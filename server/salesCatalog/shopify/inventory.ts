import crypto from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  catalogSources,
  catalogProducts,
  catalogVariants,
} from "@shared/schema";
import {
  variantAvailability,
  verifiedProductUrl,
} from "@shared/commerceCatalog";
import type { CatalogDb } from "../commerceStore";
import {
  assertCatalogInstallation,
  resolveCatalogInstallation,
} from "./installation";
import {
  CatalogApiError,
  decimalPrice,
  shopifyCatalogRequest,
  type CatalogRequest,
} from "./api";
import { isShopifyProductPublished } from "./publication";

export const INVENTORY_BATCH_MAX = 50;
export const INVENTORY_ACTIVE_MS = 30 * 60_000;
export const INVENTORY_POLL_MS = 2 * 60_000;
export type InventoryState = {
  activeUntil?: number;
  nextAt?: number;
  apiAfter?: number;
  failures?: number;
  errorCode?: string | null;
  errorDetail?: import("./api").CatalogErrorDetail | null;
  lastVerifiedAt?: number;
};
export function inventoryState(checkpoint: unknown): InventoryState {
  return (checkpoint as { inventory?: InventoryState } | null)?.inventory ?? {};
}
export function inventoryWake(checkpoint: unknown, now = Date.now()) {
  const state = inventoryState(checkpoint);
  return (state.activeUntil ?? 0) > now
    ? Math.max(state.nextAt ?? now, state.apiAfter ?? 0)
    : Infinity;
}
export const SHOPIFY_INVENTORY_BATCH_QUERY = `query VerifyInventoryBatch($ids:[ID!]!) {
 nodes(ids:$ids) { ... on ProductVariant { id title sku selectedOptions { name value } price compareAtPrice inventoryPolicy inventoryQuantity availableForSale requiresComponents updatedAt inventoryItem { id tracked }
 product { id title status publishedAt onlineStoreUrl requiresSellingPlan } } }
 shop { currencyCode myshopifyDomain }
}`;

/** Demand extends an activity window, not inventory validity. Never moves a quota/backoff deadline earlier. */
export async function markInventoryActivity(
  database: CatalogDb,
  userId: string,
  sourceId: string,
) {
  await database
    .update(catalogSources)
    .set({
      checkpoint: sql`jsonb_set(${catalogSources.checkpoint}, '{inventory}', COALESCE(${catalogSources.checkpoint}->'inventory','{}'::jsonb) || jsonb_build_object('activeUntil', ${Date.now() + INVENTORY_ACTIVE_MS}::bigint))`,
      nextAttemptAt: sql`CASE WHEN ${catalogSources.errorCode} IS NOT NULL OR ${catalogSources.leaseToken} IS NOT NULL THEN ${catalogSources.nextAttemptAt}
      ELSE LEAST(${catalogSources.nextAttemptAt}, to_timestamp(GREATEST(COALESCE((${catalogSources.checkpoint}->'inventory'->>'apiAfter')::bigint,0),COALESCE((${catalogSources.checkpoint}->'inventory'->>'nextAt')::bigint,0),${Date.now()}::bigint)/1000.0)) END`,
    })
    .where(
      and(
        eq(catalogSources.id, sourceId),
        eq(catalogSources.userId, userId),
        sql`${catalogSources.status} IN ('ready','syncing')`,
        sql`COALESCE((${catalogSources.checkpoint}->'inventory'->>'activeUntil')::bigint,0) < ${Date.now() + INVENTORY_ACTIVE_MS / 2}::bigint`,
      ),
    );
}

/** One bounded exact-ID read, sharing the existing source lease and Shopify quota deadline. */
export async function refreshInventoryBatch(
  database: CatalogDb,
  sourceId: string,
  leaseToken: string,
  variantIds: string[],
  requestFor: (
    shop: string,
    token: string,
  ) => CatalogRequest = shopifyCatalogRequest,
  backgroundSweep = false,
) {
  if (!variantIds.length || variantIds.length > INVENTORY_BATCH_MAX) return [];
  const [source] = await database
    .select()
    .from(catalogSources)
    .where(
      and(
        eq(catalogSources.id, sourceId),
        eq(catalogSources.leaseToken, leaseToken),
      ),
    )
    .limit(1);
  if (!source) return [];
  const install = await resolveCatalogInstallation(
    database,
    source.userId,
    source.shop,
  );
  if (!install || install.integrationId !== source.integrationId) return [];
  const rows = await database
    .select({ variant: catalogVariants, product: catalogProducts })
    .from(catalogVariants)
    .innerJoin(
      catalogProducts,
      eq(catalogProducts.id, catalogVariants.productId),
    )
    .where(
      and(
        eq(catalogVariants.userId, source.userId),
        eq(catalogVariants.sourceId, sourceId),
        eq(catalogProducts.userId, source.userId),
        eq(catalogProducts.sourceId, sourceId),
        isNull(catalogProducts.deletedAt),
        sql`${catalogVariants.id} IN (${sql.join(
          variantIds.map((id) => sql`${id}`),
          sql`,`,
        )})`,
      ),
    )
    .limit(INVENTORY_BATCH_MAX);
  if (!rows.length) return [];
  let state = inventoryState(source.checkpoint);
  const savedToken = install.token;
  try {
    const data = await requestFor(install.shop, savedToken)(
      SHOPIFY_INVENTORY_BATCH_QUERY,
      { ids: rows.map((r) => r.variant.externalId) },
    );
    if (!Array.isArray(data.nodes) || data.nodes.length !== rows.length)
      throw new CatalogApiError("invalid_response", 30_000, "inventory_nodes_shape");
    if (data.shop?.myshopifyDomain !== install.shop)
      throw new CatalogApiError("invalid_response", 30_000, "inventory_shop_identity");
    if (!/^[A-Z]{3}$/.test(data.shop?.currencyCode ?? ""))
      throw new CatalogApiError("invalid_response", 30_000, "inventory_currency");
    const now = Date.now(),
      seen = new Set<string>();
    const verified = rows.map((row) => {
      const current = data.nodes.find(
        (n: any) => n?.id === row.variant.externalId,
      );
      if (!current) return null; // Null/deleted/unsupported nodes invalidate the old snapshot below.
      if (
        seen.has(current.id) ||
        current.product?.id !== row.product.externalId ||
        typeof current.title !== "string" ||
        !Array.isArray(current.selectedOptions) ||
        current.selectedOptions.some((option: any) => typeof option?.name !== "string" || typeof option?.value !== "string")
      )
        throw new CatalogApiError("invalid_response", 30_000, "inventory_variant_shape_or_identity");
      seen.add(current.id);
      const variant = {
        ...row.variant,
        title: current.title,
        sku: typeof current.sku === "string" ? current.sku : null,
        options: Array.isArray(current.selectedOptions)
          ? current.selectedOptions
          : row.variant.options,
        price: decimalPrice(current.price),
        compareAtPrice: decimalPrice(current.compareAtPrice),
        currency: data.shop.currencyCode,
        inventoryItemId:
          typeof current.inventoryItem?.id === "string"
            ? current.inventoryItem.id
            : row.variant.inventoryItemId,
        tracked:
          typeof current.inventoryItem?.tracked === "boolean"
            ? current.inventoryItem.tracked
            : null,
        quantity: Number.isSafeInteger(current.inventoryQuantity)
          ? current.inventoryQuantity
          : null,
        availableForSale:
          typeof current.availableForSale === "boolean"
            ? current.availableForSale
            : null,
        requiresComponents: current.requiresComponents !== false,
        inventoryPolicy: current.inventoryPolicy ?? null,
        verifiedAt: new Date(now),
      };
      return {
        variant,
        product: {
          ...row.product,
          title:
            typeof current.product.title === "string"
              ? current.product.title
              : row.product.title,
          status: current.product.status,
          published: isShopifyProductPublished(current.product),
          productUrl: verifiedProductUrl(
            current.product.onlineStoreUrl,
            source.allowedHosts as string[],
          ),
        },
        availability: variantAvailability(variant, {
          published:
            row.product.complete && isShopifyProductPublished(current.product),
          sourceHealthy: true,
          now,
        }),
      };
    });
    const throttle = data.__throttle;
    const quotaDelay =
      throttle && throttle.currentlyAvailable < 300
        ? Math.ceil(
            ((300 - throttle.currentlyAvailable) /
              Math.max(1, throttle.restoreRate ?? 50)) *
              1000,
          )
        : 0;
    state = {
      ...state,
      failures: 0,
      errorCode: null,
      errorDetail: null,
      lastVerifiedAt: now,
      nextAt: backgroundSweep ? now + INVENTORY_POLL_MS : (state.nextAt ?? now),
      apiAfter: now + Math.max(2000, quotaDelay),
    };
    await database.transaction(async (tx: any) => {
      await assertCatalogInstallation(tx, install);
      const [owned] = await tx
        .select()
        .from(catalogSources)
        .where(
          and(
            eq(catalogSources.id, sourceId),
            eq(catalogSources.leaseToken, leaseToken),
            sql`${catalogSources.leaseExpiresAt}>NOW()`,
          ),
        )
        .for("update");
      if (!owned) throw Error("lease_lost");
      state.activeUntil = Math.max(
        state.activeUntil ?? 0,
        inventoryState(owned.checkpoint).activeUntil ?? 0,
      );
      for (let i = 0; i < rows.length; i++) {
        const item = verified[i];
        if (!item) {
          await tx
            .update(catalogVariants)
            .set({ availableForSale: null, verifiedAt: new Date(0) })
            .where(eq(catalogVariants.id, rows[i].variant.id));
          continue;
        }
        const v = item.variant;
        await tx
          .update(catalogVariants)
          .set({
            title: v.title,
            sku: v.sku,
            options: v.options,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            currency: v.currency,
            inventoryItemId: v.inventoryItemId,
            tracked: v.tracked,
            quantity: v.quantity,
            availableForSale: v.availableForSale,
            requiresComponents: v.requiresComponents,
            inventoryPolicy: v.inventoryPolicy,
            verifiedAt: v.verifiedAt,
          })
          .where(eq(catalogVariants.id, v.id));
        await tx
          .update(catalogProducts)
          .set({
            title: item.product.title,
            status: item.product.status,
            published: item.product.published,
            productUrl: item.product.productUrl,
          })
          .where(eq(catalogProducts.id, item.product.id));
      }
      await tx
        .update(catalogSources)
        .set({
          checkpoint: { ...(owned.checkpoint as object), inventory: state },
          currency: data.shop.currencyCode,
        })
        .where(eq(catalogSources.id, sourceId));
    });
    return verified.filter((v): v is NonNullable<typeof v> => !!v);
  } catch (error) {
    const failures = Math.min(6, (state.failures ?? 0) + 1);
    const delay = Math.min(
      30 * 60_000,
      (error instanceof CatalogApiError ? error.retryMs : 30_000) *
        2 ** (failures - 1),
    );
    state = {
      ...state,
      failures,
      errorCode: error instanceof CatalogApiError ? error.code : "unavailable",
      errorDetail: error instanceof CatalogApiError ? error.detail ?? null : null,
      nextAt: Date.now() + delay,
      apiAfter: Date.now() + delay,
    };
    await database
      .update(catalogSources)
      .set({
        checkpoint: sql`jsonb_set(${catalogSources.checkpoint},'{inventory}',COALESCE(${catalogSources.checkpoint}->'inventory','{}'::jsonb) || ${JSON.stringify({ ...state, activeUntil: undefined })}::jsonb)`,
      })
      .where(
        and(
          eq(catalogSources.id, sourceId),
          eq(catalogSources.leaseToken, leaseToken),
        ),
      );
    return [];
  }
}

/** Live callers share the worker's lease and durable cooldown, rather than opening a new quota channel. */
export async function verifyInventoryForPurchase(
  database: CatalogDb,
  userId: string,
  sourceId: string,
  ids: string[],
  requestFor = shopifyCatalogRequest,
) {
  if (!ids.length || ids.length > 8) return [];
  await markInventoryActivity(database, userId, sourceId);
  const token = crypto.randomUUID();
  const [source] = await database
    .update(catalogSources)
    .set({ leaseToken: token, leaseExpiresAt: new Date(Date.now() + 120_000) })
    .where(
      and(
        eq(catalogSources.id, sourceId),
        eq(catalogSources.userId, userId),
        sql`${catalogSources.status} IN ('ready','syncing')`,
        isNull(catalogSources.errorCode),
        sql`(${catalogSources.status}<>'syncing' OR ${catalogSources.nextAttemptAt}<=NOW())`,
        sql`${catalogSources.grantedScopes} @> '["read_products"]'::jsonb`,
        sql`(${catalogSources.leaseExpiresAt} IS NULL OR ${catalogSources.leaseExpiresAt}<NOW())`,
        sql`COALESCE((${catalogSources.checkpoint}->'inventory'->>'apiAfter')::bigint,0) <= ${Date.now()}::bigint`,
      ),
    )
    .returning({ id: catalogSources.id });
  if (!source) return [];
  try {
    return await refreshInventoryBatch(
      database,
      sourceId,
      token,
      ids,
      requestFor,
    );
  } finally {
    await database
      .update(catalogSources)
      .set({
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: sql`LEAST(${catalogSources.nextAttemptAt},to_timestamp(GREATEST(COALESCE((${catalogSources.checkpoint}->'inventory'->>'nextAt')::bigint,0),COALESCE((${catalogSources.checkpoint}->'inventory'->>'apiAfter')::bigint,0),${Date.now()}::bigint)/1000.0))`,
      })
      .where(
        and(
          eq(catalogSources.id, sourceId),
          eq(catalogSources.leaseToken, token),
        ),
      );
  }
}

export type VerifiedInventoryVariant = Awaited<
  ReturnType<typeof refreshInventoryBatch>
>[number];


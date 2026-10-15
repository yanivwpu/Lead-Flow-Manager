import crypto from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  catalogSources,
  catalogProducts,
  catalogVariants,
  catalogMedia,
  catalogCollections,
  catalogMemberships,
  catalogEvents,
} from "@shared/schema";
import { verifiedProductUrl } from "@shared/commerceCatalog";
import type { CatalogDb } from "../commerceStore";
import {
  resolveCatalogInstallation,
  assertCatalogInstallation,
} from "./installation";
import {
  CatalogApiError,
  SHOPIFY_CATALOG_META_QUERY,
  SHOPIFY_CATALOG_IDS_QUERY,
  SHOPIFY_CATALOG_PRODUCT_QUERY,
  readConnection,
  decimalPrice,
  type CatalogRequest,
} from "./api";

type Checkpoint = {
  mode: "full" | "events";
  after: string | null;
  pending: string[];
  end: boolean;
  events: string[];
  current?: {
    id: string;
    version: string;
    generation: string;
    variants: string | null;
    media: string | null;
    collections: string | null;
    variantsDone: boolean;
    mediaDone: boolean;
    collectionsDone: boolean;
  };
};
const safeDate = (v: unknown) => {
  if (typeof v !== "string" || !Number.isFinite(Date.parse(v)))
    throw new CatalogApiError("invalid_response");
  return new Date(v);
};
const gid = (v: unknown, kind: string) => {
  if (
    typeof v !== "string" ||
    !new RegExp(`^gid://shopify/${kind}/[1-9][0-9]*$`).test(v)
  )
    throw new CatalogApiError("invalid_response");
  return v;
};
export function createShopifyCatalogSync(
  database: CatalogDb,
  requestFor: (shop: string, token: string) => CatalogRequest,
) {
  async function work(sourceId: string, leaseToken: string) {
    let [source] = await database
      .select()
      .from(catalogSources)
      .where(
        and(
          eq(catalogSources.id, sourceId),
          eq(catalogSources.leaseToken, leaseToken),
        ),
      )
      .limit(1);
    if (!source) return;
    const maybeInstall = await resolveCatalogInstallation(
      database,
      source.userId,
      source.shop,
    );
    if (!maybeInstall || maybeInstall.integrationId !== source.integrationId) {
      await database
        .update(catalogSources)
        .set({ status: "disconnected", leaseToken: null, leaseExpiresAt: null })
        .where(
          and(
            eq(catalogSources.id, sourceId),
            eq(catalogSources.leaseToken, leaseToken),
          ),
        );
      return;
    }
    const install = maybeInstall;
    let checkpoint = source.checkpoint as Partial<Checkpoint>;
    try {
      const request = requestFor(install.shop, install.token);
      const meta = await request(SHOPIFY_CATALOG_META_QUERY);
      const scopes = meta.currentAppInstallation?.accessScopes?.map(
        (s: any) => s.handle,
      );
      if (
        !Array.isArray(scopes) ||
        !scopes.every((s: unknown) => typeof s === "string") ||
        !/^[A-Z]{3}$/.test(meta.shop?.currencyCode ?? "") ||
        meta.shop.myshopifyDomain !== install.shop
      )
        throw new CatalogApiError("invalid_response");
      const hosts = [
        install.shop,
        ...(typeof meta.shop.primaryDomain?.host === "string"
          ? [meta.shop.primaryDomain.host.toLowerCase()]
          : []),
      ];
      if (!scopes.includes("read_products")) {
        await database
          .update(catalogSources)
          .set({
            status: "permission_required",
            grantedScopes: scopes,
            errorCode: "read_products_required",
            nextAttemptAt: new Date(Date.now() + 600_000),
            leaseToken: null,
            leaseExpiresAt: null,
          })
          .where(
            and(
              eq(catalogSources.id, sourceId),
              eq(catalogSources.leaseToken, leaseToken),
            ),
          );
        return;
      }
      async function persist(run: (tx: CatalogDb) => Promise<void>) {
        await database.transaction(async (tx: any) => {
          await assertCatalogInstallation(tx, install);
          const [owned] = await tx
            .select()
            .from(catalogSources)
            .where(
              and(
                eq(catalogSources.id, sourceId),
                eq(catalogSources.userId, install.userId),
                eq(catalogSources.leaseToken, leaseToken),
                sql`${catalogSources.leaseExpiresAt}>NOW()`,
              ),
            )
            .for("update");
          if (!owned) throw new Error("lease_lost");
          await run(tx);
        });
      }
      if (!checkpoint.mode) {
        const pending = await database
          .select()
          .from(catalogEvents)
          .where(
            and(
              eq(catalogEvents.sourceId, sourceId),
              isNull(catalogEvents.processedAt),
            ),
          )
          .orderBy(catalogEvents.receivedAt, catalogEvents.id)
          .limit(10);
        const full =
          !source.initialSyncCompletedAt ||
          !source.lastSyncAt ||
          Date.now() - source.lastSyncAt.getTime() > 5 * 60_000 ||
          pending.some((e) => e.topic.startsWith("collections/")) ||
          source.requestedAt.getTime() > source.lastSyncAt.getTime();
        if (!full && !pending.length) {
          await database
            .update(catalogSources)
            .set({
              leaseToken: null,
              leaseExpiresAt: null,
              nextAttemptAt: new Date(
                source.lastSyncAt!.getTime() + 5 * 60_000,
              ),
            })
            .where(
              and(
                eq(catalogSources.id, sourceId),
                eq(catalogSources.leaseToken, leaseToken),
              ),
            );
          return;
        }
        const ids: string[] = [];
        if (!full)
          for (const event of pending) {
            if (event.topic.startsWith("products/"))
              ids.push(`gid://shopify/Product/${event.resourceId}`);
            else {
              const rows = await database
                .select({ externalId: catalogProducts.externalId })
                .from(catalogVariants)
                .innerJoin(
                  catalogProducts,
                  eq(catalogProducts.id, catalogVariants.productId),
                )
                .where(
                  and(
                    eq(catalogVariants.sourceId, sourceId),
                    eq(catalogVariants.userId, install.userId),
                    eq(
                      catalogVariants.inventoryItemId,
                      `gid://shopify/InventoryItem/${event.resourceId}`,
                    ),
                  ),
                )
                .limit(10);
              ids.push(...rows.map((r) => r.externalId));
            }
          }
        // Unknown inventory mappings are recovered by a full reconciliation, never ignored.
        const mode =
          full || (pending.length > 0 && ids.length === 0) ? "full" : "events";
        checkpoint = {
          mode,
          after: null,
          pending: [...new Set(ids)],
          end: mode === "events",
          events: pending.map((e) => e.id),
        };
        const generation = crypto.randomUUID();
        await persist(async (tx) => {
          [source] = await tx
            .update(catalogSources)
            .set({
              status: "syncing",
              grantedScopes: scopes,
              currency: meta.shop.currencyCode,
              allowedHosts: hosts,
              checkpoint,
              generation,
              errorCode: null,
            })
            .where(eq(catalogSources.id, sourceId))
            .returning();
        });
      }
      let delay = 0;
      for (let budget = 0; budget < 6; budget++) {
        if (!checkpoint.pending!.length) {
          if (checkpoint.end) {
            await persist(async (tx) => {
              if (checkpoint.mode === "full")
                await tx
                  .update(catalogProducts)
                  .set({ deletedAt: new Date(), published: false })
                  .where(
                    and(
                      eq(catalogProducts.sourceId, sourceId),
                      eq(catalogProducts.userId, install.userId),
                      sql`${catalogProducts.seenGeneration} IS DISTINCT FROM ${source.generation}`,
                    ),
                  );
              if (checkpoint.events!.length)
                await tx
                  .update(catalogEvents)
                  .set({ processedAt: new Date() })
                  .where(
                    and(
                      eq(catalogEvents.sourceId, sourceId),
                      sql`${catalogEvents.id} IN (${sql.join(
                        checkpoint.events!.map((id) => sql`${id}`),
                        sql`,`,
                      )})`,
                    ),
                  );
              await tx
                .update(catalogSources)
                .set({
                  status: "ready",
                  initialSyncCompletedAt:
                    source.initialSyncCompletedAt ?? new Date(),
                  lastSyncAt:
                    checkpoint.mode === "full" ? new Date() : source.lastSyncAt,
                  checkpoint: {},
                  generation: null,
                  errorCode: null,
                  attempts: 0,
                  nextAttemptAt: new Date(Date.now() + 60_000),
                  leaseToken: null,
                  leaseExpiresAt: null,
                })
                .where(eq(catalogSources.id, sourceId));
            });
            return;
          }
          const data = await request(SHOPIFY_CATALOG_IDS_QUERY, {
            after: checkpoint.after,
          });
          const page = readConnection(data.products);
          if (page.cursor === checkpoint.after && page.cursor !== null)
            throw new CatalogApiError("invalid_response");
          checkpoint.after = page.cursor;
          checkpoint.pending = page.nodes.map((n) => gid(n.id, "Product"));
          checkpoint.end = page.cursor === null;
          await persist(async (tx) => {
            await tx
              .update(catalogSources)
              .set({ checkpoint })
              .where(eq(catalogSources.id, sourceId));
          });
          continue;
        }
        const id = checkpoint.pending![0];
        const current = checkpoint.current;
        const data = await request(SHOPIFY_CATALOG_PRODUCT_QUERY, {
          id,
          variants: current?.variants ?? null,
          media: current?.media ?? null,
          collections: current?.collections ?? null,
          includeVariants: !current?.variantsDone,
          includeMedia: !current?.mediaDone,
          includeCollections: !current?.collectionsDone,
        });
        const product = data.product;
        if (product === null) {
          await persist(async (tx) => {
            await tx
              .update(catalogProducts)
              .set({ deletedAt: new Date(), published: false })
              .where(
                and(
                  eq(catalogProducts.sourceId, sourceId),
                  eq(catalogProducts.userId, install.userId),
                  eq(catalogProducts.externalId, id),
                ),
              );
            checkpoint.pending!.shift();
            delete checkpoint.current;
            await tx
              .update(catalogSources)
              .set({ checkpoint })
              .where(eq(catalogSources.id, sourceId));
          });
          continue;
        }
        if (
          !product ||
          gid(product.id, "Product") !== id ||
          typeof product.title !== "string" ||
          !Array.isArray(product.tags) ||
          !Array.isArray(product.options)
        )
          throw new CatalogApiError("invalid_response");
        const version = safeDate(product.updatedAt);
        // Never mix pages from two provider versions. Restart this product's bounded hydration.
        if (current && current.version !== product.updatedAt) {
          delete checkpoint.current;
          await persist(async (tx) => {
            await tx
              .update(catalogSources)
              .set({ checkpoint })
              .where(eq(catalogSources.id, sourceId));
          });
          continue;
        }
        const empty = { nodes: [], cursor: null };
        const variants = current?.variantsDone
            ? empty
            : readConnection(product.variants),
          media = current?.mediaDone ? empty : readConnection(product.media),
          collections = current?.collectionsDone
            ? empty
            : readConnection(product.collections);
        if (
          (variants.cursor && variants.cursor === current?.variants) ||
          (media.cursor && media.cursor === current?.media) ||
          (collections.cursor && collections.cursor === current?.collections)
        )
          throw new CatalogApiError("invalid_response");
        const generation = current?.generation ?? crypto.randomUUID();
        const url = verifiedProductUrl(product.onlineStoreUrl, hosts);
        await persist(async (tx) => {
          const [existing] = await tx
            .select()
            .from(catalogProducts)
            .where(
              and(
                eq(catalogProducts.sourceId, sourceId),
                eq(catalogProducts.externalId, id),
              ),
            )
            .limit(1);
          // API refreshes current state instead of trusting out-of-order webhook payload prices/stock.
          if (existing && existing.providerUpdatedAt > version) {
            await tx
              .update(catalogProducts)
              .set({ seenGeneration: source.generation })
              .where(eq(catalogProducts.id, existing.id));
            checkpoint.pending!.shift();
            delete checkpoint.current;
            await tx
              .update(catalogSources)
              .set({ checkpoint })
              .where(eq(catalogSources.id, sourceId));
            return;
          }
          const values = {
            userId: install.userId,
            sourceId,
            externalId: id,
            title: product.title,
            description: String(product.description ?? "").slice(0, 100_000),
            productType: product.productType ?? null,
            vendor: product.vendor ?? null,
            status: product.status,
            published:
              !!product.publishedAt && !!url && !product.requiresSellingPlan,
            productUrl: url,
            variantCount: Number.isSafeInteger(product.variantsCount?.count)
              ? product.variantsCount.count
              : 0,
            options: product.options,
            providerTags: product.tags,
            providerUpdatedAt: version,
            syncedAt: new Date(),
            complete: false,
            deletedAt: null,
            seenGeneration: source.generation,
            hydrationGeneration: generation,
          };
          const [record] = await tx
            .insert(catalogProducts)
            .values(values)
            .onConflictDoUpdate({
              target: [catalogProducts.sourceId, catalogProducts.externalId],
              set: values,
            })
            .returning();
          for (const v of variants.nodes) {
            if (
              typeof v.availableForSale !== "boolean" ||
              !v.inventoryItem ||
              typeof v.inventoryItem.tracked !== "boolean"
            )
              throw new CatalogApiError("invalid_response");
            const values = {
              userId: install.userId,
              sourceId,
              productId: record.id,
              externalId: gid(v.id, "ProductVariant"),
              title: String(v.title),
              sku: v.sku ?? null,
              options: v.selectedOptions ?? [],
              price: decimalPrice(v.price),
              compareAtPrice: decimalPrice(v.compareAtPrice),
              currency: meta.shop.currencyCode,
              inventoryItemId: gid(v.inventoryItem.id, "InventoryItem"),
              tracked: v.inventoryItem.tracked,
              quantity: Number.isSafeInteger(v.inventoryQuantity)
                ? v.inventoryQuantity
                : null,
              sellableOnlineQuantity: Number.isSafeInteger(
                v.sellableOnlineQuantity,
              )
                ? v.sellableOnlineQuantity
                : null,
              inventoryPolicy: v.inventoryPolicy ?? null,
              availableForSale: v.availableForSale,
              requiresComponents: v.requiresComponents === true,
              providerUpdatedAt: safeDate(v.updatedAt),
              verifiedAt: new Date(),
              generation,
            };
            await tx
              .insert(catalogVariants)
              .values(values)
              .onConflictDoUpdate({
                target: [catalogVariants.sourceId, catalogVariants.externalId],
                set: values,
              });
          }
          for (const image of media.nodes) {
            const raw = image.image?.url;
            let safe: string | null = null;
            try {
              const u = new URL(raw);
              if (
                u.protocol === "https:" &&
                !u.username &&
                !u.password &&
                u.hostname === "cdn.shopify.com"
              )
                safe = u.href;
            } catch {}
            if (!safe) continue;
            const values = {
              userId: install.userId,
              sourceId,
              productId: record.id,
              externalId: gid(image.id, "MediaImage"),
              url: safe,
              altText: image.image.altText ?? null,
              generation,
            };
            await tx
              .insert(catalogMedia)
              .values(values)
              .onConflictDoUpdate({
                target: [catalogMedia.productId, catalogMedia.externalId],
                set: values,
              });
          }
          for (const c of collections.nodes) {
            const [collection] = await tx
              .insert(catalogCollections)
              .values({
                userId: install.userId,
                sourceId,
                externalId: gid(c.id, "Collection"),
                title: String(c.title),
              })
              .onConflictDoUpdate({
                target: [
                  catalogCollections.sourceId,
                  catalogCollections.externalId,
                ],
                set: { title: String(c.title) },
              })
              .returning();
            await tx
              .insert(catalogMemberships)
              .values({
                productId: record.id,
                collectionId: collection.id,
                generation,
              })
              .onConflictDoUpdate({
                target: [
                  catalogMemberships.productId,
                  catalogMemberships.collectionId,
                ],
                set: { generation },
              });
          }
          const done = !variants.cursor && !media.cursor && !collections.cursor;
          if (done) {
            await tx
              .delete(catalogVariants)
              .where(
                and(
                  eq(catalogVariants.productId, record.id),
                  sql`${catalogVariants.generation}<>${generation}`,
                ),
              );
            await tx
              .delete(catalogMedia)
              .where(
                and(
                  eq(catalogMedia.productId, record.id),
                  sql`${catalogMedia.generation}<>${generation}`,
                ),
              );
            await tx
              .delete(catalogMemberships)
              .where(
                and(
                  eq(catalogMemberships.productId, record.id),
                  sql`${catalogMemberships.generation}<>${generation}`,
                ),
              );
            await tx
              .update(catalogProducts)
              .set({
                complete: true,
                searchText: sql`${record.title} || ' ' || ${record.description} || ' ' || ${record.productType ?? ""} || ' ' || COALESCE((SELECT string_agg(COALESCE(sku,'') || ' ' || title || ' ' || options::text,' ') FROM catalog_variants WHERE product_id=${record.id}),'') || ' ' || COALESCE((SELECT string_agg(c.title,' ') FROM catalog_memberships m JOIN catalog_collections c ON c.id=m.collection_id WHERE m.product_id=${record.id}),'')`,
              })
              .where(eq(catalogProducts.id, record.id));
            checkpoint.pending!.shift();
            delete checkpoint.current;
          } else
            checkpoint.current = {
              id,
              version: product.updatedAt,
              generation,
              variants: variants.cursor,
              media: media.cursor,
              collections: collections.cursor,
              variantsDone: !variants.cursor,
              mediaDone: !media.cursor,
              collectionsDone: !collections.cursor,
            };
          await tx
            .update(catalogSources)
            .set({ checkpoint, errorCode: null })
            .where(eq(catalogSources.id, sourceId));
        });
        const throttle = data.__throttle;
        if (throttle && throttle.currentlyAvailable < 300) {
          delay = Math.max(
            1000,
            Math.ceil(
              ((300 - throttle.currentlyAvailable) /
                Math.max(1, throttle.restoreRate ?? 50)) *
                1000,
            ),
          );
          break;
        }
      }
      await database
        .update(catalogSources)
        .set({
          leaseToken: null,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + delay),
        })
        .where(
          and(
            eq(catalogSources.id, sourceId),
            eq(catalogSources.leaseToken, leaseToken),
          ),
        );
    } catch (error: any) {
      const apiError =
        error instanceof CatalogApiError
          ? error
          : new CatalogApiError("unavailable");
      await database
        .update(catalogSources)
        .set({
          status:
            apiError.code === "access_denied" ? "permission_required" : "error",
          errorCode: apiError.code,
          attempts: sql`${catalogSources.attempts}+1`,
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(
                3_600_000,
                apiError.retryMs * 2 ** Math.min(source.attempts, 6),
              ),
          ),
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(
          and(
            eq(catalogSources.id, sourceId),
            eq(catalogSources.leaseToken, leaseToken),
          ),
        );
    }
  }
  return {
    work,
    async tick() {
      const token = crypto.randomUUID();
      const result = await database.execute(
        sql`UPDATE catalog_sources SET lease_token=${token},lease_expires_at=NOW()+interval '2 minutes' WHERE id=(SELECT id FROM catalog_sources WHERE status<>'disconnected' AND next_attempt_at<=NOW() AND (lease_expires_at IS NULL OR lease_expires_at<NOW()) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`,
      );
      const row = (result as any).rows?.[0];
      if (!row) return false;
      await work(row.id, token);
      return true;
    },
  };
}

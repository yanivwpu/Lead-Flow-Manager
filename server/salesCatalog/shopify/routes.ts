import type { Express } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { catalogSources } from "@shared/schema";
import type { CatalogDb, createCommerceStore } from "../commerceStore";
import { requireWorkspaceOffersAdmin } from "../../workspaceOffers/offerAccess";
import { catalogReadiness } from "./readiness";
import {
  ensureCatalogSource,
  resolveCatalogInstallation,
  assertCatalogInstallation,
} from "./installation";
import { catalogAuthorizationUrl } from "./authorization";
import {
  decimalPrice,
  SHOPIFY_CATALOG_VERIFY_VARIANT_QUERY,
  shopifyCatalogRequest,
} from "./api";
import {
  variantAvailability,
  verifiedProductUrl,
  commerceAnnotationSchema,
} from "@shared/commerceCatalog";
export function registerShopifyCatalogRoutes(
  app: Express,
  database: CatalogDb,
  store: ReturnType<typeof createCommerceStore>,
  authorize = requireWorkspaceOffersAdmin,
) {
  app.get("/api/sales-catalog/commerce/status", async (req, res) => {
    const auth = await authorize(req, res);
    if (!auth) return;
    res.set("Cache-Control", "private, no-store");
    try {
      res.json(await catalogReadiness(database, store, auth.workspaceUserId));
    } catch {
      res.status(503).json({ error: "Catalog status unavailable" });
    }
  });
  app.post("/api/sales-catalog/commerce/sync", async (req, res) => {
    const auth = await authorize(req, res);
    if (!auth) return;
    try {
      const source = await ensureCatalogSource(database, auth.workspaceUserId);
      if (!source)
        return res
          .status(409)
          .json({ error: "Reconnect your existing Shopify installation" });
      const [accepted] = await database
        .update(catalogSources)
        .set({
          requestedAt: new Date(),
          lastRequestedAt: new Date(),
          nextAttemptAt: sql`CASE WHEN (${catalogSources.status}='syncing' OR ${catalogSources.errorCode} IS NOT NULL) AND ${catalogSources.nextAttemptAt}>NOW() THEN ${catalogSources.nextAttemptAt} ELSE NOW() END`,
        })
        .where(
          and(
            eq(catalogSources.id, source.id),
            sql`(${catalogSources.lastRequestedAt} IS NULL OR ${catalogSources.lastRequestedAt}<NOW()-interval '1 minute')`,
          ),
        )
        .returning({ id: catalogSources.id });
      if (!accepted)
        return res.status(429).json({
          error: "A sync was recently requested. Please wait a minute.",
        });
      return res.status(202).json({ queued: true });
    } catch {
      return res.status(503).json({ error: "Sync unavailable" });
    }
  });
  app.get("/api/sales-catalog/commerce/products", async (req, res) => {
    const auth = await authorize(req, res);
    if (!auth) return;
    res.set("Cache-Control", "private, no-store");
    const input = z
      .object({
        query: z.string().max(200).optional(),
        cursor: z.string().max(100).optional(),
        category: z.string().max(200).optional(),
        status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).optional(),
      })
      .safeParse(req.query);
    if (!input.success)
      return res.status(400).json({ error: "Invalid catalog filters" });
    try {
      const source = await store.source(auth.workspaceUserId);
      return res.json(
        source
          ? await store.browse(auth.workspaceUserId, source.id, input.data)
          : { items: [], nextCursor: null },
      );
    } catch {
      return res.status(503).json({ error: "Products unavailable" });
    }
  });
  app.get("/api/sales-catalog/commerce/products/:id", async (req, res) => {
    const auth = await authorize(req, res);
    if (!auth) return;
    res.set("Cache-Control", "private, no-store");
    try {
      const src = await store.source(auth.workspaceUserId);
      const item = src
        ? await store.lookup(auth.workspaceUserId, src.id, req.params.id)
        : null;
      if (!item) return res.status(404).json({ error: "Product not found" });
      res.json({ item });
    } catch {
      res.status(503).json({ error: "Product unavailable" });
    }
  });
  app.get(
    "/api/sales-catalog/commerce/products/:id/variants",
    async (req, res) => {
      const auth = await authorize(req, res);
      if (!auth) return;
      res.set("Cache-Control", "private, no-store");
      const input = z
        .object({ cursor: z.string().max(200).optional() })
        .strict()
        .safeParse(req.query);
      if (!input.success)
        return res.status(400).json({ error: "Invalid variant cursor" });
      try {
        const src = await store.source(auth.workspaceUserId);
        const page = src
          ? await store.variantPage(
              auth.workspaceUserId,
              src.id,
              req.params.id,
              input.data.cursor,
            )
          : null;
        if (!page) return res.status(404).json({ error: "Product not found" });
        return res.json(page);
      } catch {
        return res.status(503).json({ error: "Variants unavailable" });
      }
    },
  );
  app.patch("/api/sales-catalog/commerce/products/:id", async (req, res) => {
    const auth = await authorize(req, res);
    if (!auth) return;
    const input = commerceAnnotationSchema.safeParse(req.body);
    if (!input.success)
      return res
        .status(400)
        .json({ error: "Only merchant annotations can be edited" });
    try {
      const src = await store.source(auth.workspaceUserId);
      if (
        !src ||
        !(await store.annotate(
          auth.workspaceUserId,
          src.id,
          req.params.id,
          input.data,
        ))
      )
        return res.status(404).json({ error: "Product not found" });
      res.json({ saved: true });
    } catch {
      res.status(503).json({ error: "Could not save annotations" });
    }
  });
  app.get("/api/shopify/catalog/authorize", async (req, res) => {
    const auth = await authorize(req, res);
    if (!auth) return;
    if (process.env.SHOPIFY_CATALOG_AUTH_ENABLED !== "true")
      return res.status(409).json({
        error: "Product access requires an approved Shopify app version",
      });
    const install = await resolveCatalogInstallation(
      database,
      auth.workspaceUserId,
    );
    if (!install)
      return res.status(409).json({ error: "Reconnect Shopify first" });
    await ensureCatalogSource(database, auth.workspaceUserId);
    const url = catalogAuthorizationUrl(
      install.shop,
      process.env.SHOPIFY_API_KEY ?? "",
    );
    if (!url)
      return res.status(503).json({ error: "Authorization unavailable" });
    return res.redirect(url);
  });
}
/** Read-only verification for future checkout callers. Never constructs checkout links. */
export async function verifyCatalogVariant(
  database: CatalogDb,
  store: ReturnType<typeof createCommerceStore>,
  userId: string,
  productId: string,
  variantId: string,
  requestFactory = shopifyCatalogRequest,
) {
  const src = await store.source(userId);
  const product = src ? await store.lookup(userId, src.id, productId) : null;
  const variant = src
    ? await store.lookupVariant(userId, src.id, productId, variantId)
    : null;
  const install = await resolveCatalogInstallation(database, userId, src?.shop);
  if (!src || !product || !variant || !install)
    throw new Error("variant_not_owned");
  const response = await requestFactory(install.shop, install.token)(
    SHOPIFY_CATALOG_VERIFY_VARIANT_QUERY,
    { id: variant.externalId },
  );
  const current = response.productVariant;
  if (
    !current ||
    current.id !== variant.externalId ||
    current.product?.id !== product.externalId ||
    !/^[A-Z]{3}$/.test(response.shop?.currencyCode ?? "")
  )
    throw new Error("variant_not_available");
  await database.transaction(async (tx) => {
    await assertCatalogInstallation(tx, install);
  });
  return {
    variantId: variant.id,
    price: decimalPrice(current.price),
    currency: response.shop.currencyCode,
    availability: variantAvailability(
      {
        ...variant,
        requiresComponents: current.requiresComponents !== false,
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
        inventoryPolicy: current.inventoryPolicy,
        verifiedAt: new Date(),
      },
      {
        published:
          current.product.status === "ACTIVE" &&
          !!current.product.publishedAt &&
          !!verifiedProductUrl(
            current.product.onlineStoreUrl,
            src.allowedHosts as string[],
          ) &&
          !current.product.requiresSellingPlan,
        sourceHealthy: true,
      },
    ),
    verifiedAt: new Date().toISOString(),
  };
}

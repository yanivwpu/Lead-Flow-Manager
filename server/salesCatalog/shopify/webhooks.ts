import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { catalogSources, catalogEvents, users } from "@shared/schema";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import type { CatalogDb } from "../commerceStore";
import {
  assertCatalogInstallation,
  resolveCatalogInstallation,
} from "./installation";
export const SHOPIFY_CATALOG_TOPICS = [
  "app/scopes_update",
  "products/create",
  "products/update",
  "products/delete",
  "inventory_levels/update",
  "inventory_levels/connect",
  "inventory_levels/disconnect",
  "inventory_items/update",
  "collections/create",
  "collections/update",
  "collections/delete",
] as const;
export function createCatalogWebhookHandler(
  database: CatalogDb,
  verify: (raw: Buffer, hmac: string) => boolean,
) {
  return async (req: Request, res: Response) => {
    const raw = (req as any).rawBody,
      hmac = req.get("x-shopify-hmac-sha256"),
      shop = normalizeShopifyShopDomain(req.get("x-shopify-shop-domain"));
    const topic = req.get("x-shopify-topic"),
      eventId =
        req.get("x-shopify-event-id") || req.get("x-shopify-webhook-id");
    if (!Buffer.isBuffer(raw) || !hmac || !verify(raw, hmac))
      return res.status(401).json({ error: "Invalid webhook signature" });
    if (
      !shop ||
      !topic ||
      !SHOPIFY_CATALOG_TOPICS.includes(topic as any) ||
      !eventId?.trim() ||
      eventId.length > 255 ||
      req.params.topic !== topic.replaceAll("/", "-")
    )
      return res.status(400).json({ error: "Invalid catalog webhook headers" });
    let id: string;
    try {
      const body = JSON.parse(raw.toString("utf8"));
      const value =
        topic === "app/scopes_update"
          ? "0"
          : topic.startsWith("inventory_levels/")
            ? body.inventory_item_id
            : body.id;
      if (typeof value === "number" && !Number.isSafeInteger(value))
        throw Error();
      id = String(value);
      if (
        !(topic === "app/scopes_update" && id === "0") &&
        !/^[1-9][0-9]{0,24}$/.test(id)
      )
        throw Error();
    } catch {
      return res.status(400).json({ error: "Invalid catalog webhook payload" });
    }
    try {
      const matches = await database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.shopifyShop, shop));
      if (matches.length !== 1) return res.json({ received: true });
      const install = await resolveCatalogInstallation(
        database,
        matches[0].id,
        shop,
      );
      if (!install) return res.json({ received: true });
      await database.transaction(async (tx: any) => {
        await assertCatalogInstallation(tx, install);
        const [source] = await tx
          .select()
          .from(catalogSources)
          .where(
            and(
              eq(catalogSources.userId, install.userId),
              eq(catalogSources.shop, shop),
              eq(catalogSources.integrationId, install.integrationId),
            ),
          )
          .for("update")
          .limit(1);
        if (!source || source.status === "disconnected") return;
        const [inserted] = await tx
          .insert(catalogEvents)
          .values({
            userId: install.userId,
            sourceId: source.id,
            eventId: eventId.trim(),
            topic,
            resourceId: id,
          })
          .onConflictDoNothing({
            target: [catalogEvents.sourceId, catalogEvents.eventId],
          })
          .returning({ id: catalogEvents.id });
        if (inserted)
          await tx
            .update(catalogSources)
            .set({
              nextAttemptAt: sql`CASE WHEN (${catalogSources.status}='syncing' OR ${catalogSources.errorCode} IS NOT NULL) AND ${catalogSources.nextAttemptAt}>NOW() THEN ${catalogSources.nextAttemptAt} ELSE NOW() END`,
            })
            .where(eq(catalogSources.id, source.id));
      });
      return res.json({ received: true });
    } catch {
      return res
        .status(503)
        .json({ error: "Catalog event persistence failed; retry delivery" });
    }
  };
}
export function registerCatalogWebhooks(
  app: Express,
  database: CatalogDb,
  verify: (raw: Buffer, hmac: string) => boolean,
) {
  app.post(
    "/api/shopify/catalog-webhooks/:topic",
    createCatalogWebhookHandler(database, verify),
  );
}
import { cleanupCheckout } from "../../shopping/checkout/cleanup";
export async function cleanupShopifyCatalog(
  tx: CatalogDb,
  shop: string,
  erase: boolean,
) {
  const result = await tx.execute(
    sql`SELECT to_regclass('catalog_sources') AS table_name`,
  );
  if (!(result as any).rows?.[0]?.table_name) return;
  await cleanupCheckout(tx,shop);
  if (erase)
    await tx
      .delete(catalogSources)
      .where(
        and(
          eq(catalogSources.provider, "shopify"),
          eq(catalogSources.shop, shop),
        ),
      );
  else
    await tx
      .update(catalogSources)
      .set({
        status: "disconnected",
        leaseToken: null,
        leaseExpiresAt: null,
        checkpoint: {},
        generation: null,
      })
      .where(
        and(
          eq(catalogSources.provider, "shopify"),
          eq(catalogSources.shop, shop),
        ),
      );
}

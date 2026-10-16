import {
  inventoryState,
  inventoryWake,
  refreshInventoryBatch,
  INVENTORY_POLL_MS,
  type InventoryState,
} from "./inventory";
import { isShopifyProductPublished } from "./publication";
import crypto from "node:crypto";
import type {
  CatalogWebhookRegistrar,
  CatalogWebhookState,
} from "./registration";
import { catalogReconciliationIntervalMs } from "./reconciliation";
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
  SHOPIFY_CATALOG_INVENTORY_PRODUCT_QUERY,
  SHOPIFY_CATALOG_COLLECTION_PRODUCTS_QUERY,
  readConnection,
  decimalPrice,
  type CatalogRequest,
} from "./api";

type Checkpoint = {
  inventory?: InventoryState;
  webhooks?: CatalogWebhookState;
  mode: "full" | "events";
  after: string | null;
  pending: string[];
  end: boolean;
  events: string[];
  startedAt?: string;
  lastFullDurationMs?: number;
  collection?: {
    id: string;
    providerAfter: string | null;
    providerDone: boolean;
    localAfter: string | null;
    localDone: boolean;
  };
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
  registerWebhooks?: CatalogWebhookRegistrar,
) {
  async function productCount(userId: string, sourceId: string, db = database) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(catalogProducts)
      .where(
        and(
          eq(catalogProducts.sourceId, sourceId),
          eq(catalogProducts.userId, userId),
          isNull(catalogProducts.deletedAt),
        ),
      );
    return row.count;
  }
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
      if ((inventoryState(checkpoint).apiAfter ?? 0) > Date.now()) {
        await database
          .update(catalogSources)
          .set({
            leaseToken: null,
            leaseExpiresAt: null,
            nextAttemptAt: new Date(inventoryState(checkpoint).apiAfter!),
          })
          .where(
            and(
              eq(catalogSources.id, sourceId),
              eq(catalogSources.leaseToken, leaseToken),
            ),
          );
        return;
      }
      const request = requestFor(install.shop, install.token);
      const reconcileAt = source.lastSyncAt
        ? source.lastSyncAt.getTime() +
          catalogReconciliationIntervalMs(
            await productCount(install.userId, sourceId),
            checkpoint.lastFullDurationMs,
          )
        : 0;
      const hooksAt = registerWebhooks
        ? checkpoint.webhooks?.scopesKey !==
          [...(source.grantedScopes as string[])].sort().join(",")
          ? 0
          : Date.parse(checkpoint.webhooks?.nextCheckAt ?? "")
        : Infinity;
      if (
        (!checkpoint.mode || inventoryWake(checkpoint) <= Date.now()) &&
        source.initialSyncCompletedAt &&
        !source.errorCode &&
        ["ready", "syncing"].includes(source.status) &&
        (checkpoint.mode ||
          (reconcileAt > Date.now() &&
            source.requestedAt <= source.lastSyncAt!)) &&
        (!registerWebhooks || hooksAt > Date.now())
      ) {
        const pendingInventory = await database
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
        if (
          pendingInventory.length &&
          pendingInventory.every((e) => e.topic.startsWith("inventory_")) &&
          inventoryWake(checkpoint) > Date.now()
        ) {
          const resourceIds = [
            ...new Set(
              pendingInventory.map(
                (e) => `gid://shopify/InventoryItem/${e.resourceId}`,
              ),
            ),
          ];
          const mapped = await database
            .select({
              id: catalogVariants.id,
              item: catalogVariants.inventoryItemId,
            })
            .from(catalogVariants)
            .where(
              and(
                eq(catalogVariants.userId, install.userId),
                eq(catalogVariants.sourceId, sourceId),
                sql`${catalogVariants.inventoryItemId} IN (${sql.join(
                  resourceIds.map((id) => sql`${id}`),
                  sql`,`,
                )})`,
              ),
            )
            .limit(50);
          if (resourceIds.every((id) => mapped.some((v) => v.item === id))) {
            await refreshInventoryBatch(
              database,
              sourceId,
              leaseToken,
              mapped.map((v) => v.id),
              requestFor,
            );
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
              if (!owned) return;
              if (!inventoryState(owned.checkpoint).errorCode)
                await tx
                  .update(catalogEvents)
                  .set({ processedAt: new Date() })
                  .where(
                    and(
                      eq(catalogEvents.sourceId, sourceId),
                      sql`${catalogEvents.id} IN (${sql.join(
                        pendingInventory.map((e) => sql`${e.id}`),
                        sql`,`,
                      )})`,
                    ),
                  );
              const [remaining] = await tx
                .select({ id: catalogEvents.id })
                .from(catalogEvents)
                .where(
                  and(
                    eq(catalogEvents.sourceId, sourceId),
                    isNull(catalogEvents.processedAt),
                  ),
                )
                .limit(1);
              await tx
                .update(catalogSources)
                .set({
                  leaseToken: null,
                  leaseExpiresAt: null,
                  nextAttemptAt: new Date(
                    Math.max(
                      inventoryState(owned.checkpoint).apiAfter ?? 0,
                      remaining
                        ? Date.now()
                        : Math.min(
                            reconcileAt,
                            Number.isFinite(hooksAt) ? hooksAt : Infinity,
                            inventoryWake(owned.checkpoint),
                          ),
                    ),
                  ),
                })
                .where(eq(catalogSources.id, sourceId));
            });
            return;
          }
        }
        if (
          !pendingInventory.length ||
          inventoryWake(checkpoint) <= Date.now()
        ) {
          if (inventoryWake(checkpoint) > Date.now()) {
            await database
              .update(catalogSources)
              .set({
                leaseToken: null,
                leaseExpiresAt: null,
                nextAttemptAt: new Date(
                  Math.min(
                    reconcileAt,
                    Number.isFinite(hooksAt) ? hooksAt : Infinity,
                    inventoryWake(checkpoint),
                  ),
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
          const variants = await database
            .select({ id: catalogVariants.id })
            .from(catalogVariants)
            .innerJoin(
              catalogProducts,
              eq(catalogProducts.id, catalogVariants.productId),
            )
            .where(
              and(
                eq(catalogVariants.sourceId, sourceId),
                eq(catalogVariants.userId, install.userId),
                eq(catalogProducts.sourceId, sourceId),
                eq(catalogProducts.userId, install.userId),
                eq(catalogProducts.status, "ACTIVE"),
                eq(catalogProducts.published, true),
                eq(catalogProducts.complete, true),
                isNull(catalogProducts.deletedAt),
                eq(catalogVariants.requiresComponents, false),
                sql`${catalogVariants.price} IS NOT NULL`,
                eq(catalogVariants.currency, source.currency!),
                sql`${catalogVariants.verifiedAt}<NOW()-interval '10 minutes'`,
              ),
            )
            .orderBy(catalogVariants.verifiedAt, catalogVariants.id)
            .limit(50);
          if (variants.length)
            await refreshInventoryBatch(
              database,
              sourceId,
              leaseToken,
              variants.map((v) => v.id),
              requestFor,
              true,
            );
          else
            await database
              .update(catalogSources)
              .set({
                checkpoint: sql`jsonb_set(${catalogSources.checkpoint},'{inventory}',COALESCE(${catalogSources.checkpoint}->'inventory','{}'::jsonb) || ${JSON.stringify({ nextAt: Date.now() + INVENTORY_POLL_MS })}::jsonb)`,
              })
              .where(
                and(
                  eq(catalogSources.id, sourceId),
                  eq(catalogSources.leaseToken, leaseToken),
                ),
              );
          const [arrived] = await database
            .select({ id: catalogEvents.id })
            .from(catalogEvents)
            .where(
              and(
                eq(catalogEvents.sourceId, sourceId),
                isNull(catalogEvents.processedAt),
              ),
            )
            .limit(1);
          const [latest] = await database
            .select({ checkpoint: catalogSources.checkpoint })
            .from(catalogSources)
            .where(eq(catalogSources.id, sourceId))
            .limit(1);
          await database
            .update(catalogSources)
            .set({
              leaseToken: null,
              leaseExpiresAt: null,
              nextAttemptAt: new Date(
                checkpoint.mode
                  ? Math.max(
                      Date.now(),
                      inventoryState(latest?.checkpoint).apiAfter ?? 0,
                    )
                  : Math.min(
                      reconcileAt,
                      Number.isFinite(hooksAt) ? hooksAt : Infinity,
                      arrived
                        ? Math.max(
                            Date.now(),
                            inventoryState(latest?.checkpoint).apiAfter ?? 0,
                          )
                        : inventoryWake(latest?.checkpoint),
                    ),
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
      }
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
          const demand = inventoryState(owned.checkpoint);
          checkpoint.inventory = {
            ...inventoryState(checkpoint),
            activeUntil: Math.max(
              inventoryState(checkpoint).activeUntil ?? 0,
              demand.activeUntil ?? 0,
            ),
          };
          await run(tx);
        });
      }
      function webhookDeadline() {
        const at = Date.parse(checkpoint.webhooks?.nextCheckAt ?? "");
        return registerWebhooks && Number.isFinite(at) ? at : Infinity;
      }
      if (registerWebhooks) {
        const registration = await registerWebhooks({
          install,
          sourceId,
          leaseToken,
          scopes,
          state: checkpoint.webhooks,
        });
        if (registration.didWork) {
          checkpoint.webhooks = registration.state;
          await persist(async (tx) => {
            await tx
              .update(catalogSources)
              .set({
                checkpoint,
                status:
                  checkpoint.mode ||
                  !source.initialSyncCompletedAt ||
                  registration.delayMs > 0
                    ? "syncing"
                    : source.status,
                grantedScopes: scopes,
                leaseToken: null,
                leaseExpiresAt: null,
                nextAttemptAt: new Date(Date.now() + registration.delayMs),
              })
              .where(eq(catalogSources.id, sourceId));
          });
          return;
        }
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
          Date.now() >=
            source.lastSyncAt.getTime() +
              catalogReconciliationIntervalMs(
                await productCount(install.userId, sourceId),
                checkpoint.lastFullDurationMs,
              ) ||
          source.requestedAt.getTime() > source.lastSyncAt.getTime();
        if (!full && !pending.length) {
          await database
            .update(catalogSources)
            .set({
              status: source.errorCode ? source.status : "ready",
              leaseToken: null,
              leaseExpiresAt: null,
              nextAttemptAt: new Date(
                Math.min(
                  webhookDeadline(),
                  inventoryWake(checkpoint),
                  source.lastSyncAt!.getTime() +
                    catalogReconciliationIntervalMs(
                      await productCount(install.userId, sourceId),
                      checkpoint.lastFullDurationMs,
                    ),
                ),
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
            else if (event.topic.startsWith("collections/"))
              ids.push(`gid://shopify/Collection/${event.resourceId}`);
            else if (event.topic.startsWith("inventory_")) {
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
              if (!rows.length)
                ids.push(`gid://shopify/InventoryItem/${event.resourceId}`);
            }
          }
        // Inventory and collection markers resolve to bounded targeted product pages inside the chunk budget.
        const mode = full ? "full" : "events";
        checkpoint = {
          mode,
          startedAt: mode === "full" ? new Date().toISOString() : undefined,
          lastFullDurationMs: checkpoint.lastFullDurationMs,
          webhooks: checkpoint.webhooks,
          inventory: checkpoint.inventory,
          after: null,
          pending: full ? [] : [...new Set(ids)],
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
      function observeQuota(data: any) {
        const throttle = data.__throttle;
        if (throttle && throttle.currentlyAvailable < 300)
          delay = Math.max(
            1000,
            Math.ceil(
              ((300 - throttle.currentlyAvailable) /
                Math.max(1, throttle.restoreRate ?? 50)) *
                1000,
            ),
          );
        if (delay > 0)
          checkpoint.inventory = {
            ...inventoryState(checkpoint),
            apiAfter: Math.max(
              inventoryState(checkpoint).apiAfter ?? 0,
              Date.now() + delay,
            ),
          };
      }
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
              const completedAt = new Date();
              const lastFull =
                checkpoint.mode === "full" ? completedAt : source.lastSyncAt!;
              const start = Date.parse(checkpoint.startedAt ?? "");
              const lastFullDurationMs =
                checkpoint.mode === "full" && Number.isFinite(start)
                  ? Math.max(0, completedAt.getTime() - start)
                  : (checkpoint.lastFullDurationMs ?? 0);
              const [remaining] = await tx
                .select({ id: catalogEvents.id })
                .from(catalogEvents)
                .where(
                  and(
                    eq(catalogEvents.sourceId, sourceId),
                    isNull(catalogEvents.processedAt),
                  ),
                )
                .limit(1);
              const [latest] = await tx
                .select({ requestedAt: catalogSources.requestedAt })
                .from(catalogSources)
                .where(eq(catalogSources.id, sourceId))
                .limit(1);
              const manualPending =
                checkpoint.mode === "events" && latest.requestedAt > lastFull;
              const reconcileAt = new Date(
                lastFull.getTime() +
                  catalogReconciliationIntervalMs(
                    await productCount(install.userId, sourceId, tx),
                    lastFullDurationMs,
                  ),
              );
              await tx
                .update(catalogSources)
                .set({
                  status: "ready",
                  initialSyncCompletedAt:
                    source.initialSyncCompletedAt ?? completedAt,
                  lastSyncAt: lastFull,
                  checkpoint: {
                    lastFullDurationMs,
                    webhooks: checkpoint.webhooks,
                    inventory: checkpoint.inventory,
                  },
                  generation: null,
                  errorCode: null,
                  attempts: 0,
                  nextAttemptAt:
                    remaining || manualPending
                      ? completedAt
                      : new Date(
                          Math.min(
                            reconcileAt.getTime(),
                            webhookDeadline(),
                            inventoryWake(checkpoint),
                          ),
                        ),
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
          observeQuota(data);
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
          if (delay > 0) break;
          continue;
        }
        const id = checkpoint.pending![0];
        if (id.startsWith("gid://shopify/InventoryItem/")) {
          const data = await request(SHOPIFY_CATALOG_INVENTORY_PRODUCT_QUERY, {
            id,
          });
          observeQuota(data);
          if (
            data.inventoryItem !== null &&
            (!data.inventoryItem || data.inventoryItem.id !== id)
          )
            throw new CatalogApiError("invalid_response");
          const productId =
            data.inventoryItem === null
              ? null
              : gid(data.inventoryItem.variant?.product?.id, "Product");
          await persist(async (tx) => {
            checkpoint.pending!.shift();
            if (productId && !checkpoint.pending!.includes(productId))
              checkpoint.pending!.unshift(productId);
            await tx
              .update(catalogSources)
              .set({ checkpoint })
              .where(eq(catalogSources.id, sourceId));
          });
          if (delay > 0) break;
          continue;
        }
        if (id.startsWith("gid://shopify/Collection/")) {
          const current = checkpoint.collection ?? {
            id,
            providerAfter: null,
            providerDone: false,
            localAfter: null,
            localDone: false,
          };
          if (current.id !== id) throw new CatalogApiError("invalid_response");
          let ids: string[] = [];
          if (!current.providerDone) {
            const data = await request(
              SHOPIFY_CATALOG_COLLECTION_PRODUCTS_QUERY,
              { id, after: current.providerAfter },
            );
            observeQuota(data);
            if (
              data.collection !== null &&
              (!data.collection || data.collection.id !== id)
            )
              throw new CatalogApiError("invalid_response");
            const page =
              data.collection === null
                ? { nodes: [], cursor: null }
                : readConnection(data.collection.products);
            if (page.cursor && page.cursor === current.providerAfter)
              throw new CatalogApiError("invalid_response");
            current.providerAfter = page.cursor;
            current.providerDone = page.cursor === null;
            ids = page.nodes.map((n) => gid(n.id, "Product"));
          } else if (!current.localDone) {
            const rows = await database
              .select({ externalId: catalogProducts.externalId })
              .from(catalogMemberships)
              .innerJoin(
                catalogProducts,
                eq(catalogProducts.id, catalogMemberships.productId),
              )
              .innerJoin(
                catalogCollections,
                eq(catalogCollections.id, catalogMemberships.collectionId),
              )
              .where(
                and(
                  eq(catalogProducts.userId, install.userId),
                  eq(catalogProducts.sourceId, sourceId),
                  eq(catalogCollections.userId, install.userId),
                  eq(catalogCollections.sourceId, sourceId),
                  eq(catalogCollections.externalId, id),
                  current.localAfter
                    ? sql`${catalogProducts.externalId}>${current.localAfter}`
                    : undefined,
                ),
              )
              .orderBy(catalogProducts.externalId)
              .limit(50);
            ids = rows.map((r) => r.externalId);
            current.localAfter = ids[ids.length - 1] ?? current.localAfter;
            current.localDone = rows.length < 50;
          }
          await persist(async (tx) => {
            checkpoint.pending!.shift();
            if (current.providerDone && current.localDone)
              delete checkpoint.collection;
            else {
              checkpoint.collection = current;
              checkpoint.pending!.unshift(id);
            }
            checkpoint.pending!.unshift(...new Set(ids));
            await tx
              .update(catalogSources)
              .set({ checkpoint })
              .where(eq(catalogSources.id, sourceId));
          });
          if (delay > 0) break;
          continue;
        }
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
        observeQuota(data);
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
          if (delay > 0) break;
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
          if (delay > 0) break;
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
            published: isShopifyProductPublished(product),
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
              requiresComponents: v.requiresComponents !== false,
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
            checkpoint.inventory = {
              ...inventoryState(checkpoint),
              errorCode: null,
              failures: 0,
            };
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
        if (delay > 0) break;
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

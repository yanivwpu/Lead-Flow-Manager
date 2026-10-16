import { inventoryState } from "./inventory";
import {
  CATALOG_FRESH_MS,
  SHOPIFY_CATALOG_SCOPES,
} from "@shared/commerceCatalog";
import type { CatalogWebhookState } from "./registration";
import { resolveCatalogInstallation } from "./installation";
import type { CatalogDb, createCommerceStore } from "../commerceStore";
export async function catalogReadiness(
  database: CatalogDb,
  store: ReturnType<typeof createCommerceStore>,
  userId: string,
) {
  const install = await resolveCatalogInstallation(database, userId);
  const source = install ? await store.source(userId) : null;
  const scopes = (source?.grantedScopes ?? []) as string[];
  const completed = !!source?.initialSyncCompletedAt;
  const summary = source
    ? await store.inventorySummary(userId, source.id)
    : { published: 0, unverified: 0, lastVerifiedAt: null };
  const fresh =
    summary.unverified === 0 &&
    !!summary.lastVerifiedAt &&
    Date.now() - new Date(summary.lastVerifiedAt).getTime() <
      CATALOG_FRESH_MS &&
    !source?.errorCode;
  const searchable =
    !!install &&
    completed &&
    scopes.includes("read_products") &&
    !["permission_required", "disconnected"].includes(source!.status);
  const savedHooks = (
    source?.checkpoint as { webhooks?: CatalogWebhookState } | undefined
  )?.webhooks;
  const hooks =
    savedHooks?.scopesKey === [...scopes].sort().join(",")
      ? savedHooks
      : undefined;
  const hookStatuses = Object.values(hooks?.statuses ?? {});
  const hookRetry = hookStatuses.some(
    (s) => !["registered", "already_registered", "skipped_scope"].includes(s),
  );
  const inventory = inventoryState(source?.checkpoint);
  return {
    inventoryRefresh: {
      status: inventory.errorCode
        ? "backoff"
        : (inventory.activeUntil ?? 0) > Date.now()
          ? "active"
          : "idle",
      errorCode: inventory.errorCode ?? null,
      nextCheckAt: inventory.nextAt ?? null,
    },
    catalogWebhooks: {
      status: !hooks
        ? "pending"
        : hookRetry
          ? "retrying"
          : !hooks.completedAt || hooks.cursor !== 0
            ? "pending"
            : hookStatuses.includes("skipped_scope")
              ? "partial"
              : "verified",
      verifiedAt: hooks?.completedAt ?? null,
      nextCheckAt: hooks?.nextCheckAt ?? null,
      registeredCount: hookStatuses.filter((s) =>
        ["registered", "already_registered"].includes(s),
      ).length,
    },
    connection: install ? "connected" : "disconnected",
    sourceId: source?.id ?? null,
    status: !install
      ? "disconnected"
      : (source?.status ?? "permission_required"),
    missingScopes: SHOPIFY_CATALOG_SCOPES.filter((s) => !scopes.includes(s)),
    permissionsVerified: !!source && scopes.length > 0,
    initialSyncCompleted: completed,
    publishedProductCount: summary.published,
    inventoryUnverifiedProductCount: summary.unverified,
    inventoryVerifiedAt: summary.lastVerifiedAt,
    eligibleProductCount: source
      ? await store.eligibleCount(userId, source.id)
      : 0,
    inventoryCapability: scopes.includes("read_inventory")
      ? "aggregate_with_inventory_scope"
      : scopes.includes("read_products")
        ? "aggregate_polling"
        : "unavailable",
    searchReady: searchable,
    aiRetrievalAvailable: searchable,
    freshness: fresh ? "fresh" : "unknown_or_stale",
    lastSyncAt: source?.lastSyncAt ?? null,
    errorCode: source?.errorCode ?? null,
    authorizationEnabled: process.env.SHOPIFY_CATALOG_AUTH_ENABLED === "true",
  };
}

import type { InventoryProvider } from "./inventoryProviderSchema";

/**
 * Inventory feed roadmap (listing sync providers only — not CRM bridges):
 * - Primary: MLS Grid, Trestle, Bridge Interactive
 * - Secondary: IDX Broker, Showcase IDX, iHomefinder
 *
 * BoldTrail / Inside Real Estate: CRM intelligence only — no public MLS inventory API/feed.
 * Do not treat BoldTrail as an inventory source.
 */

/** User-facing provider labels (avoid technical jargon in primary UI). */
export const INVENTORY_PROVIDER_USER_LABELS: Record<InventoryProvider, string> = {
  mls_grid: "MLS Grid",
  trestle: "Trestle",
  bridge_interactive: "Bridge Interactive",
  showcase_idx: "Showcase IDX",
  idx_broker: "IDX Broker",
  ihomefinder: "iHomefinder",
  reso: "RESO feed",
  csv: "CSV import",
};

/** Provider picker — set `available: true` when connector ships. Order reflects roadmap priority. */
export const INVENTORY_PROVIDER_UI_OPTIONS: Array<{
  id: InventoryProvider;
  label: string;
  available: boolean;
  tier: "primary" | "secondary";
  helper?: string;
}> = [
  { id: "mls_grid", label: "MLS Grid", available: true, tier: "primary" },
  { id: "trestle", label: "Trestle", available: true, tier: "primary", helper: "CoreLogic Trestle RESO feed" },
  {
    id: "bridge_interactive",
    label: "Bridge Interactive",
    available: true,
    tier: "primary",
    helper:
      "Bridge Interactive RESO feed. Obtain your dataset ID and server token from your Bridge Data Output account.",
  },
  { id: "idx_broker", label: "IDX Broker", available: false, tier: "secondary", helper: "Coming soon" },
  {
    id: "showcase_idx",
    label: "Showcase IDX",
    available: false,
    tier: "secondary",
    helper: "Coming soon",
  },
  { id: "ihomefinder", label: "iHomefinder", available: false, tier: "secondary", helper: "Coming soon" },
];

const DEV_SEED_LABEL_PATTERN = /dev[\s-]?seed/i;

export function isDevSeedDisplayName(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return DEV_SEED_LABEL_PATTERN.test(value.trim());
}

export { isDevSeedOriginatingSystem } from "./inventoryDevSeedGuard";

/** Hide dev-seed labels in production UI — seed scripts unchanged. */
export function sanitizeInventoryDisplayNameForUi(
  value: string | null | undefined,
  isProduction: boolean,
): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (isProduction && isDevSeedDisplayName(v)) return "";
  return v;
}

export function sanitizeOriginatingSystemForUi(
  value: string | null | undefined,
  isProduction: boolean,
): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (isProduction && isDevSeedOriginatingSystem(v)) return "";
  return v;
}

export function inventoryProviderUserLabel(provider: string): string {
  const key = provider as InventoryProvider;
  return INVENTORY_PROVIDER_USER_LABELS[key] ?? "Inventory source";
}

export type InventorySyncStatRow = { label: string; value: string };

function statNumber(stats: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!stats || typeof stats !== "object") return null;
  const v = stats[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function statString(stats: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!stats || typeof stats !== "object") return null;
  const v = stats[key];
  return typeof v === "string" && v.trim() ? v : null;
}

function formatSyncTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

/** Key stats for the inventory status card. */
export function getInventoryStatusHighlights(
  stats: Record<string, unknown> | null | undefined,
): {
  newListings: number | null;
  priceChanges: number | null;
  updatedListings: number | null;
  inactiveListings: number | null;
} {
  const inactiveFromFeed = statNumber(stats, "inactiveFromFeed");
  const inactivated = statNumber(stats, "inactivated");
  const inactiveTotal = (inactiveFromFeed ?? 0) + (inactivated ?? 0);

  return {
    newListings: statNumber(stats, "newListings"),
    priceChanges: statNumber(stats, "priceChanges"),
    updatedListings: statNumber(stats, "updatedListings"),
    inactiveListings: inactiveTotal > 0 ? inactiveTotal : null,
  };
}

/** Production status card rows for Inventory Source settings. */
export function formatInventorySourceStatusRows(
  stats: Record<string, unknown> | null | undefined,
  config: Record<string, unknown> | null | undefined,
): InventorySyncStatRow[] {
  if (!stats || typeof stats !== "object") return [];

  const rows: InventorySyncStatRow[] = [];
  const n = (key: string) => statNumber(stats, key);

  const skippedDueToCap = n("skippedDueToCap");
  if (skippedDueToCap != null && skippedDueToCap > 0) {
    rows.push({ label: "Skipped due to cap", value: skippedDueToCap.toLocaleString() });
  }

  const skippedOutOfScope = n("skippedOutOfScope");
  if (skippedOutOfScope != null && skippedOutOfScope > 0) {
    rows.push({ label: "Skipped (out of scope)", value: skippedOutOfScope.toLocaleString() });
  }

  const synced = n("listingsUpserted") ?? n("listingsImported") ?? n("seenCount") ?? n("upserted");
  if (synced != null) rows.push({ label: "Last sync upserted", value: synced.toLocaleString() });

  const fetched = n("listingsFetched");
  if (fetched != null && fetched > 0) {
    rows.push({ label: "Last sync fetched", value: fetched.toLocaleString() });
  }

  const skipped = n("listingsSkipped") ?? n("skipped");
  if (skipped != null && skipped > 0) {
    rows.push({ label: "Skipped (invalid rows)", value: skipped.toLocaleString() });
  }

  const datasetId = statString(stats, "datasetId");
  if (datasetId) {
    rows.push({ label: "Dataset", value: datasetId });
  }

  const pagesFetched = n("pagesFetched");
  if (pagesFetched != null && pagesFetched > 0) {
    rows.push({ label: "Pages processed", value: pagesFetched.toLocaleString() });
  }

  const newListings = n("newListings");
  if (newListings != null) {
    rows.push({ label: "New listings", value: newListings.toLocaleString() });
  }

  const updated = n("updatedListings");
  if (updated != null) {
    rows.push({ label: "Updated listings", value: updated.toLocaleString() });
  }

  const inactiveFromFeed = n("inactiveFromFeed");
  const inactivated = n("inactivated");
  const inactiveTotal = (inactiveFromFeed ?? 0) + (inactivated ?? 0);
  if (inactiveTotal > 0) {
    rows.push({ label: "Inactive listings", value: inactiveTotal.toLocaleString() });
  }

  const priceChanges = n("priceChanges");
  if (priceChanges != null && priceChanges > 0) {
    rows.push({ label: "Price changes", value: priceChanges.toLocaleString() });
  }

  const lastSuccess =
    formatSyncTimestamp(statString(stats, "lastSuccessfulSyncAt")) ??
    formatSyncTimestamp(
      typeof config?.lastSuccessfulSyncAt === "string" ? config.lastSuccessfulSyncAt : null,
    );
  if (lastSuccess) {
    rows.push({ label: "Last successful sync", value: lastSuccess });
  }

  const lastFailed =
    formatSyncTimestamp(statString(stats, "lastFailedSyncAt")) ??
    formatSyncTimestamp(typeof config?.lastFailedSyncAt === "string" ? config.lastFailedSyncAt : null);
  if (lastFailed) {
    rows.push({ label: "Last failed sync", value: lastFailed });
  }

  return rows;
}

/** Human-readable last-sync stats for settings UI. */
export function formatInventorySyncStatRows(
  stats: Record<string, unknown> | null | undefined,
): InventorySyncStatRow[] {
  if (!stats || typeof stats !== "object") return [];

  const rows: InventorySyncStatRow[] = [];
  const n = (key: string) => statNumber(stats, key);

  const skippedDueToCap = n("skippedDueToCap");
  if (skippedDueToCap != null && skippedDueToCap > 0) {
    rows.push({ label: "Skipped due to cap", value: skippedDueToCap.toLocaleString() });
  }

  const skippedOutOfScope = n("skippedOutOfScope");
  if (skippedOutOfScope != null && skippedOutOfScope > 0) {
    rows.push({ label: "Skipped (out of scope)", value: skippedOutOfScope.toLocaleString() });
  }

  const synced = n("listingsUpserted") ?? n("listingsImported") ?? n("seenCount") ?? n("upserted");
  if (synced != null) rows.push({ label: "Last sync upserted", value: synced.toLocaleString() });

  const fetched = n("listingsFetched");
  if (fetched != null && fetched > 0) {
    rows.push({ label: "Last sync fetched", value: fetched.toLocaleString() });
  }

  const skipped = n("listingsSkipped") ?? n("skipped");
  if (skipped != null && skipped > 0) {
    rows.push({ label: "Skipped (invalid rows)", value: skipped.toLocaleString() });
  }

  const datasetId = statString(stats, "datasetId");
  if (datasetId) {
    rows.push({ label: "Dataset", value: datasetId });
  }

  const newListings = n("newListings");
  if (newListings != null && newListings > 0) {
    rows.push({ label: "New listings", value: newListings.toLocaleString() });
  }

  const updated = n("updatedListings");
  if (updated != null && updated > 0) {
    rows.push({ label: "Updated listings", value: updated.toLocaleString() });
  }

  const priceChanges = n("priceChanges");
  if (priceChanges != null && priceChanges > 0) {
    rows.push({ label: "Price changes", value: priceChanges.toLocaleString() });
  }

  const inactivated = n("inactivated");
  if (inactivated != null && inactivated > 0) {
    rows.push({ label: "Inactive listings", value: inactivated.toLocaleString() });
  }

  const inactiveFromFeed = n("inactiveFromFeed");
  if (inactiveFromFeed != null && inactiveFromFeed > 0) {
    rows.push({ label: "Removed from feed", value: inactiveFromFeed.toLocaleString() });
  }

  const syncMode = stats.syncMode;
  if (typeof syncMode === "string") {
    rows.push({ label: "Sync mode", value: syncMode });
  }

  const requestsMade = n("requestsMade");
  if (requestsMade != null && requestsMade > 0) {
    rows.push({ label: "API requests", value: requestsMade.toLocaleString() });
  }

  const rateLimitHits = n("rateLimitHits");
  if (rateLimitHits != null && rateLimitHits > 0) {
    rows.push({ label: "Rate limit retries", value: rateLimitHits.toLocaleString() });
  }

  const failureDiag = stats.failureDiagnostics;
  if (failureDiag && typeof failureDiag === "object") {
    const d = failureDiag as Record<string, unknown>;
    const httpStatus = typeof d.httpStatus === "number" ? d.httpStatus : null;
    if (httpStatus != null) {
      rows.push({ label: "HTTP status", value: String(httpStatus) });
    }
    const phase = typeof d.phase === "string" ? d.phase : null;
    if (phase) {
      rows.push({ label: "Failure phase", value: phase });
    }
    const requestUrl = typeof d.requestUrl === "string" ? d.requestUrl : null;
    if (requestUrl) {
      rows.push({ label: "Request URL", value: requestUrl.length > 80 ? `${requestUrl.slice(0, 80)}…` : requestUrl });
    }
    const oDataFilter = typeof d.oDataFilter === "string" ? d.oDataFilter : null;
    if (oDataFilter) {
      rows.push({
        label: "OData filter",
        value: oDataFilter.length > 80 ? `${oDataFilter.slice(0, 80)}…` : oDataFilter,
      });
    }
    const httpBody = typeof d.httpBody === "string" ? d.httpBody : null;
    if (httpBody) {
      rows.push({
        label: "API response",
        value: httpBody.length > 120 ? `${httpBody.slice(0, 120)}…` : httpBody,
      });
    }
  }

  return rows;
}

/** Map raw sync/validation errors to short user-facing text. */
export function friendlyInventoryErrorMessage(raw: string | null | undefined): string {
  if (!raw?.trim()) return "Something went wrong. Check your settings and try again.";
  const msg = raw.trim();
  if (msg.includes("MLS Grid HTTP 401") || msg.includes("Unauthorized")) {
    return "Access token was rejected. Confirm your token and originating system name, then validate again.";
  }
  if (msg.includes("MLS Grid HTTP 403")) {
    return "Access denied for this feed. Verify your data provider approved this connection.";
  }
  if (msg.includes("MLS Grid HTTP 429")) {
    return "Too many requests to the listing feed. Wait a few minutes and sync again.";
  }
  if (msg.includes("MLS Grid HTTP")) {
    return "Could not reach the listing feed. Try again later or contact your data provider.";
  }
  if (msg.includes("Trestle credentials were rejected") || msg.includes("Trestle authentication failed")) {
    return "Trestle credentials were rejected. Confirm your client ID, client secret, and originating system name.";
  }
  if (msg.includes("Trestle HTTP 401") || msg.includes("Trestle HTTP 403")) {
    return "Trestle access was denied. Verify your feed credentials with your data provider.";
  }
  if (msg.includes("Trestle HTTP 429")) {
    return "Too many requests to Trestle. Wait a few minutes and sync again.";
  }
  if (msg.includes("Trestle HTTP")) {
    return "Could not reach Trestle. Try again later or contact your data provider.";
  }
  if (msg.includes("Bridge Interactive HTTP 401") || msg.includes("Bridge Interactive HTTP 403")) {
    return "Bridge server token was rejected. Confirm your dataset ID and server token, then validate again.";
  }
  if (msg.includes("Bridge Interactive HTTP 429")) {
    return "Too many requests to Bridge Interactive. Wait a few minutes and sync again.";
  }
  if (msg.startsWith("Import failed:") || msg.startsWith("Connection failed:")) {
    return msg;
  }
  if (msg.includes("Bridge Interactive HTTP")) {
    return "Could not reach Bridge Interactive. Try again later or contact your data provider.";
  }
  if (msg.includes("datasetId") || msg.includes("Dataset ID")) {
    return "Dataset ID is required.";
  }
  if (msg.includes("serverToken") || msg.includes("server token")) {
    return "Server token is required when connecting a new inventory source.";
  }
  if (msg.includes("clientId") || msg.includes("clientSecret") || msg.includes("client ID")) {
    return "Trestle client ID and client secret are required when connecting a new inventory source.";
  }
  if (msg.includes("originatingSystemName")) {
    return "Originating system name is required.";
  }
  if (msg.includes("access token") || msg.includes("accessToken")) {
    return "Access token is required when connecting a new inventory source.";
  }
  if (msg.length > 280) return `${msg.slice(0, 277)}…`;
  return msg;
}

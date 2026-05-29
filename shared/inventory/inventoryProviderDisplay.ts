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
  { id: "trestle", label: "Trestle", available: false, tier: "primary", helper: "Coming soon" },
  {
    id: "bridge_interactive",
    label: "Bridge Interactive",
    available: false,
    tier: "primary",
    helper: "Coming soon",
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

export function isDevSeedOriginatingSystem(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const v = value.trim().toLowerCase();
  return v === "dev-seed" || v.includes("dev-seed");
}

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

  const synced = n("seenCount") ?? n("upserted");
  if (synced != null) rows.push({ label: "Listings synced", value: synced.toLocaleString() });

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

  const synced = n("seenCount") ?? n("upserted");
  if (synced != null) rows.push({ label: "Listings synced", value: synced.toLocaleString() });

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
  if (msg.includes("originatingSystemName")) {
    return "Originating system name is required.";
  }
  if (msg.includes("access token") || msg.includes("accessToken")) {
    return "Access token is required when connecting a new inventory source.";
  }
  if (msg.length > 280) return `${msg.slice(0, 277)}…`;
  return msg;
}

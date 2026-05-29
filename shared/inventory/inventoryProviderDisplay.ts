import type { InventoryProvider } from "./inventoryProviderSchema";

/** User-facing provider labels (avoid technical jargon in primary UI). */
export const INVENTORY_PROVIDER_USER_LABELS: Record<InventoryProvider, string> = {
  mls_grid: "MLS Grid",
  showcase_idx: "Showcase IDX",
  idx_broker: "IDX Broker",
  ihomefinder: "iHomefinder",
  reso: "RESO feed",
  csv: "CSV import",
};

/** Provider picker options — extend `available: true` when connector ships. */
export const INVENTORY_PROVIDER_UI_OPTIONS: Array<{
  id: InventoryProvider;
  label: string;
  available: boolean;
  helper?: string;
}> = [
  { id: "mls_grid", label: "MLS Grid", available: true },
  { id: "idx_broker", label: "IDX Broker", available: false, helper: "Coming soon" },
  { id: "showcase_idx", label: "Showcase IDX", available: false, helper: "Coming soon" },
  { id: "ihomefinder", label: "iHomefinder", available: false, helper: "Coming soon" },
  { id: "reso", label: "Other RESO feed", available: false, helper: "Coming soon" },
];

export function inventoryProviderUserLabel(provider: string): string {
  const key = provider as InventoryProvider;
  return INVENTORY_PROVIDER_USER_LABELS[key] ?? "Inventory source";
}

export type InventorySyncStatRow = { label: string; value: string };

/** Human-readable last-sync stats for settings UI. */
export function formatInventorySyncStatRows(
  stats: Record<string, unknown> | null | undefined,
): InventorySyncStatRow[] {
  if (!stats || typeof stats !== "object") return [];

  const rows: InventorySyncStatRow[] = [];
  const n = (key: string) => {
    const v = stats[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

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

import { z } from "zod";

/** Inventory feed providers (Showcase = lead-only stub for listing sync). */
export const inventoryProviderSchema = z.enum([
  "mls_grid",
  "trestle",
  "bridge_interactive",
  "showcase_idx",
  "idx_broker",
  "ihomefinder",
  "reso",
  "csv",
]);

export type InventoryProvider = z.infer<typeof inventoryProviderSchema>;

export const inventoryConnectionStatusSchema = z.enum([
  "disconnected",
  "configuring",
  "connected",
  "error",
  "disconnected_by_user",
]);

export type InventoryConnectionStatus = z.infer<typeof inventoryConnectionStatusSchema>;

export const inventorySyncStatusSchema = z.enum([
  "idle",
  "running",
  "success",
  "partial",
  "failed",
]);

export type InventorySyncStatus = z.infer<typeof inventorySyncStatusSchema>;

/** Internal / admin labels — prefer `inventoryProviderUserLabel()` in UI. */
export const INVENTORY_PROVIDER_LABELS: Record<InventoryProvider, string> = {
  mls_grid: "MLS Grid",
  trestle: "Trestle",
  bridge_interactive: "Bridge Interactive",
  showcase_idx: "Showcase IDX",
  idx_broker: "IDX Broker",
  ihomefinder: "iHomefinder",
  reso: "RESO feed",
  csv: "CSV import",
};

export const LISTING_SYNC_CAPABLE_PROVIDERS: InventoryProvider[] = ["mls_grid"];

export function providerSupportsListingSync(provider: InventoryProvider): boolean {
  return LISTING_SYNC_CAPABLE_PROVIDERS.includes(provider);
}

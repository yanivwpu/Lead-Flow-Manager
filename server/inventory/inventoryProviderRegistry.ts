import type { InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import { mlsGridInventoryAdapter } from "./providers/mlsGridInventoryAdapter";
import { showcaseIdxListingStubAdapter, createStubInventoryAdapter } from "./providers/stubInventoryAdapter";
import type { InventoryProviderAdapter } from "./providers/types";

const stubMessage = (label: string) =>
  `${label} listing sync is not available in this release. Connect your MLS inventory via an MLS Grid source.`;

const adapters: Record<InventoryProvider, InventoryProviderAdapter> = {
  mls_grid: mlsGridInventoryAdapter,
  showcase_idx: showcaseIdxListingStubAdapter,
  idx_broker: createStubInventoryAdapter("idx_broker", stubMessage("IDX Broker")),
  ihomefinder: createStubInventoryAdapter("ihomefinder", stubMessage("iHomefinder")),
  reso: createStubInventoryAdapter("reso", stubMessage("RESO")),
  csv: createStubInventoryAdapter(
    "csv",
    "CSV import is available as an admin fallback later. Connect your MLS inventory to sync listings.",
  ),
};

export function getInventoryProviderAdapter(provider: InventoryProvider): InventoryProviderAdapter {
  return adapters[provider];
}

import type { InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import { mlsGridInventoryAdapter } from "./providers/mlsGridInventoryAdapter";
import { trestleInventoryAdapter } from "./providers/trestleInventoryAdapter";
import { showcaseIdxListingStubAdapter, createStubInventoryAdapter } from "./providers/stubInventoryAdapter";
import type { InventoryProviderAdapter } from "./providers/types";

const stubMessage = (label: string) =>
  `${label} is not available yet. Use your active listing feed provider to connect inventory.`;

const adapters: Record<InventoryProvider, InventoryProviderAdapter> = {
  mls_grid: mlsGridInventoryAdapter,
  trestle: trestleInventoryAdapter,
  bridge_interactive: createStubInventoryAdapter(
    "bridge_interactive",
    stubMessage("Bridge Interactive"),
  ),
  showcase_idx: showcaseIdxListingStubAdapter,
  idx_broker: createStubInventoryAdapter("idx_broker", stubMessage("IDX Broker")),
  ihomefinder: createStubInventoryAdapter("ihomefinder", stubMessage("iHomefinder")),
  reso: createStubInventoryAdapter("reso", stubMessage("RESO")),
  csv: createStubInventoryAdapter(
    "csv",
    "CSV import is available as an admin fallback later. Connect a listing feed provider to sync inventory.",
  ),
};

export function getInventoryProviderAdapter(provider: InventoryProvider): InventoryProviderAdapter {
  return adapters[provider];
}

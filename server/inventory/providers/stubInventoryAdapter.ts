import type { InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import type {
  InventoryAdapterContext,
  InventoryProviderAdapter,
  ValidateConnectionResult,
} from "./types";

export function createStubInventoryAdapter(
  provider: InventoryProvider,
  message: string,
): InventoryProviderAdapter {
  return {
    provider,
    async validateConnection(): Promise<ValidateConnectionResult> {
      return { ok: false, message };
    },
    async fetchListings(): Promise<{ listings: unknown[]; pagesFetched: number }> {
      throw new Error(message);
    },
    normalizeListing(): null {
      return null;
    },
  };
}

export const showcaseIdxListingStubAdapter = createStubInventoryAdapter(
  "showcase_idx",
  "Showcase IDX supports lead and activity sync only. Connect a listing feed provider to sync inventory.",
);

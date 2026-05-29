import type { InventoryMatchDraftResponse } from "@shared/inventory/inventoryDraftTypes";
import { apiRequest } from "@/lib/queryClient";

export type FetchInventoryDraftInput = {
  contactId: string;
  listingId: string;
  reasons?: string[];
  opportunityType?: "new_listing" | "price_reduced";
  priceReductionLabel?: string | null;
};

export async function fetchInventoryMatchDraft(
  input: FetchInventoryDraftInput,
): Promise<InventoryMatchDraftResponse> {
  const res = await apiRequest(
    "POST",
    `/api/contacts/${input.contactId}/inventory-matches/${input.listingId}/draft`,
    {
      reasons: input.reasons,
      opportunityType: input.opportunityType,
      priceReductionLabel: input.priceReductionLabel,
    },
  );
  return res.json() as Promise<InventoryMatchDraftResponse>;
}

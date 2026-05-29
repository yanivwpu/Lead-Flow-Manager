import { z } from "zod";

export const inventoryMatchDraftRequestSchema = z.object({
  reasons: z.array(z.string()).optional(),
  opportunityType: z.enum(["new_listing", "price_reduced"]).optional(),
  priceReductionLabel: z.string().nullable().optional(),
});

export type InventoryMatchDraftRequest = z.infer<typeof inventoryMatchDraftRequestSchema>;

export const inventoryMatchDraftResponseSchema = z.object({
  draft: z.string(),
  matchBullets: z.array(z.string()),
  listingId: z.string(),
  contactId: z.string(),
});

export type InventoryMatchDraftResponse = z.infer<typeof inventoryMatchDraftResponseSchema>;

/**
 * Copilot dominant intent — latest message overrides stale profile state.
 */
import { hasInventoryPreferenceSignals } from "./buyerPreferenceInventorySignals";
import { isPureSellerIntent, type SellerIntentClass } from "./sellerIntent";

export type CopilotDominantIntent = "buyer" | "seller" | "mixed" | "neutral";

export function resolveCopilotDominantIntent(input: {
  inboundText?: string | null;
  sellerIntent?: SellerIntentClass | null;
}): CopilotDominantIntent {
  const sellerIntent = input.sellerIntent ?? null;
  if (sellerIntent === "seller_and_buyer") return "mixed";

  if (hasInventoryPreferenceSignals(input.inboundText ?? "")) return "buyer";

  if (isPureSellerIntent(sellerIntent) || sellerIntent === "seller_followup") {
    return "seller";
  }

  return "neutral";
}

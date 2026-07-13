/**
 * Copilot dominant intent — latest message overrides stale profile state.
 * Uses shared AI domain eligibility so Copilot and Suggest Reply agree.
 */
import {
  resolveAiConversationDomain,
  type AiDomainEligibilityInput,
} from "./aiDomainEligibility";
import type { SellerIntentClass } from "./sellerIntent";

export type CopilotDominantIntent = "buyer" | "seller" | "mixed" | "neutral";

export function resolveCopilotDominantIntent(input: {
  inboundText?: string | null;
  sellerIntent?: SellerIntentClass | null;
  conversationText?: string | null;
  leadType?: string | null;
  buyerProfileHasCriteria?: boolean;
  sellerProfileHasData?: boolean;
  contactEmail?: string | null;
  rgeInstalled?: boolean;
  industry?: string | null;
}): CopilotDominantIntent {
  const domainInput: AiDomainEligibilityInput = {
    inboundText: input.inboundText,
    conversationText: input.conversationText,
    sellerIntent: input.sellerIntent ?? null,
    leadType: input.leadType,
    buyerProfileHasCriteria: input.buyerProfileHasCriteria,
    sellerProfileHasData: input.sellerProfileHasData,
    contactEmail: input.contactEmail,
    rgeInstalled: input.rgeInstalled,
    industry: input.industry,
  };
  const domain = resolveAiConversationDomain(domainInput);
  switch (domain) {
    case "real_estate_buyer":
    case "real_estate_rental":
      return "buyer";
    case "real_estate_seller":
      return "seller";
    case "real_estate_mixed":
      return "mixed";
    default:
      return "neutral";
  }
}

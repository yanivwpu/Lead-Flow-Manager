import type { BuyerPreferenceProfile } from "@shared/buyerPreferenceSchema";
import { assessBuyerQualification } from "@shared/buyerQualification";

export const INVENTORY_MATCH_PAGE_SIZE = 10;

const OWNER_DEBUG_KEY = "lfm_inventory_debug";
const SUPPORT_DEBUG_KEY = "lfm_support_debug";

export function isInventoryOwnerDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(OWNER_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

export function isInventorySupportDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SUPPORT_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

export function formatInventoryMatchSummary(totalFound: number, showing: number): string {
  if (totalFound <= 0) return "No matches yet";
  if (showing >= totalFound) {
    return `${totalFound} match${totalFound === 1 ? "" : "es"} found`;
  }
  return `${totalFound} match${totalFound === 1 ? "" : "es"} found · Showing ${showing}`;
}

/** Copilot refine — one helpful narrowing question for the agent composer. */
export function buildInventoryRefineComposerPrompt(
  profile: BuyerPreferenceProfile,
  matchCount: number,
): string {
  const qualification = assessBuyerQualification({ profile, matchCount });
  const question = qualification.suggestedQuestion?.trim();
  if (!question) {
    return matchCount > INVENTORY_MATCH_PAGE_SIZE
      ? "What would help narrow these matches — area, budget, or must-haves?"
      : "What else should I know to refine your search?";
  }
  if (matchCount > INVENTORY_MATCH_PAGE_SIZE) {
    return `To narrow from ${matchCount} matches: ${question}`;
  }
  return question;
}

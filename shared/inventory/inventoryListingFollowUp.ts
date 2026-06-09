import { extractListingIdFromShareUrl } from "./listingViewUrl";

export type ConversationTurn = {
  role: string;
  content?: string;
};

/** Outbound message looks like a listing recommendation (composer format). */
export const LISTING_RECOMMENDATION_OUTBOUND_RE =
  /(?:View listing:\s*https?:\/\/|\$\d{1,3}(?:,\d{3})+[\s\S]{0,120}?(?:\d+(?:\.\d+)?\s*bed|\bbed\s*\/\s*\d))/i;

export const LISTING_FOLLOW_UP_INBOUND_RE =
  /\b(?:yes\s*(?:please|pls)?|send\s+(?:me\s+)?more\s+details|more\s+(?:details|info|information|photos|pictures|pics)|tell\s+me\s+more(?:\s+about\s+(?:it|this|the\s+(?:property|listing|condo|home|house))?)?|can\s+(?:you|i)\s+(?:see|get|send)\s+more|(?:looks?|sounds?)\s+good|(?:i'?m\s+)?interested|that\s+(?:one|listing|property)\s+(?:looks?|sounds?)\s+good)\b/i;

function lastOutboundMessage(history: ConversationTurn[] | undefined): string | null {
  if (!history?.length) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const role = (history[i].role || "").toLowerCase();
    if (role === "assistant" || role === "agent") {
      const content = (history[i].content || "").trim();
      if (content) return content;
    }
  }
  return null;
}

export function isListingRecommendationOutbound(content: string): boolean {
  return LISTING_RECOMMENDATION_OUTBOUND_RE.test(content);
}

export function parseListingIdFromRecommendation(content: string): string | null {
  const viewLine = content.match(/View listing:\s*(https?:\/\/\S+)/i);
  if (viewLine?.[1]) {
    const fromShare = extractListingIdFromShareUrl(viewLine[1]);
    if (fromShare) return fromShare;
  }
  const shareMatch = content.match(/\/share\/listings\/([0-9a-f-]{36})/i);
  return shareMatch?.[1] ?? null;
}

export function detectListingFollowUp(
  history: ConversationTurn[] | undefined,
  inbound: string,
): { active: boolean; listingId: string | null; lastRecommendation: string | null } {
  const trimmed = (inbound || "").trim();
  if (!trimmed || !LISTING_FOLLOW_UP_INBOUND_RE.test(trimmed)) {
    return { active: false, listingId: null, lastRecommendation: null };
  }
  const lastOut = lastOutboundMessage(history);
  if (!lastOut || !isListingRecommendationOutbound(lastOut)) {
    return { active: false, listingId: null, lastRecommendation: null };
  }
  return {
    active: true,
    listingId: parseListingIdFromRecommendation(lastOut),
    lastRecommendation: lastOut,
  };
}

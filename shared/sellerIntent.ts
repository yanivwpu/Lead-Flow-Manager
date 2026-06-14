/**
 * Seller lead intent classification — separate from buyer inventory matching.
 */

export type SellerIntentClass =
  | "seller_new"
  | "seller_followup"
  | "seller_valuation"
  | "seller_listing_consultation"
  | "seller_and_buyer";

const MIXED_SELL_BUY_RE =
  /\b(?:need|want|have)\s+to\s+sell\b[^.?!]{0,80}\b(?:and|&)\s+buy\b|\bsell\b[^.?!]{0,80}\b(?:and|then|before)\s+buy\b|\bsell\s+(?:my|our|the)\s+(?:current|existing)\s+(?:home|house|place|property)\b[^.?!]{0,80}\b(?:and|then|before|to)\b|\bsell\s+before\s+buying\b|\bupgrade\s+(?:to|into)\b[^.?!]{0,60}\bsell\b/i;

const SELLER_VALUATION_RE =
  /\b(?:what(?:'s|\s+is)\s+my\s+(?:home|house|property)\s+worth|home\s+worth|house\s+worth|property\s+worth|how\s+much\s+(?:can\s+(?:i|we)\s+get|is\s+my\s+(?:home|house|property)\s+worth)|market\s+value|valuation|valuations|cma|comparative\s+market\s+analysis|price\s+my\s+(?:home|house|property))\b/i;

const SELLER_LISTING_RE =
  /\b(?:list\s+my\s+(?:home|house|property)|help\s+(?:me\s+)?list|listing\s+consultation|sell\s+consultation|ready\s+to\s+list|thinking\s+about\s+listing|list\s+(?:the|this|our)\s+property)\b/i;

const SELLER_GENERAL_RE =
  /\b(?:want\s+to\s+sell|thinking\s+(?:about|of)\s+selling|planning\s+to\s+sell|looking\s+to\s+sell|sell\s+my\s+(?:home|house|property|place)|i(?:'m|\s+am)\s+selling|help\s+(?:me\s+)?sell)\b/i;

const SELLER_CONSULTATION_BOOKING_RE =
  /\b(?:schedule|book)\b[^.?!]{0,80}\b(?:listing\s+consultation|list(?:ing)?\s+consult|cma\s+(?:appointment|meeting|consultation)|valuation\s+(?:appointment|meeting|consultation)|seller\s+consultation)\b|\b(?:listing\s+consultation|cma\s+appointment|valuation\s+appointment)\b[^.?!]{0,40}\b(?:schedule|book)\b/i;

export function detectMixedSellerBuyerIntent(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return MIXED_SELL_BUY_RE.test(t);
}

export function detectPureSellerSignals(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return (
    SELLER_VALUATION_RE.test(t) ||
    SELLER_LISTING_RE.test(t) ||
    SELLER_GENERAL_RE.test(t)
  );
}

export function detectSellerConsultationBookingIntent(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return SELLER_CONSULTATION_BOOKING_RE.test(t);
}

export type ClassifySellerIntentInput = {
  inboundText: string;
  hasSellerProfile?: boolean;
  priorSellerIntent?: SellerIntentClass | null;
};

/** Classify seller intent from inbound text. Returns null when no seller signals. */
export function classifySellerIntent(input: ClassifySellerIntentInput): SellerIntentClass | null {
  const t = (input.inboundText || "").trim();
  if (!t) return null;

  if (detectMixedSellerBuyerIntent(t)) return "seller_and_buyer";
  if (SELLER_VALUATION_RE.test(t)) {
    return input.hasSellerProfile || input.priorSellerIntent ? "seller_followup" : "seller_valuation";
  }
  if (SELLER_LISTING_RE.test(t)) {
    return input.hasSellerProfile || input.priorSellerIntent ? "seller_followup" : "seller_listing_consultation";
  }
  if (SELLER_GENERAL_RE.test(t)) {
    return input.hasSellerProfile || input.priorSellerIntent ? "seller_followup" : "seller_new";
  }
  if (input.hasSellerProfile || input.priorSellerIntent) return "seller_followup";
  return null;
}

/** Pure seller paths skip buyer inventory matching and buyer qualification. */
export function isPureSellerIntent(intent: SellerIntentClass | null | undefined): boolean {
  return (
    intent === "seller_new" ||
    intent === "seller_followup" ||
    intent === "seller_valuation" ||
    intent === "seller_listing_consultation"
  );
}

export function isMixedSellerBuyerIntent(intent: SellerIntentClass | null | undefined): boolean {
  return intent === "seller_and_buyer";
}

/** Pure seller paths skip buyer inventory matching and buyer qualification. */
export function shouldSkipBuyerPipelineForSellerLead(
  sellerIntent: SellerIntentClass | null | undefined,
): boolean {
  return isPureSellerIntent(sellerIntent);
}

export function sellerIntentRouteLabel(intent: SellerIntentClass | null): string {
  return intent || "none";
}

/**
 * Lightweight conversation text signals shared by Copilot domain + seller intent.
 */

/** Greeting-only inbound — not enough evidence for high-intent Copilot actions. */
const GREETING_ONLY_RE =
  /^(?:hi+|hello+|hey+|howdy|hola+|yo+|sup)(?:\s+(?:there|all|folks|team))?[!?.\s]*$/i;
const GREETING_TIME_RE =
  /^(?:good\s+(?:morning|afternoon|evening))(?:\s+(?:there|all|folks|team))?[!?.\s]*$/i;

export function looksLikeGreetingOnly(text: string | null | undefined): boolean {
  const t = String(text || "").trim();
  if (!t || t.length > 48) return false;
  return GREETING_ONLY_RE.test(t) || GREETING_TIME_RE.test(t);
}

const WEBSITE_VISIT_RE =
  /\bvisit\s+(?:our\s+)?(?:website|site|app|portal|account)\b|\bvisit\s+[\w.-]+\.(?:com|net|org|io|co)\b/i;
const SHOWING_WORD_RE = /\b(?:showings?|open house|viewings?)\b/i;
const TOUR_WORD_RE = /\b(?:tour|tours)\b/i;
const VISIT_PROPERTY_RE =
  /\bvisit\s+(?:the\s+)?(?:property|home|house|condo|listing|place|unit|apartment)\b|\b(?:when\s+can\s+i|can\s+i|could\s+i|want\s+to|like\s+to)\s+visit\b/i;
const SCHEDULE_SHOWING_RE =
  /\b(?:schedule|book)\s+(?:a\s+)?(?:showing|tour|viewing|visit|appointment)\b/i;
const AVAILABLE_CREDIT_OR_PRODUCT_RE =
  /\bavailable\s+(?:credit|balance|funds?|plans?|slots?\s+on)\b|\b(?:product|credit|account)\s+availability\b/i;
const PROPERTY_NOUN_RE =
  /\b(?:condo(?:minium)?s?|homes?|houses?|propert(?:y|ies)|listings?|apartments?|units?|townhouses?)\b/i;

/**
 * Current-message showing / tour / visit-the-property intent.
 * Does not treat "visit example.com", "available credit", or "product availability"
 * as a real-estate showing.
 */
export function hasPropertyShowingIntent(text: string | null | undefined): boolean {
  const t = String(text || "");
  if (!t.trim()) return false;

  if (SHOWING_WORD_RE.test(t) || SCHEDULE_SHOWING_RE.test(t) || VISIT_PROPERTY_RE.test(t)) {
    return true;
  }
  if (TOUR_WORD_RE.test(t) && !/\btour\s+(?:de\s+france|guide|operator)\b/i.test(t)) {
    return true;
  }
  if (/\bis\s+(?:it|the\s+\w+)\s+(?:still\s+)?available\b/i.test(t)) return true;

  if (AVAILABLE_CREDIT_OR_PRODUCT_RE.test(t)) return false;
  if (WEBSITE_VISIT_RE.test(t)) return false;
  if (/\bavailable\b/i.test(t) && PROPERTY_NOUN_RE.test(t)) return true;
  return false;
}

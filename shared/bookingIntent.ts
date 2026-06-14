/**
 * High-confidence booking / showing intent — server fast-path (no debounce, no chatbot delay).
 */

const HIGH_CONFIDENCE_BOOKING_RE =
  /\b(?:let'?s|lets)\s+(?:schedule|book)\b|\bschedule\s+(?:a\s+)?(?:showing|viewing|tour|time|appointment|call)\b|\bbook(?:ing)?\s+(?:a\s+)?(?:showing|viewing|tour|appointment|call|slot|time)\b|\b(?:want|like|love)\s+to\s+(?:schedule|book)\s+(?:a\s+)?(?:showing|viewing|tour|appointment|call)\b|\b(?:pick|choose)\s+a\s+time\b|\b(?:showing|viewing|tour)\s+(?:on|for)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|next week|this week)\b|\b(?:on|this)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^.?!]{0,40}\b(?:showing|viewing|tour|visit)\b/i;

/** True when inbound should bypass buyer-pref debounce, chatbot delay, and inventory matching. */
export function detectHighConfidenceBookingIntent(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return HIGH_CONFIDENCE_BOOKING_RE.test(t);
}

export function bookingIntentRouteLabel(): "book" {
  return "book";
}

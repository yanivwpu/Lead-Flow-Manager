/**
 * High-confidence booking / showing intent — server fast-path (no debounce, no chatbot delay).
 * Also recognizes booking acknowledgment vs explicit link-resend on the same detector.
 */

const HIGH_CONFIDENCE_BOOKING_RE =
  /\b(?:let'?s|lets)\s+(?:schedule|book)\b|\bschedule\s+(?:a\s+)?(?:showing|viewing|tour|time|appointment|call)\b|\bbook(?:ing)?\s+(?:a\s+)?(?:showing|viewing|tour|appointment|call|slot|time)\b|\b(?:want|like|love)\s+to\s+(?:schedule|book)\s+(?:a\s+)?(?:showing|viewing|tour|appointment|call)\b|\b(?:can\s+(?:i|we)|want\s+to|like\s+to|need\s+to|please)\s+(?:pick|choose)\s+a\s+time\b|\b(?:showing|viewing|tour)\s+(?:on|for)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|next week|this week)\b|\b(?:on|this)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^.?!]{0,40}\b(?:showing|viewing|tour|visit)\b/i;

const BOOKING_ACKNOWLEDGMENT_RE =
  /\b(?:thanks?|thank\s+you|got\s+it|perfect|great|awesome|ok(?:ay)?|sounds\s+good)\b[\s,!.-]{0,20}(?:i(?:['’]ll| will)|gonna|going\s+to)?\s*(?:pick|choose|select|book)\b|\b(?:i(?:['’]ll| will)|gonna|going\s+to)\s+(?:pick|choose|select)\s+(?:a\s+)?(?:time|slot|date)\b|\bgracias\b[\s,!.-]{0,40}\b(?:elegir[eé]|escoger[eé]|voy\s+a\s+(?:elegir|escoger|reservar)|reservar[eé])\b|\b(?:elegir[eé]|escoger[eé]|voy\s+a\s+(?:elegir|escoger))\s+(?:un\s+)?(?:horario|hora|momento)\b|תודה[\s,!.-]{0,40}(?:אבחר|אקבע)|(?:אבחר|אקבע)\s+(?:שעה|זמן|מועד)/i;

const BOOKING_LINK_RESEND_RE =
  /\b(?:send|share|resend)\s+(?:me\s+)?(?:the\s+)?(?:link|url|calendly)\s+again\b|\b(?:link|url)\s+(?:again|one\s+more\s+time)\b|\b(?:link|url).{0,24}(?:didn['’]?t|doesn['’]?t|won['’]?t|not)\s+work\b|\b(?:broken|dead|invalid)\s+(?:link|url)\b|\bwhere(?:['’]s|\s+is)\s+(?:the\s+)?(?:link|url|calendly)\b|\bcan\s+you\s+(?:send|resend)\s+(?:the\s+)?(?:link|url|calendly)\b|\b(?:env[ií]a|manda).{0,24}(?:enlace|link).{0,12}(?:otra\s+vez|de\s+nuevo)\b|\b(?:el\s+)?(?:enlace|link).{0,24}(?:no\s+funciona|roto)\b|שלח(?:י)?\s+(?:את\s+)?(?:הקישור|הלינק)\s+שוב|הקישור.{0,18}לא\s+עובד/i;

export type BookingHistoryTurn = {
  role?: string | null;
  content?: string | null;
};

function lastNonUserTurn(
  history?: BookingHistoryTurn[] | null,
): BookingHistoryTurn | null {
  if (!history?.length) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const role = String(history[i]?.role || "").toLowerCase();
    if (role === "user" || role === "inbound") continue;
    return history[i];
  }
  return null;
}

/** Last assistant/outbound Calendly URL already shown to the visitor. */
export function lastAssistantCalendlyUrl(history?: BookingHistoryTurn[] | null): string | null {
  const turn = lastNonUserTurn(history);
  const content = turn?.content || "";
  if (!content || !/calendly\.com/i.test(content)) return null;
  const match = content.match(/https?:\/\/[^\s<>"')]*calendly\.com[^\s<>"')]*/i);
  return match?.[0]?.replace(/[.,!?;:]+$/, "") || null;
}

export function priorAssistantAlreadySentCalendly(history?: BookingHistoryTurn[] | null): boolean {
  return Boolean(lastAssistantCalendlyUrl(history));
}

/** Visitor is acknowledging a just-sent booking link, not requesting a new one. */
export function detectBookingAcknowledgment(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (detectBookingLinkResendRequest(t)) return false;
  return BOOKING_ACKNOWLEDGMENT_RE.test(t);
}

/** Visitor asked to resend the same verified URL, or said the prior link failed. */
export function detectBookingLinkResendRequest(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return BOOKING_LINK_RESEND_RE.test(t);
}

export function isBookingAcknowledgmentAfterLink(input: {
  inbound?: string | null;
  history?: BookingHistoryTurn[] | null;
}): boolean {
  return (
    detectBookingAcknowledgment(input.inbound) &&
    priorAssistantAlreadySentCalendly(input.history)
  );
}

export function isBookingLinkResendAfterLink(input: {
  inbound?: string | null;
  history?: BookingHistoryTurn[] | null;
}): boolean {
  return (
    detectBookingLinkResendRequest(input.inbound) &&
    priorAssistantAlreadySentCalendly(input.history)
  );
}

/** True when inbound should bypass buyer-pref debounce, chatbot delay, and inventory matching. */
export function detectHighConfidenceBookingIntent(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (detectBookingAcknowledgment(t)) return false;
  return HIGH_CONFIDENCE_BOOKING_RE.test(t);
}

export function bookingIntentRouteLabel(): "book" {
  return "book";
}

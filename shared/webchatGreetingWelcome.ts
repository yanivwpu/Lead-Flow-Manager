/**
 * Web Chat greeting welcome policy.
 * A casual greeting may receive one brief welcome. It must not collect personal
 * data or invent business facts.
 */

const GREETING_ONLY =
  /^(hi|hello|hey|yo|sup|hola|good morning|good afternoon|good evening|gm|gn|howdy|greetings|good day)[\s!?.]*$/i;

/** "Hello guys." is still a greeting, not a knowledge question. */
const WEBCHAT_CASUAL_GREETING =
  /^(hi|hello|hey|yo|sup|hola|good morning|good afternoon|good evening|gm|gn|howdy|greetings|good day)([\s,]+[a-z]{1,16}){0,3}[\s!?.]*$/i;

export function isCasualWebchatGreeting(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return GREETING_ONLY.test(t) || WEBCHAT_CASUAL_GREETING.test(t);
}

export type UnsafeWebchatGreetingWelcomeReason =
  | "trivial"
  | "too_long"
  | "personal_data_request"
  | "invented_business_fact";

const PERSONAL_DATA_RE =
  /\b(e-?mail|phone|telephone|mobile|cell|whatsapp|your name|full name|first name|last name|consent|opt-?in|privacy policy|terms of (service|use)|book(ing)?|schedule|appointment|calendly|tour|showing|consultation|budget|pre-?approv|qualif(?:y|ication)|timeline|financ(?:e|ing)|best (phone )?number|reach you|contact (info|details|information)|callback|share your|tell us your|what(?:'s| is) your (name|email|phone|number))\b/i;

const INVENTED_FACT_RE =
  /\b(business hours|our hours|open until|open from|we(?:'re| are) open|\$\d|\d+\s*(usd|dollars)|pric(?:e|ing)|our rates?|% off|discount|promo|availab(?:le|ility)|in stock|slots? (open|left)|have openings|package|special offer|promotion)\b/i;

export function unsafeWebchatGreetingWelcomeReason(
  text: string,
): UnsafeWebchatGreetingWelcomeReason | null {
  const t = text.trim();
  if (!t || t.length <= 5) return "trivial";
  if (t.length > 400) return "too_long";
  if ((t.match(/[.!?]/g) || []).length > 4) return "too_long";
  if (PERSONAL_DATA_RE.test(t)) return "personal_data_request";
  if (INVENTED_FACT_RE.test(t)) return "invented_business_fact";
  return null;
}

export function isSafeWebchatGreetingWelcome(text: string): boolean {
  return unsafeWebchatGreetingWelcomeReason(text) === null;
}

export function webchatSafeGreetingWelcome(businessName?: string | null): string {
  const name = String(businessName || "")
    .trim()
    .replace(/\s+/g, " ");
  if (name.length >= 2 && name.length <= 80 && !/[{}\[\]<>]/.test(name)) {
    return `Hi, thanks for reaching out to ${name}. How can we help?`;
  }
  return "Hi, thanks for reaching out. How can we help?";
}

export function coerceWebchatGreetingWelcome(
  suggestion: string,
  businessName?: string | null,
): { text: string; coerced: boolean } {
  const trimmed = String(suggestion || "").trim();
  if (isSafeWebchatGreetingWelcome(trimmed)) {
    return { text: trimmed, coerced: false };
  }
  return { text: webchatSafeGreetingWelcome(businessName), coerced: true };
}

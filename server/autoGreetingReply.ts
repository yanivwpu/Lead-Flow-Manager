/**
 * Conversation-aware auto-reply copy for simple greetings (business auto-reply path).
 * Does not affect away messages, handoff, chatbot, or AI intent flows.
 */

/** Matches standalone greetings (aligned with aiAutoSendGate GREETING_ONLY, slightly permissive). */
const PURE_GREETING_RE =
  /^(hi|hello|hey|yo|sup|hola|good morning|good afternoon|good evening|gm|gn|howdy|greetings|good day)[\s!?.]*$/i;

export type GreetingInboundKind = "none" | "pure" | "impatience";

/**
 * Classify short inbound text as impatience (Hello?, Hi??) vs pure greeting vs not a greeting opener.
 */
export function classifyGreetingInbound(text: string): GreetingInboundKind {
  const t = text.trim();
  if (!t || t.length > 120) return "none";

  const lower = t.toLowerCase();
  const greetingStem =
    /^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup|hola|howdy|greetings|good day)\b/i;
  if (!greetingStem.test(lower)) return "none";

  // Impatience: repeated punctuation or multiple question marks (user feels ignored)
  if (/\?\?/.test(t)) return "impatience";
  if (/\?$/.test(t) && t.length <= 35) return "impatience";
  if (/!{2,}/.test(t) && t.length <= 40) return "impatience";

  if (PURE_GREETING_RE.test(t)) return "pure";
  return "none";
}

const LIGHT_FOLLOWUP = "Hi again! How can I help?";
const IMPATIENCE_REPLY = "Hey! Sorry about that — how can I help?";

/** Example niche opener for real estate (matches product examples). */
export function nicheGreetingOpener(industryRaw: string | null | undefined): string {
  const i = (industryRaw || "").toLowerCase();
  if (
    i.includes("real estate") ||
    i.includes("real_estate") ||
    i.includes("realtor") ||
    i.includes("property")
  ) {
    return "Hi! Are you looking to buy or sell?";
  }
  if (i.includes("clinic") || i.includes("health") || i.includes("medical") || i.includes("dental")) {
    return "Hi! How can we help you today?";
  }
  if (i.includes("travel") || i.includes("tour")) {
    return "Hi! Where would you like to go?";
  }
  return "Hi! What can we help you with today?";
}

export function getLightGreetingFollowup(): string {
  return LIGHT_FOLLOWUP;
}

export function getImpatienceGreetingReply(): string {
  return IMPATIENCE_REPLY;
}

export const GREETING_ACTIVITY = {
  niche: "auto_greeting_niche",
  light: "auto_greeting_light",
  impatience: "auto_greeting_impatience",
} as const;

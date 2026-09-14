/**
 * Context assembled after a chatbot Ask Question turn completes.
 * Keeps AI replies relevant to visitor_intent without tenant-specific hardcoding.
 */

import { resolveAiRouting, type AiRoutingResult } from "./aiRouting";
import {
  detectBookingAcknowledgment,
  detectBookingLinkResendRequest,
  lastAssistantCalendlyUrl,
} from "./bookingIntent";
import { usableVisitorPersonalizationName } from "./visitorNamePersonalization";

export type ChatbotVisitorIntentKind =
  | "features_pricing"
  | "find_solution"
  | "calculate_savings"
  | "book_demo"
  | "other";

export type ChatbotVarRecord = Record<string, { value?: unknown } | unknown>;

export function readChatbotVars(customFields: unknown): Record<string, string> {
  const cf = customFields && typeof customFields === "object" ? (customFields as Record<string, unknown>) : {};
  const raw = cf.chatbotVars;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw as ChatbotVarRecord)) {
    if (!key || key.length > 40) continue;
    if (val && typeof val === "object" && !Array.isArray(val) && typeof (val as { value?: unknown }).value === "string") {
      out[key] = String((val as { value: string }).value).slice(0, 500);
    } else if (typeof val === "string") {
      out[key] = val.slice(0, 500);
    }
  }
  return out;
}

export function classifyChatbotVisitorIntent(text: unknown): ChatbotVisitorIntentKind {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return "other";
  if (
    /\b(?:book(?:ing)?\s+(?:a\s+)?demo|book\s+a\s+live\s+demo|schedule\s+(?:a\s+)?demo|demo\s+call)\b/.test(t) ||
    t === "book a demo" ||
    /קביעת\s*הדגמה|לקבוע\s*הדגמה|הזמן(?:ת)?\s*הדגמה|קבע(?:ו)?\s*הדגמה/.test(t) ||
    /reservar\s+(?:una\s+)?demo|agendar\s+(?:una\s+)?demo|reservar\s+(?:una\s+)?demostraci[oó]n/.test(t) ||
    /أريد\s+حجز|حجز\s+(?:موعد|عرض)|موعد\s+تجريب/.test(t) ||
    /预约|预约演示|我想预约|安排演示/.test(t)
  ) {
    return "book_demo";
  }
  if (
    /\bcalculate(?:\s+my)?\s+savings\b/.test(t) ||
    t === "calculate my savings" ||
    /calcular\s+(?:mi\s+)?ahorro/.test(t) ||
    /חישוב\s+החיסכון|החיסכון\s+שלי/.test(t)
  ) {
    return "calculate_savings";
  }
  if (
    /\b(?:find(?:ing)?\s+my\s+solution|find\s+the\s+right\s+solution|which\s+plan|what\s+plan|help me choose|choose the right|right setup|right plan)\b/.test(t) ||
    t === "find my solution" ||
    /למצוא\s+את\s+הפתרון|הפתרון\s+שלי/.test(t) ||
    /encontrar\s+mi\s+soluci[oó]n|encontrar\s+la\s+soluci[oó]n/.test(t) ||
    /帮我选|哪个方案|适合我/.test(t)
  ) {
    return "find_solution";
  }
  if (
    /\b(?:features?\s*(?:&|and)?\s*pricing|pricing|prices?|plans?|what\s+does\s+it\s+cost|how\s+much|compare\s+(?:plans?|pricing|free)|free\s*(?:&|and)\s*pro)\b/.test(t) ||
    t === "features & pricing" ||
    t === "features and pricing" ||
    t === "compare free & pro" ||
    /comparar\s+(?:planes?|free)/.test(t) ||
    /השוואת/.test(t) ||
    /פיצ['׳]רים\s+ומחירים|תכונות\s+ומחירים/.test(t) ||
    /caracter[ií]sticas\s+y\s+precios|funciones\s+y\s+precios/.test(t)
  ) {
    return "features_pricing";
  }
  return "other";
}

export function visitorIntentAllowsBookingCta(
  intent: ChatbotVisitorIntentKind,
  routing?: Pick<AiRoutingResult, "decision" | "needsRoutingClarification"> | null,
): boolean {
  if (intent === "book_demo") return true;
  if (intent === "features_pricing" || intent === "find_solution" || intent === "calculate_savings") {
    return false;
  }
  return routing?.decision === "BOOK_APPOINTMENT" && routing.needsRoutingClarification !== true;
}

function visitorKindFromPageAction(kind?: string | null): ChatbotVisitorIntentKind | null {
  if (kind === "book_demo") return "book_demo";
  if (kind === "calculate_savings") return "calculate_savings";
  if (kind === "compare_plans" || kind === "features_pricing") return "features_pricing";
  if (kind === "find_solution") return "find_solution";
  if (kind === "other") return "other";
  return null;
}

/**
 * One current-turn booking result for first inbound, quick replies, opening match,
 * later free-text, and follow-ups after pricing. Reuses existing classifiers only.
 */
export function isCanonicalBookingTurn(input: {
  inbound?: string | null;
  history?: Array<{ role: string; content?: string }>;
  pageActionKind?: string | null;
}): boolean {
  const inbound = (input.inbound || "").trim();
  const fromPage = visitorKindFromPageAction(input.pageActionKind);
  if (fromPage === "book_demo") return true;
  if (fromPage && fromPage !== "other") return false;
  if (!inbound) return false;
  if (detectBookingAcknowledgment(inbound) && lastAssistantCalendlyUrl(input.history)) {
    return detectBookingLinkResendRequest(inbound);
  }
  if (detectBookingLinkResendRequest(inbound)) return true;
  if (classifyChatbotVisitorIntent(inbound) === "book_demo") return true;
  const routing = resolveAiRouting({
    inbound,
    joinedInbound: inbound,
    history: input.history,
  });
  return (
    (routing.decision === "BOOK_APPOINTMENT" && routing.needsRoutingClarification !== true) ||
    routing.subIntents.includes("booking_question")
  );
}

function currentTurnVisitorKind(input: {
  inbound?: string | null;
  visitorIntent?: string | null;
  history?: Array<{ role: string; content?: string }>;
  pageActionKind?: string | null;
}): ChatbotVisitorIntentKind {
  const inbound = input.inbound || "";
  const acknowledgment =
    detectBookingAcknowledgment(inbound) && Boolean(lastAssistantCalendlyUrl(input.history));
  if (acknowledgment && !detectBookingLinkResendRequest(inbound)) return "other";
  const fromPage = visitorKindFromPageAction(input.pageActionKind);
  if (fromPage) return fromPage;
  if (isCanonicalBookingTurn({ inbound, history: input.history })) return "book_demo";
  const currentKind = classifyChatbotVisitorIntent(inbound);
  if (currentKind !== "other") return currentKind;
  return classifyChatbotVisitorIntent(input.visitorIntent);
}

export function formatNaturalPrice(amount: number, period: "month" | "year", language?: string | null): string {
  const lang = String(language || "en").split("-")[0];
  const n = Number.isFinite(amount) ? amount : 0;
  const rounded = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, "");
  if (lang === "he") return period === "year" ? `$${rounded} לשנה` : `$${rounded} לחודש`;
  if (lang === "es") return period === "year" ? `$${rounded}/año` : `$${rounded}/mes`;
  return period === "year" ? `$${rounded}/year` : `$${rounded}/month`;
}

export function buildChatbotCompletionContactContext(input: {
  customFields?: unknown;
  name?: string | null;
  source?: string | null;
  sourceDetails?: unknown;
  leadSource?: string | null;
  conversationLanguage?: string | null;
  workspaceName?: string | null;
  pageTitle?: string | null;
}): {
  intent?: string;
  visitorIntent?: string;
  chatbotVariables?: string;
  leadSource?: string;
  name?: string;
  conversationLanguage?: string;
} {
  const vars = readChatbotVars(input.customFields);
  const visitorIntent = vars.visitor_intent || "";
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${v}`);
  const name = usableVisitorPersonalizationName({
    name: input.name,
    source: input.source,
    sourceDetails: input.sourceDetails,
    customFields: input.customFields,
    workspaceName: input.workspaceName,
    pageTitle: input.pageTitle,
  });
  return {
    ...(name ? { name } : {}),
    ...(input.leadSource ? { leadSource: input.leadSource } : {}),
    ...(visitorIntent ? { intent: visitorIntent, visitorIntent } : {}),
    ...(lines.length ? { chatbotVariables: lines.join("; ") } : {}),
    ...(input.conversationLanguage ? { conversationLanguage: input.conversationLanguage } : {}),
  };
}

export function resolveChatbotCompletionRouting(input: {
  inbound: string;
  visitorIntent?: string | null;
  history?: Array<{ role: string; content?: string }>;
  industry?: string;
  handoffKeywords?: string[];
  pageActionKind?: string | null;
}): AiRoutingResult {
  const acknowledgment =
    detectBookingAcknowledgment(input.inbound) && Boolean(lastAssistantCalendlyUrl(input.history));
  const resend = detectBookingLinkResendRequest(input.inbound);
  const currentBooking = isCanonicalBookingTurn({
    inbound: input.inbound,
    history: input.history,
    pageActionKind: input.pageActionKind,
  });
  const kind = currentTurnVisitorKind(input);
  const inbound =
    acknowledgment || resend || currentBooking || kind === "other"
      ? input.inbound
      : `${input.inbound}\n${input.visitorIntent || ""}`.trim();
  const routing = resolveAiRouting({
    inbound,
    joinedInbound: inbound,
    history: input.history,
    industry: input.industry,
    handoffKeywords: input.handoffKeywords,
  });
  if (acknowledgment) {
    return routing;
  }
  if (kind === "book_demo" && !routing.subIntents.includes("booking_question")) {
    return { ...routing, subIntents: [...routing.subIntents, "booking_question"] };
  }
  if (
    !currentBooking &&
    (kind === "features_pricing" || kind === "find_solution" || kind === "calculate_savings") &&
    routing.subIntents.includes("booking_question")
  ) {
    return {
      ...routing,
      subIntents: routing.subIntents.filter((intent) => intent !== "booking_question"),
    };
  }
  return routing;
}

export function chatbotCompletionPromptRules(input: {
  visitorIntent?: string | null;
  conversationLanguage?: string | null;
  bookingUrl?: string | null;
  inbound?: string | null;
  history?: Array<{ role: string; content?: string }>;
  pageActionKind?: string | null;
}): string {
  const inbound = input.inbound || "";
  const priorUrl = lastAssistantCalendlyUrl(input.history);
  const acknowledgment = detectBookingAcknowledgment(inbound) && Boolean(priorUrl);
  const resend = detectBookingLinkResendRequest(inbound);
  const kind = currentTurnVisitorKind({
    inbound,
    visitorIntent: input.visitorIntent,
    history: input.history,
    pageActionKind: input.pageActionKind,
  });
  const allowBooking = visitorIntentAllowsBookingCta(kind);
  const verifiedUrl = input.bookingUrl || priorUrl || "";
  const lines = [
    "CHATBOT COMPLETION — answer the visitor's current request directly.",
    "- Use only relevant published facts. Do not dump unrelated benefits, source labels, or extraction text.",
    "- Keep most answers to 2–4 short sentences unless the visitor asked for detail.",
    "- Format prices naturally for the reply language (e.g. $49/month, $490/year). Never write 'USD 49 per month'.",
    "- Preserve accurate product names, plan names, prices, requirements, URLs, and plan distinctions.",
    "- Never invent missing features, pricing, integrations, or promises.",
    "- Never invent availability, appointment confirmation, or meeting details before Calendly confirms a booking.",
    "- Never address the visitor as Website, Web Chat, Unknown, Visitor, Guest, or any channel/site label.",
  ];
  if (acknowledgment && !resend) {
    lines.push("- The visitor acknowledged the booking link already sent. Reply briefly and naturally. Do not repeat the scheduling URL.");
    return lines.join("\n");
  }
  if (resend && verifiedUrl) {
    lines.push(`- The visitor asked for the booking link again or said it failed. Resend this exact workspace-selected Calendly URL on its own line:\n${verifiedUrl}`);
    return lines.join("\n");
  }
  if (kind === "features_pricing") {
    lines.push("- The visitor asked to compare published plans or pricing. Use only current workspace pricing knowledge. Do not invent plan facts. Do not add a booking CTA or booking link.");
  } else if (kind === "calculate_savings") {
    lines.push("- The visitor wants a savings estimate. On this first turn, ask for the minimum missing inputs: their current platform and approximate monthly cost. Do not invent a calculation or savings amount. Do not add a booking CTA.");
  } else if (kind === "find_solution") {
    lines.push("- The visitor wants help choosing. Ask ONE useful qualification question. Do not pitch everything at once.");
  } else if (kind === "book_demo") {
    if (input.bookingUrl) {
      lines.push(`- The visitor asked to book a demo. Share this exact workspace-selected Calendly URL on its own line:\n${input.bookingUrl}`);
    } else {
      lines.push("- The visitor asked to book a demo but no workspace Calendly event URL is configured. Do not invent a link.");
    }
  } else if (!allowBooking) {
    lines.push("- Do not add a booking CTA or booking link unless the visitor asks to book, requests a demo, or shows clear booking intent.");
  }
  return lines.join("\n");
}

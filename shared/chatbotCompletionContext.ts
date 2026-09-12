/**
 * Context assembled after a chatbot Ask Question turn completes.
 * Keeps AI replies relevant to visitor_intent without tenant-specific hardcoding.
 */

import { resolveAiRouting, type AiRoutingResult } from "./aiRouting";

export type ChatbotVisitorIntentKind = "features_pricing" | "find_solution" | "book_demo" | "other";

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
    t === "book a demo"
  ) {
    return "book_demo";
  }
  if (
    /\b(?:find(?:ing)?\s+my\s+solution|find\s+the\s+right\s+solution|which\s+plan|what\s+plan)\b/.test(t) ||
    t === "find my solution"
  ) {
    return "find_solution";
  }
  if (
    /\b(?:features?\s*(?:&|and)?\s*pricing|pricing|prices?|plans?|what\s+does\s+it\s+cost|how\s+much)\b/.test(t) ||
    t === "features & pricing" ||
    t === "features and pricing"
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
  if (intent === "features_pricing" || intent === "find_solution") return false;
  return routing?.decision === "BOOK_APPOINTMENT" && routing.needsRoutingClarification !== true;
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
  leadSource?: string | null;
  conversationLanguage?: string | null;
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
  return {
    ...(input.name ? { name: input.name } : {}),
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
}): AiRoutingResult {
  const kind = classifyChatbotVisitorIntent(input.visitorIntent || input.inbound);
  const inbound =
    kind === "other"
      ? input.inbound
      : `${input.inbound}\n${input.visitorIntent || ""}`.trim();
  const routing = resolveAiRouting({
    inbound,
    joinedInbound: inbound,
    history: input.history,
    industry: input.industry,
    handoffKeywords: input.handoffKeywords,
  });
  return routing;
}

export function chatbotCompletionPromptRules(input: {
  visitorIntent?: string | null;
  conversationLanguage?: string | null;
  bookingUrl?: string | null;
}): string {
  const kind = classifyChatbotVisitorIntent(input.visitorIntent);
  const allowBooking = visitorIntentAllowsBookingCta(kind);
  const lines = [
    "CHATBOT COMPLETION — answer the visitor's current request directly.",
    "- Use only relevant published facts. Do not dump unrelated benefits, source labels, or extraction text.",
    "- Keep most answers to 2–4 short sentences unless the visitor asked for detail.",
    "- Format prices naturally for the reply language (e.g. $49/month, $490/year). Never write 'USD 49 per month'.",
    "- Preserve accurate product names, plan names, prices, requirements, URLs, and plan distinctions.",
    "- Never invent missing features, pricing, integrations, or promises.",
  ];
  if (kind === "features_pricing") {
    lines.push("- The visitor asked about features and pricing only. Answer that. Do not add a booking CTA or booking link.");
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

/**
 * First inbound on a new-conversation Ask Question: skip the redundant prompt
 * only when the triggering message already answers an option with high confidence.
 */

import { resolveAiRouting } from "./aiRouting";
import {
  classifyChatbotVisitorIntent,
  type ChatbotVisitorIntentKind,
} from "./chatbotCompletionContext";
import {
  matchAskQuestionQuickReply,
  type ChatbotAskQuickReply,
} from "./chatbotAskQuestionOptions";
import { detectConversationLanguage } from "./conversationLanguage";
import { isCasualWebchatGreeting } from "./webchatGreetingWelcome";

export type AskOpeningMatch =
  | { matched: true; option: ChatbotAskQuickReply; confidence: "high"; reason: string }
  | { matched: false; reason: string };

function optionKind(option: ChatbotAskQuickReply): ChatbotVisitorIntentKind {
  return classifyChatbotVisitorIntent(`${option.value} ${option.label}`);
}

function tokensFrom(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function optionAliases(
  option: ChatbotAskQuickReply,
  index: number,
  localizedSets: ChatbotAskQuickReply[][],
): string[] {
  const aliases = [option.label, option.value];
  for (const set of localizedSets) {
    if (set[index]?.label) aliases.push(set[index].label);
    if (set[index]?.value) aliases.push(set[index].value);
  }
  return aliases.filter(Boolean);
}

function tokenScore(message: string, aliases: string[]): number {
  const msg = message.toLowerCase();
  let score = 0;
  for (const alias of aliases) {
    if (msg === alias.trim().toLowerCase()) return 100;
    for (const token of tokensFrom(alias)) {
      if (msg.includes(token) || (token.includes(msg.trim()) && msg.trim().length >= 3)) {
        score += token.length;
      }
    }
  }
  return score;
}

function uniqueKindOption(
  kind: ChatbotVisitorIntentKind,
  canonical: ChatbotAskQuickReply[],
): ChatbotAskQuickReply | null {
  if (kind === "other") return null;
  const hits = canonical.filter((o) => optionKind(o) === kind);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * High-confidence opening answer. Greetings, emoji, and ambiguous text must not skip.
 */
export function matchAskQuestionOpeningMessage(
  message: unknown,
  canonical: ChatbotAskQuickReply[],
  localizedSets?: ChatbotAskQuickReply[][],
): AskOpeningMatch {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text || !canonical.length) return { matched: false, reason: "empty" };
  if (isCasualWebchatGreeting(text)) return { matched: false, reason: "greeting" };

  const exact = matchAskQuestionQuickReply(text, canonical, localizedSets);
  if (exact) return { matched: true, option: exact, confidence: "high", reason: "exact_option" };

  const sets = localizedSets || [];
  const kind = classifyChatbotVisitorIntent(text);
  const byKind = uniqueKindOption(kind, canonical);
  if (byKind) return { matched: true, option: byKind, confidence: "high", reason: `intent_kind:${kind}` };

  const routing = resolveAiRouting({ inbound: text, joinedInbound: text });
  if (routing.decision === "BOOK_APPOINTMENT" && !routing.needsRoutingClarification) {
    const book = uniqueKindOption("book_demo", canonical);
    if (book) return { matched: true, option: book, confidence: "high", reason: "routing_book" };
  }
  if (routing.subIntents.includes("pricing_question")) {
    const pricing = uniqueKindOption("features_pricing", canonical);
    if (pricing) return { matched: true, option: pricing, confidence: "high", reason: "routing_pricing" };
  }

  const scores = canonical.map((option, i) => ({
    option,
    score: tokenScore(text, optionAliases(option, i, sets)),
  }));
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const second = scores[1]?.score || 0;
  if (best && best.score >= 5 && best.score >= second + 3) {
    return { matched: true, option: best.option, confidence: "high", reason: "option_token_overlap" };
  }

  const lang = detectConversationLanguage(text);
  if (
    lang.confident &&
    (lang.code === "ar" || lang.code === "zh") &&
    (routing.decision === "BOOK_APPOINTMENT" || kind === "book_demo")
  ) {
    const book = uniqueKindOption("book_demo", canonical);
    if (book) return { matched: true, option: book, confidence: "high", reason: "locale_booking" };
  }

  return { matched: false, reason: "low_confidence" };
}

export function firstAskQuestionFromFlow(
  nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>,
  edges: Array<{ source?: string; target?: string }>,
): { id: string; data: Record<string, unknown> } | null {
  if (!nodes.length) return null;
  const next = new Map<string, string>();
  for (const e of edges) {
    if (e.source && e.target && !next.has(e.source)) next.set(e.source, e.target);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let current = byId.get("start") || nodes[0];
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    const type = String(current.type || "");
    const data = current.data && typeof current.data === "object" ? current.data : {};
    if (type === "question") {
      const options = Array.isArray(data.options) ? data.options : [];
      if (options.length > 0) return { id: current.id, data };
    }
    if (type === "message" || type === "action" || type === "start" || !type) {
      const nextId = next.get(current.id);
      current = nextId ? byId.get(nextId) : undefined;
      continue;
    }
    break;
  }
  return null;
}

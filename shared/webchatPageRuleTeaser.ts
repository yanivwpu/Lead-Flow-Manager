/**
 * Closed-widget page-rule teasers are separate from the global teaser and
 * from the full greeting shown after the visitor opens chat.
 *
 * Fallback when `teaserGreeting` is empty: first sentence of the greeting,
 * truncated to PAGE_RULE_TEASER_MAX. Never copy the tenant global teaser.
 */

import { sanitizePlainWidgetText } from "./webchatWidgetBranding";
import { WEBCHAT_BRANDING_MESSAGE_SOURCE } from "./webchatWidgetBranding";
import { resolveLocalizedPageRuleGreeting } from "./webchatWidgetCopyI18n";
import { normalizeWidgetStaticLocale } from "./webchatWidgetLocale";
import { readShownPageRuleKeys, writeShownPageRuleKeys } from "./webchatPageRuleEngagement";

export const PAGE_RULE_TEASER_MAX = 140;
export const PAGE_RULE_TEASER_DELAY_MS = 1200;
export const PAGE_RULE_TEASER_HOLD_MS = 8000;
export const PAGE_RULE_TEASER_COOLDOWN_MS = 20_000;
export const PAGE_RULE_TEASER_STORAGE_PREFIX = "wcw-pr-teaser";
export const PAGE_RULE_TEASER_AT_STORAGE_PREFIX = "wcw-pr-teaser-at";
export const WEBCHAT_TEASER_GATE_MESSAGE_TYPE = "wcw-teaser-gate";

export function pageRuleTeaserStorageKey(widgetId: string): string {
  return `${PAGE_RULE_TEASER_STORAGE_PREFIX}:${String(widgetId || "").trim()}`;
}

export function pageRuleTeaserAtStorageKey(widgetId: string): string {
  return `${PAGE_RULE_TEASER_AT_STORAGE_PREFIX}:${String(widgetId || "").trim()}`;
}

export function fallbackPageRuleTeaserFromGreeting(greeting: string): string {
  const t = sanitizePlainWidgetText(greeting, 500);
  if (!t) return "";
  let cut = t;
  const marks = [t.indexOf("?"), t.indexOf("."), t.indexOf("!")].filter((i) => i >= 0);
  if (marks.length) cut = t.slice(0, Math.min(...marks) + 1);
  if (cut.length <= PAGE_RULE_TEASER_MAX) return cut;
  const sliced = cut.slice(0, PAGE_RULE_TEASER_MAX - 3).replace(/\s+\S*$/, "").trimEnd();
  return `${sliced || cut.slice(0, PAGE_RULE_TEASER_MAX - 3).trimEnd()}...`;
}

export function resolveLocalizedPageRuleTeaser(input: {
  locale?: string | null;
  teaserGreeting?: unknown;
  greeting?: unknown;
  localized?: unknown;
}): string {
  const loc = normalizeWidgetStaticLocale(input.locale);
  const locMap =
    input.localized && typeof input.localized === "object" && !Array.isArray(input.localized)
      ? (input.localized as Record<string, unknown>)
      : {};
  const block =
    locMap[loc] && typeof locMap[loc] === "object" && !Array.isArray(locMap[loc])
      ? (locMap[loc] as Record<string, unknown>)
      : {};
  const variant = sanitizePlainWidgetText(block.teaserGreeting, 200);
  if (variant) return variant;
  const custom = sanitizePlainWidgetText(input.teaserGreeting, 200);
  if (custom) return custom;
  const greeting = resolveLocalizedPageRuleGreeting({
    locale: input.locale,
    greeting: typeof input.greeting === "string" ? input.greeting : "",
    localized: input.localized,
    fallback: "",
  });
  return fallbackPageRuleTeaserFromGreeting(greeting);
}

export function pageRuleTeaserCooldownActive(lastShownAt: number, now: number): boolean {
  if (!Number.isFinite(lastShownAt) || lastShownAt <= 0) return false;
  if (!Number.isFinite(now)) return false;
  return now - lastShownAt < PAGE_RULE_TEASER_COOLDOWN_MS;
}

export function parsePageRuleTeaserAt(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function readShownPageRuleTeaserKeys(raw: string | null | undefined): string[] {
  return readShownPageRuleKeys(raw);
}

export function writeShownPageRuleTeaserKeys(existing: string[], nextKey: string): string[] {
  return writeShownPageRuleKeys(existing, nextKey);
}

export type PageRuleTeaserDecision = "schedule" | "none";

export type PageRuleTeaserReason =
  | "eligible"
  | "scheduled"
  | "rendered"
  | "already_consumed"
  | "cooldown"
  | "chat_open"
  | "takeover"
  | "pending_chatbot"
  | "navigation_cancelled"
  | "render_failed"
  | "open_behavior"
  | "device"
  | "no_match";

export function remainingPageRuleTeaserCooldownMs(lastShownAt: number, now: number): number {
  if (!pageRuleTeaserCooldownActive(lastShownAt, now)) return 0;
  return Math.max(0, PAGE_RULE_TEASER_COOLDOWN_MS - (now - lastShownAt));
}

export type PageRuleTeaserLocaleSync = "update-visible" | "reschedule-pending" | "keep-consumed" | "replan";

/**
 * Same logical rule + new display locale: update copy, never a second exposure.
 * Rule identity stays the primary key; locale is a separate dimension.
 */
export function decidePageRuleTeaserLocaleSync(input: {
  localeChanged: boolean;
  sameRuleKey: boolean;
  teaserVisible: boolean;
  alreadyShownForRule: boolean;
  pending: boolean;
}): PageRuleTeaserLocaleSync {
  if (input.sameRuleKey && input.alreadyShownForRule && input.teaserVisible) {
    return "update-visible";
  }
  if (input.sameRuleKey && input.alreadyShownForRule && !input.teaserVisible) {
    return "keep-consumed";
  }
  if (input.sameRuleKey && input.pending && input.localeChanged) {
    return "reschedule-pending";
  }
  if (!input.localeChanged && input.sameRuleKey) return "keep-consumed";
  return "replan";
}

export function explainPageRuleTeaser(input: {
  openBehavior?: string | null;
  chatOpen: boolean;
  deviceAllowed: boolean;
  ruleKey?: string | null;
  teaserText: string;
  alreadyShownForRule: boolean;
  cooldownActive: boolean;
  humanTakeover: boolean;
  pendingVisitorInput: boolean;
}): { decision: PageRuleTeaserDecision; reason: PageRuleTeaserReason } {
  if (input.openBehavior && input.openBehavior !== "teaser") {
    return { decision: "none", reason: "open_behavior" };
  }
  if (input.chatOpen) return { decision: "none", reason: "chat_open" };
  if (!input.deviceAllowed) return { decision: "none", reason: "device" };
  if (!input.ruleKey || !String(input.teaserText || "").trim()) {
    return { decision: "none", reason: "no_match" };
  }
  if (input.alreadyShownForRule) return { decision: "none", reason: "already_consumed" };
  if (input.humanTakeover) return { decision: "none", reason: "takeover" };
  if (input.pendingVisitorInput) return { decision: "none", reason: "pending_chatbot" };
  if (input.cooldownActive) return { decision: "none", reason: "cooldown" };
  return { decision: "schedule", reason: "eligible" };
}

export function decidePageRuleTeaser(input: {
  openBehavior?: string | null;
  chatOpen: boolean;
  deviceAllowed: boolean;
  ruleKey?: string | null;
  teaserText: string;
  alreadyShownForRule: boolean;
  cooldownActive: boolean;
  humanTakeover: boolean;
  pendingVisitorInput: boolean;
}): PageRuleTeaserDecision {
  return explainPageRuleTeaser(input).decision;
}

export type PageRuleTeaserGateReason = "takeover" | "pending_chatbot";

export type WebchatTeaserGateMessage = {
  source: typeof WEBCHAT_BRANDING_MESSAGE_SOURCE;
  type: typeof WEBCHAT_TEASER_GATE_MESSAGE_TYPE;
  widgetId: string;
  blocked: boolean;
  reason?: PageRuleTeaserGateReason;
};

export function webchatTeaserGateMessage(
  widgetId: string,
  blocked: boolean,
  reason?: PageRuleTeaserGateReason | null,
): WebchatTeaserGateMessage {
  const payload: WebchatTeaserGateMessage = {
    source: WEBCHAT_BRANDING_MESSAGE_SOURCE,
    type: WEBCHAT_TEASER_GATE_MESSAGE_TYPE,
    widgetId: String(widgetId || ""),
    blocked: blocked === true,
  };
  if (payload.blocked && (reason === "takeover" || reason === "pending_chatbot")) {
    payload.reason = reason;
  }
  return payload;
}

export function parseWebchatTeaserGateMessage(
  data: unknown,
  widgetId: string,
): WebchatTeaserGateMessage | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  if (payload.source !== WEBCHAT_BRANDING_MESSAGE_SOURCE) return null;
  if (payload.type !== WEBCHAT_TEASER_GATE_MESSAGE_TYPE) return null;
  if (String(payload.widgetId || "") !== String(widgetId || "")) return null;
  const reason = payload.reason === "takeover" || payload.reason === "pending_chatbot" ? payload.reason : null;
  return webchatTeaserGateMessage(String(payload.widgetId || ""), payload.blocked === true, reason);
}

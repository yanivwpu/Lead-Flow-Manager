/**
 * Canonical Website Chat page-rule matching.
 * Launcher, iframe, and server must use these helpers so they cannot disagree.
 *
 * matchType defaults to legacy `contains` when omitted (saved rules stay compatible).
 * Newer `pathname` / `pathname_prefix` ignore query strings and hashes.
 */

import { parseHttpUrl } from "./webchatPageContext";
import { sanitizePlainWidgetText } from "./webchatWidgetBranding";
import {
  resolveLocalizedPageRuleGreeting,
  resolveLocalizedPageRuleQuestions,
} from "./webchatWidgetCopyI18n";
import { resolveLocalizedPageRuleTeaser } from "./webchatPageRuleTeaser";

export const WIDGET_PAGE_RULE_MATCH_TYPES = ["contains", "pathname", "pathname_prefix"] as const;
export type WidgetPageRuleMatchType = (typeof WIDGET_PAGE_RULE_MATCH_TYPES)[number];

export type WidgetPageRuleMatchInput = {
  urlContains?: unknown;
  matchType?: unknown;
  greeting?: unknown;
  teaserGreeting?: unknown;
  prefilledMessage?: unknown;
  suggestedQuestions?: unknown;
  chatbotFlowId?: unknown;
  ctaLabel?: unknown;
  ctaUrl?: unknown;
  localized?: unknown;
};

export type MatchedWidgetPageRule = {
  urlContains: string;
  matchType: WidgetPageRuleMatchType;
  ruleKey: string;
  greeting?: string;
  teaserGreeting?: string;
  prefilledMessage?: string;
  suggestedQuestions: string[];
  chatbotFlowId?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  localized?: unknown;
};

const MAX_HREF = 4000;
const MAX_FRAGMENT = 500;

export function normalizePageRuleMatchType(raw: unknown): WidgetPageRuleMatchType {
  if (raw === "pathname" || raw === "pathname_prefix" || raw === "contains") return raw;
  return "contains";
}

export function normalizePathnameForMatch(pathname: string): string {
  const pathOnly = String(pathname || "/").split("?")[0].split("#")[0] || "/";
  let p = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1) || "/";
  return p;
}

export function hrefPathnameForMatch(href: string): string | null {
  const trimmed = String(href || "").trim().slice(0, MAX_HREF);
  if (!trimmed) return null;
  const parsed = parseHttpUrl(trimmed);
  if (parsed) return normalizePathnameForMatch(parsed.pathname);
  if (trimmed.startsWith("/")) return normalizePathnameForMatch(trimmed);
  return null;
}

function rulePathname(fragment: string): string | null {
  const trimmed = String(fragment || "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return hrefPathnameForMatch(trimmed);
  return normalizePathnameForMatch(trimmed.split("?")[0].split("#")[0]);
}

export function pageRuleStableKey(rule: { urlContains?: unknown; matchType?: unknown }): string {
  const fragment = String(rule.urlContains || "").trim().toLowerCase().slice(0, 200);
  const matchType = normalizePageRuleMatchType(rule.matchType);
  return `${matchType}:${fragment}`;
}

export function pageRuleMatchesHref(
  rule: { urlContains?: unknown; matchType?: unknown },
  href: string,
): boolean {
  const fragment = String(rule.urlContains || "").trim();
  if (!fragment) return false;
  const matchType = normalizePageRuleMatchType(rule.matchType);
  const trimmedHref = String(href || "").slice(0, MAX_HREF);
  if (!trimmedHref) return false;
  if (matchType === "contains") {
    return trimmedHref.indexOf(fragment) !== -1;
  }
  const path = hrefPathnameForMatch(trimmedHref);
  const want = rulePathname(fragment);
  if (!path || !want) return false;
  if (matchType === "pathname") return path === want;
  return path === want || path.startsWith(`${want}/`);
}

function suggestedQuestionsFromRule(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function hydrateMatchedWidgetPageRule(
  raw: WidgetPageRuleMatchInput,
  locale?: string | null,
): MatchedWidgetPageRule | null {
  const urlContains = String(raw.urlContains ?? "").trim().slice(0, MAX_FRAGMENT);
  if (!urlContains) return null;
  const matchType = normalizePageRuleMatchType(raw.matchType);
  const questions = resolveLocalizedPageRuleQuestions({
    locale,
    suggestedQuestions: suggestedQuestionsFromRule(raw.suggestedQuestions),
    localized: raw.localized,
  });
  const flowId = typeof raw.chatbotFlowId === "string" ? raw.chatbotFlowId.trim() : "";
  const ctaLabel = typeof raw.ctaLabel === "string" ? raw.ctaLabel.trim().slice(0, 80) : "";
  const ctaUrl = typeof raw.ctaUrl === "string" ? raw.ctaUrl.trim().slice(0, 2000) : "";
  const greetingRaw = typeof raw.greeting === "string" ? raw.greeting : "";
  return {
    urlContains,
    matchType,
    ruleKey: pageRuleStableKey({ urlContains, matchType }),
    greeting:
      resolveLocalizedPageRuleGreeting({
        locale,
        greeting: greetingRaw,
        localized: raw.localized,
        fallback: "",
      }) || greetingRaw || undefined,
    teaserGreeting:
      resolveLocalizedPageRuleTeaser({
        locale,
        teaserGreeting: raw.teaserGreeting,
        greeting: greetingRaw,
        localized: raw.localized,
      }) || undefined,
    prefilledMessage:
      typeof raw.prefilledMessage === "string" ? raw.prefilledMessage : undefined,
    suggestedQuestions: questions,
    chatbotFlowId: flowId || undefined,
    ctaLabel: ctaLabel || undefined,
    ctaUrl: ctaUrl || undefined,
    localized: raw.localized && typeof raw.localized === "object" ? raw.localized : undefined,
  };
}

export function matchWidgetPageRule(
  settings: Record<string, unknown> | null | undefined,
  href: string,
  locale?: string | null,
): MatchedWidgetPageRule | null {
  const rules = Array.isArray(settings?.pageRules) ? settings!.pageRules : [];
  for (const raw of rules) {
    try {
      const r = raw && typeof raw === "object" ? (raw as WidgetPageRuleMatchInput) : {};
      if (!pageRuleMatchesHref(r, href)) continue;
      const hydrated = hydrateMatchedWidgetPageRule(r, locale);
      if (hydrated) return hydrated;
    } catch {
      continue;
    }
  }
  return null;
}

export function pageRuleActionLabelsAtIndex(
  rule: { suggestedQuestions?: unknown; localized?: unknown },
  actionIndex: number,
): string[] {
  if (!Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex > 7) return [];
  const base = suggestedQuestionsFromRule(rule.suggestedQuestions);
  const labels = new Set<string>();
  const add = (value: unknown) => {
    const t = sanitizePlainWidgetText(value, 200);
    if (t) labels.add(t);
  };
  add(base[actionIndex]);
  const localized = rule.localized && typeof rule.localized === "object" ? (rule.localized as Record<string, unknown>) : {};
  for (const loc of ["en", "es", "he"]) {
    const block = localized[loc];
    const questions =
      block && typeof block === "object"
        ? suggestedQuestionsFromRule((block as { suggestedQuestions?: unknown }).suggestedQuestions)
        : [];
    add(questions[actionIndex]);
  }
  return [...labels];
}

export type ValidatedPageRuleAction = {
  ruleKey: string;
  actionIndex: number;
  label: string;
};

/**
 * Trust the matched rule + current inbound label (and optional index).
 * Never trust a client-supplied canonical intent or rule key.
 */
export function validatePageRuleInboundAction(input: {
  matched: MatchedWidgetPageRule | null;
  message: string;
  actionIndex?: number | null;
}): ValidatedPageRuleAction | null {
  const matched = input.matched;
  if (!matched) return null;
  const message = String(input.message || "").trim();
  if (!message) return null;
  const tryIndex = (index: number): ValidatedPageRuleAction | null => {
    const labels = pageRuleActionLabelsAtIndex(matched, index);
    if (!labels.includes(message)) return null;
    return { ruleKey: matched.ruleKey, actionIndex: index, label: message };
  };
  if (typeof input.actionIndex === "number" && Number.isInteger(input.actionIndex)) {
    return tryIndex(input.actionIndex);
  }
  const baseCount = Math.max(
    suggestedQuestionsFromRule(matched.suggestedQuestions).length,
    8,
  );
  for (let i = 0; i < baseCount; i++) {
    const hit = tryIndex(i);
    if (hit) return hit;
  }
  return null;
}

export function mergeShownPageRuleKeys(
  existing: unknown,
  nextKey?: string | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    const key = String(value || "").trim().slice(0, 220);
    if (!key || key.includes("://") || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  if (Array.isArray(existing)) {
    for (const item of existing) push(item);
  }
  push(nextKey);
  return out.slice(0, 30);
}

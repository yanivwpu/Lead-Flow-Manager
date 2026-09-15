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

export const WIDGET_PAGE_RULE_MAX_ALIASES = 8;

export type WidgetPageRuleMatchInput = {
  urlContains?: unknown;
  urlAliases?: unknown;
  matchType?: unknown;
  greeting?: unknown;
  teaserGreeting?: unknown;
  prefilledMessage?: unknown;
  suggestedQuestions?: unknown;
  chatbotFlowId?: unknown;
  ctaLabel?: unknown;
  ctaUrl?: unknown;
  localized?: unknown;
  actionKinds?: unknown;
};

export type MatchedWidgetPageRule = {
  urlContains: string;
  urlAliases?: string[];
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
  /** Optional per-index semantic kinds. Absent rules still classify from localized labels. */
  actionKinds?: string[];
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

export function pageRuleUrlFieldLabel(matchType: unknown): string {
  const type = normalizePageRuleMatchType(matchType);
  if (type === "pathname") return "Primary path";
  if (type === "pathname_prefix") return "Path prefix";
  return "URL contains";
}

export function pageRulePathInputIssue(raw: string): string | null {
  if (String(raw || "").includes(",")) {
    return "Add each path separately. Comma-separated paths are not supported.";
  }
  return null;
}

export function pageRulesHavePathInputIssues(
  rules: Array<{ urlContains?: unknown; urlAliases?: unknown }>,
): boolean {
  if (!Array.isArray(rules)) return false;
  for (const rule of rules) {
    if (pageRulePathInputIssue(String(rule?.urlContains || ""))) return true;
    if (!Array.isArray(rule?.urlAliases)) continue;
    for (const alias of rule.urlAliases) {
      if (pageRulePathInputIssue(String(alias || ""))) return true;
    }
  }
  return false;
}

export function pageRuleDuplicateIdentityKeys(
  fragment: string,
  matchType: WidgetPageRuleMatchType,
): string[] {
  const trimmed = String(fragment || "").trim();
  if (!trimmed) return [];
  const keys = [trimmed.toLowerCase()];
  if (matchType === "pathname" || matchType === "pathname_prefix") {
    const path = rulePathname(trimmed);
    if (path) keys.push(path.toLowerCase());
  }
  return [...new Set(keys)];
}

/**
 * Extra Exact-path fragments. Ignored for Contains / Path prefix.
 * Skips empty, comma-separated, duplicate, and primary-equal values.
 */
export function collectPageRuleAliasFragments(rule: {
  urlContains?: unknown;
  urlAliases?: unknown;
  matchType?: unknown;
}): string[] {
  if (normalizePageRuleMatchType(rule.matchType) !== "pathname") return [];
  if (!Array.isArray(rule.urlAliases)) return [];
  const primary = String(rule.urlContains || "").trim().slice(0, MAX_FRAGMENT);
  const seen = new Set(pageRuleDuplicateIdentityKeys(primary, "pathname"));
  const out: string[] = [];
  for (const item of rule.urlAliases.slice(0, WIDGET_PAGE_RULE_MAX_ALIASES)) {
    try {
      if (typeof item !== "string" && typeof item !== "number") continue;
      const fragment = String(item || "").trim().slice(0, MAX_FRAGMENT);
      if (!fragment || pageRulePathInputIssue(fragment)) continue;
      const keys = pageRuleDuplicateIdentityKeys(fragment, "pathname");
      if (keys.some((key) => seen.has(key))) continue;
      for (const key of keys) seen.add(key);
      out.push(fragment);
    } catch {
      continue;
    }
  }
  return out;
}

export function sanitizePageRuleUrlAliases(
  raw: unknown,
  primary?: string,
): { aliases: string[]; error?: string } {
  if (raw == null) return { aliases: [] };
  if (!Array.isArray(raw)) return { aliases: [], error: "Additional paths must be a list." };
  if (raw.length > WIDGET_PAGE_RULE_MAX_ALIASES) {
    return { aliases: [], error: "Too many additional paths (maximum 8)." };
  }
  const seen = new Set(pageRuleDuplicateIdentityKeys(String(primary || ""), "pathname"));
  const out: string[] = [];
  for (const item of raw) {
    if (item == null || item === "") continue;
    if (typeof item !== "string" && typeof item !== "number") {
      return { aliases: [], error: "Each additional path must be text." };
    }
    const fragment = String(item).trim();
    if (!fragment) continue;
    const comma = pageRulePathInputIssue(fragment);
    if (comma) return { aliases: [], error: comma };
    if (fragment.length > MAX_FRAGMENT) {
      return { aliases: [], error: "URL fragment is too long." };
    }
    const keys = pageRuleDuplicateIdentityKeys(fragment, "pathname");
    if (keys.some((key) => seen.has(key))) {
      return {
        aliases: [],
        error: "Additional paths cannot duplicate the primary path or each other.",
      };
    }
    for (const key of keys) seen.add(key);
    out.push(fragment.slice(0, MAX_FRAGMENT));
  }
  return { aliases: out };
}

export function pageRuleStableKey(rule: { urlContains?: unknown; matchType?: unknown }): string {
  const fragment = String(rule.urlContains || "").trim().toLowerCase().slice(0, 200);
  const matchType = normalizePageRuleMatchType(rule.matchType);
  return `${matchType}:${fragment}`;
}

function fragmentMatchesHref(
  fragment: string,
  matchType: WidgetPageRuleMatchType,
  href: string,
): boolean {
  const trimmed = String(fragment || "").trim();
  if (!trimmed) return false;
  const trimmedHref = String(href || "").slice(0, MAX_HREF);
  if (!trimmedHref) return false;
  if (matchType === "contains") {
    return trimmedHref.indexOf(trimmed) !== -1;
  }
  const path = hrefPathnameForMatch(trimmedHref);
  const want = rulePathname(trimmed);
  if (!path || !want) return false;
  if (matchType === "pathname") return path === want;
  return path === want || path.startsWith(`${want}/`);
}

export function pageRuleMatchesHref(
  rule: { urlContains?: unknown; urlAliases?: unknown; matchType?: unknown },
  href: string,
): boolean {
  const matchType = normalizePageRuleMatchType(rule.matchType);
  const primary = String(rule.urlContains || "").trim();
  if (!primary) return false;
  if (fragmentMatchesHref(primary, matchType, href)) return true;
  if (matchType !== "pathname") return false;
  for (const alias of collectPageRuleAliasFragments(rule)) {
    if (fragmentMatchesHref(alias, matchType, href)) return true;
  }
  return false;
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
  const urlAliases = collectPageRuleAliasFragments({
    urlContains,
    urlAliases: raw.urlAliases,
    matchType,
  });
  return {
    urlContains,
    ...(urlAliases.length ? { urlAliases } : {}),
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
    ...(Array.isArray(raw.actionKinds)
      ? {
          actionKinds: raw.actionKinds
            .filter((k): k is string => typeof k === "string")
            .map((k) => k.trim())
            .filter(Boolean)
            .slice(0, 8),
        }
      : {}),
  };
}

/**
 * Higher wins when several rules match the same href (e.g. Homepage `/` vs Pricing `/pricing`).
 * Exact path beats prefix beats contains; longer matched paths beat `/`.
 */
export function pageRuleMatchRank(
  rule: { urlContains?: unknown; urlAliases?: unknown; matchType?: unknown },
  href: string,
): number {
  if (!pageRuleMatchesHref(rule, href)) return -1;
  const matchType = normalizePageRuleMatchType(rule.matchType);
  const primary = String(rule.urlContains || "").trim();
  const pathLen = (fragment: string) => (rulePathname(fragment) || fragment).length;
  if (matchType === "pathname") {
    let best = 0;
    for (const fragment of [primary, ...collectPageRuleAliasFragments(rule)]) {
      if (fragmentMatchesHref(fragment, "pathname", href)) {
        const n = pathLen(fragment);
        if (n > best) best = n;
      }
    }
    return 2000 + best;
  }
  if (matchType === "pathname_prefix") return 1000 + pathLen(primary);
  return primary.length;
}

export function matchWidgetPageRule(
  settings: Record<string, unknown> | null | undefined,
  href: string,
  locale?: string | null,
): MatchedWidgetPageRule | null {
  const rules = Array.isArray(settings?.pageRules) ? settings!.pageRules : [];
  let best: MatchedWidgetPageRule | null = null;
  let bestRank = -1;
  for (const raw of rules) {
    try {
      const r = raw && typeof raw === "object" ? (raw as WidgetPageRuleMatchInput) : {};
      const rank = pageRuleMatchRank(r, href);
      if (rank < 0 || rank < bestRank) continue;
      const hydrated = hydrateMatchedWidgetPageRule(r, locale);
      if (!hydrated) continue;
      if (rank > bestRank) {
        best = hydrated;
        bestRank = rank;
      }
    } catch {
      continue;
    }
  }
  return best;
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
 * Trust the matched rule + current inbound label at a supplied action index.
 * Never trust a client-supplied canonical intent or rule key.
 * Never infer trust merely because free text equals a saved label.
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
  if (typeof input.actionIndex !== "number" || !Number.isInteger(input.actionIndex)) {
    return null;
  }
  const labels = pageRuleActionLabelsAtIndex(matched, input.actionIndex);
  if (!labels.includes(message)) return null;
  return { ruleKey: matched.ruleKey, actionIndex: input.actionIndex, label: message };
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

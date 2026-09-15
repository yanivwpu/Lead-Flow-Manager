/**
 * Server-trusted current-turn provenance for Website Chat page-rule actions.
 * Client canonical intent is ignored. Free text that happens to equal a label is not trusted.
 */

import { parseHttpUrl } from "./webchatPageContext";
import type { WebchatPageContext } from "./webchatPageContext";
import { classifyChatbotVisitorIntent } from "./chatbotCompletionContext";
import {
  matchWidgetPageRule,
  pageRuleActionLabelsAtIndex,
  validatePageRuleInboundAction,
  type MatchedWidgetPageRule,
  type ValidatedPageRuleAction,
} from "./webchatPageRuleMatch";

export const PAGE_RULE_ACTION_SOURCE = "page_rule_suggested_action" as const;

export const PAGE_RULE_ACTION_KINDS = [
  "features_pricing",
  "find_solution",
  "compare_plans",
  "calculate_savings",
  "book_demo",
  "other",
] as const;

export type PageRuleActionKind = (typeof PAGE_RULE_ACTION_KINDS)[number];

export function isPageRuleActionKind(value: unknown): value is PageRuleActionKind {
  return (
    value === "features_pricing" ||
    value === "find_solution" ||
    value === "compare_plans" ||
    value === "calculate_savings" ||
    value === "book_demo" ||
    value === "other"
  );
}

export function sanitizePageRuleActionKinds(raw: unknown, count: number): PageRuleActionKind[] | undefined {
  if (!Array.isArray(raw) || !Number.isInteger(count) || count <= 0) return undefined;
  const out: PageRuleActionKind[] = [];
  for (let i = 0; i < Math.min(count, 8); i++) {
    const kind = raw[i];
    out.push(isPageRuleActionKind(kind) && kind !== "other" ? kind : "other");
  }
  return out.some((k) => k !== "other") ? out : undefined;
}

export type TrustedPageRuleAction = ValidatedPageRuleAction & {
  source: typeof PAGE_RULE_ACTION_SOURCE;
  configuredLabel: string;
  kind: PageRuleActionKind;
  parentUrl?: string;
  origin?: string;
};

export type WebchatPageActionStamp = {
  source: typeof PAGE_RULE_ACTION_SOURCE;
  ruleKey: string;
  actionIndex: number;
  label: string;
  configuredLabel?: string;
  kind?: PageRuleActionKind;
  inboundMessageId: string;
  parentUrl?: string;
  origin?: string;
};

export type CurrentTurnPageAction = {
  trusted: boolean;
  provenanceCurrentInbound: boolean;
  explicitUserChoice: boolean;
  source?: typeof PAGE_RULE_ACTION_SOURCE;
  kind?: PageRuleActionKind;
  ruleKey?: string;
  actionIndex?: number;
  label?: string;
  inboundMessageId?: string;
  parentUrl?: string;
  origin?: string;
};

const MAX_LABEL = 200;
const MAX_RULE = 220;
const MAX_URL = 2000;
const MAX_ORIGIN = 200;
const MAX_INBOUND_ID = 80;

const COMPARE_PLANS_RE =
  /^(?:compare\s+(?:free(?:\s*(?:&|and)\s*pro)?|plans?|pricing)|comparar\s+(?:planes?|free)|השוואת)/i;

export function classifyPageRuleActionKind(text: unknown): PageRuleActionKind {
  const raw = String(text || "").trim();
  const kind = classifyChatbotVisitorIntent(raw);
  if (kind === "book_demo") return "book_demo";
  if (kind === "calculate_savings") return "calculate_savings";
  if (kind === "find_solution") return "find_solution";
  if (kind === "features_pricing") {
    return COMPARE_PLANS_RE.test(raw) ? "compare_plans" : "features_pricing";
  }
  return "other";
}

export function classifyPageRuleActionKindFromRule(
  matched: MatchedWidgetPageRule,
  actionIndex: number,
): PageRuleActionKind {
  const configured = matched.actionKinds?.[actionIndex];
  if (isPageRuleActionKind(configured) && configured !== "other") return configured;
  const labels = [
    matched.suggestedQuestions[actionIndex],
    ...pageRuleActionLabelsAtIndex(matched, actionIndex),
  ];
  for (const label of labels) {
    const kind = classifyPageRuleActionKind(label);
    if (kind !== "other") return kind;
  }
  return "other";
}

export function enrichValidatedPageRuleAction(
  action: ValidatedPageRuleAction,
  matched: MatchedWidgetPageRule,
  parentUrl?: string | null,
): TrustedPageRuleAction {
  const parsed = parseHttpUrl(parentUrl || "");
  const configuredLabel =
    matched.suggestedQuestions[action.actionIndex] || action.label;
  return {
    ...action,
    source: PAGE_RULE_ACTION_SOURCE,
    configuredLabel: String(configuredLabel || action.label).slice(0, MAX_LABEL),
    kind: classifyPageRuleActionKindFromRule(matched, action.actionIndex),
    parentUrl: parsed ? parsed.toString().slice(0, MAX_URL) : undefined,
    origin: parsed ? parsed.origin.slice(0, MAX_ORIGIN) : undefined,
  };
}

/**
 * Origin must already be authorized. Rematch the rule from parentUrl, then verify
 * the current inbound label against the configured action at the supplied index.
 */
export function resolveTrustedPageRuleInboundAction(input: {
  originAuthorized: boolean;
  settings: Record<string, unknown> | null | undefined;
  parentUrl?: string | null;
  locale?: string | null;
  message: string;
  actionIndex?: number | null;
}): TrustedPageRuleAction | null {
  if (input.originAuthorized !== true) return null;
  const matched = matchWidgetPageRule(input.settings, input.parentUrl || "", input.locale);
  const validated = validatePageRuleInboundAction({
    matched,
    message: input.message,
    actionIndex: input.actionIndex,
  });
  if (!validated || !matched) return null;
  return enrichValidatedPageRuleAction(validated, matched, input.parentUrl);
}

export function bindPageRuleActionToInbound(
  action: TrustedPageRuleAction,
  inboundMessageId: string,
): WebchatPageActionStamp | null {
  const inboundId = String(inboundMessageId || "").trim().slice(0, MAX_INBOUND_ID);
  if (!inboundId) return null;
  return {
    source: PAGE_RULE_ACTION_SOURCE,
    ruleKey: action.ruleKey.slice(0, MAX_RULE),
    actionIndex: action.actionIndex,
    label: action.label.slice(0, MAX_LABEL),
    configuredLabel: action.configuredLabel.slice(0, MAX_LABEL),
    kind: action.kind,
    inboundMessageId: inboundId,
    parentUrl: action.parentUrl,
    origin: action.origin,
  };
}

export function stampWebchatPageAction(
  existing: WebchatPageContext | Record<string, unknown> | null | undefined,
  stamp: WebchatPageActionStamp | null,
): WebchatPageContext {
  const prev =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as WebchatPageContext) }
      : {};
  if (!stamp) {
    const { pageAction: _drop, ...rest } = prev as WebchatPageContext & {
      pageAction?: unknown;
    };
    return rest;
  }
  return {
    ...prev,
    pageAction: {
      source: PAGE_RULE_ACTION_SOURCE,
      ruleKey: stamp.ruleKey.slice(0, MAX_RULE),
      actionIndex: stamp.actionIndex,
      label: stamp.label.slice(0, MAX_LABEL),
      configuredLabel: String(stamp.configuredLabel || stamp.label).slice(0, MAX_LABEL),
      kind: stamp.kind || "other",
      inboundMessageId: stamp.inboundMessageId.slice(0, MAX_INBOUND_ID),
      ...(stamp.parentUrl ? { parentUrl: stamp.parentUrl.slice(0, MAX_URL) } : {}),
      ...(stamp.origin ? { origin: stamp.origin.slice(0, MAX_ORIGIN) } : {}),
    },
  };
}

function readPageActionStamp(pageContext: unknown): WebchatPageActionStamp | null {
  const ctx =
    pageContext && typeof pageContext === "object" && !Array.isArray(pageContext)
      ? (pageContext as Record<string, unknown>)
      : null;
  const raw = ctx?.pageAction;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.source !== PAGE_RULE_ACTION_SOURCE) return null;
  const ruleKey = typeof o.ruleKey === "string" ? o.ruleKey.trim().slice(0, MAX_RULE) : "";
  const label = typeof o.label === "string" ? o.label.trim().slice(0, MAX_LABEL) : "";
  const inboundMessageId =
    typeof o.inboundMessageId === "string" ? o.inboundMessageId.trim().slice(0, MAX_INBOUND_ID) : "";
  const actionIndex = o.actionIndex;
  if (!ruleKey || !label || !inboundMessageId) return null;
  if (typeof actionIndex !== "number" || !Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex > 7) {
    return null;
  }
  const kindRaw = typeof o.kind === "string" ? o.kind : "";
  const kind: PageRuleActionKind = isPageRuleActionKind(kindRaw) ? kindRaw : "other";
  return {
    source: PAGE_RULE_ACTION_SOURCE,
    ruleKey,
    actionIndex,
    label,
    configuredLabel:
      typeof o.configuredLabel === "string" ? o.configuredLabel.trim().slice(0, MAX_LABEL) : label,
    kind,
    inboundMessageId,
    parentUrl: typeof o.parentUrl === "string" ? o.parentUrl.slice(0, MAX_URL) : undefined,
    origin: typeof o.origin === "string" ? o.origin.slice(0, MAX_ORIGIN) : undefined,
  };
}

export function resolveCurrentTurnPageAction(params: {
  pageContext: unknown;
  inboundMessageId: string;
}): CurrentTurnPageAction {
  const inboundId = String(params.inboundMessageId || "").trim();
  const stamp = readPageActionStamp(params.pageContext);
  if (!stamp) {
    return { trusted: false, provenanceCurrentInbound: false, explicitUserChoice: false };
  }
  const provenanceCurrentInbound = Boolean(inboundId && stamp.inboundMessageId === inboundId);
  const trusted = provenanceCurrentInbound;
  return {
    trusted,
    provenanceCurrentInbound,
    explicitUserChoice: trusted,
    source: PAGE_RULE_ACTION_SOURCE,
    kind: stamp.kind || "other",
    ruleKey: stamp.ruleKey,
    actionIndex: stamp.actionIndex,
    label: stamp.label,
    inboundMessageId: stamp.inboundMessageId,
    parentUrl: stamp.parentUrl,
    origin: stamp.origin,
  };
}

export function pageActionGateDiagnostics(action: CurrentTurnPageAction | null | undefined): {
  pageActionValidated: boolean;
  pageActionCurrentInbound: boolean;
  pageRuleKey?: string;
  pageActionIndex?: number;
  explicitUserChoice: boolean;
} {
  const trusted = action?.trusted === true;
  const current = action?.provenanceCurrentInbound === true;
  return {
    pageActionValidated: trusted,
    pageActionCurrentInbound: current,
    ...(trusted && action?.ruleKey ? { pageRuleKey: action.ruleKey.slice(0, MAX_RULE) } : {}),
    ...(trusted && typeof action?.actionIndex === "number" ? { pageActionIndex: action.actionIndex } : {}),
    explicitUserChoice: trusted && current,
  };
}

export function pageActionKindToVisitorIntent(
  kind: PageRuleActionKind | null | undefined,
): "features_pricing" | "compare_plans" | "find_solution" | "calculate_savings" | "book_demo" | "other" | undefined {
  if (kind === "book_demo") return "book_demo";
  if (kind === "calculate_savings") return "calculate_savings";
  if (kind === "compare_plans") return "compare_plans";
  if (kind === "features_pricing") return "features_pricing";
  if (kind === "find_solution") return "find_solution";
  if (kind === "other") return "other";
  return undefined;
}

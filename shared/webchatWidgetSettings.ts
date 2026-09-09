/**
 * Website Chat Widget defaults, activation state, and legacy-default fingerprinting.
 * Shared by Website Widget UI, Channels, origin policy, and backfill.
 */

import {
  normalizeAllowedOriginsList,
  parseAllowAnyOrigin,
} from "./webchatOriginPolicy";
import {
  NEUTRAL_WEBCHAT_BRANDING,
  sanitizePlainWidgetText,
  sanitizeWebchatBranding,
  sanitizeWidgetHexColor,
} from "./webchatWidgetBranding";
import { sanitizeWebchatFormDefinition } from "./webchatStructuredForm";

export const NEUTRAL_WIDGET_COLOR = "#10b981";
export const NEUTRAL_WIDGET_WELCOME = "Hi! How can we help you today?";
export const LEGACY_WIDGET_COLOR = "#25D366";
export const LEGACY_WIDGET_WELCOME = "Hi there! How can we help you today?";

export type WidgetPageRuleShape = {
  urlContains?: string;
  greeting?: string;
  prefilledMessage?: string;
  suggestedQuestions?: unknown;
  chatbotFlowId?: unknown;
  ctaLabel?: unknown;
  ctaUrl?: unknown;
};

export type WidgetSettingsShape = {
  enabled?: unknown;
  color?: unknown;
  welcomeMessage?: unknown;
  position?: unknown;
  showOnMobile?: unknown;
  showOnDesktop?: unknown;
  triggerType?: unknown;
  triggerDelaySeconds?: unknown;
  triggerScrollPercent?: unknown;
  pageRules?: unknown;
  allowedOrigins?: unknown;
  allowAnyOrigin?: unknown;
};

export const NEUTRAL_WIDGET_SETTINGS: {
  enabled: false;
  color: string;
  welcomeMessage: string;
  position: "right";
  showOnMobile: true;
  showOnDesktop: true;
  triggerType: "always";
  triggerDelaySeconds: number;
  triggerScrollPercent: number;
  pageRules: [];
  allowedOrigins: [];
  allowAnyOrigin: false;
} & typeof NEUTRAL_WEBCHAT_BRANDING = {
  enabled: false,
  color: NEUTRAL_WIDGET_COLOR,
  welcomeMessage: NEUTRAL_WIDGET_WELCOME,
  position: "right",
  showOnMobile: true,
  showOnDesktop: true,
  triggerType: "always",
  triggerDelaySeconds: 5,
  triggerScrollPercent: 50,
  pageRules: [],
  allowedOrigins: [],
  allowAnyOrigin: false,
  ...NEUTRAL_WEBCHAT_BRANDING,
};

/** Exact untouched schema default page rules (order matters). */
export const LEGACY_DEFAULT_PAGE_RULES: Array<{
  urlContains: string;
  greeting: string;
  prefilledMessage: string;
}> = [
  {
    urlContains: "/pricing",
    greeting: "Questions about pricing?",
    prefilledMessage: "Hi! I have a question about your pricing.",
  },
  {
    urlContains: "/contact",
    greeting: "Let us get in touch",
    prefilledMessage: "Hi! I would like to get in touch.",
  },
  {
    urlContains: "/services",
    greeting: "Tell us what you need",
    prefilledMessage: "Hi! I am interested in your services.",
  },
];

/** Former Website Widget placeholders; stored only if a save copied them into JSON. */
export const LEGACY_DEFAULT_SUGGESTED_QUESTIONS = ["What are your hours?", "Book a demo"];
export const LEGACY_DEFAULT_CTA_LABEL = "Book a demo";

/**
 * Dominant production dump: older column default never stored pageRules.
 * Sanitized from production (61 rows: 59 of this shape).
 */
export const PRODUCTION_SHORT_LEGACY_WIDGET_SETTINGS = {
  enabled: true,
  color: LEGACY_WIDGET_COLOR,
  welcomeMessage: LEGACY_WIDGET_WELCOME,
  position: "right" as const,
  showOnMobile: true,
};

export function requestedWidgetEnabled(settings: WidgetSettingsShape | null | undefined): boolean {
  return settings?.enabled === true;
}

export function hasWidgetOriginPrerequisite(settings: WidgetSettingsShape | null | undefined): boolean {
  if (parseAllowAnyOrigin(settings as Record<string, unknown> | undefined)) return true;
  return normalizeAllowedOriginsList(settings?.allowedOrigins).length > 0;
}

export type WidgetActivationReason = "disabled" | "no_origins" | "ok" | "allow_any";

export type WidgetActivationState = {
  requestedEnabled: boolean;
  hasOriginPrerequisite: boolean;
  effectivePublic: boolean;
  reason: WidgetActivationReason;
};

export function resolveWidgetActivationState(
  settings: WidgetSettingsShape | null | undefined,
): WidgetActivationState {
  const requestedEnabled = requestedWidgetEnabled(settings);
  const allowAny = parseAllowAnyOrigin(settings as Record<string, unknown> | undefined);
  const origins = normalizeAllowedOriginsList(settings?.allowedOrigins);
  const hasOriginPrerequisite = allowAny || origins.length > 0;
  if (!requestedEnabled) {
    return { requestedEnabled, hasOriginPrerequisite, effectivePublic: false, reason: "disabled" };
  }
  if (allowAny) {
    return { requestedEnabled, hasOriginPrerequisite: true, effectivePublic: true, reason: "allow_any" };
  }
  if (origins.length === 0) {
    return { requestedEnabled, hasOriginPrerequisite: false, effectivePublic: false, reason: "no_origins" };
  }
  return { requestedEnabled, hasOriginPrerequisite: true, effectivePublic: true, reason: "ok" };
}

function normText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSuggestedQuestions(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    return raw.split(",").map((q) => q.trim()).filter(Boolean);
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((q) => String(q).trim()).filter(Boolean);
}

function suggestedQuestionsMatchLegacyDefault(raw: unknown): boolean {
  const qs = normalizeSuggestedQuestions(raw);
  if (qs.length === 0) return true;
  if (qs.length !== LEGACY_DEFAULT_SUGGESTED_QUESTIONS.length) return false;
  return qs.every((q, i) => q === LEGACY_DEFAULT_SUGGESTED_QUESTIONS[i]);
}

function ctaLabelMatchLegacyDefault(raw: unknown): boolean {
  const label = normText(raw);
  return label === "" || label === LEGACY_DEFAULT_CTA_LABEL;
}

/** Empty extras or the old UI placeholders — not a customer customization. */
function extrasAreUntouchedPlatformDefaults(rule: WidgetPageRuleShape): boolean {
  if (normText(rule.chatbotFlowId)) return false;
  if (normText(rule.ctaUrl)) return false;
  if (!ctaLabelMatchLegacyDefault(rule.ctaLabel)) return false;
  if (!suggestedQuestionsMatchLegacyDefault(rule.suggestedQuestions)) return false;
  return true;
}

export function rulesMatchLegacyDefaultFingerprint(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length !== LEGACY_DEFAULT_PAGE_RULES.length) return false;
  for (let i = 0; i < LEGACY_DEFAULT_PAGE_RULES.length; i++) {
    const rule = raw[i] as WidgetPageRuleShape;
    const expected = LEGACY_DEFAULT_PAGE_RULES[i];
    if (!rule || typeof rule !== "object") return false;
    if (normText(rule.urlContains) !== expected.urlContains) return false;
    if (normText(rule.greeting) !== expected.greeting) return false;
    if (normText(rule.prefilledMessage) !== expected.prefilledMessage) return false;
    if (!extrasAreUntouchedPlatformDefaults(rule)) return false;
  }
  return true;
}

function isDefaultWelcome(value: unknown): boolean {
  if (value == null || value === "") return true;
  const w = normText(value);
  return w === LEGACY_WIDGET_WELCOME || w === NEUTRAL_WIDGET_WELCOME;
}

function isDefaultColor(value: unknown): boolean {
  if (value == null || value === "") return true;
  const c = String(value).trim().toLowerCase();
  return c === LEGACY_WIDGET_COLOR.toLowerCase() || c === NEUTRAL_WIDGET_COLOR.toLowerCase();
}

export type WidgetSettingsClass = "exact_legacy_default" | "already_neutral" | "customized";

export function classifyWidgetSettings(stored: unknown): WidgetSettingsClass {
  const s = stored && typeof stored === "object" ? (stored as WidgetSettingsShape) : {};
  const hasOrigins = hasWidgetOriginPrerequisite(s);
  if (Array.isArray(s.pageRules) && s.pageRules.length === 0) return "already_neutral";
  if (
    !hasOrigins &&
    isDefaultWelcome(s.welcomeMessage) &&
    isDefaultColor(s.color)
  ) {
    if (!Array.isArray(s.pageRules)) return "exact_legacy_default";
    if (rulesMatchLegacyDefaultFingerprint(s.pageRules)) return "exact_legacy_default";
  }
  return "customized";
}

export function applyLegacyDefaultWidgetSanitize(
  stored: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const s = { ...(stored && typeof stored === "object" ? stored : {}) };
  if (classifyWidgetSettings(s) !== "exact_legacy_default") {
    return s;
  }
  return {
    ...s,
    enabled: false,
    color: NEUTRAL_WIDGET_COLOR,
    welcomeMessage: NEUTRAL_WIDGET_WELCOME,
    pageRules: [],
    allowAnyOrigin: false,
  };
}

export function mergeNeutralWidgetSettings(stored: unknown): Record<string, unknown> {
  const s = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const sanitized = applyLegacyDefaultWidgetSanitize(s);
  const pageRules = Array.isArray(sanitized.pageRules) ? sanitized.pageRules : [];
  const branding = sanitizeWebchatBranding(sanitized);
  const leadForm = sanitizeWebchatFormDefinition(sanitized.leadForm);
  const merged: Record<string, unknown> = {
    ...NEUTRAL_WIDGET_SETTINGS,
    ...sanitized,
    ...branding,
    enabled: sanitized.enabled === true,
    allowAnyOrigin: sanitized.allowAnyOrigin === true,
    color: sanitizeWidgetHexColor(sanitized.color, NEUTRAL_WIDGET_COLOR) || NEUTRAL_WIDGET_COLOR,
    welcomeMessage:
      sanitizePlainWidgetText(sanitized.welcomeMessage, 500) || NEUTRAL_WIDGET_WELCOME,
    pageRules,
    allowedOrigins: Array.isArray(sanitized.allowedOrigins) ? sanitized.allowedOrigins : [],
  };
  if (leadForm) merged.leadForm = leadForm;
  else delete merged.leadForm;
  return merged;
}

export type PageRuleValidation =
  | { ok: true; rules: WidgetPageRuleShape[] }
  | { ok: false; error: string };

export function leftoverLegacyExamplePageRules(stored: unknown): boolean {
  const s = stored && typeof stored === "object" ? (stored as WidgetSettingsShape) : {};
  return classifyWidgetSettings(s) === "customized" && rulesMatchLegacyDefaultFingerprint(s.pageRules);
}

export type WidgetSettingsClassCounts = {
  exactLegacyDefault: number;
  alreadyNeutral: number;
  customized: number;
  leftoverLegacyExampleRules: number;
  total: number;
};

export function countWidgetSettingsClasses(rows: unknown[]): WidgetSettingsClassCounts {
  const counts: WidgetSettingsClassCounts = {
    exactLegacyDefault: 0,
    alreadyNeutral: 0,
    customized: 0,
    leftoverLegacyExampleRules: 0,
    total: rows.length,
  };
  for (const row of rows) {
    const cls = classifyWidgetSettings(row);
    if (cls === "exact_legacy_default") counts.exactLegacyDefault += 1;
    else if (cls === "already_neutral") counts.alreadyNeutral += 1;
    else counts.customized += 1;
    if (leftoverLegacyExamplePageRules(row)) counts.leftoverLegacyExampleRules += 1;
  }
  return counts;
}

export type WidgetSurfaceStatus = {
  switchChecked: boolean;
  widgetStatusLabel: string;
  channelPill: "connected" | "needs_attention" | "not_connected";
  channelSubline: string;
  originHint: string | null;
};

export function widgetSurfaceStatus(state: WidgetActivationState): WidgetSurfaceStatus {
  if (state.effectivePublic) {
    return {
      switchChecked: true,
      widgetStatusLabel: "Active",
      channelPill: "connected",
      channelSubline: "Website Chat Widget is live on allowed domains.",
      originHint: null,
    };
  }
  if (state.reason === "no_origins" || (state.requestedEnabled && !state.hasOriginPrerequisite)) {
    return {
      switchChecked: false,
      widgetStatusLabel: "Inactive",
      channelPill: "needs_attention",
      channelSubline: "Add a website domain before enabling the widget.",
      originHint: "Add a website domain before enabling the widget.",
    };
  }
  return {
    switchChecked: false,
    widgetStatusLabel: "Disabled",
    channelPill: "not_connected",
    channelSubline: "Capture, qualify and assist website visitors in your unified Inbox.",
    originHint: null,
  };
}

export function validateWidgetPageRules(raw: unknown): PageRuleValidation {
  if (!Array.isArray(raw)) return { ok: false, error: "Page rules must be a list." };
  if (raw.length > 30) return { ok: false, error: "Too many page rules." };
  const seen = new Set<string>();
  const rules: WidgetPageRuleShape[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Each page rule must be an object." };
    }
    const rule = item as WidgetPageRuleShape;
    const urlContains = normText(rule.urlContains);
    if (!urlContains) {
      return { ok: false, error: "Each page rule needs a URL fragment (for example /about)." };
    }
    if (urlContains.length > 500) {
      return { ok: false, error: "URL fragment is too long." };
    }
    const key = urlContains.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: "Two page rules use the same URL fragment. The first match wins — remove the duplicate." };
    }
    seen.add(key);
    const ctaUrl = normText(rule.ctaUrl);
    if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) {
      return { ok: false, error: "CTA URL must start with https:// or http://." };
    }
    rules.push({
      ...rule,
      urlContains,
      greeting: normText(rule.greeting).slice(0, 500),
      prefilledMessage: String(rule.prefilledMessage || "").slice(0, 2000),
      ctaUrl,
      ctaLabel: normText(rule.ctaLabel).slice(0, 80),
    });
  }
  return { ok: true, rules };
}

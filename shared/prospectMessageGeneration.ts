/**
 * Message Generation orchestration helpers (pure).
 * Strategies: AI Compose · Use My Template · AI Assisted Template.
 */

import {
  applyAiPlaceholderReplacements,
  extractAiPlaceholderKeys,
  sanitizeAiPlaceholderFillResponse,
} from "./prospectAiPlaceholders";
import {
  messageCreationAllowsAiPlaceholders,
  messageCreationUsesTemplate,
  type ProspectMessageCreationMode,
  type ProspectMessageCreationSettings,
} from "./prospectMessageCreation";
import {
  buildProspectMessageVariableMap,
  extractProspectTemplateTokens,
  mergeProspectTemplate,
  type ProspectMessageVariableSource,
} from "./prospectMessageVariables";

export type ProspectGeneratedMessage = {
  subject: string;
  body: string;
  mode: ProspectMessageCreationMode;
  /** Keys still present after render (unresolved tokens). */
  unresolvedTokens: string[];
  meta: {
    usedTemplate: boolean;
    aiPlaceholdersFilled: string[];
    variablesMerged: boolean;
  };
};

export type ProspectAiComposeSeed = {
  subject?: string | null;
  body?: string | null;
};

/** Render Use My Template / pre-AI-assisted merge (variables only). */
export function renderProspectTemplateMerge(params: {
  settings: ProspectMessageCreationSettings;
  source: ProspectMessageVariableSource;
}): { subject: string; body: string } {
  const values = buildProspectMessageVariableMap(params.source);
  return {
    subject: mergeProspectTemplate(params.settings.templateSubject, values),
    body: mergeProspectTemplate(params.settings.templateBody, values),
  };
}

/**
 * Apply AI placeholder fill onto an already variable-merged template.
 * Only replaces requested ai_* keys present in the template.
 */
export function renderProspectAiAssistedTemplate(params: {
  subject: string;
  body: string;
  requestedKeys: string[];
  aiFill: unknown;
}): { subject: string; body: string; filledKeys: string[] } {
  const replacements = sanitizeAiPlaceholderFillResponse(params.requestedKeys, params.aiFill);
  const filledKeys = Object.keys(replacements);
  return {
    subject: applyAiPlaceholderReplacements(params.subject, replacements),
    body: applyAiPlaceholderReplacements(params.body, replacements),
    filledKeys,
  };
}

export function listUnresolvedTemplateTokens(subject: string, body: string): string[] {
  return extractProspectTemplateTokens(subject, body);
}

/** Pure path for template modes (AI fill map optional for assisted). */
export function generateFromTemplateStrategy(params: {
  mode: ProspectMessageCreationMode;
  settings: ProspectMessageCreationSettings;
  source: ProspectMessageVariableSource;
  aiFill?: unknown;
}): ProspectGeneratedMessage {
  if (!messageCreationUsesTemplate(params.mode)) {
    throw new Error("generateFromTemplateStrategy requires a template mode");
  }

  const merged = renderProspectTemplateMerge({
    settings: params.settings,
    source: params.source,
  });

  let subject = merged.subject;
  let body = merged.body;
  let aiPlaceholdersFilled: string[] = [];

  if (messageCreationAllowsAiPlaceholders(params.mode)) {
    const requested = extractAiPlaceholderKeys(
      params.settings.templateSubject,
      params.settings.templateBody,
    );
    if (requested.length > 0 && params.aiFill != null) {
      const applied = renderProspectAiAssistedTemplate({
        subject,
        body,
        requestedKeys: requested,
        aiFill: params.aiFill,
      });
      subject = applied.subject;
      body = applied.body;
      aiPlaceholdersFilled = applied.filledKeys;
    }
  }

  return {
    subject: subject.slice(0, 500),
    body,
    mode: params.mode,
    unresolvedTokens: extractProspectTemplateTokens(subject, body),
    meta: {
      usedTemplate: true,
      aiPlaceholdersFilled,
      variablesMerged: true,
    },
  };
}

/** AI Compose uses pre-written seed (PI draft / rewrite result) — no template rewrite. */
export function generateFromAiComposeSeed(params: {
  seed: ProspectAiComposeSeed;
}): ProspectGeneratedMessage {
  const subject = String(params.seed.subject || "").trim();
  const body = String(params.seed.body || "").trim();
  return {
    subject: subject.slice(0, 500),
    body,
    mode: "ai_compose",
    unresolvedTokens: extractProspectTemplateTokens(subject, body),
    meta: {
      usedTemplate: false,
      aiPlaceholdersFilled: [],
      variablesMerged: false,
    },
  };
}

/** Contract helper for tests: Use My Template must not change prose outside tokens. */
export function templateProseFingerprint(template: string): string {
  return template.replace(/\{\{\s*[a-zA-Z][a-zA-Z0-9_.-]*\s*\}\}/g, "{{}}");
}

/**
 * Prospect AI Message Creation — modes + settings persisted in outreach_instructions jsonb.
 * AI Compose keeps existing Campaign Instructions fields; template modes add subject/body.
 */

import {
  isOutreachInstructionsConfigured,
  normalizeOutreachInstructionsForSave,
  OutreachInstructionsValidationError,
  parseOutreachInstructions,
  PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
  type ProspectOutreachInstructions,
} from "./prospectOutreachInstructions";
import { extractAiPlaceholderKeys } from "./prospectAiPlaceholders";

export const PROSPECT_MESSAGE_CREATION_MODES = [
  "ai_compose",
  "use_my_template",
  "ai_assisted_template",
] as const;

export type ProspectMessageCreationMode = (typeof PROSPECT_MESSAGE_CREATION_MODES)[number];

export const PROSPECT_MESSAGE_CREATION_MODE_LABELS: Record<ProspectMessageCreationMode, string> = {
  ai_compose: "AI Compose",
  use_my_template: "Use My Template",
  ai_assisted_template: "AI Assisted Template",
};

export type ProspectMessageCreationSettings = ProspectOutreachInstructions & {
  mode: ProspectMessageCreationMode;
  templateSubject: string;
  templateBody: string;
};

export const PROSPECT_MESSAGE_CREATION_DEFAULTS: ProspectMessageCreationSettings = {
  ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
  mode: "ai_compose",
  templateSubject: "",
  templateBody: "",
};

export function parseProspectMessageCreationMode(raw: unknown): ProspectMessageCreationMode {
  const mode = String(raw || "")
    .trim()
    .toLowerCase();
  if ((PROSPECT_MESSAGE_CREATION_MODES as readonly string[]).includes(mode)) {
    return mode as ProspectMessageCreationMode;
  }
  return "ai_compose";
}

/** Lenient parse for stored jsonb / API reads. Missing mode → ai_compose. */
export function parseMessageCreationSettings(raw: unknown): ProspectMessageCreationSettings {
  const base = parseOutreachInstructions(raw);
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    ...base,
    mode: parseProspectMessageCreationMode(src.mode),
    templateSubject: String(src.templateSubject ?? "").slice(0, 500),
    templateBody: String(src.templateBody ?? "").slice(0, 20_000),
  };
}

/**
 * Normalize a PATCH body into a persistable jsonb object (always full shape).
 * Template modes require a non-empty body; Use My Template rejects ai_* tokens.
 */
export function normalizeMessageCreationForSave(raw: unknown): ProspectMessageCreationSettings {
  const parsed = parseMessageCreationSettings(raw);
  const instructions = normalizeOutreachInstructionsForSave(raw);
  const next: ProspectMessageCreationSettings = {
    ...instructions,
    mode: parsed.mode,
    templateSubject: parsed.templateSubject.trim().slice(0, 500),
    templateBody: parsed.templateBody.trim().slice(0, 20_000),
  };

  if (next.mode === "use_my_template" || next.mode === "ai_assisted_template") {
    if (!next.templateBody) {
      throw new OutreachInstructionsValidationError(
        "Add a message template before saving this Message Creation mode.",
      );
    }
  }

  if (next.mode === "use_my_template") {
    const aiKeys = extractAiPlaceholderKeys(next.templateSubject, next.templateBody);
    if (aiKeys.length > 0) {
      throw new OutreachInstructionsValidationError(
        "Use My Template cannot include AI placeholders ({{ai_…}}). Switch to AI Assisted Template, or remove those tokens.",
      );
    }
  }

  return next;
}

/** True when the workspace has usable Message Creation settings for the active mode. */
export function isMessageCreationConfigured(raw: unknown): boolean {
  if (!raw || typeof raw === "undefined") return false;
  const settings = parseMessageCreationSettings(raw);
  if (settings.mode === "ai_compose") {
    return isOutreachInstructionsConfigured(raw);
  }
  return settings.templateBody.trim().length > 0;
}

/** Slice AI-compose fields for prompts that still expect ProspectOutreachInstructions. */
export function toOutreachInstructions(
  settings: ProspectMessageCreationSettings | ProspectOutreachInstructions | null | undefined,
): ProspectOutreachInstructions {
  const s = settings || PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS;
  return {
    customInstructions: s.customInstructions,
    tone: s.tone,
    length: s.length,
    personalize: s.personalize,
    language: s.language,
    linkUrl: s.linkUrl,
    includeLinkNaturally: s.includeLinkNaturally,
  };
}

export function messageCreationUsesTemplate(mode: ProspectMessageCreationMode): boolean {
  return mode === "use_my_template" || mode === "ai_assisted_template";
}

export function messageCreationAllowsAiRewrite(mode: ProspectMessageCreationMode): boolean {
  return mode === "ai_compose";
}

export function messageCreationAllowsAiPlaceholders(mode: ProspectMessageCreationMode): boolean {
  return mode === "ai_assisted_template";
}

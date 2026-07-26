/**
 * Prospect AI Campaign — workspace Outreach Instructions.
 * Separate from AI Brain custom_instructions.
 */

import { titleCaseProspectName } from "./prospectContactEnrichment";

export const PROSPECT_OUTREACH_TONES = ["professional", "friendly", "direct"] as const;
export type ProspectOutreachTone = (typeof PROSPECT_OUTREACH_TONES)[number];

export const PROSPECT_OUTREACH_LENGTHS = ["short", "medium"] as const;
export type ProspectOutreachLength = (typeof PROSPECT_OUTREACH_LENGTHS)[number];

export const PROSPECT_OUTREACH_LANGUAGES = [
  "auto",
  "english",
  "spanish",
  "hebrew",
  "arabic",
] as const;
export type ProspectOutreachLanguage = (typeof PROSPECT_OUTREACH_LANGUAGES)[number];

export const PROSPECT_OUTREACH_LANGUAGE_LABELS: Record<ProspectOutreachLanguage, string> = {
  auto: "Auto (match prospect)",
  english: "English",
  spanish: "Spanish",
  hebrew: "Hebrew",
  arabic: "Arabic",
};

export type ProspectOutreachInstructions = {
  customInstructions: string;
  tone: ProspectOutreachTone;
  length: ProspectOutreachLength;
  personalize: boolean;
  language: ProspectOutreachLanguage;
  /** Exact user URL (trimmed). Empty = no link. */
  linkUrl: string;
  /** When true and linkUrl is set, instruct AI to include the URL once in the message body. */
  includeLinkNaturally: boolean;
};

export const PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS: ProspectOutreachInstructions = {
  customInstructions: "",
  tone: "professional",
  length: "short",
  personalize: true,
  language: "auto",
  linkUrl: "",
  includeLinkNaturally: true,
};

/** True when the workspace has saved instructions (jsonb is not empty {}). */
export function isOutreachInstructionsConfigured(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return Object.keys(raw as Record<string, unknown>).length > 0;
}

export type OutreachLinkValidation =
  | { ok: true; linkUrl: string }
  | { ok: false; error: string };

/**
 * Validate optional campaign link. Empty is allowed.
 * Preserves the exact trimmed URL (no rewriting / tracking params).
 */
export function validateOutreachLinkUrl(raw: unknown): OutreachLinkValidation {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: true, linkUrl: "" };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Enter a valid http:// or https:// URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "URL must start with http:// or https://" };
  }
  return { ok: true, linkUrl: trimmed };
}

/** Lenient parse for stored jsonb / API reads — invalid language/URL fall back safely. */
export function parseOutreachInstructions(raw: unknown): ProspectOutreachInstructions {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const toneRaw = String(src.tone || "")
    .trim()
    .toLowerCase();
  const lengthRaw = String(src.length || "")
    .trim()
    .toLowerCase();
  const languageRaw = String(src.language || "")
    .trim()
    .toLowerCase();
  const tone = (PROSPECT_OUTREACH_TONES as readonly string[]).includes(toneRaw)
    ? (toneRaw as ProspectOutreachTone)
    : PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS.tone;
  const length = (PROSPECT_OUTREACH_LENGTHS as readonly string[]).includes(lengthRaw)
    ? (lengthRaw as ProspectOutreachLength)
    : PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS.length;
  const language = (PROSPECT_OUTREACH_LANGUAGES as readonly string[]).includes(languageRaw)
    ? (languageRaw as ProspectOutreachLanguage)
    : PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS.language;

  const linkCheck = validateOutreachLinkUrl(src.linkUrl);
  const linkUrl = linkCheck.ok ? linkCheck.linkUrl : "";

  return {
    customInstructions: String(src.customInstructions ?? "").slice(0, 4000),
    tone,
    length,
    personalize:
      typeof src.personalize === "boolean"
        ? src.personalize
        : PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS.personalize,
    language,
    linkUrl,
    includeLinkNaturally:
      typeof src.includeLinkNaturally === "boolean"
        ? src.includeLinkNaturally
        : PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS.includeLinkNaturally,
  };
}

export class OutreachInstructionsValidationError extends Error {
  readonly code = "invalid_outreach_instructions";

  constructor(message: string) {
    super(message);
    this.name = "OutreachInstructionsValidationError";
  }
}

/**
 * Normalize a PATCH body into a persistable jsonb object (always full shape).
 * Rejects non-empty invalid URLs (empty URL is allowed).
 */
export function normalizeOutreachInstructionsForSave(
  raw: unknown,
): ProspectOutreachInstructions {
  const parsed = parseOutreachInstructions(raw);
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const linkCheck = validateOutreachLinkUrl(src.linkUrl ?? parsed.linkUrl);
  if (!linkCheck.ok) {
    throw new OutreachInstructionsValidationError(linkCheck.error);
  }
  return {
    ...parsed,
    linkUrl: linkCheck.linkUrl,
  };
}

/**
 * Default subject when none is saved — natural, varied, never rigid "Idea for {Business}".
 * Deterministic from the prospect name so the same prospect stays stable.
 */
export function buildProspectOutreachSubject(
  name?: string | null,
  opts?: { offer?: string | null; angle?: string | null },
): string {
  const clean = titleCaseProspectName(name) || "your team";
  const offer = String(opts?.offer || "").toLowerCase();
  const angle = String(opts?.angle || "").toLowerCase();

  const variants: string[] = [
    `Quick introduction, ${clean}`,
    `Thought this might fit ${clean}`,
    `Quick question for ${clean}`,
    `${clean} × a quick idea`,
    `Connecting with ${clean}`,
  ];

  if (/agency|partner|white.?label/i.test(offer) || /agency/i.test(angle)) {
    variants.push("Helping agencies respond to leads faster");
    variants.push("Quick question about your lead conversations");
  }
  if (/shopify|ecommerce|store/i.test(offer) || /shopify|store/i.test(angle)) {
    variants.push("Quick question about your customer conversations");
  }
  if (/real.?estate|realtor/i.test(offer) || /real.?estate/i.test(angle)) {
    variants.push("Quick question about your client conversations");
  }

  let hash = 0;
  const seed = `${clean}|${offer}|${angle}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i) * (i + 3)) % 997;
  }
  const subject = variants[hash % variants.length] || variants[0]!;
  return subject.slice(0, 200);
}

/**
 * Prefer the per-prospect saved subject; otherwise a safe varied fallback.
 * Never throws on null/empty older rows.
 */
export function resolveProspectOutreachSubject(params: {
  savedSubject?: string | null;
  prospectName?: string | null;
  recommendedOffer?: string | null;
  outreachAngle?: string | null;
}): string {
  const saved = String(params.savedSubject || "").trim();
  if (saved) return saved.slice(0, 200);
  return buildProspectOutreachSubject(params.prospectName, {
    offer: params.recommendedOffer,
    angle: params.outreachAngle,
  });
}

function languageInstructionLine(language: ProspectOutreachLanguage): string {
  switch (language) {
    case "english":
      return "Write the customer-facing subject and message in English.";
    case "spanish":
      return "Write the customer-facing subject and message in Spanish.";
    case "hebrew":
      return "Write the customer-facing subject and message in Hebrew as natural Hebrew text (not transliteration).";
    case "arabic":
      return "Write the customer-facing subject and message in Arabic as natural Arabic text (not transliteration).";
    case "auto":
    default:
      return "Use a reliably inferred prospect/business language when available; otherwise use English. Do not guess language from a business name alone.";
  }
}

/** Prompt block for Prospect AI generation — separate from AI Brain instructions. */
export function formatOutreachInstructionsForPrompt(
  instructions: ProspectOutreachInstructions | null | undefined,
): string {
  const i = instructions || PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS;
  const personalizeLine = i.personalize
    ? "Personalize using prospect/company information when available."
    : "Keep copy general; minimize prospect-specific assumptions.";
  const custom = i.customInstructions.trim();
  const linkLines =
    i.linkUrl && i.includeLinkNaturally
      ? `- Include this exact URL once, naturally in the outreach message body where it fits (not at the awkward start, not repeated). Do not put the URL in the subject. Do not shorten, rewrite, or add tracking parameters:\n${i.linkUrl}`
      : i.linkUrl && !i.includeLinkNaturally
        ? "- A campaign link is saved but automatic inclusion is disabled — do not insert a URL unless the custom instructions explicitly ask for it."
        : "- No campaign link configured — do not invent or insert a URL.";

  return `PROSPECT AI OUTREACH INSTRUCTIONS (Campaign settings — guide subject + message style only):
- Language: ${i.language}
- ${languageInstructionLine(i.language)}
- Tone: ${i.tone}
- Length: ${i.length}
- ${personalizeLine}
${custom ? `- Custom instructions from the workspace:\n${custom}` : "- No custom free-text instructions saved."}
${linkLines}
Rules:
- Follow these instructions for suggestedOutreachAngle, suggestedOutreachSubject, and suggestedFirstMessage.
- Customer-facing subject and message must follow the language instruction; outreach angle may stay internal/English if needed.
- Preserve proper names, business names, brand names, product names, and URLs appropriately (do not translate URLs).
- Never put the configured campaign URL in the subject line.
- Do NOT invent unsupported claims, fake interest, Re:/Fwd: subjects, clickbait, spammy wording, or emojis unless explicitly requested.
- Do NOT override safety/compliance or invent what the workspace sells beyond WORKSPACE BUSINESS CONTEXT.
- Prefer natural, varied email subjects — never default every prospect to "Idea for {Business}".`;
}

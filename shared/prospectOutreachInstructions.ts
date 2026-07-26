/**
 * Prospect AI Campaign — workspace Outreach Instructions.
 * Separate from AI Brain custom_instructions.
 */

import { titleCaseProspectName } from "./prospectContactEnrichment";

export const PROSPECT_OUTREACH_TONES = ["professional", "friendly", "direct"] as const;
export type ProspectOutreachTone = (typeof PROSPECT_OUTREACH_TONES)[number];

export const PROSPECT_OUTREACH_LENGTHS = ["short", "medium"] as const;
export type ProspectOutreachLength = (typeof PROSPECT_OUTREACH_LENGTHS)[number];

export type ProspectOutreachInstructions = {
  customInstructions: string;
  tone: ProspectOutreachTone;
  length: ProspectOutreachLength;
  personalize: boolean;
};

export const PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS: ProspectOutreachInstructions = {
  customInstructions: "",
  tone: "professional",
  length: "short",
  personalize: true,
};

/** True when the workspace has saved instructions (jsonb is not empty {}). */
export function isOutreachInstructionsConfigured(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return Object.keys(raw as Record<string, unknown>).length > 0;
}

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
  const tone = (PROSPECT_OUTREACH_TONES as readonly string[]).includes(toneRaw)
    ? (toneRaw as ProspectOutreachTone)
    : PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS.tone;
  const length = (PROSPECT_OUTREACH_LENGTHS as readonly string[]).includes(lengthRaw)
    ? (lengthRaw as ProspectOutreachLength)
    : PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS.length;
  return {
    customInstructions: String(src.customInstructions ?? "").slice(0, 4000),
    tone,
    length,
    personalize:
      typeof src.personalize === "boolean"
        ? src.personalize
        : PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS.personalize,
  };
}

/** Normalize a PATCH body into a persistable jsonb object (always full shape). */
export function normalizeOutreachInstructionsForSave(
  raw: unknown,
): ProspectOutreachInstructions {
  return parseOutreachInstructions(raw);
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

/** Prompt block for Prospect AI generation — separate from AI Brain instructions. */
export function formatOutreachInstructionsForPrompt(
  instructions: ProspectOutreachInstructions | null | undefined,
): string {
  const i = instructions || PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS;
  const personalizeLine = i.personalize
    ? "Personalize using prospect/company information when available."
    : "Keep copy general; minimize prospect-specific assumptions.";
  const custom = i.customInstructions.trim();
  return `PROSPECT AI OUTREACH INSTRUCTIONS (Campaign settings — guide subject + message style only):
- Tone: ${i.tone}
- Length: ${i.length}
- ${personalizeLine}
${custom ? `- Custom instructions from the workspace:\n${custom}` : "- No custom free-text instructions saved."}
Rules:
- Follow these instructions for suggestedOutreachAngle, suggestedOutreachSubject, and suggestedFirstMessage.
- Do NOT invent unsupported claims, fake interest, Re:/Fwd: subjects, clickbait, spammy wording, or emojis unless explicitly requested.
- Do NOT override safety/compliance or invent what the workspace sells beyond WORKSPACE BUSINESS CONTEXT.
- Prefer natural, varied email subjects — never default every prospect to "Idea for {Business}".`;
}

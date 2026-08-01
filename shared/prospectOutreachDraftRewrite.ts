/**
 * Campaign-wide AI guidance as a rewrite layer over existing personalized drafts.
 * Must preserve prospect-specific facts — never invent an unrelated message.
 */

import {
  formatOutreachInstructionsForPrompt,
  type ProspectOutreachInstructions,
} from "./prospectOutreachInstructions";

export function buildOutreachDraftRewriteSystemPrompt(): string {
  return `You rewrite an existing personalized cold-outreach email draft.
Rules:
- Preserve the prospect's identity, company, and any specific facts already in the draft.
- Apply the campaign guidance as a style/content layer (tone, length, must-mention / must-avoid).
- Do NOT invent a completely new pitch unrelated to the original draft.
- Do NOT invent unsupported claims, fake interest, Re:/Fwd: subjects, spam, or emojis unless asked.
- Return JSON only: {"subject":"...","message":"..."}`;
}

export function buildOutreachDraftRewriteUserPrompt(input: {
  prospectName?: string | null;
  subject: string;
  message: string;
  instructions: ProspectOutreachInstructions | null | undefined;
}): string {
  const name = String(input.prospectName || "").trim() || "Prospect";
  return `Prospect: ${name}

EXISTING SUBJECT:
${String(input.subject || "").trim()}

EXISTING MESSAGE:
${String(input.message || "").trim()}

${formatOutreachInstructionsForPrompt(input.instructions)}

Rewrite the subject and message to follow the campaign instructions while keeping the same personalized intent.`;
}

export function parseOutreachDraftRewriteResponse(raw: string): {
  subject: string;
  message: string;
} | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const json = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    const parsed = JSON.parse(json) as { subject?: unknown; message?: unknown };
    const subject = String(parsed.subject || "").trim().slice(0, 200);
    const message = String(parsed.message || "").trim().slice(0, 8000);
    if (!subject || !message) return null;
    return { subject, message };
  } catch {
    return null;
  }
}

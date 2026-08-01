/**
 * Campaign-wide AI guidance as a rewrite layer over existing personalized drafts.
 * Must preserve prospect-specific facts — never invent an unrelated message.
 * Always applies the Platform Outreach Writing Standard.
 */

import {
  formatOutreachInstructionsForPrompt,
  type ProspectOutreachInstructions,
} from "./prospectOutreachInstructions";
import {
  formatOutreachProspectIntelligenceForPrompt,
  formatOutreachSenderContextForPrompt,
  formatPlatformOutreachWritingStandardForPrompt,
} from "./prospectOutreachWritingStandard";

export function buildOutreachDraftRewriteSystemPrompt(): string {
  return `You rewrite an existing personalized cold-outreach email draft into a stronger final message.

${formatPlatformOutreachWritingStandardForPrompt()}

Additional rewrite rules:
- Preserve real prospect-specific details already in the draft or prospect intelligence; never invent new compliments, awards, listings, or specialties.
- Apply Campaign Instructions as a customization layer (objective, offer emphasis, CTA, tone, length, link, include/avoid) — never as a replacement for the writing standard.
- Obey link inclusion flags: if Include link is NO, strip every URL from the previous draft.
- Sender signature must use verified workspace fields only; if no verified displayName, close with "Best," only.
- Do NOT invent a completely new pitch unrelated to the original draft.
- Do NOT invent unsupported claims, fake interest, Re:/Fwd: subjects, spam, or emojis unless asked.
- Stay on the prospect's industry — no cross-vertical language leakage.
- Return JSON only: {"subject":"...","message":"..."}`;
}

export function buildOutreachDraftRewriteUserPrompt(input: {
  prospectName?: string | null;
  subject: string;
  message: string;
  instructions: ProspectOutreachInstructions | null | undefined;
  /** Preformatted WORKSPACE BUSINESS CONTEXT block (optional). */
  workspaceContextBlock?: string | null;
  /** Preformatted PROSPECT INTELLIGENCE block (optional). */
  prospectIntelligenceBlock?: string | null;
  /** Raw sender fields when a preformatted block is not provided. */
  sender?: {
    displayName?: string | null;
    businessName?: string | null;
    email?: string | null;
    website?: string | null;
    phone?: string | null;
    executiveSummary?: string | null;
    servicesProducts?: string | null;
    configured?: boolean;
  } | null;
  prospect?: {
    companyName?: string | null;
    industry?: string | null;
    businessType?: string | null;
    outreachAngle?: string | null;
    reasoningSummary?: string | null;
    recipientIdentity?: string | null;
  } | null;
}): string {
  const name = String(input.prospectName || "").trim() || "Prospect";
  const workspaceBlock =
    String(input.workspaceContextBlock || "").trim() ||
    formatOutreachSenderContextForPrompt({
      ...(input.sender || {}),
      configured: input.sender?.configured,
    });
  const prospectBlock =
    String(input.prospectIntelligenceBlock || "").trim() ||
    formatOutreachProspectIntelligenceForPrompt({
      prospectName: name,
      ...(input.prospect || {}),
    });

  return `Assemble the final outreach rewrite in this order (already reflected below):
1) Platform Outreach Writing Standard (see system message — always apply)
2) Workspace / AI Brain context
3) Prospect intelligence
4) Campaign-specific instructions
5) Existing personalized draft → produce the improved final draft

${workspaceBlock}

${prospectBlock}

${formatOutreachInstructionsForPrompt(input.instructions)}

EXISTING PERSONALIZED DRAFT (improve this — preserve prospect-specific facts):
EXISTING SUBJECT:
${String(input.subject || "").trim()}

EXISTING MESSAGE:
${String(input.message || "").trim()}

Rewrite the subject and message so they follow the Platform Outreach Writing Standard and incorporate Campaign Instructions, while keeping the same personalized intent. Return JSON only.`;
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

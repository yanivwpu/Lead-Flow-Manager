/**
 * Platform-wide Prospect AI Outreach Writing Standard.
 * Always applied automatically — Campaign Instructions customize WHAT to emphasize, not HOW to write.
 */

export const PLATFORM_OUTREACH_WRITING_STANDARD_HEADING =
  "PLATFORM OUTREACH WRITING STANDARD";

/**
 * Global writing quality rules for every Prospect AI outreach draft and rewrite.
 * Injected ahead of workspace context, prospect intelligence, and campaign instructions.
 */
export function formatPlatformOutreachWritingStandardForPrompt(): string {
  return `${PLATFORM_OUTREACH_WRITING_STANDARD_HEADING} (always apply — even when Campaign Instructions are blank):
Users tell AI WHAT to emphasize. You already know HOW to write a professional outreach email. Follow these rules on every draft:

PRECEDENCE (conflicts):
- Campaign Instructions may change tone, length, offer emphasis, CTA, and topics to include/avoid.
- They must NEVER override: factual accuracy, safety/compliance, verified sender identity, no-unsupported-claims rules, or this writing standard.
- If Campaign Instructions conflict with safety/accuracy/sender rules, keep the global standard and ignore the conflicting request.

PERSONALIZATION:
- Personalize using ONLY verified prospect facts from the prospect context / existing draft.
- Never invent compliments, awards, listings, specialties, client results, or business facts.
- When prospect evidence is limited, use a natural generic opening (e.g. "Hi there,") — still benefit-first and conversational.

WRITING QUALITY:
- Write naturally and conversationally — like a thoughtful colleague, not a brochure.
- Lead with the BUSINESS BENEFIT before listing product features.
- Mention only features relevant to that specific prospect's vertical (no cross-industry leakage — e.g. never mention MLS/listings for a dental clinic or roofing company).
- Keep paragraphs short and easy to read.
- Never sound like a generic marketing email.
- Never exaggerate or invent information about the prospect or the workspace offer.
- Avoid repeating the same benefit twice.
- Keep the tone confident but not pushy.
- Prefer varied, natural subjects — never default every prospect to rigid templates like "Idea for {Business}".
- End with a friendly call-to-action.

LINKS:
- When a campaign link is allowed, introduce it naturally (e.g. "If you'd like to learn more about...", "You can see how it works here...", "Here's a quick overview...").
- Never drop a raw URL without context. Never put a campaign URL in the subject.
- Never invent, shorten, rewrite, or add tracking to the destination URL — use the exact configured URL only.
- When link inclusion is disabled or no campaign link is configured: do not include any URL, and REMOVE any URLs that appear in a previous draft during rewrite/regeneration.

SENDER SIGNATURE (verified workspace fields only):
- Use ONLY verified sender fields from WORKSPACE BUSINESS CONTEXT: displayName, companyName, email, phone, website (when present).
- Never invent a sender name, company, title, phone, or signature line.
- If a verified displayName exists, close with a professional signature using available verified fields (name, then company/phone/email only if present).
- If no verified displayName exists, close with a neutral line only — e.g. "Best," — and do not fabricate identity.`;
}

/**
 * Compact sender-identity block for rewrite prompts (from workspace context).
 * Prefer real workspace fields; never invent missing values.
 */
export function formatOutreachSenderContextForPrompt(input: {
  displayName?: string | null;
  businessName?: string | null;
  email?: string | null;
  website?: string | null;
  phone?: string | null;
  executiveSummary?: string | null;
  servicesProducts?: string | null;
  configured?: boolean;
}): string {
  const hasVerifiedSenderName = Boolean(String(input.displayName || "").trim());
  if (input.configured === false) {
    return `WORKSPACE BUSINESS CONTEXT:
Sender/business context is incomplete.
- Closing: use neutral "Best," only — do not invent a sender name, company, title, or phone.
- Offer grounding may be limited; do not invent products.`;
  }
  return `WORKSPACE BUSINESS CONTEXT (sender + offer grounding — do not invent beyond this):
${JSON.stringify(
  {
    displayName: input.displayName || null,
    companyName: input.businessName || null,
    email: input.email || null,
    website: input.website || null,
    phone: input.phone || null,
    offerSummary: input.executiveSummary || null,
    productsAndServices: input.servicesProducts || null,
    verifiedSenderNamePresent: hasVerifiedSenderName,
    closingRule: hasVerifiedSenderName
      ? "Use verified displayName (and company/phone/email only if present). Never invent a title."
      : 'No verified displayName — close with neutral "Best," only; do not fabricate identity.',
  },
  null,
  2,
)}`;
}

/** Compact prospect facts for rewrite prompts. */
export function formatOutreachProspectIntelligenceForPrompt(input: {
  prospectName?: string | null;
  companyName?: string | null;
  industry?: string | null;
  businessType?: string | null;
  outreachAngle?: string | null;
  reasoningSummary?: string | null;
  recipientIdentity?: string | null;
}): string {
  return `PROSPECT INTELLIGENCE (personalize from these facts only — never invent compliments, awards, listings, specialties, or other business facts):
${JSON.stringify(
  {
    prospectName: input.prospectName || null,
    companyName: input.companyName || null,
    industry: input.industry || null,
    businessType: input.businessType || null,
    outreachAngle: input.outreachAngle || null,
    reasoningSummary: input.reasoningSummary || null,
    recipient: input.recipientIdentity || null,
  },
  null,
  2,
)}
Stay on this prospect's vertical only — do not leak language from unrelated industries.`;
}

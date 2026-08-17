/**
 * Shared Prospect AI ↔ AI Brain educational copy.
 * Educational UX only — AI Brain is optional; Prospect AI works independently.
 */
import { AI_BRAIN_ADDON_PRICE_USD } from "@shared/pricingEntitlements";

export const PROSPECT_AI_BRAIN_RELATIONSHIP_LINES = [
  "Prospect AI finds and qualifies opportunities.",
  "AI Brain adds your business intelligence.",
] as const;

export const PROSPECT_AI_BRAIN_RELATIONSHIP =
  `${PROSPECT_AI_BRAIN_RELATIONSHIP_LINES[0]}\n${PROSPECT_AI_BRAIN_RELATIONSHIP_LINES[1]}`;

export const PROSPECT_AI_BRAIN_ONBOARDING = {
  heading: "Make Prospect AI even smarter with AI Brain",
  body: [
    "With AI Brain, Prospect AI can go deeper — analyzing each prospect, identifying stronger opportunities, creating more personalized outreach, and recommending the best next steps.",
  ],
} as const;

export const PROSPECT_AI_BRAIN_OPTIONAL_SUMMARY =
  "Prospect AI works without AI Brain and includes business discovery, AI qualification, personalized outreach, campaigns, and reply management.";

export const PROSPECT_AI_BRAIN_OPTIONAL_DETAIL =
  `AI Brain is an optional $${AI_BRAIN_ADDON_PRICE_USD}/month intelligence layer for businesses that want WhachatCRM to understand their company, services, offers, and knowledge more deeply. That additional context can improve personalization, recommendations, Copilot assistance, and how WhachatCRM helps you work opportunities.`;

export const PROSPECT_AI_BRAIN_FAQ = {
  question: "Do I need AI Brain to use Prospect AI?",
  answer: [
    `No. ${PROSPECT_AI_BRAIN_OPTIONAL_SUMMARY}`,
    PROSPECT_AI_BRAIN_OPTIONAL_DETAIL,
    PROSPECT_AI_BRAIN_RELATIONSHIP_LINES[0],
    PROSPECT_AI_BRAIN_RELATIONSHIP_LINES[1],
  ].join(" "),
} as const;

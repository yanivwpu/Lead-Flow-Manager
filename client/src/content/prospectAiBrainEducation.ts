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
  heading: "Want Prospect AI to understand your business even better?",
  body: [
    "Prospect AI works on its own to discover, qualify, and help you reach new opportunities.",
    "AI Brain is an optional intelligence layer that learns your business, services, offers, and company knowledge. This gives Prospect AI and AI Copilot deeper context for personalization, recommendations, and conversations.",
  ],
  priceLabel: `AI Brain — $${AI_BRAIN_ADDON_PRICE_USD}/month · Optional`,
  ctaLabel: "Learn about AI Brain",
  ctaHref: "/app/ai-brain",
  activeConfirmation: "AI Brain is active — Prospect AI can use your business context.",
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

/**
 * Canonical WhachatCRM product positioning for Prospect Intelligence.
 * Single source of truth for analyze / reanalyze / suggested first message / offer angles.
 * Do not paste a giant feature dump into every outreach message — tailor 2–4 benefits.
 */

export const WHACHAT_PRODUCT_NAME = "WhachatCRM";

/** Partner program public terms used in outreach (keep exact wording). */
export const WHACHAT_PARTNER_COMMISSION_COPY =
  "30% lifetime recurring commission on paid plan revenue";

/**
 * Full product truth for AI system/user prompts.
 * Outreach must choose a small subset of these capabilities per prospect.
 */
export const WHACHAT_CANONICAL_CAPABILITIES = [
  "Multi-channel unified inbox across WhatsApp, Instagram, Facebook Messenger, email, Telegram, web chat, and other supported channels",
  "AI Copilot that analyzes conversations, helps qualify leads, summarizes context, recommends next actions, and assists with responses",
  "AI-powered lead qualification and lead scoring",
  "Contact management and CRM pipeline/stage organization",
  "Automated follow-up, nurture campaigns, workflows, and messaging automation",
  "Team collaboration for managing customer conversations",
  "Appointment and booking workflows",
  "Industry-specific capabilities and Growth Engines",
  "Shopify commerce/customer messaging for applicable businesses",
  "Real Estate Growth Engine with MLS/inventory matching and property workflows for applicable real estate prospects",
  "Agency opportunities: use WhachatCRM in a client-service stack, plus white-label/agency offerings when relevant",
  `Partner/affiliate opportunity: ${WHACHAT_PARTNER_COMMISSION_COPY} where appropriate`,
] as const;

export type WhachatPositioningSegment =
  | "agency"
  | "ghl_agency"
  | "shopify"
  | "real_estate"
  | "local_service"
  | "partner"
  | "general";

export type WhachatPositioningContext = {
  segment: WhachatPositioningSegment;
  /** 2–4 benefits the model should prioritize */
  priorityBenefits: string[];
  /** One concrete sentence suitable for cold outreach */
  positioningSentence: string;
  /** Optional short closer (e.g. white-label / partner) */
  optionalCloser?: string;
  /** Features that must NOT be pitched for this segment */
  avoidTopics: string[];
};

const SEGMENT_CONTEXT: Record<WhachatPositioningSegment, WhachatPositioningContext> = {
  agency: {
    segment: "agency",
    priorityBenefits: [
      "unified multi-channel client communication",
      "CRM + pipeline organization",
      "AI-powered lead qualification and follow-up",
      "automation for client conversations",
    ],
    positioningSentence:
      "WhachatCRM is a unified inbox and CRM that helps agencies manage client conversations across WhatsApp, Instagram, Facebook Messenger, email, and more from one place, with AI-powered lead qualification, follow-up, and automation.",
    optionalCloser: "We also offer agency and white-label opportunities.",
    avoidTopics: ["MLS", "inventory matching", "abandoned cart"],
  },
  ghl_agency: {
    segment: "ghl_agency",
    priorityBenefits: [
      "multi-channel client messaging in one inbox",
      "CRM for agencies managing multiple clients",
      "AI qualification and automated follow-up",
      "agency/white-label opportunity",
    ],
    positioningSentence:
      "WhachatCRM is a unified inbox and CRM built for agencies that manage client conversations across WhatsApp, Instagram, Facebook Messenger, email, and more — with AI-powered lead qualification, follow-up, and automation that fits a client-service stack.",
    optionalCloser: "We also offer agency and white-label opportunities for GHL and digital agencies.",
    avoidTopics: ["MLS", "Shopify storefront", "abandoned cart"],
  },
  shopify: {
    segment: "shopify",
    priorityBenefits: [
      "customer conversations in one inbox",
      "Shopify/customer messaging context",
      "follow-up and customer engagement workflows",
      "AI assistance for replies and qualification",
    ],
    positioningSentence:
      "WhachatCRM is a multi-channel CRM and unified inbox that helps Shopify brands manage customer conversations across WhatsApp, Instagram, Messenger, email, and web chat — with AI assistance for follow-up and customer engagement.",
    avoidTopics: ["MLS", "white-label agency", "partner commission"],
  },
  real_estate: {
    segment: "real_estate",
    priorityBenefits: [
      "multi-channel lead communication",
      "CRM and follow-up",
      "AI lead qualification",
      "Real Estate Growth Engine / MLS inventory matching when relevant",
    ],
    positioningSentence:
      "WhachatCRM is a multi-channel CRM and unified inbox for real estate teams — manage leads across WhatsApp, Instagram, Messenger, and email, with AI lead qualification, follow-up automation, and a Real Estate Growth Engine that supports MLS/inventory matching workflows.",
    avoidTopics: ["Shopify", "abandoned cart", "white-label agency"],
  },
  local_service: {
    segment: "local_service",
    priorityBenefits: [
      "never losing customer inquiries across channels",
      "faster response",
      "lead qualification and follow-up",
      "booking + simple CRM organization",
    ],
    positioningSentence:
      "WhachatCRM is a multi-channel CRM and unified inbox that helps local businesses capture customer inquiries from WhatsApp, Instagram, Messenger, email, and web chat in one place — with AI help to qualify leads, follow up, and organize bookings in a simple CRM.",
    avoidTopics: ["MLS", "Shopify", "white-label", "partner commission"],
  },
  partner: {
    segment: "partner",
    priorityBenefits: [
      "recurring revenue opportunity",
      "broad target market for your audience",
      WHACHAT_PARTNER_COMMISSION_COPY,
      "complements existing services/audience",
    ],
    positioningSentence:
      `WhachatCRM is a multi-channel CRM and AI-powered customer engagement platform for agencies, local businesses, ecommerce, and real estate — and our partner program pays ${WHACHAT_PARTNER_COMMISSION_COPY}.`,
    optionalCloser: "It can complement the audience or services you already serve.",
    avoidTopics: ["MLS deep dive", "Shopify-only pitch"],
  },
  general: {
    segment: "general",
    priorityBenefits: [
      "multi-channel unified inbox",
      "CRM pipeline organization",
      "AI Copilot for qualification and replies",
      "follow-up automation",
    ],
    positioningSentence:
      "WhachatCRM is a multi-channel CRM, unified inbox, and AI-powered customer engagement platform — manage conversations across WhatsApp, Instagram, Facebook Messenger, email, and more, with AI Copilot for lead qualification, follow-up, and CRM organization.",
    avoidTopics: [],
  },
};

/** Phrases that undersell WhachatCRM — outreach should not reduce the product to these alone. */
export const WEAK_WHACHAT_POSITIONING_PHRASES = [
  "a platform for unified messaging and AI support",
  "a unified inbox solution",
  "streamline communication",
  "streamline your operations",
  "AI support",
  "a messaging platform",
  "unified messaging",
] as const;

export function resolveWhachatPositioningSegment(input: {
  recommendedOffer?: string | null;
  industry?: string | null;
  businessType?: string | null;
  importTag?: string | null;
  importReason?: string | null;
  originalTags?: string[];
  agencyLikelihood?: number | null;
  shopifyMerchantLikelihood?: number | null;
  realEstateLikelihood?: number | null;
  localBusinessLikelihood?: number | null;
}): WhachatPositioningSegment {
  const offer = String(input.recommendedOffer || "").toLowerCase();
  const hay = [
    input.industry,
    input.businessType,
    input.importTag,
    input.importReason,
    ...(input.originalTags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (offer === "partner_program") return "partner";
  if (offer === "agency_white_label") {
    return /\bghl\b|go high level|gohighlevel/.test(hay) ? "ghl_agency" : "agency";
  }
  if (offer === "shopify_app") return "shopify";
  if (offer === "real_estate_growth_engine") return "real_estate";

  if ((input.shopifyMerchantLikelihood ?? 0) >= 55 || /\bshopify\b|ecommerce|e-commerce/.test(hay)) {
    return "shopify";
  }
  if (
    (input.realEstateLikelihood ?? 0) >= 55 ||
    /real[\s-]?estate|realtor|broker|mls/.test(hay)
  ) {
    return "real_estate";
  }
  if (
    (input.agencyLikelihood ?? 0) >= 55 ||
    /\bagency\b|digital marketing|marketing agency|ghl|go high level/.test(hay)
  ) {
    return /\bghl\b|go high level|gohighlevel/.test(hay) ? "ghl_agency" : "agency";
  }
  if (
    (input.localBusinessLikelihood ?? 0) >= 55 ||
    /local business|service business|contractor|salon|clinic|restaurant/.test(hay)
  ) {
    return "local_service";
  }

  if (offer === "core_whachatcrm" || offer === "general_demo") return "local_service";
  return "general";
}

export function getWhachatPositioningContext(
  segment: WhachatPositioningSegment,
): WhachatPositioningContext {
  return SEGMENT_CONTEXT[segment];
}

export function buildWhachatPositioningForProspect(input: {
  recommendedOffer?: string | null;
  industry?: string | null;
  businessType?: string | null;
  importTag?: string | null;
  importReason?: string | null;
  originalTags?: string[];
  agencyLikelihood?: number | null;
  shopifyMerchantLikelihood?: number | null;
  realEstateLikelihood?: number | null;
  localBusinessLikelihood?: number | null;
}): WhachatPositioningContext {
  return getWhachatPositioningContext(resolveWhachatPositioningSegment(input));
}

/**
 * Canonical block injected into Prospect Intelligence AI prompts
 * (initial analyze, reanalyze, first message + offer generation).
 */
export function buildWhachatProductContextForPrompt(): string {
  const capabilities = WHACHAT_CANONICAL_CAPABILITIES.map((c) => `- ${c}`).join("\n");
  const bySegment = (Object.keys(SEGMENT_CONTEXT) as WhachatPositioningSegment[])
    .map((key) => {
      const ctx = SEGMENT_CONTEXT[key];
      return `### ${key}
Prioritize: ${ctx.priorityBenefits.join("; ")}
Example positioning: ${ctx.positioningSentence}${
        ctx.optionalCloser ? `\nOptional closer: ${ctx.optionalCloser}` : ""
      }
Avoid unless clearly relevant: ${ctx.avoidTopics.length ? ctx.avoidTopics.join("; ") : "n/a"}`;
    })
    .join("\n\n");

  return `PRODUCT: ${WHACHAT_PRODUCT_NAME}
WhachatCRM is a multi-channel CRM, unified inbox, and AI-powered customer engagement platform.

CANONICAL CAPABILITIES (choose 2–4 most relevant for THIS prospect — do not list everything):
${capabilities}

NEVER describe WhachatCRM ONLY as:
- "AI support"
- "a messaging platform"
- "a unified inbox solution"
- "a platform for unified messaging and AI support"
- vague "streamline communication / streamline your operations" without saying what the product does

WRITING RULES FOR suggestedFirstMessage:
- Be specific enough that the recipient understands what WhachatCRM actually does.
- Do not hallucinate capabilities.
- Do not claim the prospect has a problem unless input evidence supports it.
- Keep first-touch cold outreach concise and human.
- Avoid generic AI-sales fluff (revolutionize, game-changing, cutting-edge, leverage synergies).
- End with a low-friction, relevant question.
- The selected recommendedOffer MUST materially shape the message (partner → revenue opportunity; agency_white_label → agency/client-service + white-label; real_estate → RE Growth Engine; shopify_app → commerce messaging; core → operational CRM/inbox value).

TAILOR BY SEGMENT / OFFER:
${bySegment}`;
}

/** Detect underselling / overly generic WhachatCRM descriptions in generated copy. */
export function detectWeakWhachatPositioning(message: string): string[] {
  const text = String(message || "");
  const hits: string[] = [];
  for (const phrase of WEAK_WHACHAT_POSITIONING_PHRASES) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      hits.push(phrase);
    }
  }
  // Isolated "AI support" without CRM/inbox substance
  if (/\bAI support\b/i.test(text) && !/\b(CRM|unified inbox|multi-channel|lead qualification)\b/i.test(text)) {
    if (!hits.includes("AI support")) hits.push("AI support");
  }
  return hits;
}

/**
 * True when the message names WhachatCRM with enough concrete product substance
 * (CRM / multi-channel / inbox / qualification / partner commission as appropriate).
 */
export function hasConcreteWhachatPositioning(message: string): boolean {
  const text = String(message || "");
  if (!/whachat\s*crm/i.test(text)) return false;
  if (new RegExp(WHACHAT_PARTNER_COMMISSION_COPY.replace(/%/g, "\\%"), "i").test(text)) {
    return true;
  }
  return /\b(CRM|unified inbox|multi-channel|multi channel|lead qualification|follow-up|follow up|Growth Engine|white-?label|partner program)\b/i.test(
    text,
  );
}

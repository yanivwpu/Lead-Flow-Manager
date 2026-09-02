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
  "AI-powered prospect discovery and lead sourcing",
  "AI lead qualification and lead scoring",
  "Outreach automation for first-touch and follow-up sequences",
  "Official WhatsApp Business API messaging",
  "Email and other messaging channels (Instagram, Facebook Messenger, Telegram, web chat, and more)",
  "Unified customer conversations in one inbox",
  "CRM follow-up, pipeline organization, and workflow automation",
  "Turning conversations into customers with AI Copilot assistance on replies and next actions",
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
      "AI lead qualification for inbound/client leads",
      "outreach automation across WhatsApp and messaging channels",
      "unified client conversations in one inbox",
      "CRM follow-up and pipeline organization",
    ],
    positioningSentence:
      "WhachatCRM is an AI-powered CRM that helps agencies discover and qualify leads, automate outreach, and manage client conversations across WhatsApp Business API, email, and other messaging channels — turning conversations into customers.",
    optionalCloser: "We also offer agency and white-label opportunities.",
    avoidTopics: ["MLS", "inventory matching", "abandoned cart", "analytics dashboard", "insights platform"],
  },
  ghl_agency: {
    segment: "ghl_agency",
    priorityBenefits: [
      "multi-channel client messaging in one inbox",
      "AI qualification and automated outreach/follow-up",
      "CRM for agencies managing multiple clients",
      "agency/white-label opportunity",
    ],
    positioningSentence:
      "WhachatCRM is an AI-powered CRM built for agencies that qualify leads and manage client conversations across WhatsApp Business API, email, Instagram, Messenger, and more — with outreach automation and follow-up that fits a client-service stack.",
    optionalCloser: "We also offer agency and white-label opportunities for digital agencies.",
    avoidTopics: ["MLS", "Shopify storefront", "abandoned cart", "analytics dashboard", "insights platform"],
  },
  shopify: {
    segment: "shopify",
    priorityBenefits: [
      "customer conversations in one inbox",
      "WhatsApp + email messaging for shoppers",
      "follow-up and customer engagement workflows",
      "AI assistance for replies and qualification",
    ],
    positioningSentence:
      "WhachatCRM is an AI-powered CRM and unified inbox that helps Shopify brands manage customer conversations across WhatsApp Business API, Instagram, Messenger, email, and web chat — with outreach automation and AI help for follow-up.",
    avoidTopics: ["MLS", "white-label agency", "partner commission", "analytics dashboard"],
  },
  real_estate: {
    segment: "real_estate",
    priorityBenefits: [
      "multi-channel lead communication",
      "AI lead qualification and outreach automation",
      "CRM and follow-up workflows",
      "Real Estate Growth Engine / MLS inventory matching when relevant",
    ],
    positioningSentence:
      "WhachatCRM is an AI-powered CRM for real estate teams — qualify leads, automate outreach, and manage conversations across WhatsApp Business API, Instagram, Messenger, and email, with a Real Estate Growth Engine that supports MLS/inventory matching workflows.",
    avoidTopics: ["Shopify", "abandoned cart", "white-label agency", "analytics dashboard"],
  },
  local_service: {
    segment: "local_service",
    priorityBenefits: [
      "never losing customer inquiries across channels",
      "faster response via WhatsApp and messaging",
      "lead qualification and outreach follow-up",
      "booking + simple CRM organization",
    ],
    positioningSentence:
      "WhachatCRM is an AI-powered CRM that helps local businesses capture inquiries from WhatsApp Business API, Instagram, Messenger, email, and web chat in one place — with AI help to qualify leads, automate follow-up, and organize bookings.",
    avoidTopics: ["MLS", "Shopify", "white-label", "partner commission", "analytics dashboard"],
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
      `WhachatCRM is an AI-powered CRM for prospecting, lead qualification, outreach automation, and customer conversations across WhatsApp Business API, email, and messaging channels — and our partner program pays ${WHACHAT_PARTNER_COMMISSION_COPY}.`,
    optionalCloser: "It can complement the audience or services you already serve.",
    avoidTopics: ["MLS deep dive", "Shopify-only pitch", "analytics dashboard"],
  },
  general: {
    segment: "general",
    priorityBenefits: [
      "AI prospecting and lead qualification",
      "outreach automation",
      "WhatsApp Business API + email messaging",
      "unified conversations and CRM follow-up",
    ],
    positioningSentence:
      "WhachatCRM is an AI-powered CRM for prospecting, lead qualification, outreach automation, and customer conversations — built around the official WhatsApp Business API together with email and other messaging channels.",
    avoidTopics: ["analytics dashboard", "insights platform"],
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
  "insights and analytics",
  "our insights and analytics",
  "analytics can further enhance",
  "enhance your offerings",
  "analytics platform",
  "insights platform",
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
WhachatCRM is an AI-powered CRM for prospecting, lead qualification, outreach automation, and customer conversations — built around the official WhatsApp Business API together with email and other messaging channels.

CANONICAL CAPABILITIES (choose only the 1–2 most relevant for THIS prospect — do not dump the full list):
${capabilities}

OUTREACH REASONING ORDER (required):
1. Understand the prospect's actual business / core offer from the input.
2. Infer one plausible pain point worth solving (only if evidence supports it; otherwise stay neutral).
3. Select only the 1–2 WhachatCRM capabilities most relevant to that prospect.
4. Write a short natural message connecting their likely pain to those capabilities.
5. Never paste a generic feature list into every message.

NEVER default to describing WhachatCRM as:
- an analytics product
- an insights platform
- "insights and analytics"
- vague "enhance your offerings" without naming a real capability
unless the prospect's actual use case genuinely supports analytics/reporting.

NEVER describe WhachatCRM ONLY as:
- "AI support"
- "a messaging platform"
- "a unified inbox solution"
- "a platform for unified messaging and AI support"
- vague "streamline communication / streamline your operations" without saying what the product does

WRITING RULES FOR suggestedFirstMessage / suggestedOutreachAngle / reasoningSummary:
- Be specific enough that the recipient understands what WhachatCRM actually does for THEM.
- Do not hallucinate capabilities.
- Do not claim the prospect has a problem unless input evidence supports it.
- Keep first-touch cold outreach concise and human.
- Avoid generic AI-sales fluff (revolutionize, game-changing, cutting-edge, leverage synergies).
- End with a low-friction, relevant question.
- The selected recommendedOffer MUST materially shape the message (partner → revenue opportunity; agency_white_label → agency/client-service + white-label; real_estate → RE Growth Engine; shopify_app → commerce messaging; core → operational CRM/inbox + outreach value).

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
  return /\b(CRM|unified inbox|multi-channel|multi channel|lead qualification|outreach automation|WhatsApp|follow-up|follow up|Growth Engine|white-?label|partner program|prospecting)\b/i.test(
    text,
  );
}

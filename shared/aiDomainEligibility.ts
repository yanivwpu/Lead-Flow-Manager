/**
 * Shared AI domain / context eligibility.
 *
 * Real-estate / RGE / buyer / seller / inventory / showing context must NOT be
 * injected merely because the workspace has RGE installed or industry=real estate.
 * Conversation (and contact) evidence must establish a real-estate domain first.
 *
 * Used by:
 * - Copilot next-action recommendations (customerInsights)
 * - Suggest Reply / AI reply generation (routes + aiService)
 */

import {
  hasStrongStructuredSearchSignals,
  hasPropertyTypeSignalInMessage,
} from "./buyerPreferenceInventorySignals";
import {
  isPureSellerIntent,
  type SellerIntentClass,
} from "./sellerIntent";

export type AiConversationDomain =
  | "real_estate_buyer"
  | "real_estate_rental"
  | "real_estate_seller"
  | "real_estate_mixed"
  | "generic";

export type AiDomainEligibilityInput = {
  /** Latest inbound message (preferred). */
  inboundText?: string | null;
  /** Optional joined conversation / prior inbound for continuity. */
  conversationText?: string | null;
  sellerIntent?: SellerIntentClass | null;
  leadType?: string | null;
  /** Workspace capability flags — necessary but not sufficient alone. */
  rgeInstalled?: boolean;
  industry?: string | null;
  buyerProfileHasCriteria?: boolean;
  sellerProfileHasData?: boolean;
  /** Contact email local-part / address for system mail detection. */
  contactEmail?: string | null;
  channel?: string | null;
};

const RENTAL_INTENT_RE =
  /\b(?:rent(?:al|ing)?|lease|leasing|for\s+rent|looking\s+to\s+rent|need\s+(?:a|an)\s+\d*\s*(?:bed|br|bedroom)?\s*rental)\b/i;

const BUY_INTENT_RE =
  /\b(?:buy(?:ing)?|purchase|for\s+sale|looking\s+to\s+buy|ready\s+to\s+buy|make\s+an\s+offer)\b/i;

const BED_OR_BUDGET_RE =
  /\b\d+\s*[-/]?\s*(?:bed|br|bath)|\b\d+\s*\/\s*\d+\b|\$\s*[\d,.]+|\b(?:under|up\s+to|max|budget)\s+[\d,.]+/i;

const AREA_OR_PROPERTY_RE =
  /\b(?:condo(?:minium)?s?|townhouses?|town[\s-]?houses?|single[\s-]?family|sfh|apartments?|houses?|homes?|villas?|duplex(?:es)?)\b|\b(?:in|near|around)\s+(?!the\b|a\b|an\b|this\b|that\b|your\b|our\b|any\b|all\b|each\b|such\b|which\b)([A-Za-z][A-Za-z\s.-]{1,40})\b/i;

/** System / notification senders — never inherit RGE workflows. */
const SYSTEM_EMAIL_LOCAL_RE =
  /^(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|postmaster|notifications?|alerts?|updates?|news|newsletter|billing|receipts?|security|accounts?|support|info|hello|team|newsletters?)\b/i;

const GOOGLE_SYSTEM_RE =
  /\b(?:google\s+terms?\s+of\s+service|terms\s+of\s+service|privacy\s+policy|account\s+activity|security\s+alert|sign[\s-]?in\s+(?:attempt|from)|2[\s-]?step\s+verification|gmail\s+team|google\s+llc)\b/i;

/** Product / SaaS / agency CRM questions — business domain, not real-estate lead. */
const PRODUCT_SAAS_INQUIRY_RE =
  /\b(?:gohighlevel|go\s*high\s*level|\bghl\b|whachat(?:crm)?|highlevel|clickfunnels|hubspot|salesforce|pipedrive|zendesk|intercom|shopify\s+(?:app|integration)|whatsapp\s+(?:api|crm|business)|crm\s+(?:for|integration|agency)|agency\s+(?:crm|tool|software)|does\s+.+\s+work\s+with|integrat(?:e|ion)\s+with)\b/i;

export function isRealEstateIndustry(industry: string | null | undefined): boolean {
  const s = (industry || "").toLowerCase();
  return (
    s.includes("real estate") ||
    s.includes("realestate") ||
    s.includes("realtor") ||
    s.includes("property") ||
    s === "real_estate"
  );
}

/** Workspace *can* use RGE features — not permission to inject into every thread. */
export function isRealEstateWorkspaceCapable(input: {
  rgeInstalled?: boolean;
  industry?: string | null;
  leadType?: string | null;
}): boolean {
  if (input.rgeInstalled) return true;
  if (isRealEstateIndustry(input.industry)) return true;
  const lt = String(input.leadType || "").toLowerCase();
  return lt === "buyer" || lt === "seller" || lt === "renter" || lt === "investor";
}

export function looksLikeSystemOrNotificationEmail(input: {
  contactEmail?: string | null;
  inboundText?: string | null;
}): boolean {
  const email = String(input.contactEmail || "").trim().toLowerCase();
  if (email) {
    const local = email.split("@")[0] || "";
    if (SYSTEM_EMAIL_LOCAL_RE.test(local)) return true;
    if (email.endsWith("@google.com") || email.endsWith("@accounts.google.com")) return true;
  }
  const text = String(input.inboundText || "");
  if (GOOGLE_SYSTEM_RE.test(text)) return true;
  return false;
}

export function looksLikeProductOrSaasInquiry(text: string | null | undefined): boolean {
  return PRODUCT_SAAS_INQUIRY_RE.test(String(text || ""));
}

/**
 * Strong real-estate transactional evidence in message text.
 * Deliberately stricter than hasInventoryPreferenceSignals (which false-positives
 * on legal/ToS language like "purchase" / "in the").
 */
export function hasStrongRealEstateLeadEvidence(text: string | null | undefined): boolean {
  const t = String(text || "").trim();
  if (t.length < 8) return false;
  if (hasStrongStructuredSearchSignals(t)) return true;

  const rental = RENTAL_INTENT_RE.test(t);
  const buy = BUY_INTENT_RE.test(t);
  if (!rental && !buy) return false;

  const hasCriteria =
    BED_OR_BUDGET_RE.test(t) ||
    hasPropertyTypeSignalInMessage(t) ||
    AREA_OR_PROPERTY_RE.test(t);

  return hasCriteria;
}

export function detectRentalLeadEvidence(text: string | null | undefined): boolean {
  const t = String(text || "").trim();
  if (!RENTAL_INTENT_RE.test(t)) return false;
  return (
    hasStrongStructuredSearchSignals(t) ||
    BED_OR_BUDGET_RE.test(t) ||
    hasPropertyTypeSignalInMessage(t) ||
    AREA_OR_PROPERTY_RE.test(t)
  );
}

/**
 * Resolve conversation domain from evidence — independent of workspace RGE flag.
 */
export function resolveAiConversationDomain(
  input: AiDomainEligibilityInput,
): AiConversationDomain {
  const inbound = String(input.inboundText || "").trim();
  const history = String(input.conversationText || "").trim();
  const primary = inbound || history;

  if (
    looksLikeSystemOrNotificationEmail({
      contactEmail: input.contactEmail,
      inboundText: primary,
    })
  ) {
    return "generic";
  }

  if (looksLikeProductOrSaasInquiry(primary)) {
    return "generic";
  }

  const sellerIntent = input.sellerIntent ?? null;
  if (sellerIntent === "seller_and_buyer") return "real_estate_mixed";
  if (isPureSellerIntent(sellerIntent) || sellerIntent === "seller_followup") {
    // Stale seller profile alone must not classify a non-seller message as seller
    // when the inbound is clearly generic/product — already handled above.
    // Require either explicit seller signals in text OR strong continuity with profile.
    if (sellerIntent !== "seller_followup" || hasSellerContinuity(primary, input)) {
      return "real_estate_seller";
    }
  }

  if (detectRentalLeadEvidence(inbound) || (!inbound && detectRentalLeadEvidence(history))) {
    return "real_estate_rental";
  }

  if (
    hasStrongRealEstateLeadEvidence(inbound) ||
    (!inbound && hasStrongRealEstateLeadEvidence(history))
  ) {
    return "real_estate_buyer";
  }

  // Continuity: known buyer/renter with saved criteria + inbound continues RE search.
  const leadType = String(input.leadType || "").toLowerCase();
  if (
    input.buyerProfileHasCriteria &&
    (leadType === "buyer" || leadType === "renter" || leadType === "investor") &&
    hasStrongRealEstateLeadEvidence(primary)
  ) {
    return leadType === "renter" ? "real_estate_rental" : "real_estate_buyer";
  }

  return "generic";
}

function hasSellerContinuity(text: string, input: AiDomainEligibilityInput): boolean {
  if (!input.sellerProfileHasData && !input.sellerIntent) return false;
  // seller_followup from stale profile + non-RE inbound → not continuity
  if (!text) return Boolean(input.sellerProfileHasData);
  // Weak generic text with only stale profile → do not keep seller domain
  if (looksLikeProductOrSaasInquiry(text) || looksLikeSystemOrNotificationEmail({ inboundText: text })) {
    return false;
  }
  // Require some property/sell language OR short follow-up answers in an active seller thread
  if (/\b(?:sell|listing|cma|valuation|address|home|house|property)\b/i.test(text)) return true;
  // Very short acknowledgements in an active seller thread
  if (text.length <= 40 && input.sellerProfileHasData) return true;
  return false;
}

export function isRealEstateConversationDomain(
  domain: AiConversationDomain,
): boolean {
  return domain !== "generic";
}

export type AiDomainDecision = {
  domain: AiConversationDomain;
  workspaceCapable: boolean;
  /** Inject buyer prefs / qualification / inventory into AI prompts. */
  injectBuyerContext: boolean;
  /** Inject seller prefs / seller qualification. */
  injectSellerContext: boolean;
  /** Inject inventory match summaries / listing follow-up enrichment. */
  injectInventoryContext: boolean;
  /** Copilot: Share matching listings / Schedule showing / seller listing actions. */
  showRealEstateCopilotRecommendations: boolean;
  /** aiService: buyer's-agent persona + REAL ESTATE SPECIFIC block. */
  useRealEstatePromptPersona: boolean;
};

/**
 * Single routing decision for Copilot + Suggest Reply.
 * Workspace capability alone never enables RE context.
 */
export function resolveAiDomainEligibility(
  input: AiDomainEligibilityInput,
): AiDomainDecision {
  const domain = resolveAiConversationDomain(input);
  const workspaceCapable = isRealEstateWorkspaceCapable(input);
  const reDomain = isRealEstateConversationDomain(domain);

  // Injection requires conversation domain evidence. Workspace capability is
  // preferred for inventory/RGE features but conversation domain is the gate.
  const injectBuyerContext =
    reDomain &&
    (domain === "real_estate_buyer" ||
      domain === "real_estate_rental" ||
      domain === "real_estate_mixed");

  const injectSellerContext =
    reDomain &&
    (domain === "real_estate_seller" || domain === "real_estate_mixed");

  const injectInventoryContext = injectBuyerContext && workspaceCapable;

  return {
    domain,
    workspaceCapable,
    injectBuyerContext,
    injectSellerContext,
    injectInventoryContext,
    // Conversation domain is the gate — workspace RGE alone never forces these.
    showRealEstateCopilotRecommendations: reDomain,
    useRealEstatePromptPersona: reDomain,
  };
}

/** Copilot-facing helper — same decision as Suggest Reply. */
export function shouldShowRealEstateCopilotRecommendations(
  input: AiDomainEligibilityInput,
): boolean {
  return resolveAiDomainEligibility(input).showRealEstateCopilotRecommendations;
}

export function shouldInjectBuyerRealEstateContext(
  input: AiDomainEligibilityInput,
): boolean {
  return resolveAiDomainEligibility(input).injectBuyerContext;
}

export function shouldInjectSellerRealEstateContext(
  input: AiDomainEligibilityInput,
): boolean {
  return resolveAiDomainEligibility(input).injectSellerContext;
}

export function shouldUseRealEstateAiPersona(
  input: AiDomainEligibilityInput,
): boolean {
  return resolveAiDomainEligibility(input).useRealEstatePromptPersona;
}

/** Strip RE-only contactContext fields when domain is not eligible. */
export function stripIneligibleRealEstateContactContext<T extends Record<string, unknown>>(
  context: T | null | undefined,
  decision: AiDomainDecision,
): T {
  const next = { ...(context || {}) } as T;
  if (!decision.injectBuyerContext) {
    delete (next as Record<string, unknown>).buyerPreferences;
    delete (next as Record<string, unknown>).buyerQualificationContext;
    delete (next as Record<string, unknown>).inventoryMatchSummary;
    delete (next as Record<string, unknown>).copilotDecisionReason;
    // Budget/timeline/financing from buyer prefs — keep only if not clearly RE-seeded;
    // safest: drop when buyer context ineligible.
    delete (next as Record<string, unknown>).budget;
    delete (next as Record<string, unknown>).timeline;
    delete (next as Record<string, unknown>).financing;
  }
  if (!decision.injectSellerContext) {
    delete (next as Record<string, unknown>).sellerPreferences;
    delete (next as Record<string, unknown>).sellerQualificationContext;
    delete (next as Record<string, unknown>).sellerIntent;
  }
  if (!decision.injectInventoryContext) {
    delete (next as Record<string, unknown>).inventoryMatchSummary;
    delete (next as Record<string, unknown>).listingFollowUp;
  }
  (next as Record<string, unknown>).aiConversationDomain = decision.domain;
  (next as Record<string, unknown>).useRealEstatePromptPersona =
    decision.useRealEstatePromptPersona;
  return next;
}

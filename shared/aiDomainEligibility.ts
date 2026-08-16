/**
 * Shared AI domain / context eligibility.
 *
 * Real-estate / RGE / buyer / seller / inventory / showing context must NOT be
 * injected merely because the workspace has RGE installed or industry=real estate.
 * Conversation (and contact) evidence must establish a real-estate domain first.
 *
 * System / automated emails resolve to domain `system` (not a lead workflow).
 *
 * Used by:
 * - Copilot next-action recommendations (customerInsights)
 * - Suggest Reply / AI reply generation (routes + aiService)
 * - Copilot Buyer Preferences panel visibility
 */

import {
  hasStrongStructuredSearchSignals,
  hasPropertyTypeSignalInMessage,
} from "./buyerPreferenceInventorySignals";
import {
  isPureSellerIntent,
  type SellerIntentClass,
} from "./sellerIntent";
import { looksLikeGreetingOnly, hasPropertyShowingIntent } from "./conversationTextSignals";

export { looksLikeGreetingOnly, hasPropertyShowingIntent } from "./conversationTextSignals";

export type AiConversationDomain =
  | "real_estate_buyer"
  | "real_estate_rental"
  | "real_estate_seller"
  | "real_estate_mixed"
  | "generic"
  /** Automated / noreply / legal / account notification — not an actionable lead. */
  | "system";

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
  /** Current inbound Email From — preferred over contactEmail for system detection. */
  fromEmail?: string | null;
  channel?: string | null;
};

const RENTAL_INTENT_RE =
  /\b(?:rent(?:al|ing)?|lease|leasing|for\s+rent|looking\s+to\s+rent|need\s+(?:a|an)\s+\d*\s*(?:bed|br|bedroom)?\s*rental)\b/i;

const BUY_INTENT_RE =
  /\b(?:looking\s+to\s+buy|ready\s+to\s+buy|want\s+to\s+buy|buy(?:ing)?\s+(?:a|an|the)|for\s+sale|make\s+an\s+offer)\b/i;

const BED_OR_BUDGET_RE =
  /\b\d+\s*[-/]?\s*(?:bed|br|bath)|\b\d+\s*\/\s*\d+\b|\$\s*[\d,.]+|\b(?:under|up\s+to|max|budget)\s+[\d,.]+/i;

const AREA_OR_PROPERTY_RE =
  /\b(?:condo(?:minium)?s?|townhouses?|town[\s-]?houses?|single[\s-]?family|sfh|apartments?|houses?|homes?|villas?|duplex(?:es)?)\b|\b(?:in|near|around)\s+(?!the\b|a\b|an\b|this\b|that\b|your\b|our\b|any\b|all\b|each\b|such\b|which\b)([A-Za-z][A-Za-z\s.-]{1,40})\b/i;

/**
 * Strong automated-sender local parts (including google-noreply, notifications+tag).
 * Deliberately excludes support/info/hello/team — those can be real human inquiries.
 */
const STRONG_SYSTEM_LOCAL_RE =
  /(?:^|[-_.+])(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|postmaster)(?:$|[-_.+])|^(notifications?|alerts?|newsletters?|updates?)(?:$|[-_.+])/i;

/** Platform / legal / account / transactional notification semantics (content). */
const SYSTEM_NOTIFICATION_CONTENT_RE =
  /\b(?:terms?\s+of\s+service|privacy\s+policy|security\s+alert|account\s+(?:activity|notification|alert)|sign[\s-]?in\s+(?:attempt|from|notification)|2[\s-]?step\s+verification|password\s+reset|verify\s+your\s+(?:email|account)|we(?:'ve| have)\s+updated\s+our|policy\s+update|automated\s+(?:message|notification|email)|do\s+not\s+reply\s+to\s+this|this\s+(?:is\s+an?\s+)?(?:automated|system)\s+(?:message|email|notification)|receipt\s+for\s+your|order\s+confirmation|payment\s+received|billing\s+statement|gmail\s+team|google\s+llc|credit\s+(?:usage|score|report|limit|monitoring)|(?:usage|score)\s+went\s+(?:down|up)|no\s+action\s+(?:is\s+)?(?:required|needed)|just\s+messaged\s+you|sent\s+you\s+a\s+message|wants?\s+to\s+connect|new\s+listing(?:s)?\s+(?:for\s+rent|for\s+sale|alert)|listing\s+alert|price\s+(?:drop|reduction)\s+alert|your\s+(?:package|order|shipment)\s+(?:has|was)|tracking\s+(?:number|update)|manage\s+(?:your\s+)?(?:alerts|notifications|email\s+preferences)|view\s+(?:this\s+)?(?:email\s+)?in\s+(?:a\s+)?browser)\b/i;

/** Real human sales/support ask — keeps company-domain emails actionable. Bare `?` is not enough. */
const HUMAN_ASK_RE =
  /\b(?:can\s+(?:you|your|we|i|someone)|could\s+you|would\s+you|please\s+help|help\s+us|i(?:'m|\s+am)\s+(?:looking|interested|trying|hoping)|how\s+(?:do|does|can|much)|does\s+.+\s+work|what\s+(?:is|are|does)|need\s+(?:help|support|info|information)|want\s+to\s+(?:buy|know|learn|schedule|book)|we(?:'d|\s+would)\s+like|interested\s+in)\b/i;

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

/** Explicit human request/question language — not a marketing `?` or CTA. */
export function looksLikeHumanAsk(text: string | null | undefined): boolean {
  return HUMAN_ASK_RE.test(String(text || ""));
}

export function looksLikeHumanInquiry(text: string | null | undefined): boolean {
  const t = String(text || "");
  return looksLikeHumanAsk(t) || /\?/.test(t);
}

export function looksLikeSystemNotificationContent(text: string | null | undefined): boolean {
  return SYSTEM_NOTIFICATION_CONTENT_RE.test(String(text || ""));
}

export function isEmailChannel(channel: string | null | undefined): boolean {
  return String(channel || "").trim().toLowerCase() === "email";
}

function parseEmailParts(email: string): { local: string; domain: string } {
  const e = String(email || "").trim().toLowerCase();
  if (!e.includes("@")) return { local: e, domain: "" };
  const [local, domain] = e.split("@");
  return { local: local || "", domain: domain || "" };
}

/** notification / alert / newsletter host labels — not a brand list. */
function looksLikeNotificationHost(domain: string): boolean {
  if (!domain) return false;
  return domain.split(".").some((label) =>
    /^(notifications?|alerts?|newsletters?|updates?|noreply|no-reply)$/i.test(label),
  );
}

/**
 * Classify automated / system mail.
 *
 * Rule:
 * 1. Strong noreply-style sender local-part without a human inquiry → system.
 * 2. Notification/alert host label without a human inquiry → system.
 * 3. Notification/legal/account/transactional content WITHOUT human inquiry → system.
 * 4. Email channel: informational/system-like current inbound + no human inquiry → system.
 * 5. Human sales/support inquiry from a company domain stays actionable.
 */
export function looksLikeSystemOrNotificationEmail(input: {
  contactEmail?: string | null;
  fromEmail?: string | null;
  inboundText?: string | null;
  channel?: string | null;
}): boolean {
  const sender = String(input.fromEmail || input.contactEmail || "").trim().toLowerCase();
  const { local, domain } = parseEmailParts(sender);
  const text = String(input.inboundText || "");
  const humanAsk = looksLikeHumanAsk(text);
  const strongLocal = !!local && STRONG_SYSTEM_LOCAL_RE.test(local);
  const googleSystemDomain =
    domain === "google.com" ||
    domain === "accounts.google.com" ||
    domain.endsWith(".google.com");
  const notificationHost = looksLikeNotificationHost(domain);

  // Real human asks stay actionable. Notification/legal/transactional CONTENT
  // still classifies as system so marketing CTAs ("Can we help?") cannot veto.
  if (humanAsk && !looksLikeSystemNotificationContent(text)) return false;

  if (strongLocal) return true;
  if (googleSystemDomain && (strongLocal || /noreply|no-reply|notification/i.test(local))) {
    return true;
  }
  if (notificationHost) return true;
  if (looksLikeSystemNotificationContent(text)) return true;

  if (isEmailChannel(input.channel) && text.trim().length >= 12) {
    const informationalEmail =
      looksLikeSystemNotificationContent(text) ||
      notificationHost ||
      strongLocal ||
      /\b(?:unsubscribe|view\s+in\s+browser|this\s+email\s+was\s+sent|manage\s+preferences|no\s+reply)\b/i.test(
        text,
      );
    if (informationalEmail) return true;
  }

  return false;
}

export function looksLikeProductOrSaasInquiry(text: string | null | undefined): boolean {
  return PRODUCT_SAAS_INQUIRY_RE.test(String(text || ""));
}

/** Workspace can surface Realtor Growth Engine Copilot actions (industry or RGE). */
export function isRealtorWorkspaceForCopilot(input: {
  rgeInstalled?: boolean;
  industry?: string | null;
}): boolean {
  return Boolean(input.rgeInstalled) || isRealEstateIndustry(input.industry);
}

/**
 * Strong real-estate transactional evidence in message text.
 * Deliberately stricter than hasInventoryPreferenceSignals (which false-positives
 * on legal/ToS language like "purchase" / "in the").
 */
export function hasStrongRealEstateLeadEvidence(text: string | null | undefined): boolean {
  const t = String(text || "").trim();
  if (t.length < 8) return false;
  if (hasPropertyShowingIntent(t)) return true;
  if (hasStrongStructuredSearchSignals(t)) return true;

  const rental = RENTAL_INTENT_RE.test(t);
  const buy = BUY_INTENT_RE.test(t);
  if (!rental && !buy) return false;

  const hasPlace =
    /\b(?:in|near|around)\s+(?!the\b|a\b|an\b|this\b|that\b|your\b|our\b|any\b|all\b|each\b|such\b|which\b)([A-Za-z][A-Za-z\s.-]{1,40})\b/i.test(
      t,
    );
  const hasCriteria =
    BED_OR_BUDGET_RE.test(t) ||
    hasPropertyTypeSignalInMessage(t) ||
    hasPlace;

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
  const currentOrHistory = inbound || history;
  const systemInput = {
    contactEmail: input.contactEmail,
    fromEmail: input.fromEmail,
    channel: input.channel,
  };

  // Current inbound dominates: a system/notification current message cannot inherit
  // Realtor domain from history or saved profiles.
  if (inbound) {
    if (looksLikeSystemOrNotificationEmail({ ...systemInput, inboundText: inbound })) {
      return "system";
    }
  } else if (
    looksLikeSystemOrNotificationEmail({ ...systemInput, inboundText: history })
  ) {
    return "system";
  }

  const primary = inbound || history;

  if (looksLikeProductOrSaasInquiry(primary)) {
    return "generic";
  }

  const sellerIntent = input.sellerIntent ?? null;
  if (sellerIntent === "seller_and_buyer") {
    if (inbound && looksLikeSystemOrNotificationEmail({ ...systemInput, inboundText: inbound })) {
      return "system";
    }
    return "real_estate_mixed";
  }
  if (isPureSellerIntent(sellerIntent) || sellerIntent === "seller_followup") {
    const continuityText = inbound || history;
    if (sellerIntent !== "seller_followup" || hasSellerContinuity(continuityText, input)) {
      return "real_estate_seller";
    }
  }

  if (inbound) {
    if (detectRentalLeadEvidence(inbound)) return "real_estate_rental";
    if (hasStrongRealEstateLeadEvidence(inbound)) return "real_estate_buyer";
  } else {
    if (detectRentalLeadEvidence(history)) return "real_estate_rental";
    if (hasStrongRealEstateLeadEvidence(history)) return "real_estate_buyer";
  }

  // Continuity only after current-message eligibility allows it.
  const currentBlocksContinuity =
    Boolean(inbound) &&
    !looksLikeHumanAsk(inbound) &&
    !hasStrongRealEstateLeadEvidence(inbound);
  if (!currentBlocksContinuity) {
    const leadType = String(input.leadType || "").toLowerCase();
    if (
      input.buyerProfileHasCriteria &&
      (leadType === "buyer" || leadType === "renter" || leadType === "investor") &&
      hasStrongRealEstateLeadEvidence(inbound || currentOrHistory)
    ) {
      return leadType === "renter" ? "real_estate_rental" : "real_estate_buyer";
    }
  }

  return "generic";
}

function hasSellerContinuity(text: string, input: AiDomainEligibilityInput): boolean {
  if (!input.sellerProfileHasData && !input.sellerIntent) return false;
  // seller_followup from stale profile + non-RE inbound → not continuity
  if (!text) return Boolean(input.sellerProfileHasData);
  // Weak generic text with only stale profile → do not keep seller domain
  if (looksLikeProductOrSaasInquiry(text) || looksLikeSystemOrNotificationEmail({
    inboundText: text,
    fromEmail: input.fromEmail,
    contactEmail: input.contactEmail,
    channel: input.channel,
  })) {
    return false;
  }
  // Greetings / unknown intent must never keep a stale seller domain
  if (looksLikeGreetingOnly(text)) return false;
  // Require some property/sell language OR short follow-up answers in an active seller thread
  if (/\b(?:sell|listing|cma|valuation|address|home|house|property)\b/i.test(text)) return true;
  // Short acknowledgements only (not any short text — "Hellooooo" is not continuity)
  if (
    input.sellerProfileHasData &&
    /^(?:yes|yeah|yep|ok|okay|sure|thanks|thank you|correct|right)[.!]?$/i.test(text.trim())
  ) {
    return true;
  }
  return false;
}

export function isRealEstateConversationDomain(
  domain: AiConversationDomain,
): boolean {
  return (
    domain === "real_estate_buyer" ||
    domain === "real_estate_rental" ||
    domain === "real_estate_seller" ||
    domain === "real_estate_mixed"
  );
}

export type AiDomainDecision = {
  domain: AiConversationDomain;
  workspaceCapable: boolean;
  /** Automated / noreply / legal notification — not a lead. */
  isSystemNotification: boolean;
  /** Suppress Assign agent / nurture / booking / listing lead workflows. */
  suppressLeadWorkflowActions: boolean;
  /** Copilot informational "No action needed" state. */
  copilotNoActionNeeded: boolean;
  /** Inject buyer prefs / qualification / inventory into AI prompts. */
  injectBuyerContext: boolean;
  /** Show Copilot Buyer Preferences panel (same gate as injectBuyerContext). */
  showBuyerPreferencesPanel: boolean;
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
  const realtorWorkspace = isRealtorWorkspaceForCopilot(input);
  const isSystemNotification = domain === "system";
  const reDomain = isRealEstateConversationDomain(domain);
  // Conversation evidence AND Realtor workspace (industry or RGE). Never leak
  // listing/showing/seller Copilot actions into Travel/generic businesses.
  const reFeaturesAllowed = reDomain && realtorWorkspace;

  // Injection requires conversation domain evidence. Workspace capability is
  // preferred for inventory/RGE features but conversation domain is the gate.
  const injectBuyerContext =
    reFeaturesAllowed &&
    (domain === "real_estate_buyer" ||
      domain === "real_estate_rental" ||
      domain === "real_estate_mixed");

  const injectSellerContext =
    reFeaturesAllowed &&
    (domain === "real_estate_seller" || domain === "real_estate_mixed");

  const injectInventoryContext = injectBuyerContext && workspaceCapable;

  return {
    domain,
    workspaceCapable,
    isSystemNotification,
    suppressLeadWorkflowActions: isSystemNotification,
    copilotNoActionNeeded: isSystemNotification,
    injectBuyerContext,
    showBuyerPreferencesPanel: injectBuyerContext,
    injectSellerContext,
    injectInventoryContext,
    // Conversation domain + Realtor workspace — never RGE/domain alone across industries.
    showRealEstateCopilotRecommendations: reFeaturesAllowed,
    useRealEstatePromptPersona: reFeaturesAllowed,
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

export function shouldShowBuyerPreferencesPanel(
  input: AiDomainEligibilityInput,
): boolean {
  return resolveAiDomainEligibility(input).showBuyerPreferencesPanel;
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

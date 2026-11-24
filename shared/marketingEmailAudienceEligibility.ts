/** Recipient-level marketing email readiness, not an outbound authorization.
 * Applies to merchant-owned CRM, CSV and Shopify records. The final marketing
 * sender must continue to enforce its independent queue/provider acceptance gate.
 *
 * U.S. CAN-SPAM's opt-out model is NOT permission to ignore explicit opt-outs,
 * Shopify unsubscribe signals, global suppression or unknown jurisdictions.
 */
export type MarketingEmailAudienceDecision =
  | "eligible_opt_in"
  | "eligible_us_opt_out"
  | "needs_verification"
  | "suppressed";

export type MarketingEmailAudienceReason =
  | "subscribed"
  | "documented_us_existing_customer"
  | "invalid_email"
  | "explicit_opt_out"
  | "suppressed_identity"
  | "pending_consent"
  | "missing_country_or_basis"
  | "outside_us_without_consent"
  | "conflicting_consent";

export type MarketingEmailAudienceResult = {
  decision: MarketingEmailAudienceDecision;
  reason: MarketingEmailAudienceReason;
  /** Only a recipient-level decision; NOT an authorization to dispatch mail. */
  potentialEmailRecipient: boolean;
};

export type MarketingEmailAudienceInput = {
  email?: string | null;
  shopifyConsentState?: unknown;
  shopifyAcceptsMarketing?: unknown;
  suppressed?: boolean;
  explicitOptOut?: boolean;
  /** Country evidence from a trustworthy first-party customer record. */
  verifiedRecipientCountry?: string | null;
  /** Merchant-owned list provenance and current relationship must be documented. */
  documentedExistingCustomerRelationship?: boolean;
  /** Explicit owner assertion, never inferred from workspace/shop address. */
  ownerConfirmedUsOptOutBasis?: boolean;
};

const stop = (reason: MarketingEmailAudienceReason): MarketingEmailAudienceResult =>
  ({ decision: "suppressed", reason, potentialEmailRecipient: false });
const hold = (reason: MarketingEmailAudienceReason): MarketingEmailAudienceResult =>
  ({ decision: "needs_verification", reason, potentialEmailRecipient: false });

export function evaluateMarketingEmailAudience(input: MarketingEmailAudienceInput): MarketingEmailAudienceResult {
  const email = String(input.email || "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email))
    return hold("invalid_email");

  // Unsubscribe, bounce and manual DNC win over all recipient classifications.
  if (input.suppressed) return stop("suppressed_identity");
  if (input.explicitOptOut) return stop("explicit_opt_out");

  const state = String(input.shopifyConsentState || "unknown").toLowerCase();
  if (state === "unsubscribed" || state === "redacted" || state === "invalid")
    return stop("explicit_opt_out");
  if (input.shopifyAcceptsMarketing === false) return stop("conflicting_consent");
  if (state === "pending") return hold("pending_consent");
  if (state === "subscribed")
    return { decision: "eligible_opt_in", reason: "subscribed", potentialEmailRecipient: true };

  // Unknown/not_subscribed is NOT the same as unsubscribed. But outside the US,
  // missing opt-in cannot become eligible by attaching an unsubscribe footer.
  // Do not infer country from language, domain, IP, phone or merchant location.
  const country = String(input.verifiedRecipientCountry || "").trim().toUpperCase();
  if (country && country !== "US") return hold("outside_us_without_consent");
  if (country === "US" && input.documentedExistingCustomerRelationship === true &&
      input.ownerConfirmedUsOptOutBasis === true) {
    return {
      decision: "eligible_us_opt_out",
      reason: "documented_us_existing_customer",
      potentialEmailRecipient: true,
    };
  }
  return hold("missing_country_or_basis");
}

/** Legacy CRM suppression flags remain authoritative even before ledger backfill. */
export function hasLegacyEmailMarketingOptOut(fields: unknown): boolean {
  const f = fields && typeof fields === "object" && !Array.isArray(fields)
    ? fields as Record<string, unknown> : {};
  return f.doNotContact === true || f.dnc === true || f.stop === true ||
    f.optOut === true || f.unsubscribed === true || f.emailUnsubscribed === true ||
    f.campaignOptOut === true || f.marketingOptIn === false ||
    f.suppressed === true || f.emailBounced === true || f.bounced === true;
}

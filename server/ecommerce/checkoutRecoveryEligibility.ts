/**
 * Abandoned CHECKOUT eligibility decision only. This module never sends a
 * message, schedules a job, fetches Shopify data, or treats a cart as checkout.
 * Webhook HMAC, installation ownership, and authoritative purchase state must
 * be verified upstream. This cannot be wired directly to public request bodies.
 */
export type CheckoutRecoveryInput = {
  verifiedEvent: boolean;
  activeInstallation: boolean;
  tenantMatches: boolean;
  merchantEnabled: boolean;
  checkoutId: string | null;
  checkoutRecoveryUrl: string | null;
  hasCompletedPurchase: boolean | null;
  checkoutAgeMinutes: number;
  minimumDelayMinutes: number;
  contactIdentityVerified: boolean;
  whatsAppOptIn: 'granted' | 'denied' | 'unknown';
  optedOut: boolean;
  approvedTemplateAvailable: boolean;
  alreadyClaimed: boolean;
};
export type CheckoutRecoveryDecision =
  | { status: 'eligible_for_durable_claim'; checkoutId: string; recoveryUrl: string }
  | { status: 'blocked'; reason: string };

export function evaluateCheckoutRecovery(i: CheckoutRecoveryInput): CheckoutRecoveryDecision {
  const blocked = (reason: string): CheckoutRecoveryDecision => ({status:'blocked',reason});
  if (!i.verifiedEvent) return blocked('unverified_event');
  if (!i.activeInstallation || !i.tenantMatches) return blocked('invalid_installation_or_tenant');
  if (!i.merchantEnabled) return blocked('merchant_disabled');
  if (!i.checkoutId?.trim() || i.checkoutId.length > 256) return blocked('missing_checkout');
  if (!i.checkoutRecoveryUrl) return blocked('missing_recovery_url');
  // Accept Shopify-hosted secure links only, and never carry credentials in URL fragments.
  let url: URL;
  try { url = new URL(i.checkoutRecoveryUrl); }
  catch { return blocked('invalid_recovery_url'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(url.hostname) ||
      url.port) return blocked('invalid_recovery_url');
  if (i.hasCompletedPurchase !== false) return blocked('purchase_not_confirmed_incomplete');
  if (!Number.isFinite(i.minimumDelayMinutes) || i.minimumDelayMinutes < 1 ||
      !Number.isFinite(i.checkoutAgeMinutes) || i.checkoutAgeMinutes < i.minimumDelayMinutes)
    return blocked('waiting_period');
  if (!i.contactIdentityVerified) return blocked('unknown_contact');
  if (i.optedOut || i.whatsAppOptIn !== 'granted') return blocked('no_messaging_consent');
  if (!i.approvedTemplateAvailable) return blocked('template_unavailable');
  if (i.alreadyClaimed) return blocked('duplicate_claim');
  // Eligibility is not authorization to send: DB claim, current purchase recheck,
  // provider-specific policy and send-side opt-out recheck are still required.
  return {status:'eligible_for_durable_claim',checkoutId:i.checkoutId.trim(),recoveryUrl:url.toString()};
}

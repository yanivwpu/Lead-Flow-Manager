/**
 * Phase-1 E-commerce Growth Engine event planning boundary.
 * Pure, tenant-scoped, and deliberately incapable of sending messages.
 * Upstream Shopify webhook handling MUST authenticate HMAC before invoking this.
 */
export type CommerceEventDecision =
  | { status: 'candidate'; journey: 'order_support' | 'fulfillment_support' | 'order_cancelled'; dedupeKey: string }
  | { status: 'ignored'; reason: 'unsupported_topic' | 'unverified_webhook' | 'missing_identity' | 'invalid_shop' };

const TOPICS = {
  'orders/create': 'order_support',
  'orders/fulfilled': 'fulfillment_support',
  'orders/cancelled': 'order_cancelled',
} as const;

export function classifyCommerceWebhook(input: {
  verified: boolean;
  accountId: string | null | undefined;
  shopDomain: string | null | undefined;
  topic: string;
  webhookId: string | null | undefined;
}): CommerceEventDecision {
  if (!input.verified) return { status: 'ignored', reason: 'unverified_webhook' };
  const account = input.accountId?.trim();
  const id = input.webhookId?.trim();
  if (!account || !id || account.length > 128 || id.length > 256)
    return { status: 'ignored', reason: 'missing_identity' };
  const shop = input.shopDomain?.trim().toLowerCase();
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop))
    return { status: 'ignored', reason: 'invalid_shop' };
  if (!Object.prototype.hasOwnProperty.call(TOPICS,input.topic))
    return { status: 'ignored', reason: 'unsupported_topic' };
  const journey = TOPICS[input.topic as keyof typeof TOPICS];
  // Never log this key or use it as an outbound idempotency guarantee until persisted.
  return { status: 'candidate', journey, dedupeKey: JSON.stringify([account,shop,input.topic,id]) };
}

/**
 * Planning-only activation gate. Returns a preview, never a send instruction.
 * Real message delivery additionally requires durable deduplication, per-channel
 * legal consent, opt-out handling, template approval and a reviewed workflow.
 */
export type CommercePreviewDecision =
  | { status: 'preview_ready'; journey: 'order_support' | 'fulfillment_support' | 'order_cancelled'; dedupeKey: string }
  | { status: 'blocked'; reason:
      'event_ineligible' | 'engine_disabled' | 'installation_inactive' |
      'tenant_mismatch' | 'consent_unknown_or_denied' | 'customer_opted_out' };

export function previewCommerceJourney(
  decision: CommerceEventDecision,
  context: {
    engineEnabled: boolean;
    installationActive: boolean;
    installationAccountId: string | null;
    eventAccountId: string;
    contactConsent: 'granted' | 'denied' | 'unknown';
    contactOptedOut: boolean;
  },
): CommercePreviewDecision {
  if (decision.status !== 'candidate') return {status:'blocked',reason:'event_ineligible'};
  if (!context.engineEnabled) return {status:'blocked',reason:'engine_disabled'};
  if (!context.installationActive) return {status:'blocked',reason:'installation_inactive'};
  const accountId = context.eventAccountId.trim();
  if (!accountId || context.installationAccountId !== accountId ||
      JSON.parse(decision.dedupeKey)[0] !== accountId)
    return {status:'blocked',reason:'tenant_mismatch'};
  if (context.contactOptedOut) return {status:'blocked',reason:'customer_opted_out'};
  if (context.contactConsent !== 'granted') return {status:'blocked',reason:'consent_unknown_or_denied'};
  return {status:'preview_ready',journey:decision.journey,dedupeKey:decision.dedupeKey};
}

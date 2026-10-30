import { createHash } from "node:crypto";
import { classifyCommerceWebhook } from "./eventIntake";
import { JOURNEY_POLICY, POST_PURCHASE_JOURNEYS, validJourneyPlan, type PostPurchasePlans } from "../../shared/postPurchase";

/**
 * No-send scheduling policy. Inputs are trusted, freshly read server evidence,
 * NEVER merchant request JSON. This module cannot enqueue or dispatch messages.
 * Recovery-specific consent is intentionally not accepted for these purposes.
 */
export type PostPurchaseSnapshot = {
  accountId: string; shop: string; installationActive: boolean; merchantPaused: boolean;
  event: { verified: boolean; accountId: string; shop: string; topic: string; deliveryId: string;
    orderId: string; customerId: string; occurredAt: number };
  order: { accountId: string; shop: string; id: string; customerId: string;
    status: "open" | "fulfilled" | "cancelled"; updatedAt: number; checkedAt: number;
    purchasedAt: number; latestPurchaseAt: number | null };
  recipient: { accountId: string; customerId: string; identityVerified: boolean;
    channel: "whatsapp"; stopped: boolean; erased: boolean; paused: boolean;
    consentPurposes: readonly string[] };
  templates: Partial<Record<keyof PostPurchasePlans, {
    localApproved: boolean; liveApproved: boolean; category: string;
    exactBodyMatched: boolean; language: string;
  }>>;
  /** Existing durable dispatch history, scoped by account + shop before loading. */
  previousKeys: readonly string[];
  now: number;
};
export function planPostPurchaseTimeline(plans: PostPurchasePlans, input: PostPurchaseSnapshot) {
  const event = classifyCommerceWebhook({
    verified: input.event.verified, accountId: input.event.accountId,
    shopDomain: input.event.shop, topic: input.event.topic, webhookId: input.event.deliveryId,
  });
  return POST_PURCHASE_JOURNEYS.map(journey => {
    const policy = JOURNEY_POLICY[journey], plan = plans[journey];
    const reasons: string[] = [];
    const { order, recipient, now } = input;
    if (!validJourneyPlan(plan) || !plan.selected) reasons.push("journey_paused");
    if (!input.installationActive) reasons.push("installation_inactive");
    if (input.merchantPaused || recipient.paused) reasons.push("merchant_or_contact_paused");
    if (event.status !== "candidate" || input.event.topic !== policy.topic) reasons.push("event_ineligible");
    if (!input.accountId || input.accountId !== input.event.accountId || input.accountId !== order.accountId ||
        input.accountId !== recipient.accountId || input.shop !== input.event.shop || input.shop !== order.shop)
      reasons.push("tenant_or_shop_mismatch");
    if (!/^gid:\/\/shopify\/Order\/[1-9][0-9]{0,19}$/.test(order.id) ||
        order.id !== input.event.orderId ||
        !/^gid:\/\/shopify\/Customer\/[1-9][0-9]{0,19}$/.test(order.customerId) ||
        order.customerId !== input.event.customerId || order.customerId !== recipient.customerId ||
        recipient.identityVerified !== true) reasons.push("identity_unverified");
    if (recipient.channel !== "whatsapp" || !recipient.consentPurposes.includes(journey))
      reasons.push("purpose_specific_whatsapp_consent_required");
    if (recipient.stopped) reasons.push("recipient_stopped");
    if (recipient.erased) reasons.push("privacy_erased");
    if (!Number.isFinite(now) || !Number.isFinite(order.checkedAt) ||
        order.checkedAt > now || now - order.checkedAt > 60_000) reasons.push("fresh_order_check_required");
    if (!Number.isFinite(input.event.occurredAt) || input.event.occurredAt > now ||
        !Number.isFinite(order.updatedAt) || order.updatedAt > now ||
        input.event.occurredAt > order.updatedAt) reasons.push("invalid_order_time");
    const expectedStatus = journey === "cancellation" ? "cancelled" :
      journey === "orderConfirmation" ? "open" : "fulfilled";
    if (order.status !== expectedStatus) reasons.push("order_status_changed");
    if (policy.category === "MARKETING" &&
        (order.latestPurchaseAt === null || !Number.isFinite(order.latestPurchaseAt) ||
          !Number.isFinite(order.purchasedAt) || order.purchasedAt > order.updatedAt ||
          order.latestPurchaseAt > order.purchasedAt)) reasons.push("purchase_recheck_required_or_new_purchase");
    const template = input.templates[journey];
    // Conservative: require approved exact matching template even within 24h.
    if (!template || template.localApproved !== true || template.liveApproved !== true ||
        template.exactBodyMatched !== true || template.category !== policy.category ||
        !/^(en|es|he)(_[A-Z]{2})?$/.test(template.language))
      reasons.push("approved_matching_template_required");
    const dueAt = input.event.occurredAt + (validJourneyPlan(plan) ? plan.delayMinutes : 0) * 60_000;
    if (!Number.isSafeInteger(dueAt) || dueAt > now) reasons.push("waiting_for_timing");
    // Order-level fence prevents a second delivery ID of the same semantic event
    // from producing duplicate confirmation/fulfillment/cancellation messages.
    const key = createHash("sha256").update(JSON.stringify([
      "post-purchase/v1", input.accountId, input.shop, order.id, journey,
    ])).digest("hex");
    if (input.previousKeys.includes(key)) reasons.push("duplicate_or_uncertain_attempt");
    return { journey, dueAt: Number.isSafeInteger(dueAt) ? dueAt : null, key,
      status: reasons.length ? "blocked" as const : "preview_ready" as const,
      reasons, messagingEnabled: false as const };
  });
}

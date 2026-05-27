/**
 * Commerce event ingest — contact + activity timeline + workflow triggers.
 * V1: no shopify/woocommerce/stripe inbox channels; optional mirror message on existing messaging threads only.
 */
import type { Channel, Contact, Conversation } from "@shared/schema";
import { storage } from "./storage";
import { channelService } from "./channelService";
import { dispatchCommerceEventAutomation } from "./automationEventDispatcher";
import { scheduleHubSpotAutoSync } from "./hubspotAutoSync";

/** Channels that represent real customer messaging (not Calendly/GHL commerce-only threads). */
export const COMMERCE_MESSAGING_CHANNELS: readonly Channel[] = [
  "whatsapp",
  "instagram",
  "facebook",
  "sms",
  "webchat",
  "telegram",
] as const;

export type CommerceWorkflowTrigger =
  | "shopify_order_created"
  | "shopify_customer_created";

export type CommerceIngestParams = {
  userId: string;
  source: "shopify";
  triggerType: CommerceWorkflowTrigger;
  /** Stable id for message dedupe — e.g. shopify:evt:{X-Shopify-Event-Id} */
  externalMessageId: string;
  summaryText: string;
  activityEventType: string;
  metadata: Record<string, unknown>;
  contactHints: {
    name?: string;
    email?: string;
    phone?: string;
    shopifyCustomerId?: string | number;
  };
};

export type CommerceIngestResult = {
  ok: boolean;
  deduped?: boolean;
  contactId?: string;
  conversationId?: string | null;
  messageId?: string;
  contactCreated?: boolean;
  error?: string;
};

function logCommerce(event: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "[CommerceIngest]", event, ...payload }));
}

function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

function normalizeEmail(raw: string | undefined | null): string {
  return (raw || "").trim().toLowerCase();
}

function isMessagingChannel(channel: string): channel is (typeof COMMERCE_MESSAGING_CHANNELS)[number] {
  return (COMMERCE_MESSAGING_CHANNELS as readonly string[]).includes(channel);
}

async function findContactForCommerceHints(
  userId: string,
  hints: CommerceIngestParams["contactHints"],
): Promise<Contact | undefined> {
  const phoneDigits = normalizePhone(hints.phone);
  if (phoneDigits.length >= 8) {
    const byPhone = await storage.getContactByChannelId(userId, "whatsapp", phoneDigits);
    if (byPhone) return byPhone;
  }

  const email = normalizeEmail(hints.email);
  if (email.includes("@")) {
    const byEmail = await storage.getContactByChannelId(userId, "calendly", email);
    if (byEmail) return byEmail;
  }

  const shopifyId = hints.shopifyCustomerId != null ? String(hints.shopifyCustomerId) : "";
  if (shopifyId) {
    const all = await storage.getContacts(userId, 2000);
    const hit = all.find((c) => {
      const cf = (c.customFields || {}) as Record<string, unknown>;
      return cf.shopifyCustomerId != null && String(cf.shopifyCustomerId) === shopifyId;
    });
    if (hit) return hit;
  }

  return undefined;
}

async function upsertCommerceContact(
  userId: string,
  hints: CommerceIngestParams["contactHints"],
  metadata: Record<string, unknown>,
): Promise<{ contact: Contact; created: boolean }> {
  const existing = await findContactForCommerceHints(userId, hints);
  const phoneDigits = normalizePhone(hints.phone);
  const email = normalizeEmail(hints.email);
  const name = (hints.name || "").trim() || email || phoneDigits || "Shopify customer";
  const shopifyCustomerId =
    hints.shopifyCustomerId != null ? String(hints.shopifyCustomerId) : undefined;

  const commerceCustom = {
    shopifyCustomerId: shopifyCustomerId ?? (existing?.customFields as any)?.shopifyCustomerId,
    lastCommerceSource: "shopify",
    lastCommerceAt: new Date().toISOString(),
    lastCommerceMetadata: metadata,
  };

  if (existing) {
    const prevCf = (existing.customFields || {}) as Record<string, unknown>;
    const patch: Partial<Contact> = {
      customFields: { ...prevCf, ...commerceCustom },
      updatedAt: new Date(),
    };
    if (email && !existing.email) patch.email = email;
    if (phoneDigits.length >= 8 && !existing.phone) {
      patch.phone = phoneDigits;
      if (!existing.whatsappId) patch.whatsappId = phoneDigits;
    }
    if (name && (existing.name === "Shopify customer" || !existing.name?.trim())) {
      patch.name = name;
    }
    const updated = await storage.updateContact(existing.id, patch);
    return { contact: updated || existing, created: false };
  }

  const created = await storage.createContact({
    userId,
    name,
    email: email || undefined,
    phone: phoneDigits.length >= 8 ? phoneDigits : undefined,
    whatsappId: phoneDigits.length >= 8 ? phoneDigits : undefined,
    primaryChannel: phoneDigits.length >= 8 ? "whatsapp" : email ? "calendly" : "manual",
    source: "shopify",
    sourceDetails: { shopifyCustomerId },
    customFields: commerceCustom,
  });
  return { contact: created, created: true };
}

async function findLatestMessagingConversation(contactId: string): Promise<Conversation | null> {
  const pack = await storage.getContactWithConversations(contactId);
  if (!pack?.conversations?.length) return null;
  const messaging = pack.conversations.filter((c) => isMessagingChannel(c.channel));
  if (!messaging.length) return null;
  messaging.sort(
    (a, b) => (b.lastMessageAt?.getTime() || 0) - (a.lastMessageAt?.getTime() || 0),
  );
  return messaging[0] || null;
}

/**
 * Ingest a commerce webhook: dedupe via messages.externalMessageId when a messaging thread exists;
 * always writes activity + workflow triggers.
 */
export async function ingestCommerceEvent(params: CommerceIngestParams): Promise<CommerceIngestResult> {
  const {
    userId,
    source,
    triggerType,
    externalMessageId,
    summaryText,
    activityEventType,
    metadata,
    contactHints,
  } = params;

  logCommerce("received", {
    userId,
    source,
    triggerType,
    externalMessageId,
  });

  if (externalMessageId) {
    const existingMsg = await storage.getMessageByUserExternalId(userId, externalMessageId);
    if (existingMsg) {
      logCommerce("deduped", { userId, externalMessageId, messageId: existingMsg.id });
      return { ok: true, deduped: true, contactId: existingMsg.contactId };
    }
  }

  try {
    const { contact, created: contactCreated } = await upsertCommerceContact(
      userId,
      contactHints,
      metadata,
    );

    logCommerce("contact_resolved", {
      userId,
      contactId: contact.id,
      contactCreated,
    });

    const messagingConv = await findLatestMessagingConversation(contact.id);
    let conversationId: string | null = messagingConv?.id ?? null;
    let messageId: string | undefined;

    if (messagingConv && externalMessageId) {
      const channel = messagingConv.channel as Channel;
      const channelContactId =
        channel === "whatsapp" || channel === "sms"
          ? normalizePhone(contact.whatsappId || contact.phone || "")
          : channel === "telegram"
            ? String(contact.telegramId || contact.phone || contact.id)
            : channel === "instagram"
              ? String((contact as any).instagramId || contact.id)
              : channel === "facebook"
                ? String((contact as any).facebookId || contact.id)
                : contact.id;

      const inbound = await channelService.processIncomingMessage({
        userId,
        channel,
        channelContactId: channelContactId || contact.id,
        contactName: contact.name || undefined,
        content: summaryText,
        contentType: "text",
        externalMessageId,
        preferredContactId: contact.id,
        inboundMode: "commerce",
      });

      if (inbound.deduped) {
        logCommerce("deduped", { userId, externalMessageId, via: "processIncomingMessage" });
        return { ok: true, deduped: true, contactId: contact.id };
      }

      if (inbound.conversation?.id) conversationId = inbound.conversation.id;
      if (inbound.message?.id) messageId = inbound.message.id;

      logCommerce("messaging_mirror", {
        userId,
        contactId: contact.id,
        conversationId,
        messageId,
        channel,
      });
    }

    await channelService.logActivity(userId, contact.id, conversationId ?? undefined, activityEventType, {
      source,
      triggerType,
      summary: summaryText.slice(0, 500),
      externalMessageId,
      ...metadata,
    });

    logCommerce("activity_written", {
      userId,
      contactId: contact.id,
      conversationId,
      activityEventType,
    });

    dispatchCommerceEventAutomation({
      userId,
      triggerType,
      contact,
      conversationId: conversationId ?? undefined,
      summaryText,
      metadata,
      contactCreated,
    }).catch((err) => {
      logCommerce("workflow_dispatch_error", {
        userId,
        triggerType,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    scheduleHubSpotAutoSync(userId, contact.id);

    logCommerce("completed", {
      userId,
      contactId: contact.id,
      conversationId,
      triggerType,
    });

    return {
      ok: true,
      contactId: contact.id,
      conversationId,
      messageId,
      contactCreated,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logCommerce("failed", { userId, triggerType, error });
    return { ok: false, error };
  }
}

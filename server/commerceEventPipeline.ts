/**
 * Commerce event ingest — contact + commerce thread + activity + workflows.
 * Shopify / WooCommerce: customer imports use empty threads; orders use structured commerce cards.
 */
import type { Channel, Contact, Conversation, InsertMessage } from "@shared/schema";
import { isCommerceSourcedContact } from "@shared/contactChannelDisplay";
import { storage } from "./storage";
import { dispatchCommerceEventAutomation } from "./automationEventDispatcher";
import { scheduleHubSpotAutoSync } from "./hubspotAutoSync";
import { notifyUser } from "./presence";

export type CommerceSource = "shopify" | "woocommerce";

export type CommerceWorkflowTrigger =
  | "shopify_order_created"
  | "shopify_customer_created"
  | "woocommerce_order_created"
  | "woocommerce_customer_created";

/** quiet_thread = contact + empty commerce thread; commerce_message = + inbox card; activity_only = contact/thread + activity */
export type CommerceRecordMode = "quiet_thread" | "commerce_message" | "activity_only";

export type CommerceContactHints = {
  name?: string;
  email?: string;
  phone?: string;
  shopifyCustomerId?: string | number;
  woocommerceCustomerId?: string | number;
};

export type CommerceIngestParams = {
  userId: string;
  source: CommerceSource;
  triggerType?: CommerceWorkflowTrigger;
  recordMode: CommerceRecordMode;
  /** Required when recordMode is commerce_message — used for messages.externalMessageId dedupe */
  externalMessageId?: string;
  /** Formatted commerce card text for the inbox thread (orders only) */
  messageBody?: string;
  activityEventType: string;
  metadata: Record<string, unknown>;
  contactHints: CommerceContactHints;
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

function commerceChannelForSource(source: CommerceSource): Channel {
  return source === "woocommerce" ? "woocommerce" : "shopify";
}

function defaultCustomerName(source: CommerceSource): string {
  return source === "woocommerce" ? "WooCommerce customer" : "Shopify customer";
}

function commerceThreadKey(
  contact: Contact,
  hints: CommerceContactHints,
  source: CommerceSource,
): string {
  if (source === "woocommerce") {
    const wooId =
      hints.woocommerceCustomerId != null
        ? String(hints.woocommerceCustomerId)
        : String((contact.customFields as Record<string, unknown> | null)?.woocommerceCustomerId ?? "");
    if (wooId) return `woocommerce:${wooId}`;
  } else {
    const shopifyId =
      hints.shopifyCustomerId != null
        ? String(hints.shopifyCustomerId)
        : String((contact.customFields as Record<string, unknown> | null)?.shopifyCustomerId ?? "");
    if (shopifyId) return `shopify:${shopifyId}`;
  }
  const email = normalizeEmail(hints.email || contact.email);
  if (email.includes("@")) return `email:${email}`;
  const phone = normalizePhone(hints.phone || contact.phone);
  if (phone.length >= 8) return `phone:${phone}`;
  return `contact:${contact.id}`;
}

async function findContactForCommerceHints(
  userId: string,
  hints: CommerceContactHints,
  source: CommerceSource,
): Promise<Contact | undefined> {
  if (source !== "woocommerce") {
    const phoneDigits = normalizePhone(hints.phone);
    if (phoneDigits.length >= 8) {
      const byPhone = await storage.getContactByChannelId(userId, "whatsapp", phoneDigits);
      if (byPhone) return byPhone;
    }
  }

  const email = normalizeEmail(hints.email);
  if (email.includes("@")) {
    const byEmail = await storage.getContactByChannelId(userId, "calendly", email);
    if (byEmail) return byEmail;
  }

  if (hints.shopifyCustomerId != null) {
    const shopifyId = String(hints.shopifyCustomerId);
    const all = await storage.getContacts(userId, 2000);
    const hit = all.find((c) => {
      const cf = (c.customFields || {}) as Record<string, unknown>;
      return cf.shopifyCustomerId != null && String(cf.shopifyCustomerId) === shopifyId;
    });
    if (hit) return hit;
  }

  if (hints.woocommerceCustomerId != null) {
    const wooId = String(hints.woocommerceCustomerId);
    const all = await storage.getContacts(userId, 2000);
    const hit = all.find((c) => {
      const cf = (c.customFields || {}) as Record<string, unknown>;
      return cf.woocommerceCustomerId != null && String(cf.woocommerceCustomerId) === wooId;
    });
    if (hit) return hit;
  }

  return undefined;
}

async function upsertCommerceContact(
  userId: string,
  hints: CommerceContactHints,
  metadata: Record<string, unknown>,
  source: CommerceSource,
): Promise<{ contact: Contact; created: boolean }> {
  const existing = await findContactForCommerceHints(userId, hints, source);
  const phoneDigits = normalizePhone(hints.phone);
  const email = normalizeEmail(hints.email);
  const fallbackName = defaultCustomerName(source);
  const name = (hints.name || "").trim() || email || phoneDigits || fallbackName;
  const shopifyCustomerId =
    hints.shopifyCustomerId != null ? String(hints.shopifyCustomerId) : undefined;
  const woocommerceCustomerId =
    hints.woocommerceCustomerId != null ? String(hints.woocommerceCustomerId) : undefined;
  const commerceChannel = commerceChannelForSource(source);

  const commerceCustom: Record<string, unknown> = {
    shopifyCustomerId:
      shopifyCustomerId ?? (existing?.customFields as Record<string, unknown> | null)?.shopifyCustomerId,
    woocommerceCustomerId:
      woocommerceCustomerId ??
      (existing?.customFields as Record<string, unknown> | null)?.woocommerceCustomerId,
    commerceThreadKey: existing
      ? commerceThreadKey(existing, hints, source)
      : woocommerceCustomerId != null
        ? `woocommerce:${woocommerceCustomerId}`
        : shopifyCustomerId != null
          ? `shopify:${shopifyCustomerId}`
          : normalizeEmail(hints.email)
            ? `email:${normalizeEmail(hints.email)}`
            : normalizePhone(hints.phone)
              ? `phone:${normalizePhone(hints.phone)}`
              : "pending",
    lastCommerceSource: source,
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
    }
    if (isCommerceSourcedContact(existing) || shopifyCustomerId || woocommerceCustomerId) {
      patch.primaryChannel = commerceChannel;
    }
    if (name && (existing.name === fallbackName || !existing.name?.trim())) {
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
    primaryChannel: commerceChannel,
    source,
    sourceDetails:
      source === "woocommerce"
        ? { woocommerceCustomerId }
        : { shopifyCustomerId },
    customFields: commerceCustom,
  });
  return { contact: created, created: true };
}

async function ensureCommerceConversation(
  userId: string,
  contact: Contact,
  source: CommerceSource,
  hints: CommerceContactHints,
): Promise<{ conversation: Conversation; created: boolean }> {
  const channel = commerceChannelForSource(source);
  const threadKey = commerceThreadKey(contact, hints, source);
  let conversation = await storage.getConversationByContactAndChannel(contact.id, channel);
  if (conversation) {
    return { conversation, created: false };
  }
  conversation = await storage.createConversation({
    userId,
    contactId: contact.id,
    channel,
    externalThreadId: threadKey,
    status: "open",
    windowActive: false,
    unreadCount: 0,
  });
  return { conversation, created: true };
}

async function appendCommerceChatMessage(params: {
  userId: string;
  contact: Contact;
  conversation: Conversation;
  body: string;
  externalMessageId: string;
}): Promise<string> {
  const preview = params.body.split("\n").find((l) => l.trim())?.slice(0, 100) || "Commerce update";
  const messagePayload: InsertMessage = {
    userId: params.userId,
    contactId: params.contact.id,
    conversationId: params.conversation.id,
    direction: "inbound",
    content: params.body,
    contentType: "commerce_event",
    externalMessageId: params.externalMessageId.slice(0, 500),
    status: "delivered",
  };
  const message = await storage.createMessage(messagePayload);

  await storage.updateConversation(params.conversation.id, {
    lastMessageAt: new Date(),
    lastMessagePreview: preview,
    lastMessageDirection: "inbound",
    unreadCount: (params.conversation.unreadCount || 0) + 1,
  });

  notifyUser(params.userId, {
    type: "new_message",
    conversationId: params.conversation.id,
    contactId: params.contact.id,
  });

  return message.id;
}

export function formatShopifyOrderCreatedMessage(body: {
  orderName?: string;
  orderId?: string;
  lineItems?: Array<{ title?: string; quantity?: number }>;
  totalPrice?: string;
  currency?: string;
  financialStatus?: string;
}): string {
  const orderLabel = body.orderName || (body.orderId ? `#${body.orderId}` : "New order");
  const lines = (body.lineItems || [])
    .slice(0, 20)
    .map((li) => `• ${li.title ?? "Item"} ×${li.quantity ?? 1}`);
  const total =
    body.totalPrice != null && body.totalPrice !== ""
      ? `${body.currency ? `${body.currency} ` : ""}${body.totalPrice}`.trim()
      : "";
  const status = body.financialStatus
    ? body.financialStatus.charAt(0).toUpperCase() + body.financialStatus.slice(1)
    : "";

  return [
    "🛒 Shopify Order Created",
    "",
    `Order ${orderLabel}`,
    lines.length ? "Items:" : "",
    ...lines,
    "",
    total ? `Total: ${total}` : "",
    status ? `Status: ${status}` : "",
  ]
    .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatWooCommerceOrderCreatedMessage(body: {
  orderNumber?: string;
  orderId?: string;
  lineItems?: Array<{ name?: string; quantity?: number }>;
  total?: string;
  currency?: string;
  status?: string;
}): string {
  const orderLabel =
    body.orderNumber != null && body.orderNumber !== ""
      ? `#${body.orderNumber}`
      : body.orderId
        ? `#${body.orderId}`
        : "New order";
  const lines = (body.lineItems || [])
    .slice(0, 20)
    .map((li) => `• ${li.name ?? "Item"} ×${li.quantity ?? 1}`);
  const total =
    body.total != null && body.total !== ""
      ? `${body.currency ? `${body.currency} ` : ""}${body.total}`.trim()
      : "";
  const status = body.status
    ? body.status.charAt(0).toUpperCase() + body.status.slice(1).replace(/-/g, " ")
    : "";

  return [
    "🛒 WooCommerce Order Created",
    "",
    `Order ${orderLabel}`,
    lines.length ? "Items:" : "",
    ...lines,
    "",
    total ? `Total: ${total}` : "",
    status ? `Status: ${status}` : "",
  ]
    .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function ingestCommerceEvent(params: CommerceIngestParams): Promise<CommerceIngestResult> {
  const {
    userId,
    source,
    triggerType,
    recordMode,
    externalMessageId,
    messageBody,
    activityEventType,
    metadata,
    contactHints,
  } = params;

  logCommerce("received", {
    userId,
    source,
    triggerType: triggerType || null,
    recordMode,
    externalMessageId: externalMessageId || null,
  });

  if (recordMode === "commerce_message" && externalMessageId) {
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
      source,
    );

    logCommerce("contact_resolved", {
      userId,
      contactId: contact.id,
      contactCreated,
    });

    const { conversation, created: conversationCreated } = await ensureCommerceConversation(
      userId,
      contact,
      source,
      contactHints,
    );

    logCommerce("thread_ensured", {
      userId,
      contactId: contact.id,
      conversationId: conversation.id,
      conversationCreated,
      empty: recordMode === "quiet_thread" || recordMode === "activity_only",
    });

    let messageId: string | undefined;

    if (recordMode === "commerce_message") {
      if (!messageBody?.trim()) {
        throw new Error("commerce_message requires messageBody");
      }
      if (!externalMessageId) {
        throw new Error("commerce_message requires externalMessageId");
      }
      messageId = await appendCommerceChatMessage({
        userId,
        contact,
        conversation,
        body: messageBody.trim(),
        externalMessageId,
      });
      logCommerce("commerce_message_written", {
        userId,
        contactId: contact.id,
        conversationId: conversation.id,
        messageId,
      });
    }

    const sourceLabel = source === "woocommerce" ? "WooCommerce" : "Shopify";
    const activitySummary =
      recordMode === "commerce_message"
        ? messageBody?.split("\n").find((l) => l.trim())?.slice(0, 500) || activityEventType
        : recordMode === "activity_only"
          ? `${sourceLabel} ${activityEventType.replace(/_/g, " ")}`
          : `${sourceLabel} customer ${contactCreated ? "imported" : "updated"}`;

    const { channelService } = await import("./channelService");
    await channelService.logActivity(userId, contact.id, conversation.id, activityEventType, {
      source,
      triggerType: triggerType || null,
      recordMode,
      summary: activitySummary,
      externalMessageId: externalMessageId || null,
      ...metadata,
    });

    if (triggerType && recordMode !== "activity_only") {
      dispatchCommerceEventAutomation({
        userId,
        triggerType,
        contact,
        conversationId: conversation.id,
        summaryText: activitySummary,
        metadata,
        contactCreated,
      }).catch((err) => {
        logCommerce("workflow_dispatch_error", {
          userId,
          triggerType,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    scheduleHubSpotAutoSync(userId, contact.id);

    logCommerce("completed", {
      userId,
      contactId: contact.id,
      conversationId: conversation.id,
      triggerType: triggerType || null,
      recordMode,
    });

    return {
      ok: true,
      contactId: contact.id,
      conversationId: conversation.id,
      messageId,
      contactCreated,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logCommerce("failed", { userId, triggerType: triggerType || null, error });
    return { ok: false, error };
  }
}

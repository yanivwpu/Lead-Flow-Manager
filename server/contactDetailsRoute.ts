import type { RequestHandler } from "express";
import type { Contact, Conversation, ActivityEvent } from "@shared/schema";
import { contactDetailsSuppressed, projectShopifyOrder, shopifyContactContext } from "@shared/contactDetails";
import { getContactDisplayChannel } from "@shared/contactChannelDisplay";
import { webchatSafeDisplayName, webchatPublicPhone } from "@shared/webchatContactIdentity";

/** Dependencies are explicit so ownership/privacy ordering can be tested without a database. */
export function createContactDetailsHandler(deps: {
  getContact: (id: string, userId: string) => Promise<Contact | undefined>;
  getConversations: (id: string, userId: string) => Promise<Conversation[]>;
  getActivityEvents: (id: string, userId: string, limit: number) => Promise<ActivityEvent[]>;
  isPrivacyLocked: (contact: Contact) => Promise<boolean>;
}): RequestHandler {
  return async (req, res) => {
    try {
      if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
      const contact = await deps.getContact(req.params.id, req.user.id);
      if (!contact || contact.userId !== req.user.id) { res.status(404).json({ error: "Not found" }); return; }
      if (contactDetailsSuppressed(contact) || await deps.isPrivacyLocked(contact)) {
        res.status(410).json({ error: "Customer data is unavailable following a privacy request." }); return;
      }
      const conversations = await deps.getConversations(contact.id, req.user.id);
      const events = await deps.getActivityEvents(contact.id, req.user.id, 200);
      const ownedEvents = events.filter(event => event.userId === req.user!.id);
      const orders = ownedEvents.filter(event => event.eventType === "shopify_order_created")
        .map(event => ({ id: event.id, ...projectShopifyOrder(event.eventData as Record<string, unknown>, event.createdAt) }));
      const context = shopifyContactContext(contact);
      res.json({
        contact: {
          id: contact.id, name: webchatSafeDisplayName(contact), email: contact.email, phone: webchatPublicPhone(contact),
          primaryChannel: contact.primaryChannel, primaryChannelOverride: contact.primaryChannelOverride,
          lastIncomingChannel: contact.lastIncomingChannel, source: contact.source,
          tag: contact.tag, pipelineStage: contact.pipelineStage, assignedTo: contact.assignedTo,
          leadScore: contact.leadScore, followUp: contact.followUp, followUpDate: contact.followUpDate,
          createdAt: contact.createdAt, updatedAt: contact.updatedAt,
        },
        conversations: conversations.filter(item => item.userId === req.user!.id)
          .map(item => ({ id: item.id, channel: item.channel })),
        displayChannel: getContactDisplayChannel(contact, conversations),
        orders, shopify: context.linked || orders.length > 0,
        commerceCustomer: { store: context.store || orders[0]?.store || null, ordersCount: context.ordersCount, totalSpent: context.totalSpent },
        // Webhook payloads and automation internals are never returned to the browser.
        activity: ownedEvents.map(event => ({ id: event.id, eventType: event.eventType, createdAt: event.createdAt })),
      });
    } catch {
      // Do not log raw customer records or privacy identities.
      console.error("[ContactDetails] read failed");
      res.status(500).json({ error: "Failed to fetch contact details" });
    }
  };
}

import type { Contact } from "@shared/schema";
import {
  buildWebchatLeadCustomFields,
  extractIdentityHints,
  isAnonymousWebchatVisitorName,
  isWebchatVisitorId,
  type WebchatLeadSource,
} from "@shared/agent/webchatLeadContext";
import { storage } from "./storage";

export async function syncWebchatContactIdentity(params: {
  userId: string;
  contact: Contact;
  inboundText: string;
  channelContactId: string;
  leadSource?: WebchatLeadSource;
}): Promise<Contact> {
  const { userId, inboundText, channelContactId, leadSource } = params;
  let contact = params.contact;
  const hints = extractIdentityHints(inboundText);
  if (!hints.email && !hints.phone && !hints.name) return contact;

  const updates: Partial<Contact> = {};
  const existingCf = (contact.customFields as Record<string, unknown> | undefined) || {};
  const customFields = buildWebchatLeadCustomFields(leadSource, channelContactId, existingCf);

  if (hints.email && (!contact.email || !contact.email.includes("@"))) {
    updates.email = hints.email;
  }

  if (hints.phone) {
    if (isWebchatVisitorId(contact.phone)) {
      customFields.webchatVisitorId = contact.phone;
      updates.phone = hints.phone;
    } else if (!contact.phone || isWebchatVisitorId(contact.phone)) {
      updates.phone = hints.phone;
    }
  }

  if (hints.name && isAnonymousWebchatVisitorName(contact.name)) {
    updates.name = hints.name;
  }

  if (Object.keys(customFields).length > 0) {
    updates.customFields = customFields;
  }

  if (Object.keys(updates).length === 0) return contact;

  const updated = await storage.updateContact(contact.id, updates);
  if (!updated) return contact;
  contact = updated;

  if (hints.email && isAnonymousWebchatVisitorName(contact.name)) {
    const byEmail = await storage.getContactByChannelId(userId, "calendly", hints.email);
    if (byEmail && byEmail.id !== contact.id) {
      const mergedCf = buildWebchatLeadCustomFields(
        leadSource,
        channelContactId,
        (byEmail.customFields as Record<string, unknown> | undefined) || {},
      );
      await storage.updateContact(byEmail.id, { customFields: mergedCf });
      contact = await storage.mergeContacts(byEmail.id, contact.id);
    }
  }

  return contact;
}

import type { Contact } from "@shared/schema";
import { buildWebchatLeadCustomFields, type WebchatLeadSource } from "@shared/agent/webchatLeadContext";
import { storage } from "./storage";

/**
 * Chat text is never a source of contact name/email/phone and never merges contacts.
 * Visitor UUID reuse is handled by getWebchatContactByVisitorId via getContactByChannelId.
 */
export async function syncWebchatContactIdentity(params: {
  userId: string;
  contact: Contact;
  inboundText: string;
  channelContactId: string;
  leadSource?: WebchatLeadSource;
}): Promise<Contact> {
  void params.userId;
  void params.inboundText;
  const { contact, channelContactId, leadSource } = params;
  const customFields = buildWebchatLeadCustomFields(
    leadSource,
    channelContactId,
    (contact.customFields as Record<string, unknown> | undefined) || {},
  );
  const prev = JSON.stringify(contact.customFields || {});
  const next = JSON.stringify(customFields);
  if (prev === next) return contact;
  const updated = await storage.updateContact(contact.id, { customFields });
  return updated || contact;
}

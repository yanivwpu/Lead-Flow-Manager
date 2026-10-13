import { and, eq, desc, sql, isNull } from 'drizzle-orm';
import { contacts, conversations, activityEvents, contactNotes, appointments, users } from '@shared/schema';
import { db } from '../drizzle/db';
import { customerPrivacyLocked } from './shopifyPrivacyRequests';
import { isShopifyLinked, shopifyDetailsSuppressed, buildContactDetails } from '@shared/contactDetails';

/** Ownership is part of the first SQL lookup; no related data is read on a miss. */
export async function loadContactDetails(userId: string, contactId: string, shopRedacted = false, database = db) {
  const [contact] = await database.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));
  if (!contact) return null;
  if (await contactDetailsPrivacyUnavailable(contact, database)) return null;
  const [convs, events, notes, appts] = await Promise.all([
    database.select().from(conversations).where(and(eq(conversations.contactId, contactId), eq(conversations.userId, userId))).orderBy(desc(conversations.lastMessageAt)),
    database.select().from(activityEvents).where(and(eq(activityEvents.contactId, contactId), eq(activityEvents.userId, userId))).orderBy(desc(activityEvents.createdAt)).limit(500),
    database.select().from(contactNotes).where(and(eq(contactNotes.contactId, contactId), eq(contactNotes.workspaceId, userId))).orderBy(desc(contactNotes.createdAt)),
    database.select().from(appointments).where(and(eq(appointments.contactId, contactId), eq(appointments.userId, userId))).orderBy(desc(appointments.createdAt)),
  ]);
  return buildContactDetails({ contact, conversations: convs, events, notes, appointments: appts, shopRedacted });
}

/** Timestamp compare at serialized millisecond precision; protects synced data and CRM edits. */
export function contactUpdateCondition(id: string, options?: { expectedWorkspaceUserId?: string; expectedUpdatedAt?: Date | null }) {
  return and(eq(contacts.id, id),
    options?.expectedWorkspaceUserId ? eq(contacts.userId, options.expectedWorkspaceUserId) : undefined,
    options && 'expectedUpdatedAt' in options ? options.expectedUpdatedAt === null
      ? isNull(contacts.updatedAt)
      : sql`date_trunc('milliseconds', ${contacts.updatedAt}) = ${options.expectedUpdatedAt!.toISOString()}::timestamp` : undefined);
}

export async function contactDetailsPrivacyUnavailable(contact: typeof contacts.$inferSelect, database = db) {
  const userId = contact.userId;
  if (isShopifyLinked(contact)) {
    const cf = (contact.customFields || {}) as Record<string, any>;
    const sd = (contact.sourceDetails || {}) as Record<string, any>;
    const [owner] = await database.select({ shop: users.shopifyShop, status: users.shopifySubscriptionStatus }).from(users).where(eq(users.id, userId));
    const shop = cf.shopifyShop || cf.lastCommerceMetadata?.shop || sd.shop || owner?.shop;
    if (owner?.status === 'redacted') return true;
    if (shopifyDetailsSuppressed(contact)) return true;
    if (shop && await customerPrivacyLocked(shop, { id: cf.shopifyCustomerId || sd.shopifyCustomerId, email: contact.email, phone: contact.phone }, database)) return true;
  }
  return false;
}

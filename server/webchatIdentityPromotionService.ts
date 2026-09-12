/**
 * Promote an anonymous Website Chat visitor to a CRM contact when two of
 * {name, email, phone} are validated. Workspace-scoped; never auto-merges.
 */

import type { Contact } from "@shared/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { contacts } from "@shared/schema";
import { db } from "../drizzle/db";
import { storage } from "./storage";
import { findContactsByEmail } from "./emailChannel/contactMatch";
import { isWebchatVisitorId, normalizeWebchatPhone } from "@shared/agent/webchatLeadContext";
import {
  collectValidatedIdentity,
  inboxOnlyWebchatSourceDetails,
  isInboxOnlyWebchatContact,
  mergeIdentityWithoutDowngrade,
  meetsWebchatPromotionThreshold,
  promotedWebchatSourceDetails,
  resolveIdentityContactConflict,
  stampPromotedWebchatIdentity,
} from "@shared/webchatIdentityPromotion";
import { isCrmListedContact } from "@shared/contactCrmVisibility";
import { isWebchatSourcedContact } from "@shared/webchatContactIdentity";

export async function maybePromoteWebchatVisitorIdentity(params: {
  userId: string;
  contactId: string;
  identifiedFrom?: string;
}): Promise<Contact | null> {
  const contact = await storage.getContact(params.contactId);
  if (!contact || contact.userId !== params.userId) return null;
  if (!isWebchatSourcedContact(contact)) return contact;
  if (isCrmListedContact(contact) && !isInboxOnlyWebchatContact(contact)) return contact;

  const identity = mergeIdentityWithoutDowngrade({
    current: { name: contact.name, email: contact.email, phone: contact.phone },
    incoming: collectValidatedIdentity({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
    }),
  });
  if (!meetsWebchatPromotionThreshold(identity)) return contact;

  const emailMatches = identity.email
    ? (await findContactsByEmail(params.userId, identity.email)).filter((row) => isCrmListedContact(row))
    : [];
  let phoneMatches: Array<{ id: string }> = [];
  if (identity.phone && !isWebchatVisitorId(identity.phone)) {
    const digits = normalizeWebchatPhone(identity.phone) || identity.phone.replace(/\D/g, "");
    if (digits) {
      phoneMatches = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, params.userId),
            ne(contacts.id, contact.id),
            sql`regexp_replace(coalesce(${contacts.phone}, ''), '[^0-9]', '', 'g') = ${digits}`,
          ),
        )
        .limit(8);
    }
  }
  const conflict = resolveIdentityContactConflict({
    visitorContactId: contact.id,
    emailMatches,
    phoneMatches,
  });
  const cf =
    contact.customFields && typeof contact.customFields === "object"
      ? { ...(contact.customFields as Record<string, unknown>) }
      : {};
  if (conflict) {
    cf.webchatIdentityConflict = {
      reason: conflict.reason,
      flaggedAt: new Date().toISOString(),
    };
    await storage.updateContact(contact.id, { customFields: cf }, { expectedWorkspaceUserId: params.userId });
    return (await storage.getContact(contact.id)) || contact;
  }

  const patch: Partial<Contact> = {
    customFields: stampPromotedWebchatIdentity(cf, { identifiedFrom: params.identifiedFrom || "identity_threshold" }),
    sourceDetails: promotedWebchatSourceDetails(contact.sourceDetails, {
      identifiedFrom: params.identifiedFrom || "identity_threshold",
    }),
  };
  if (identity.name && (!contact.name || !collectValidatedIdentity({ name: contact.name }).name)) {
    patch.name = identity.name;
  }
  if (identity.email && !collectValidatedIdentity({ email: contact.email }).email) {
    patch.email = identity.email;
  }
  if (identity.phone && !collectValidatedIdentity({ phone: contact.phone }).phone) {
    patch.phone = identity.phone;
  }
  await storage.updateContact(contact.id, patch, { expectedWorkspaceUserId: params.userId });
  return (await storage.getContact(contact.id)) || contact;
}

export function webchatCreateSourceDetails(extra?: Record<string, unknown>): Record<string, unknown> {
  return inboxOnlyWebchatSourceDetails(extra);
}

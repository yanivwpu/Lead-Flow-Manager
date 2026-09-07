import type { Contact } from "@shared/schema";
import { identityFromFormValues, type WebchatFormDefinition, type WebchatFormInboxSubmission } from "@shared/webchatStructuredForm";
import { isWebchatVisitorId } from "@shared/agent/webchatLeadContext";
import { buildWebchatFormContactPatch, type WebchatFormContactApplyContext } from "@shared/webchatFormContactPatch";
import { readStoredWebchatVisitorId } from "@shared/webchatContactLookup";
import { storage } from "./storage";
import { findContactsByEmail } from "./emailChannel/contactMatch";
import { and, eq, ne, sql } from "drizzle-orm";
import { contacts } from "@shared/schema";
import { db } from "../drizzle/db";

export type { WebchatFormContactApplyContext } from "@shared/webchatFormContactPatch";
export { buildWebchatFormContactPatch } from "@shared/webchatFormContactPatch";

async function flagPossibleDuplicates(params: {
  userId: string;
  contactId: string;
  email?: string;
  phone?: string;
  customFields: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const flags: Array<{ kind: "email" | "phone"; matchedContactCount: number; matchedContactIds: string[] }> = [];
  if (params.email) {
    const matches = (await findContactsByEmail(params.userId, params.email)).filter(
      (row) => row.id !== params.contactId,
    );
    if (matches.length > 0) {
      flags.push({
        kind: "email",
        matchedContactCount: matches.length,
        matchedContactIds: matches.map((row) => row.id),
      });
    }
  }
  if (params.phone && !isWebchatVisitorId(params.phone)) {
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, params.userId),
          ne(contacts.id, params.contactId),
          sql`regexp_replace(coalesce(${contacts.phone}, ''), '[^0-9]', '', 'g') = ${params.phone}`,
        ),
      )
      .limit(8);
    if (rows.length > 0) {
      flags.push({
        kind: "phone",
        matchedContactCount: rows.length,
        matchedContactIds: rows.map((row) => row.id),
      });
    }
  }
  if (flags.length === 0) return params.customFields;
  return {
    ...params.customFields,
    webchatPossibleDuplicates: flags,
  };
}

export async function applyWebchatFormToContact(params: {
  userId: string;
  contact: Contact;
  form: WebchatFormDefinition;
  values: Record<string, string | string[] | boolean>;
  submission: WebchatFormInboxSubmission;
  context?: WebchatFormContactApplyContext;
}): Promise<Contact> {
  if (params.contact.userId !== params.userId) return params.contact;
  const identity = identityFromFormValues(params.form, params.values);
  const visitorId = params.context?.visitorId || readStoredWebchatVisitorId(params.contact) || undefined;
  const updates = buildWebchatFormContactPatch({
    ...params,
    context: { ...params.context, visitorId },
  });
  const customFields = updates.customFields;
  updates.customFields = await flagPossibleDuplicates({
    userId: params.userId,
    contactId: params.contact.id,
    email: identity.email,
    phone: identity.phone,
    customFields,
  });
  const updated = await storage.updateContact(params.contact.id, updates);
  return updated || params.contact;
}

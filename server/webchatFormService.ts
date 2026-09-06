import type { Contact } from "@shared/schema";
import {
  identityFromFormValues,
  type WebchatFormDefinition,
  type WebchatFormInboxSubmission,
} from "@shared/webchatStructuredForm";
import { isAnonymousWebchatVisitorName, isWebchatVisitorId } from "@shared/agent/webchatLeadContext";
import { storage } from "./storage";

export async function applyWebchatFormToContact(params: {
  userId: string;
  contact: Contact;
  form: WebchatFormDefinition;
  values: Record<string, string | string[] | boolean>;
  submission: WebchatFormInboxSubmission;
}): Promise<Contact> {
  if (params.contact.userId !== params.userId) return params.contact;
  let contact = params.contact;
  const identity = identityFromFormValues(params.form, params.values);
  const existingCf = ((contact.customFields as Record<string, unknown> | null) || {}) as Record<string, unknown>;
  const customFields: Record<string, unknown> = { ...existingCf };
  const updates: Partial<Contact> = {};

  if (identity.email && (!contact.email || !String(contact.email).includes("@"))) {
    updates.email = identity.email;
  }
  if (identity.phone) {
    if (!contact.phone || isWebchatVisitorId(contact.phone)) {
      if (isWebchatVisitorId(contact.phone)) {
        customFields.webchatVisitorId = contact.phone;
      }
      updates.phone = identity.phone;
    }
  }
  if (identity.name && isAnonymousWebchatVisitorName(contact.name)) {
    updates.name = identity.name;
  }

  customFields.webchatForm = {
    formId: params.form.id,
    submittedAt: params.submission.submittedAt,
    fields: params.submission.fields,
    ...(params.submission.consent
      ? {
          consentAccepted: params.submission.consent.accepted,
          consentText: params.submission.consent.text,
          consentAt: params.submission.submittedAt,
        }
      : {}),
  };
  updates.customFields = customFields;
  const updated = await storage.updateContact(contact.id, updates);
  return updated || contact;
}

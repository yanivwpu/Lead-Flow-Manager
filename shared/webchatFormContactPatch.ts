import {
  identityFromFormValues,
  type WebchatFormDefinition,
  type WebchatFormInboxSubmission,
} from "./webchatStructuredForm";
import { isWebchatVisitorId } from "./agent/webchatLeadContext";
import { normalizeEmailAddress } from "./emailChannel";
import {
  isPlaceholderWebchatDisplayName,
  stampIdentifiedWebchatIdentity,
  webchatFormIdentifiedContact,
} from "./webchatContactIdentity";
import {
  collectValidatedIdentity,
  meetsWebchatPromotionThreshold,
  inboxOnlyWebchatSourceDetails,
  promotedWebchatSourceDetails,
} from "./webchatIdentityPromotion";
import {
  mergeWebchatVisitorSourceDetails,
  preserveWebchatVisitorIdentity,
  readStoredWebchatVisitorId,
} from "./webchatContactLookup";

export type WebchatFormContactApplyContext = {
  conversationId?: string | null;
  widgetPublicId?: string | null;
  formId?: string | null;
  visitorId?: string | null;
};

export type WebchatFormContactPatchInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  webchatId?: string | null;
  customFields?: unknown;
  sourceDetails?: unknown;
};

export function shouldWriteWebchatCanonicalName(
  contact: WebchatFormContactPatchInput,
  alreadyIdentified: boolean,
): boolean {
  const current = (contact.name || "").trim();
  if (!alreadyIdentified) return true;
  return isPlaceholderWebchatDisplayName(current);
}

export function shouldWriteWebchatCanonicalEmail(
  contact: WebchatFormContactPatchInput,
  alreadyIdentified: boolean,
): boolean {
  if (!alreadyIdentified) return true;
  return !normalizeEmailAddress(contact.email);
}

export function shouldWriteWebchatCanonicalPhone(
  contact: WebchatFormContactPatchInput,
  alreadyIdentified: boolean,
): boolean {
  const current = (contact.phone || "").trim();
  if (!alreadyIdentified) return true;
  return !current || isWebchatVisitorId(current);
}

export function buildWebchatFormContactPatch(params: {
  contact: WebchatFormContactPatchInput;
  form: WebchatFormDefinition;
  values: Record<string, string | string[] | boolean>;
  submission: WebchatFormInboxSubmission;
  context?: WebchatFormContactApplyContext;
}): {
  name?: string;
  email?: string;
  phone?: string;
  webchatId?: string;
  customFields: Record<string, unknown>;
  sourceDetails: Record<string, unknown>;
} {
  const identity = identityFromFormValues(params.form, params.values);
  const existingCf = ((params.contact.customFields as Record<string, unknown> | null) || {}) as Record<
    string,
    unknown
  >;
  const visitorId =
    (typeof params.context?.visitorId === "string" && params.context.visitorId.trim()) ||
    readStoredWebchatVisitorId(params.contact) ||
    "";
  let customFields: Record<string, unknown> = visitorId
    ? preserveWebchatVisitorIdentity(existingCf, visitorId)
    : { ...existingCf };
  const alreadyIdentified = webchatFormIdentifiedContact(params.contact);
  const mergedIdentity = collectValidatedIdentity({
    name: identity.name || params.contact.name,
    email: identity.email || params.contact.email,
    phone: identity.phone || params.contact.phone,
  });
  const promote = meetsWebchatPromotionThreshold(mergedIdentity);
  const updates: {
    name?: string;
    email?: string;
    phone?: string;
    webchatId?: string;
    customFields: Record<string, unknown>;
    sourceDetails: Record<string, unknown>;
  } = {
    customFields,
    sourceDetails: promote
      ? promotedWebchatSourceDetails(
          mergeWebchatVisitorSourceDetails(
            (params.contact.sourceDetails as Record<string, unknown> | undefined) || {},
            visitorId,
            { identifiedFrom: "webchat_form" },
          ),
          { identifiedFrom: "webchat_form" },
        )
      : inboxOnlyWebchatSourceDetails(
          mergeWebchatVisitorSourceDetails(
            (params.contact.sourceDetails as Record<string, unknown> | undefined) || {},
            visitorId,
            { webchatIdentityStatus: "anonymous" },
          ),
        ),
  };

  if (identity.email && shouldWriteWebchatCanonicalEmail(params.contact, alreadyIdentified)) {
    updates.email = identity.email;
  }
  if (identity.phone && shouldWriteWebchatCanonicalPhone(params.contact, alreadyIdentified)) {
    updates.phone = identity.phone;
  }
  if (identity.name && shouldWriteWebchatCanonicalName(params.contact, alreadyIdentified)) {
    updates.name = identity.name;
  }
  if (visitorId && !String(params.contact.webchatId || "").trim()) {
    updates.webchatId = visitorId;
  }

  const extras: Record<string, unknown> = {};
  for (const field of params.form.fields) {
    if (field.type === "name" || field.type === "email" || field.type === "phone" || field.type === "consent") {
      continue;
    }
    const value = params.values[field.id];
    if (value === undefined || value === "") continue;
    extras[field.id] = { type: field.type, label: field.label, value };
  }
  if (Object.keys(extras).length > 0) {
    customFields.webchatFormExtras = extras;
  }

  customFields.webchatForm = {
    formId: params.form.id,
    submittedAt: params.submission.submittedAt,
    fields: params.submission.fields,
  };

  if (params.submission.consent) {
    customFields.webchatConsent = {
      accepted: params.submission.consent.accepted,
      text: params.submission.consent.text,
      acceptedAt: params.submission.submittedAt,
      source: "webchat",
      conversationId: params.context?.conversationId || null,
      formId: params.form.id,
      policyVersion: params.form.id,
      ...(params.context?.widgetPublicId ? { widgetPublicId: params.context.widgetPublicId } : {}),
    };
  }

  if (promote) {
    customFields = stampIdentifiedWebchatIdentity(customFields, {
      identifiedAt: params.submission.submittedAt,
      identifiedFrom: "webchat_form",
      canonicalLocked: true,
    });
  }
  updates.customFields = customFields;
  return updates;
}

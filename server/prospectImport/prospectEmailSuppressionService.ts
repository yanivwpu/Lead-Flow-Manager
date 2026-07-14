/**
 * Persist suppression flags onto a contact (durable customFields).
 */
import type { Contact } from "@shared/schema";
import {
  buildProspectEmailSuppressionCustomFields,
  type ProspectEmailSuppressionReason,
} from "@shared/prospectEmailSuppression";
import { storage } from "../storage";
import { prospectBulkOutreachLog } from "@shared/prospectBulkOutreach";

export async function applyProspectEmailSuppression(params: {
  contactId: string;
  reason: ProspectEmailSuppressionReason;
  detail?: string;
  bouncedEmail?: string | null;
  source?: string;
}): Promise<{ updated: boolean; contact?: Contact }> {
  const contact = await storage.getContact(params.contactId);
  if (!contact) return { updated: false };

  const cf = (contact.customFields || {}) as Record<string, unknown>;
  // Idempotent: already suppressed for same reason type.
  if (
    (params.reason === "bounce" || params.reason === "invalid_recipient") &&
    (cf.emailBounced === true || cf.bounced === true)
  ) {
    return { updated: false, contact };
  }
  if (params.reason === "unsubscribe" && (cf.unsubscribed === true || cf.optOut === true)) {
    return { updated: false, contact };
  }

  const nextFields = buildProspectEmailSuppressionCustomFields(cf, {
    reason: params.reason,
    detail: params.detail,
    bouncedEmail: params.bouncedEmail,
  });

  const updated = await storage.updateContact(contact.id, {
    customFields: nextFields,
  } as any);

  console.info(
    JSON.stringify(
      prospectBulkOutreachLog("eligibility_rejected", {
        contactId: params.contactId,
        reason: params.reason,
        status: "suppressed",
        // safe fields only
        source: params.source || "unknown",
      }),
    ),
  );

  return { updated: true, contact: updated };
}

export async function suppressContactByEmailInWorkspace(params: {
  workspaceUserId: string;
  email: string;
  reason: ProspectEmailSuppressionReason;
  detail?: string;
  source?: string;
}): Promise<{ updated: number }> {
  const { findContactsByEmail } = await import("../emailChannel/contactMatch");
  const contacts = await findContactsByEmail(params.workspaceUserId, params.email);
  let updated = 0;
  for (const c of contacts) {
    const res = await applyProspectEmailSuppression({
      contactId: c.id,
      reason: params.reason,
      detail: params.detail,
      bouncedEmail: params.email,
      source: params.source,
    });
    if (res.updated) updated += 1;
  }
  return { updated };
}

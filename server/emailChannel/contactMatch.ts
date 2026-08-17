import { and, asc, eq, sql } from "drizzle-orm";
import { contacts, type Contact } from "@shared/schema";
import { normalizeEmailAddress } from "@shared/emailChannel";
import {
  looksLikeSystemOrNotificationEmail,
} from "@shared/aiDomainEligibility";
import {
  EMAIL_INBOX_IDENTITY_SOURCE,
  isEmailInboxIdentitySource,
} from "@shared/contactCrmVisibility";
import { db } from "../../drizzle/db";
import { storage } from "../storage";

export type EmailContactMatchResult =
  | { kind: "matched"; contact: Contact; ambiguous: boolean; candidates: number }
  | { kind: "created"; contact: Contact; crmListed: boolean }
  | { kind: "suppressed"; reason: string };

export type NewEmailContactKind = "crm" | "inbox_identity" | "drop";

const SUPPRESSED_LOCAL_PARTS = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "bounce",
  "notifications",
]);

/**
 * Legacy local-part suppressor (noreply / mailer-daemon).
 * New CRM creation uses `decideNewEmailContactKind` (content + From).
 */
export function shouldSuppressEmailContactCreation(email: string): string | null {
  const norm = normalizeEmailAddress(email);
  if (!norm) return "invalid_email";
  const local = norm.split("@")[0] || "";
  if (SUPPRESSED_LOCAL_PARTS.has(local) || local.startsWith("noreply") || local.startsWith("no-reply")) {
    return "noreply_or_system";
  }
  return null;
}

/**
 * Decide whether a *new* Email sender should become a CRM Contact.
 * Existing Contact match always happens first in `resolveEmailContact`.
 *
 * Chat channels never call this.
 */
export function decideNewEmailContactKind(input: {
  fromEmail?: string | null;
  inboundText?: string | null;
  direction: "inbound" | "outbound";
  isWebsiteForm?: boolean;
  isLeadCapture?: boolean;
}): NewEmailContactKind {
  const fromEmail = String(input.fromEmail || "").trim();
  if (!normalizeEmailAddress(fromEmail) && input.direction === "inbound" && !input.isWebsiteForm) {
    return "drop";
  }

  if (input.direction === "outbound") return "crm";
  if (input.isWebsiteForm || input.isLeadCapture) return "crm";

  const system = looksLikeSystemOrNotificationEmail({
    fromEmail,
    inboundText: input.inboundText,
    channel: "email",
  });
  if (system) return "inbox_identity";

  const localSuppress = shouldSuppressEmailContactCreation(fromEmail);
  if (localSuppress) return "inbox_identity";

  return "crm";
}

export async function findContactsByEmail(
  workspaceUserId: string,
  email: string,
): Promise<Contact[]> {
  const norm = normalizeEmailAddress(email);
  if (!norm) return [];
  return db
    .select()
    .from(contacts)
    .where(and(eq(contacts.userId, workspaceUserId), sql`lower(trim(${contacts.email})) = ${norm}`))
    .orderBy(asc(contacts.createdAt));
}

export function shouldPromoteInboxIdentityToCrm(input: {
  existingSource?: string | null;
  kind: NewEmailContactKind;
  direction: "inbound" | "outbound";
  isWebsiteForm?: boolean;
  isLeadCapture?: boolean;
}): boolean {
  if (!isEmailInboxIdentitySource(input.existingSource)) return false;
  return (
    input.kind === "crm" ||
    input.direction === "outbound" ||
    !!input.isWebsiteForm ||
    !!input.isLeadCapture
  );
}

export async function promoteInboxIdentityToCrm(
  contact: Contact,
  source: "email" | "website_form" | "import" | "gohighlevel",
): Promise<Contact> {
  if (!isEmailInboxIdentitySource(contact.source)) return contact;
  const prev =
    contact.sourceDetails && typeof contact.sourceDetails === "object"
      ? (contact.sourceDetails as Record<string, unknown>)
      : {};
  await storage.updateContact(contact.id, {
    source,
    sourceDetails: { ...prev, inboxIdentity: false, promotedFromInboxIdentity: true },
  } as any);
  return (await storage.getContact(contact.id)) || contact;
}

/**
 * Match inbound From address to a workspace contact.
 * Exact trim+lowercase only — no Gmail-dot / plus-alias collapsing.
 *
 * Existing Contact always wins (including inbox identities).
 * Suppression/inbox-identity applies only to NEW rows.
 */
export async function resolveEmailContact(params: {
  workspaceUserId: string;
  fromEmail: string;
  fromName?: string | null;
  mailboxEmail: string;
  direction: "inbound" | "outbound";
  /** When outbound, prefer linking to To recipient. */
  toEmail?: string | null;
  /**
   * Optional identity override for inbound (e.g. website form visitor from Reply-To).
   * When set, contact matching uses this instead of From.
   */
  identityEmail?: string | null;
  identityName?: string | null;
  inboundText?: string | null;
  isWebsiteForm?: boolean;
  isLeadCapture?: boolean;
}): Promise<EmailContactMatchResult> {
  const mailbox = normalizeEmailAddress(params.mailboxEmail);
  const identity = normalizeEmailAddress(params.identityEmail);
  const matchEmail =
    params.direction === "outbound"
      ? normalizeEmailAddress(params.toEmail) || normalizeEmailAddress(params.fromEmail)
      : identity || normalizeEmailAddress(params.fromEmail);

  if (!matchEmail) return { kind: "suppressed", reason: "missing_email" };
  if (mailbox && matchEmail === mailbox) {
    return { kind: "suppressed", reason: "internal_mailbox" };
  }

  const existing = await findContactsByEmail(params.workspaceUserId, matchEmail);
  if (existing.length > 0) {
    let contact = existing[0];
    const kind = decideNewEmailContactKind({
      fromEmail: params.fromEmail,
      inboundText: params.inboundText,
      direction: params.direction,
      isWebsiteForm: params.isWebsiteForm,
      isLeadCapture: params.isLeadCapture,
    });
    const shouldPromote = shouldPromoteInboxIdentityToCrm({
      existingSource: contact.source,
      kind,
      direction: params.direction,
      isWebsiteForm: params.isWebsiteForm,
      isLeadCapture: params.isLeadCapture,
    });
    if (shouldPromote) {
      contact = await promoteInboxIdentityToCrm(
        contact,
        params.isWebsiteForm ? "website_form" : "email",
      );
    }
    if (params.direction === "inbound") {
      const patch: Partial<Contact> = {
        lastIncomingChannel: "email",
        lastIncomingAt: new Date(),
      } as any;
      const hasSocial =
        !!contact.whatsappId || !!contact.instagramId || !!contact.facebookId || !!contact.telegramId;
      if (!hasSocial && !contact.primaryChannelOverride) {
        (patch as any).primaryChannel = "email";
      }
      await storage.updateContact(contact.id, patch);
    }
    if (existing.length > 1) {
      console.warn(
        JSON.stringify({
          tag: "[EmailContactMatch]",
          event: "ambiguous_email",
          workspaceUserId: params.workspaceUserId,
          candidates: existing.length,
          chosenContactId: contact.id,
        }),
      );
    }
    return {
      kind: "matched",
      contact: (await storage.getContact(contact.id)) || contact,
      ambiguous: existing.length > 1,
      candidates: existing.length,
    };
  }

  const kind = decideNewEmailContactKind({
    fromEmail: identity || params.fromEmail,
    inboundText: params.inboundText,
    direction: params.direction,
    isWebsiteForm: params.isWebsiteForm,
    isLeadCapture: params.isLeadCapture,
  });

  if (kind === "drop") {
    return { kind: "suppressed", reason: "invalid_email" };
  }

  const name =
    String(params.identityName || params.fromName || "").trim() ||
    matchEmail.split("@")[0] ||
    matchEmail;

  const crmListed = kind === "crm";
  const source = params.isWebsiteForm || params.isLeadCapture
    ? "website_form"
    : crmListed
      ? "email"
      : EMAIL_INBOX_IDENTITY_SOURCE;

  const created = await storage.createContact({
    userId: params.workspaceUserId,
    name,
    email: matchEmail,
    primaryChannel: "email",
    lastIncomingChannel: params.direction === "inbound" ? "email" : null,
    lastIncomingAt: params.direction === "inbound" ? new Date() : null,
    source,
    sourceDetails: crmListed
      ? params.isWebsiteForm
        ? { leadSource: "Website Form" }
        : {}
      : { inboxIdentity: true },
  } as any);

  console.log(
    JSON.stringify({
      tag: "[EmailContactMatch]",
      event: crmListed ? "crm_contact_created" : "inbox_identity_created",
      workspaceUserId: params.workspaceUserId,
      source,
    }),
  );

  return { kind: "created", contact: created, crmListed };
}

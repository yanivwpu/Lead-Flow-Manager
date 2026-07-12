import { and, asc, eq, sql } from "drizzle-orm";
import { contacts, type Contact } from "@shared/schema";
import { normalizeEmailAddress } from "@shared/emailChannel";
import { db } from "../../drizzle/db";
import { storage } from "../storage";

export type EmailContactMatchResult =
  | { kind: "matched"; contact: Contact; ambiguous: boolean; candidates: number }
  | { kind: "created"; contact: Contact }
  | { kind: "suppressed"; reason: string };

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

export function shouldSuppressEmailContactCreation(email: string): string | null {
  const norm = normalizeEmailAddress(email);
  if (!norm) return "invalid_email";
  const local = norm.split("@")[0] || "";
  if (SUPPRESSED_LOCAL_PARTS.has(local) || local.startsWith("noreply") || local.startsWith("no-reply")) {
    return "noreply_or_system";
  }
  return null;
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

/**
 * Match inbound From address to a workspace contact.
 * Exact trim+lowercase only — no Gmail-dot / plus-alias collapsing.
 */
export async function resolveEmailContact(params: {
  workspaceUserId: string;
  fromEmail: string;
  fromName?: string | null;
  mailboxEmail: string;
  direction: "inbound" | "outbound";
  /** When outbound, prefer linking to To recipient. */
  toEmail?: string | null;
}): Promise<EmailContactMatchResult> {
  const mailbox = normalizeEmailAddress(params.mailboxEmail);
  const matchEmail =
    params.direction === "outbound"
      ? normalizeEmailAddress(params.toEmail) || normalizeEmailAddress(params.fromEmail)
      : normalizeEmailAddress(params.fromEmail);

  if (!matchEmail) return { kind: "suppressed", reason: "missing_email" };
  if (mailbox && matchEmail === mailbox) {
    return { kind: "suppressed", reason: "internal_mailbox" };
  }

  const existing = await findContactsByEmail(params.workspaceUserId, matchEmail);
  if (existing.length > 0) {
    const contact = existing[0];
    // Update lastIncomingChannel for inbound without blindly overwriting primaryChannel.
    if (params.direction === "inbound") {
      const patch: Partial<Contact> = {
        lastIncomingChannel: "email",
        lastIncomingAt: new Date(),
      } as any;
      // Only set primaryChannel to email when contact has no stronger messaging identity.
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

  if (params.direction === "inbound") {
    const suppress = shouldSuppressEmailContactCreation(matchEmail);
    if (suppress) return { kind: "suppressed", reason: suppress };
  }

  const name =
    String(params.fromName || "").trim() ||
    matchEmail.split("@")[0] ||
    matchEmail;

  const created = await storage.createContact({
    userId: params.workspaceUserId,
    name,
    email: matchEmail,
    primaryChannel: "email",
    lastIncomingChannel: params.direction === "inbound" ? "email" : null,
    lastIncomingAt: params.direction === "inbound" ? new Date() : null,
    source: "email",
  } as any);

  return { kind: "created", contact: created };
}

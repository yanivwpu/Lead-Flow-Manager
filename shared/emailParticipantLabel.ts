import { normalizeEmailAddress } from "./emailChannel";

function cleanPersonName(raw: string | null | undefined): string {
  return String(raw || "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function ownerNameSet(names: Array<string | null | undefined> | undefined): Set<string> {
  return new Set(
    (names || [])
      .map((name) => cleanPersonName(name).toLowerCase())
      .filter(Boolean),
  );
}

/**
 * A Gmail display name is trustworthy only when it is a real person label,
 * not the address, local-part, connected mailbox owner, or encoded junk.
 */
export function isTrustworthyEmailDisplayName(
  rawName: string | null | undefined,
  participantEmail: string | null | undefined,
  mailboxOwnerNames?: Array<string | null | undefined>,
): boolean {
  const name = cleanPersonName(rawName);
  if (!name || name.includes("=?") || name.includes("@")) return false;
  const email = normalizeEmailAddress(participantEmail) || String(participantEmail || "").trim().toLowerCase();
  if (email && name.toLowerCase() === email) return false;
  const local = email.split("@")[0] || "";
  if (local && name.toLowerCase() === local) return false;
  if (ownerNameSet(mailboxOwnerNames).has(name.toLowerCase())) return false;
  return true;
}

/** Participant email: inbound From (or form identity), outbound To. Never the other party's address. */
export function emailParticipantAddress(input: {
  direction: "inbound" | "outbound";
  fromEmail?: string | null;
  toEmail?: string | null;
  identityEmail?: string | null;
}): string | null {
  if (input.direction === "outbound") {
    return normalizeEmailAddress(input.toEmail) || normalizeEmailAddress(input.fromEmail);
  }
  return normalizeEmailAddress(input.identityEmail) || normalizeEmailAddress(input.fromEmail);
}

/**
 * Label for a new email participant.
 * Inbound: trustworthy Gmail From name, else the sender address.
 * Outbound: trustworthy To name, else the recipient address.
 * Never uses the connected account's From name for an external recipient.
 */
export function resolveEmailParticipantDisplayName(input: {
  direction: "inbound" | "outbound";
  participantEmail: string;
  fromName?: string | null;
  toName?: string | null;
  identityName?: string | null;
  isWebsiteForm?: boolean;
  mailboxOwnerNames?: Array<string | null | undefined>;
}): string {
  const email =
    normalizeEmailAddress(input.participantEmail) || String(input.participantEmail || "").trim();
  if (input.isWebsiteForm && isTrustworthyEmailDisplayName(input.identityName, email, input.mailboxOwnerNames)) {
    return cleanPersonName(input.identityName);
  }
  const candidate = input.direction === "outbound" ? input.toName : input.fromName;
  if (isTrustworthyEmailDisplayName(candidate, email, input.mailboxOwnerNames)) {
    return cleanPersonName(candidate);
  }
  return email || "Unknown";
}

/** Inbox title for inbox-only participants. Saved contacts keep their managed name. */
export function inboxEmailParticipantTitle(input: {
  isInboxOnly: boolean;
  contactName?: string | null;
  contactEmail?: string | null;
  inboundFromName?: string | null;
  mailboxOwnerNames?: Array<string | null | undefined>;
}): string {
  const email = normalizeEmailAddress(input.contactEmail) || String(input.contactEmail || "").trim();
  if (!input.isInboxOnly) {
    return cleanPersonName(input.contactName) || email || "Unknown";
  }
  if (isTrustworthyEmailDisplayName(input.inboundFromName, email, input.mailboxOwnerNames)) {
    return cleanPersonName(input.inboundFromName);
  }
  return email || "Unknown";
}

export function nameCollidesWithConnectedAccount(input: {
  name?: string | null;
  workspaceOwnerName?: string | null;
  mailboxDisplayName?: string | null;
}): boolean {
  const name = cleanPersonName(input.name).toLowerCase();
  if (!name) return false;
  return ownerNameSet([input.workspaceOwnerName, input.mailboxDisplayName]).has(name);
}

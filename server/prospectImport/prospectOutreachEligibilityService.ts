/**
 * Async eligibility context for Prospect Bulk Outreach.
 * Loads mailbox / channel connection + suppression state for the pure resolver.
 */

import type { Contact } from "@shared/schema";
import { contactHasDoNotContact } from "../automationSendGuard";
import { getPrimaryEmailMailbox } from "../emailChannel/mailboxStore";
import { storage } from "../storage";
import {
  resolveProspectOutreachEligibility,
  resolveRecipientForChannel,
  type ProspectOutreachEligibilityInput,
} from "@shared/prospectOutreachEligibility";
import type {
  ProspectOutreachChannel,
  ProspectOutreachEligibilityResult,
  ProspectOutreachPreferredChannel,
} from "@shared/prospectBulkOutreach";
import { normalizeOutreachStatus } from "@shared/prospectOutreachLifecycle";
import { db } from "../../drizzle/db";
import { prospectIntelligence, prospectOutreachQueueItems } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";

export type WorkspaceChannelConnections = {
  emailConnected: boolean;
  emailMailboxId: string | null;
  smsConnected: boolean;
  whatsappConnected: boolean;
  facebookConnected: boolean;
  instagramConnected: boolean;
};

/**
 * Resolve Email sender availability the same way manual PI outreach does:
 * probe credentials (heals sticky needs_reconnect when tokens still work).
 * Do NOT gate only on raw syncStatus ∈ {connected, syncing} — that falsely rejects
 * mailboxes that still send successfully.
 */
export async function resolveEmailSenderForBulkOutreach(
  workspaceUserId: string,
): Promise<{ emailConnected: boolean; emailMailboxId: string | null }> {
  const mailbox = await getPrimaryEmailMailbox(workspaceUserId).catch(() => null);
  if (!mailbox) return { emailConnected: false, emailMailboxId: null };

  const { isEmailMailboxSyncStatusSendable } = await import("@shared/emailMailboxAvailability");
  if (!isEmailMailboxSyncStatusSendable(mailbox.syncStatus)) {
    return { emailConnected: false, emailMailboxId: null };
  }

  try {
    const { getValidMailboxAccessToken } = await import("../emailChannel/oauth");
    const { mailbox: fresh } = await getValidMailboxAccessToken(mailbox.id);
    return { emailConnected: true, emailMailboxId: fresh.id };
  } catch {
    return { emailConnected: false, emailMailboxId: null };
  }
}

export async function loadWorkspaceChannelConnections(
  workspaceUserId: string,
): Promise<WorkspaceChannelConnections> {
  const email = await resolveEmailSenderForBulkOutreach(workspaceUserId);

  const settings = await storage.getChannelSettings(workspaceUserId).catch(() => []);
  const byChannel = new Map(
    (settings || []).map((s) => [String(s.channel).toLowerCase(), s] as const),
  );

  const connected = (ch: string) => {
    const s = byChannel.get(ch);
    return !!(s && s.isConnected && s.isEnabled);
  };

  return {
    emailConnected: email.emailConnected,
    emailMailboxId: email.emailMailboxId,
    smsConnected: connected("sms"),
    whatsappConnected: connected("whatsapp"),
    facebookConnected: connected("facebook"),
    instagramConnected: connected("instagram"),
  };
}

export function contactSuppressionState(contact: Contact): {
  suppressed: boolean;
  optedOut: boolean;
  reason?: string;
} {
  const dnc = contactHasDoNotContact(contact);
  if (dnc.blocked) {
    return {
      suppressed: true,
      optedOut: dnc.reason === "unsubscribed",
      reason: dnc.detail || dnc.reason,
    };
  }
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  if (cf.emailBounced === true || cf.bounced === true || cf.suppressed === true) {
    return { suppressed: true, optedOut: false, reason: "bounced_or_suppressed_flag" };
  }
  return { suppressed: false, optedOut: false };
}

export async function hasActiveQueueItem(params: {
  workspaceUserId: string;
  contactId: string;
  channel?: ProspectOutreachChannel;
  /** Exclude the item currently being processed (send re-check). */
  excludeQueueItemId?: string;
}): Promise<boolean> {
  const rows = await db
    .select({
      id: prospectOutreachQueueItems.id,
      channel: prospectOutreachQueueItems.selectedChannel,
    })
    .from(prospectOutreachQueueItems)
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, params.workspaceUserId),
        eq(prospectOutreachQueueItems.contactId, params.contactId),
        inArray(prospectOutreachQueueItems.queueStatus, [
          "queued",
          "sending",
          "paused",
          "failed",
          "sent",
        ]),
      ),
    )
    .limit(50);

  const filtered = rows.filter((r) => r.id !== params.excludeQueueItemId);
  if (params.channel) {
    return filtered.some((r) => r.channel === params.channel);
  }
  return filtered.length > 0;
}

export async function resolveProspectOutreachEligibilityForContact(params: {
  contact: Contact;
  workspaceUserId: string;
  preferredChannel?: ProspectOutreachPreferredChannel;
  connections?: WorkspaceChannelConnections;
  excludeQueueItemId?: string;
  /** When true, ignore active-queue duplicate gate (send-time re-check of claimed item). */
  ignoreAlreadyQueued?: boolean;
}): Promise<{
  result: ProspectOutreachEligibilityResult;
  mailboxId: string | null;
  input: ProspectOutreachEligibilityInput;
}> {
  const connections =
    params.connections ?? (await loadWorkspaceChannelConnections(params.workspaceUserId));
  const piRows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, params.contact.id))
    .limit(1);
  const pi = piRows[0];
  const suppression = contactSuppressionState(params.contact);
  const alreadyQueued = params.ignoreAlreadyQueued
    ? false
    : await hasActiveQueueItem({
        workspaceUserId: params.workspaceUserId,
        contactId: params.contact.id,
        excludeQueueItemId: params.excludeQueueItemId,
      });

  const input: ProspectOutreachEligibilityInput = {
    reviewStatus: pi?.reviewStatus,
    outreachStatus: pi?.outreachStatus,
    outreachSentAt: pi?.outreachSentAt,
    repliedAt: pi?.repliedAt,
    analysisStatus: pi?.analysisStatus,
    needsReview: pi?.needsReview,
    email: params.contact.email,
    phone: params.contact.phone,
    whatsappId: params.contact.whatsappId,
    facebookId: params.contact.facebookId,
    instagramId: params.contact.instagramId,
    emailConnected: connections.emailConnected,
    smsConnected: connections.smsConnected,
    whatsappConnected: connections.whatsappConnected,
    facebookConnected: connections.facebookConnected,
    instagramConnected: connections.instagramConnected,
    smsConsent: false, // Phase 2: no SMS consent model for imported prospects
    whatsappConsent: false,
    suppressed: suppression.suppressed,
    optedOut: suppression.optedOut,
    alreadyQueued,
    preferredChannel: params.preferredChannel || "auto",
  };

  const result = resolveProspectOutreachEligibility(input);
  return { result, mailboxId: connections.emailMailboxId, input };
}

export function recipientIdentityForSelectedChannel(
  channel: ProspectOutreachChannel,
  contact: Contact,
): string | null {
  return resolveRecipientForChannel(channel, {
    email: contact.email,
    phone: contact.phone,
    whatsappId: contact.whatsappId,
  });
}

export function prospectAlreadyContacted(outreachStatus?: string | null): boolean {
  const s = normalizeOutreachStatus(outreachStatus);
  return s === "outreach_sent" || s === "replied";
}

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
import {
  detectPriorProspectOutreach,
  isProspectIntelligenceOutreachSubject,
  type PriorProspectOutreachEvidenceResult,
} from "@shared/prospectPriorOutreach";
import { normalizeOutreachStatus } from "@shared/prospectOutreachLifecycle";
import { db } from "../../drizzle/db";
import { messages, prospectIntelligence, prospectOutreachQueueItems } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { resolveProspectWebsiteUrl } from "./prospectWebsiteUrl";

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
  /** Stable machine reason: bounce | unsubscribe | dnc | suppressed | … */
  reason: string | null;
  detail: string | null;
} {
  const dnc = contactHasDoNotContact(contact);
  if (dnc.blocked) {
    const optedOut = dnc.reason === "unsubscribed";
    return {
      suppressed: true,
      optedOut,
      reason: optedOut ? "unsubscribe" : "dnc",
      detail: dnc.detail || dnc.reason || null,
    };
  }
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  if (cf.emailBounced === true || cf.bounced === true) {
    return {
      suppressed: true,
      optedOut: false,
      reason: "bounce",
      detail: String(cf.suppressionDetail || cf.suppressionReason || "bounce"),
    };
  }
  if (cf.suppressed === true) {
    const reason = String(cf.suppressionReason || "suppressed");
    const optedOut = reason === "unsubscribe" || cf.unsubscribed === true || cf.optOut === true;
    return {
      suppressed: true,
      optedOut,
      reason,
      detail: String(cf.suppressionDetail || reason),
    };
  }
  return { suppressed: false, optedOut: false, reason: null, detail: null };
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

/**
 * Gather all duplicate-protection signals for a prospect:
 * PI outreach_status / conversation linkage / prior queue sends /
 * existing "Idea for …" email threads with outbound (manual PI outreach).
 */
export async function loadPriorProspectOutreachEvidence(
  contactId: string,
): Promise<PriorProspectOutreachEvidenceResult> {
  const piRows = await db
    .select({
      outreachStatus: prospectIntelligence.outreachStatus,
      outreachConversationId: prospectIntelligence.outreachConversationId,
      outreachMessageId: prospectIntelligence.outreachMessageId,
      outreachSentAt: prospectIntelligence.outreachSentAt,
    })
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  const pi = piRows[0];

  const sentQueue = await db
    .select({ id: prospectOutreachQueueItems.id })
    .from(prospectOutreachQueueItems)
    .where(
      and(
        eq(prospectOutreachQueueItems.contactId, contactId),
        eq(prospectOutreachQueueItems.queueStatus, "sent"),
      ),
    )
    .limit(1);

  const withConvs = await storage.getContactWithConversations(contactId);
  const emailConversations: Array<{
    id: string;
    subject: string | null;
    hasOutbound: boolean;
    lastMessageAt: number;
  }> = [];

  for (const conv of withConvs?.conversations || []) {
    if (String(conv.channel) !== "email") continue;
    if (!isProspectIntelligenceOutreachSubject(conv.subject)) continue;
    const outbound = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, conv.id), eq(messages.direction, "outbound")))
      .limit(1);
    emailConversations.push({
      id: conv.id,
      subject: conv.subject,
      hasOutbound: outbound.length > 0,
      lastMessageAt: conv.lastMessageAt?.getTime?.() ?? 0,
    });
  }
  // Prefer earliest PI outreach thread (manual first send) when multiple exist.
  emailConversations.sort((a, b) => a.lastMessageAt - b.lastMessageAt);

  return detectPriorProspectOutreach({
    outreachStatus: pi?.outreachStatus,
    outreachConversationId: pi?.outreachConversationId,
    outreachMessageId: pi?.outreachMessageId,
    outreachSentAt: pi?.outreachSentAt,
    emailConversations,
    hasSuccessfulQueueSend: sentQueue.length > 0,
  });
}

export async function resolveProspectOutreachEligibilityForContact(params: {
  contact: Contact;
  workspaceUserId: string;
  preferredChannel?: ProspectOutreachPreferredChannel;
  connections?: WorkspaceChannelConnections;
  excludeQueueItemId?: string;
  /** When true, ignore active-queue duplicate gate (send-time re-check of claimed item). */
  ignoreAlreadyQueued?: boolean;
  /** Explicit resend bypass (future Autopilot / operator override). */
  forceResend?: boolean;
}): Promise<{
  result: ProspectOutreachEligibilityResult;
  mailboxId: string | null;
  input: ProspectOutreachEligibilityInput;
  priorOutreach: PriorProspectOutreachEvidenceResult;
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

  let priorOutreach = await loadPriorProspectOutreachEvidence(params.contact.id);
  if (params.forceResend) {
    priorOutreach = { alreadyContacted: false, reason: "ok" };
  }

  // Heal stuck Approved / not_sent when a prior PI outreach conversation exists.
  if (
    priorOutreach.alreadyContacted &&
    priorOutreach.conversationId &&
    pi &&
    normalizeOutreachStatus(pi.outreachStatus, {
      outreachSentAt: pi.outreachSentAt,
      repliedAt: pi.repliedAt,
    }) === "not_sent"
  ) {
    try {
      const { markProspectOutreachSent } = await import("./prospectIntelligenceService");
      await markProspectOutreachSent({
        contactId: params.contact.id,
        conversationId: priorOutreach.conversationId,
        source: "queue_eligibility_prior_outreach_reconcile",
      });
    } catch {
      /* non-fatal — still block queue */
    }
  }

  const input: ProspectOutreachEligibilityInput = {
    reviewStatus: pi?.reviewStatus,
    outreachStatus: priorOutreach.alreadyContacted
      ? priorOutreach.reason === "already_replied"
        ? "replied"
        : "outreach_sent"
      : pi?.outreachStatus,
    outreachSentAt: pi?.outreachSentAt,
    repliedAt: pi?.repliedAt,
    analysisStatus: pi?.analysisStatus,
    needsReview: pi?.needsReview,
    enrichmentStatus: pi?.enrichmentStatus,
    websiteUrl: resolveProspectWebsiteUrl(params.contact),
    websiteUrlUsed: pi?.websiteUrlUsed,
    notQualified: String(pi?.recommendedOffer || "").toLowerCase() === "not_a_fit",
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
    suppressionDetail: suppression.detail || suppression.reason || null,
    alreadyQueued,
    preferredChannel: params.preferredChannel || "auto",
  };

  const result = resolveProspectOutreachEligibility(input);
  return { result, mailboxId: connections.emailMailboxId, input, priorOutreach };
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

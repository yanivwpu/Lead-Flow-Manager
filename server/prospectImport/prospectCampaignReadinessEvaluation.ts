/** Read-only queue-entry evaluation. Review and preview consume the same batch result. */
import type { Contact, prospectIntelligence } from "@shared/schema";
import {
  buildQueueDedupKey,
  normalizeRecipientIdentity,
  prospectOutreachEligibilityReasonLabel,
  type ProspectOutreachChannel,
  type ProspectOutreachEligibilityReason,
  type ProspectOutreachPreferredChannel,
  type ProspectOutreachQueuePreview,
} from "@shared/prospectBulkOutreach";
import { resolveProspectOutreachEligibility, resolveRecipientForChannel, type ProspectOutreachEligibilityInput } from "@shared/prospectOutreachEligibility";
import { messageCreationUsesTemplate, normalizeMessageCreationForSave, type ProspectMessageCreationSettings } from "@shared/prospectMessageCreation";
import type { WorkspaceChannelConnections } from "./prospectOutreachEligibilityService";
import type { PriorProspectOutreachEvidenceResult } from "@shared/prospectPriorOutreach";

export type ProspectCampaignReadiness = {
  campaignReady: boolean;
  campaignReadyBlockCode: ProspectOutreachEligibilityReason | null;
  campaignReadyBlockLabel: string | null;
};

/** Validate the active mode exactly as settings persistence does; never generate AI on reads. */
export function canGenerateCampaignMessage(settings: ProspectMessageCreationSettings): boolean {
  if (!messageCreationUsesTemplate(settings.mode)) return false;
  try {
    normalizeMessageCreationForSave(settings);
    return true;
  } catch {
    return false;
  }
}

/** Also used by the existing per-contact send-time resolver. */
export function buildProspectOutreachEligibilityInput(params: {
  contact: Contact;
  intelligence?: Partial<typeof prospectIntelligence.$inferSelect>;
  priorOutreach: PriorProspectOutreachEvidenceResult;
  connections: WorkspaceChannelConnections;
  suppression: { suppressed: boolean; optedOut: boolean; detail: string | null; reason: string | null };
  alreadyQueued: boolean;
  preferredChannel?: ProspectOutreachPreferredChannel;
  websiteUrl: string | null;
  messageWillBeGenerated?: boolean;
}): ProspectOutreachEligibilityInput {
  const { contact, intelligence: pi, priorOutreach, connections, suppression } = params;
  return {
    reviewStatus: pi?.reviewStatus,
    approvedAt: pi?.approvedAt,
    approvedByUserId: pi?.approvedByUserId,
    enrichmentTriggeredBy: pi?.enrichmentTriggeredBy,
    outreachStatus: priorOutreach.alreadyContacted
      ? priorOutreach.reason === "already_replied" ? "replied" : "outreach_sent"
      : pi?.outreachStatus,
    outreachSentAt: pi?.outreachSentAt,
    repliedAt: pi?.repliedAt,
    analysisStatus: pi?.analysisStatus,
    needsReview: pi?.needsReview,
    enrichmentStatus: pi?.enrichmentStatus,
    websiteUrl: params.websiteUrl,
    websiteUrlUsed: pi?.websiteUrlUsed,
    notQualified: String(pi?.recommendedOffer || "").toLowerCase() === "not_a_fit",
    email: contact.email,
    phone: contact.phone,
    whatsappId: contact.whatsappId,
    facebookId: contact.facebookId,
    instagramId: contact.instagramId,
    emailConnected: connections.emailConnected,
    smsConnected: connections.smsConnected,
    whatsappConnected: connections.whatsappConnected,
    facebookConnected: connections.facebookConnected,
    instagramConnected: connections.instagramConnected,
    smsConsent: false,
    whatsappConsent: false,
    suppressed: suppression.suppressed,
    optedOut: suppression.optedOut,
    suppressionDetail: suppression.detail || suppression.reason || null,
    automationsPaused: contact.automationsPaused === true,
    alreadyQueued: params.alreadyQueued,
    preferredChannel: params.preferredChannel || "auto",
    suggestedFirstMessage: pi?.suggestedFirstMessage,
    suggestedOutreachSubject: pi?.suggestedOutreachSubject,
    messageWillBeGenerated: params.messageWillBeGenerated,
  };
}

export type CampaignReadinessCandidate = {
  contactId: string;
  name?: string;
  input: ProspectOutreachEligibilityInput;
  lifecycleStatus?: string | null;
  emailSenderFailureDetail?: string;
};
export type CampaignReadinessQueueEntry = {
  contactId: string;
  selectedChannel: string;
  recipientIdentity: string;
  queueStatus: string;
  dedupKey: string;
};

export const CAMPAIGN_DUPLICATE_QUEUE_STATUSES = ["queued", "sending", "paused", "failed", "sent"] as const;

/** No DB calls in the loop. Stable contact-ID order chooses one recipient per evaluated set. */
export function evaluateProspectCampaignReadinessBatch(params: {
  contactIds: string[];
  workspaceUserId: string;
  candidates: Map<string, CampaignReadinessCandidate>;
  queueEntries: CampaignReadinessQueueEntry[];
  preferredChannel: ProspectOutreachPreferredChannel;
  messageSettings: ProspectMessageCreationSettings;
}) {
  const ids = [...new Set(params.contactIds.filter(Boolean))];
  const readiness = new Map<string, ProspectCampaignReadiness>();
  const skips: ProspectOutreachQueuePreview["skips"] = [];
  const eligibleByChannel: Partial<Record<ProspectOutreachChannel, number>> = {};
  const campaignContacts = new Set(params.queueEntries.map((q) => q.contactId));
  const occupiedRecipients = new Set<string>();
  const occupiedKeys = new Set<string>();
  for (const q of params.queueEntries) {
    if (!(CAMPAIGN_DUPLICATE_QUEUE_STATUSES as readonly string[]).includes(q.queueStatus)) continue;
    occupiedRecipients.add(`${q.selectedChannel}:${normalizeRecipientIdentity(q.selectedChannel as ProspectOutreachChannel, q.recipientIdentity)}`);
    if (q.queueStatus !== "sent") occupiedKeys.add(q.dedupKey);
  }
  const usesTemplate = messageCreationUsesTemplate(params.messageSettings.mode);
  const messageWillBeGenerated = canGenerateCampaignMessage(params.messageSettings);
  let notBulkEligible = 0;
  let willQueue = 0;
  const block = (id: string, reason: ProspectOutreachEligibilityReason, detail?: string) => {
    const label = prospectOutreachEligibilityReasonLabel(reason, detail);
    readiness.set(id, { campaignReady: false, campaignReadyBlockCode: reason, campaignReadyBlockLabel: label });
    skips.push({ contactId: id, name: params.candidates.get(id)?.name, reason, detail, reasonLabel: label });
  };
  for (const id of [...ids].sort()) {
    const candidate = params.candidates.get(id);
    if (!candidate) { block(id, "missing_identity", "contact_not_found"); continue; }
    if (String(candidate.lifecycleStatus || "active").trim().toLowerCase() !== "active") {
      block(id, "inactive_prospect"); continue;
    }
    const input = { ...candidate.input, preferredChannel: params.preferredChannel, messageWillBeGenerated };
    const result = resolveProspectOutreachEligibility(input);
    if (!result.anyEligible || !result.selectedChannel) {
      const reason = result.summaryReason || result.channels.email.reason || "not_enabled_for_bulk";
      block(id, reason, result.channels.email.detail ||
        (reason === "sender_not_connected" ? candidate.emailSenderFailureDetail : undefined));
      if (["not_enabled_for_bulk", "unsupported_for_cold_outreach", "existing_conversation_only", "missing_consent", "template_required", "policy_blocked"].includes(reason)) notBulkEligible++;
      continue;
    }
    if (campaignContacts.has(id)) { block(id, "already_in_campaign"); continue; }
    const channel = result.selectedChannel;
    const recipient = resolveRecipientForChannel(channel, input);
    if (!recipient) { block(id, "missing_identity"); continue; }
    const key = buildQueueDedupKey({ workspaceUserId: params.workspaceUserId, contactId: id, channel, recipientIdentity: recipient });
    if (occupiedKeys.has(key)) { block(id, "dedup_key_collision"); continue; }
    const recipientKey = `${channel}:${normalizeRecipientIdentity(channel, recipient)}`;
    if (occupiedRecipients.has(recipientKey)) { block(id, "duplicate_recipient"); continue; }
    if (usesTemplate ? !messageWillBeGenerated : !String(input.suggestedFirstMessage || "").trim()) {
      block(id, "missing_message_snapshot"); continue;
    }
    occupiedRecipients.add(recipientKey);
    occupiedKeys.add(key);
    readiness.set(id, { campaignReady: true, campaignReadyBlockCode: null, campaignReadyBlockLabel: null });
    willQueue++;
    eligibleByChannel[channel] = (eligibleByChannel[channel] || 0) + 1;
  }
  const preview: ProspectOutreachQueuePreview = { selectedCount: ids.length, willQueue, skips, eligibleByChannel, notBulkEligible, preferredChannel: params.preferredChannel };
  return { readiness, preview };
}

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { contacts, prospectIntelligence, prospectOutreachQueueItems, prospectAiOutcomes, type Contact } from "@shared/schema";
import { PROSPECT_OUTREACH_DEFAULT_SETTINGS, normalizeRecipientIdentity, buildQueueDedupKey, PROSPECT_OUTREACH_CHANNELS, type ProspectOutreachPreferredChannel } from "@shared/prospectBulkOutreach";
import { resolveRecipientForChannel } from "@shared/prospectOutreachEligibility";
import { db } from "../../drizzle/db";
import { batchLoadPriorOutreachFlags, contactSuppressionState, loadWorkspaceChannelConnections, type PriorOutreachListFlags } from "./prospectOutreachEligibilityService";
import { resolveProspectWebsiteUrl } from "./prospectWebsiteUrl";
import { buildProspectOutreachEligibilityInput, CAMPAIGN_DUPLICATE_QUEUE_STATUSES, evaluateProspectCampaignReadinessBatch, type CampaignReadinessCandidate } from "./prospectCampaignReadinessEvaluation";

/** Constant number of batch reads for up to the Review list limit; no per-row DB/API calls. */
export async function batchEvaluateProspectCampaignReadiness(params: {
  contactIds: string[];
  workspaceUserId: string;
  preferredChannel?: ProspectOutreachPreferredChannel;
  /** Reuse the Review list's already-loaded records and prior-outreach evidence. */
  context?: {
    contacts: Map<string, Contact>;
    intelligence: Map<string, typeof prospectIntelligence.$inferSelect>;
    priorOutreach: Map<string, PriorOutreachListFlags>;
  };
}) {
  const ids = [...new Set(params.contactIds.filter(Boolean))];
  if (!ids.length) return evaluateProspectCampaignReadinessBatch({
    contactIds: [], workspaceUserId: params.workspaceUserId, candidates: new Map(), queueEntries: [],
    preferredChannel: params.preferredChannel || "auto", messageSettings: PROSPECT_OUTREACH_DEFAULT_SETTINGS.outreachInstructions,
  });
  const idSet = new Set(ids);
  const { getOutreachSettings } = await import("./prospectOutreachQueueService");
  const [settings, connections, contactRows, piRows, priorFlags, outcomes] = await Promise.all([
    getOutreachSettings(params.workspaceUserId),
    loadWorkspaceChannelConnections(params.workspaceUserId),
    params.context ? [...params.context.contacts.values()].filter((c) => idSet.has(c.id)) : ids.length ? db.select().from(contacts).where(and(eq(contacts.userId, params.workspaceUserId), inArray(contacts.id, ids))) : [],
    params.context ? [...params.context.intelligence.values()].filter((p) => idSet.has(p.contactId)) : ids.length ? db.select().from(prospectIntelligence).where(inArray(prospectIntelligence.contactId, ids)) : [],
    params.context ? params.context.priorOutreach : batchLoadPriorOutreachFlags(ids),
    ids.length ? db.select().from(prospectAiOutcomes).where(and(eq(prospectAiOutcomes.workspaceUserId, params.workspaceUserId), inArray(prospectAiOutcomes.contactId, ids))) : [],
  ]);
  const piById = new Map(piRows.map((p) => [p.contactId, p]));
  const outcomesById = new Map(outcomes.map((o) => [o.contactId, o.prospectOutcome]));
  const recipients = new Set<string>();
  const dedupKeys = new Set<string>();
  for (const contact of contactRows) {
    for (const channel of PROSPECT_OUTREACH_CHANNELS) {
      const recipient = resolveRecipientForChannel(channel, contact);
      if (!recipient) continue;
      recipients.add(normalizeRecipientIdentity(channel, recipient));
      dedupKeys.add(buildQueueDedupKey({ workspaceUserId: params.workspaceUserId, contactId: contact.id, channel, recipientIdentity: recipient }));
    }
  }
  const queueEntries = ids.length ? await db.select().from(prospectOutreachQueueItems).where(and(
    eq(prospectOutreachQueueItems.workspaceUserId, params.workspaceUserId),
    or(
      inArray(prospectOutreachQueueItems.contactId, ids),
      and(
        inArray(prospectOutreachQueueItems.queueStatus, [...CAMPAIGN_DUPLICATE_QUEUE_STATUSES]),
        or(
          recipients.size ? inArray(prospectOutreachQueueItems.recipientIdentityNormalized, [...recipients]) : sql`false`,
          recipients.size ? inArray(sql<string>`lower(trim(${prospectOutreachQueueItems.recipientIdentity}))`, [...recipients]) : sql`false`,
          dedupKeys.size ? inArray(prospectOutreachQueueItems.dedupKey, [...dedupKeys]) : sql`false`,
        ),
      ),
    ),
  )) : [];
  const queuedContacts = new Set(queueEntries.filter((q) => (CAMPAIGN_DUPLICATE_QUEUE_STATUSES as readonly string[]).includes(q.queueStatus)).map((q) => q.contactId));
  const candidates = new Map<string, CampaignReadinessCandidate>();
  for (const contact of contactRows) {
    if (contact.userId !== params.workspaceUserId) continue;
    const pi = piById.get(contact.id);
    const prior = priorFlags.get(contact.id);
    const input = buildProspectOutreachEligibilityInput({
      contact, intelligence: pi, connections,
      priorOutreach: { alreadyContacted: prior?.priorOutreachDetected === true, reason: prior?.reason || "ok" },
      suppression: contactSuppressionState(contact),
      alreadyQueued: queuedContacts.has(contact.id),
      preferredChannel: params.preferredChannel || settings.preferredChannel,
      websiteUrl: resolveProspectWebsiteUrl(contact),
    });
    input.outcome = outcomesById.get(contact.id);
    candidates.set(contact.id, {
      contactId: contact.id,
      name: contact.name,
      input,
      lifecycleStatus: pi?.lifecycleStatus,
      emailSenderFailureDetail: connections.emailFailureClass
        ? connections.emailDecryptField
          ? `${connections.emailFailureClass}:${connections.emailDecryptField}`
          : connections.emailFailureClass
        : undefined,
    });
  }
  return evaluateProspectCampaignReadinessBatch({ contactIds: ids, workspaceUserId: params.workspaceUserId, candidates, queueEntries, preferredChannel: params.preferredChannel || settings.preferredChannel, messageSettings: settings.outreachInstructions });
}

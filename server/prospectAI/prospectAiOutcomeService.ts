/**
 * Prospect AI Won / outcome tracking.
 * Workspace-scoped: other workspaces cannot read or modify outcomes.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  contacts,
  prospectAiDiscoveryResults,
  prospectAiOutcomes,
  prospectIntelligence,
  users,
  type Contact,
  type ProspectAiOutcomeRow,
} from "@shared/schema";
import {
  PROSPECT_AI_QUALIFIED_OUTCOMES,
  PROSPECT_AI_WON_ACTIVITY_EVENT,
  buildProspectAiWonStats,
  computeProspectAiOutreachFlags,
  isProspectAiAttributedContact,
  isProspectAiOutcome,
  resolveProspectAiWonTimeRangeStart,
  type ProspectAiOutcome,
  type ProspectAiWonCustomer,
  type ProspectAiWonStats,
  type ProspectAiWonTimeRange,
} from "@shared/prospectAI";
import { db } from "../../drizzle/db";
import { storage } from "../storage";
import { channelService } from "../channelService";
import { ProspectAiError } from "./prospectAIService";

export { isProspectAiAttributedContact };

export type WonListFilter = ProspectAiWonTimeRange;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function extractDiscoveryIds(contact: Contact): {
  discoveryResultId: string | null;
  discoverySearchId: string | null;
} {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const pai = (sd.prospectAi || cf.prospectAi || sd.prospectImport || cf.prospectImport) as
    | Record<string, unknown>
    | undefined;
  return {
    discoveryResultId: pai ? String(pai.discoveryResultId || "").trim() || null : null,
    discoverySearchId: pai ? String(pai.discoverySearchId || "").trim() || null : null,
  };
}

function extractSourceLabel(contact: Contact): string | null {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const pai = (sd.prospectAi || cf.prospectAi) as Record<string, unknown> | undefined;
  if (pai && typeof pai === "object") {
    const label = String(pai.sourceLabel || pai.batchName || "").trim();
    if (label) return label;
  }
  if (String(sd.prospectImportProvider || "").trim() === "prospect_ai") return "Prospect AI";
  return contact.source ? String(contact.source) : null;
}

async function assertContactInWorkspace(
  workspaceUserId: string,
  contactId: string,
): Promise<Contact> {
  const contact = await storage.getContact(contactId);
  if (!contact || contact.userId !== workspaceUserId) {
    throw new ProspectAiError("Contact not found in this workspace", "not_found", 404);
  }
  return contact;
}

/**
 * True when contact carries Prospect AI provenance markers
 * (provider, prospectAi meta, or discovery ids). See shared helper docs.
 */
export function isProspectAiAttributed(contact: Contact | null | undefined): boolean {
  return isProspectAiAttributedContact(contact);
}

async function loadAttributedContactIds(workspaceUserId: string): Promise<Set<string>> {
  const ids = new Set<string>();

  const discoveryLinked = await db
    .select({ contactId: prospectAiDiscoveryResults.contactId })
    .from(prospectAiDiscoveryResults)
    .where(
      and(
        eq(prospectAiDiscoveryResults.workspaceUserId, workspaceUserId),
        sql`${prospectAiDiscoveryResults.contactId} IS NOT NULL`,
      ),
    );
  for (const row of discoveryLinked) {
    if (row.contactId) ids.add(row.contactId);
  }

  const workspaceContacts = await storage.getContacts(workspaceUserId, 50000);
  for (const c of workspaceContacts) {
    if (isProspectAiAttributed(c)) ids.add(c.id);
  }

  return ids;
}

export async function ensureOutcomeRow(
  workspaceUserId: string,
  contactId: string,
  actorUserId?: string | null,
): Promise<ProspectAiOutcomeRow> {
  const contact = await assertContactInWorkspace(workspaceUserId, contactId);

  const existing = await db
    .select()
    .from(prospectAiOutcomes)
    .where(
      and(
        eq(prospectAiOutcomes.contactId, contactId),
        eq(prospectAiOutcomes.workspaceUserId, workspaceUserId),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const { discoveryResultId, discoverySearchId } = extractDiscoveryIds(contact);
  const [pi] = await db
    .select({
      outreachSentAt: prospectIntelligence.outreachSentAt,
      repliedAt: prospectIntelligence.repliedAt,
    })
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);

  const now = new Date();
  const [inserted] = await db
    .insert(prospectAiOutcomes)
    .values({
      contactId,
      workspaceUserId,
      prospectOutcome: "active",
      outcomeUpdatedAt: now,
      outcomeUpdatedByUserId: actorUserId || null,
      sourceEngine: "prospect_ai",
      discoveryResultId,
      discoverySearchId,
      prospectIntelligenceContactId: contactId,
      firstOutreachAt: pi?.outreachSentAt ?? null,
      firstReplyAt: pi?.repliedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) return inserted;

  const again = await db
    .select()
    .from(prospectAiOutcomes)
    .where(
      and(
        eq(prospectAiOutcomes.contactId, contactId),
        eq(prospectAiOutcomes.workspaceUserId, workspaceUserId),
      ),
    )
    .limit(1);
  if (!again[0]) {
    throw new ProspectAiError("Failed to create outcome row", "invalid_input", 500);
  }
  return again[0];
}

export async function getProspectOutcome(
  workspaceUserId: string,
  contactId: string,
): Promise<ProspectAiOutcomeRow | null> {
  await assertContactInWorkspace(workspaceUserId, contactId);
  const [row] = await db
    .select()
    .from(prospectAiOutcomes)
    .where(
      and(
        eq(prospectAiOutcomes.contactId, contactId),
        eq(prospectAiOutcomes.workspaceUserId, workspaceUserId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function setProspectOutcome(params: {
  workspaceUserId: string;
  contactId: string;
  outcome: ProspectAiOutcome | string;
  actorUserId: string;
}): Promise<ProspectAiOutcomeRow> {
  const { workspaceUserId, contactId, actorUserId } = params;
  if (!isProspectAiOutcome(params.outcome)) {
    throw new ProspectAiError("Invalid prospect outcome", "invalid_input", 400);
  }
  const outcome = params.outcome;
  const contact = await assertContactInWorkspace(workspaceUserId, contactId);
  if (!isProspectAiAttributed(contact)) {
    throw new ProspectAiError("Contact is not attributed to Prospect AI", "forbidden", 403);
  }

  const now = new Date();
  await ensureOutcomeRow(workspaceUserId, contactId, actorUserId);

  const patch: Partial<typeof prospectAiOutcomes.$inferInsert> = {
    prospectOutcome: outcome,
    outcomeUpdatedAt: now,
    outcomeUpdatedByUserId: actorUserId,
    updatedAt: now,
  };

  if (outcome === "won") {
    patch.wonAt = now;
    patch.wonByUserId = actorUserId;
  } else {
    patch.wonAt = null;
    patch.wonByUserId = null;
  }

  if ((PROSPECT_AI_QUALIFIED_OUTCOMES as readonly string[]).includes(outcome)) {
    patch.qualifiedAt = now;
  }

  const [updated] = await db
    .update(prospectAiOutcomes)
    .set(patch)
    .where(
      and(
        eq(prospectAiOutcomes.contactId, contactId),
        eq(prospectAiOutcomes.workspaceUserId, workspaceUserId),
      ),
    )
    .returning();

  if (!updated) {
    throw new ProspectAiError("Failed to update outcome", "invalid_input", 500);
  }
  return updated;
}

export async function markProspectAsWon(params: {
  workspaceUserId: string;
  contactId: string;
  actorUserId: string;
}): Promise<ProspectAiOutcomeRow> {
  const { workspaceUserId, contactId, actorUserId } = params;
  const contact = await assertContactInWorkspace(workspaceUserId, contactId);
  if (!isProspectAiAttributed(contact)) {
    throw new ProspectAiError("Contact is not attributed to Prospect AI", "forbidden", 403);
  }

  const row = await setProspectOutcome({
    workspaceUserId,
    contactId,
    outcome: "won",
    actorUserId,
  });

  // Do NOT close/archive the conversation — only log the win event.
  await channelService.logActivity(
    workspaceUserId,
    contactId,
    undefined,
    PROSPECT_AI_WON_ACTIVITY_EVENT,
    {
      source: "prospect_ai",
      prospectOutcome: "won",
      contactName: contact.name,
    },
    "user",
    actorUserId,
  );

  return row;
}

/** Alias used by routes / older call sites. */
export const markAsWon = markProspectAsWon;

export async function getProspectAiWonStats(
  workspaceUserId: string,
  filters: {
    timeRange?: ProspectAiWonTimeRange | string | null;
    campaignEnrollmentId?: string | null;
    teamMemberUserId?: string | null;
  } = {},
): Promise<ProspectAiWonStats> {
  const since = resolveProspectAiWonTimeRangeStart(filters.timeRange);
  const attributedIds = await loadAttributedContactIds(workspaceUserId);
  if (attributedIds.size === 0) {
    return buildProspectAiWonStats({ outreachSent: 0, replied: 0, qualified: 0, won: 0 });
  }

  const attributedList = [...attributedIds];
  const teamMember = String(filters.teamMemberUserId || "").trim() || null;
  const campaignId = String(filters.campaignEnrollmentId || "").trim() || null;

  const piRows = await db
    .select({
      contactId: prospectIntelligence.contactId,
      outreachStatus: prospectIntelligence.outreachStatus,
      outreachSentAt: prospectIntelligence.outreachSentAt,
      repliedAt: prospectIntelligence.repliedAt,
    })
    .from(prospectIntelligence)
    .where(inArray(prospectIntelligence.contactId, attributedList));

  let outreachSent = 0;
  let replied = 0;
  for (const row of piRows) {
    const flags = computeProspectAiOutreachFlags(row);
    if (flags.isSent) {
      if (!since) outreachSent += 1;
      else if (row.outreachSentAt && new Date(row.outreachSentAt) >= since) outreachSent += 1;
    }
    if (flags.isReplied) {
      if (!since) replied += 1;
      else if (row.repliedAt && new Date(row.repliedAt) >= since) replied += 1;
    }
  }

  const outcomeRows = await db
    .select({
      contactId: prospectAiOutcomes.contactId,
      prospectOutcome: prospectAiOutcomes.prospectOutcome,
      wonAt: prospectAiOutcomes.wonAt,
      qualifiedAt: prospectAiOutcomes.qualifiedAt,
      wonByUserId: prospectAiOutcomes.wonByUserId,
      campaignEnrollmentId: prospectAiOutcomes.campaignEnrollmentId,
      outcomeUpdatedAt: prospectAiOutcomes.outcomeUpdatedAt,
    })
    .from(prospectAiOutcomes)
    .where(
      and(
        eq(prospectAiOutcomes.workspaceUserId, workspaceUserId),
        inArray(prospectAiOutcomes.contactId, attributedList),
      ),
    );

  let assigneeByContact: Map<string, string | null> | null = null;
  if (teamMember) {
    assigneeByContact = new Map();
    const contactRows = await db
      .select({ id: contacts.id, assignedTo: contacts.assignedTo })
      .from(contacts)
      .where(
        and(eq(contacts.userId, workspaceUserId), inArray(contacts.id, attributedList)),
      );
    for (const c of contactRows) assigneeByContact.set(c.id, c.assignedTo ?? null);
  }

  let qualified = 0;
  let won = 0;
  for (const row of outcomeRows) {
    if (campaignId && row.campaignEnrollmentId !== campaignId) continue;

    const isQualified = (PROSPECT_AI_QUALIFIED_OUTCOMES as readonly string[]).includes(
      row.prospectOutcome,
    );
    const isWon = row.prospectOutcome === "won";

    if (isQualified) {
      const ts = row.qualifiedAt || row.outcomeUpdatedAt;
      if (since && (!ts || new Date(ts) < since)) {
        // out of range
      } else if (
        teamMember &&
        assigneeByContact?.get(row.contactId) !== teamMember &&
        row.wonByUserId !== teamMember
      ) {
        // filtered out
      } else {
        qualified += 1;
      }
    }

    if (isWon) {
      if (since && (!row.wonAt || new Date(row.wonAt) < since)) continue;
      if (
        teamMember &&
        row.wonByUserId !== teamMember &&
        assigneeByContact?.get(row.contactId) !== teamMember
      ) {
        continue;
      }
      won += 1;
    }
  }

  return buildProspectAiWonStats({ outreachSent, replied, qualified, won });
}

/** Alias */
export const getWonStats = getProspectAiWonStats;

export async function listWonCustomers(params: {
  workspaceUserId: string;
  filter?: WonListFilter | string | null;
  campaignEnrollmentId?: string | null;
  markedByUserId?: string | null;
}): Promise<ProspectAiWonCustomer[]> {
  const workspaceUserId = params.workspaceUserId;
  const since = resolveProspectAiWonTimeRangeStart(params.filter);
  const teamMember = String(params.markedByUserId || "").trim() || null;
  const campaignId = String(params.campaignEnrollmentId || "").trim() || null;

  const conditions = [
    eq(prospectAiOutcomes.workspaceUserId, workspaceUserId),
    eq(prospectAiOutcomes.prospectOutcome, "won"),
    eq(contacts.userId, workspaceUserId),
  ];
  if (since) conditions.push(gte(prospectAiOutcomes.wonAt, since));
  if (campaignId) conditions.push(eq(prospectAiOutcomes.campaignEnrollmentId, campaignId));
  if (teamMember) conditions.push(eq(prospectAiOutcomes.wonByUserId, teamMember));

  const rows = await db
    .select({
      contactId: prospectAiOutcomes.contactId,
      wonAt: prospectAiOutcomes.wonAt,
      wonByUserId: prospectAiOutcomes.wonByUserId,
      campaignEnrollmentId: prospectAiOutcomes.campaignEnrollmentId,
      prospectOutcome: prospectAiOutcomes.prospectOutcome,
      firstOutreachAt: prospectAiOutcomes.firstOutreachAt,
      name: contacts.name,
      source: contacts.source,
      sourceDetails: contacts.sourceDetails,
      customFields: contacts.customFields,
      markedByName: users.name,
      markedByEmail: users.email,
    })
    .from(prospectAiOutcomes)
    .innerJoin(contacts, eq(contacts.id, prospectAiOutcomes.contactId))
    .leftJoin(users, eq(users.id, prospectAiOutcomes.wonByUserId))
    .where(and(...conditions))
    .orderBy(desc(prospectAiOutcomes.wonAt))
    .limit(500);

  return rows.map((r) => {
    const contactLike = {
      source: r.source,
      sourceDetails: r.sourceDetails,
      customFields: r.customFields,
    } as Contact;
    return {
      contactId: r.contactId,
      name: r.name,
      source: extractSourceLabel(contactLike),
      campaign: r.campaignEnrollmentId ?? null,
      firstOutreachAt: toIso(r.firstOutreachAt),
      wonAt: toIso(r.wonAt),
      markedByUserId: r.wonByUserId ?? null,
      markedByName: r.markedByName || r.markedByEmail || null,
      outcome: (r.prospectOutcome as ProspectAiOutcome) || "won",
    };
  });
}

/** Pure helpers exported for unit tests. */
export const prospectAiOutcomeHelpers = {
  resolveTimeRangeStart: resolveProspectAiWonTimeRangeStart,
  computeOutreachFlags: computeProspectAiOutreachFlags,
  isProspectAiAttributedContact,
  buildProspectAiWonStats,
};

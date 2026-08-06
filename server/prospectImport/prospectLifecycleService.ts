/**
 * Prospect AI archive / restore / trash / soft-delete.
 * Operates on prospect_intelligence only — never deletes CRM contacts.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { contacts, prospectIntelligence, prospectOutreachQueueItems } from "@shared/schema";
import {
  emptyLifecycleBulkResult,
  getProspectArchiveBlockReason,
  inferProspectArchiveReason,
  isProspectLifecycleRestorable,
  parseProspectArchiveReason,
  parseProspectLifecycleStatus,
  PROSPECT_LIFECYCLE_BULK_LIMIT,
  resolveBulkArchiveReason,
  type ProspectArchiveReason,
  type ProspectBulkArchiveMode,
  type ProspectLifecycleBulkResult,
  type ProspectLifecycleStatus,
} from "@shared/prospectLifecycle";
import { canManageWorkspaceOffers } from "../workspaceOffers/offerAccess";
import { resolveProspectWebsiteUrl } from "./prospectWebsiteUrl";
import { isValidProspectEmail, isValidProspectPhone } from "@shared/prospectContactEnrichment";

async function assertContactInWorkspace(
  contactId: string,
  workspaceUserId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, workspaceUserId)))
    .limit(1);
  return Boolean(rows[0]);
}

async function loadQueueStatus(
  workspaceUserId: string,
  contactId: string,
): Promise<string | null> {
  const rows = await db
    .select({ status: prospectOutreachQueueItems.queueStatus })
    .from(prospectOutreachQueueItems)
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, workspaceUserId),
        eq(prospectOutreachQueueItems.contactId, contactId),
      ),
    );
  let best: string | null = null;
  for (const r of rows) {
    const st = String(r.status || "");
    if (st === "sending") return "sending";
    if (st === "queued" || st === "paused") best = st;
    else if (!best) best = st;
  }
  return best;
}

async function cancelQueuedForContact(
  workspaceUserId: string,
  contactId: string,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(prospectOutreachQueueItems)
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, workspaceUserId),
        eq(prospectOutreachQueueItems.contactId, contactId),
        inArray(prospectOutreachQueueItems.queueStatus, ["queued", "paused"]),
      ),
    );
  if (rows.length === 0) return false;
  for (const item of rows) {
    await db
      .update(prospectOutreachQueueItems)
      .set({ queueStatus: "cancelled", updatedAt: new Date() })
      .where(eq(prospectOutreachQueueItems.id, item.id));
  }
  return true;
}

function buildInferenceFromRow(params: {
  recommendedOffer?: string | null;
  reviewStatus?: string | null;
  email?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  priorOutreach?: boolean;
  discoveryAttentionReason?: string | null;
  companyName?: string | null;
}): Parameters<typeof inferProspectArchiveReason>[0] {
  const offer = String(params.recommendedOffer || "").toLowerCase();
  const notQualified =
    offer === "not_a_fit" ||
    offer === "manual_not_qualified" ||
    String(params.reviewStatus || "") === "not_qualified";
  const attention = String(params.discoveryAttentionReason || "").toLowerCase();
  const outsideTargetArea =
    attention.includes("outside") ||
    attention.includes("geo") ||
    attention.includes("target_area") ||
    attention.includes("location_mismatch");
  const closedBusiness =
    attention.includes("closed") || attention.includes("permanently_closed");
  const noContact =
    !isValidProspectEmail(params.email) &&
    !isValidProspectPhone(params.phone) &&
    !String(params.websiteUrl || "").trim();
  return {
    notQualified,
    outsideTargetArea,
    confirmedDuplicate: attention.includes("duplicate"),
    noContactInformation: noContact,
    closedBusiness,
    alreadyContacted: params.priorOutreach === true,
  };
}

export async function archiveProspect(params: {
  workspaceUserId: string;
  actorUserId: string;
  contactId: string;
  reason?: ProspectArchiveReason | null;
  note?: string | null;
  cancelQueue?: boolean;
}): Promise<{
  ok: boolean;
  status?: ProspectLifecycleStatus;
  reason?: string;
  archiveReason?: ProspectArchiveReason | null;
}> {
  if (!(await assertContactInWorkspace(params.contactId, params.workspaceUserId))) {
    return { ok: false, reason: "not_found" };
  }
  const piRows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, params.contactId))
    .limit(1);
  const pi = piRows[0];
  if (!pi) return { ok: false, reason: "not_found" };

  const current = parseProspectLifecycleStatus(
    (pi as { lifecycleStatus?: string }).lifecycleStatus,
  );
  if (current === "deleted") return { ok: false, reason: "already_deleted" };
  if (current === "archived") {
    return { ok: true, status: "archived", reason: "already_archived", archiveReason: parseProspectArchiveReason(pi.archiveReason) };
  }
  if (current === "trashed") {
    return { ok: false, reason: "in_trash" };
  }

  const queueStatus = await loadQueueStatus(params.workspaceUserId, params.contactId);
  const block = getProspectArchiveBlockReason(queueStatus, {
    cancelQueue: params.cancelQueue === true,
  });
  if (block === "campaign_sending") {
    return { ok: false, reason: "campaign_sending" };
  }
  if (block === "campaign_queued") {
    return { ok: false, reason: "campaign_queued" };
  }
  if (params.cancelQueue && (queueStatus === "queued" || queueStatus === "paused")) {
    await cancelQueuedForContact(params.workspaceUserId, params.contactId);
  }

  const archiveReason = parseProspectArchiveReason(params.reason);
  const now = new Date();
  await db
    .update(prospectIntelligence)
    .set({
      lifecycleStatus: "archived",
      archivedAt: now,
      archivedByUserId: params.actorUserId,
      archiveReason: archiveReason,
      archiveNote: params.note ? String(params.note).slice(0, 1000) : null,
      trashedAt: null,
      trashedByUserId: null,
      updatedAt: now,
    })
    .where(eq(prospectIntelligence.contactId, params.contactId));

  return { ok: true, status: "archived", archiveReason };
}

export async function bulkArchiveProspects(params: {
  workspaceUserId: string;
  actorUserId: string;
  contactIds: string[];
  mode: ProspectBulkArchiveMode;
  oneReason?: ProspectArchiveReason | null;
  note?: string | null;
  cancelQueue?: boolean;
}): Promise<ProspectLifecycleBulkResult> {
  const ids = Array.from(new Set(params.contactIds.filter(Boolean))).slice(
    0,
    PROSPECT_LIFECYCLE_BULK_LIMIT,
  );
  const result = emptyLifecycleBulkResult(ids.length);

  for (const contactId of ids) {
    try {
      let reason: ProspectArchiveReason | null = null;
      if (params.mode === "infer") {
        const piRows = await db
          .select()
          .from(prospectIntelligence)
          .where(eq(prospectIntelligence.contactId, contactId))
          .limit(1);
        const contactRows = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, contactId))
          .limit(1);
        const pi = piRows[0];
        const contact = contactRows[0];
        const sd = (contact?.sourceDetails || {}) as Record<string, unknown>;
        const cf = (contact?.customFields || {}) as Record<string, unknown>;
        const pai = (sd.prospectAi || cf.prospectAi) as Record<string, unknown> | undefined;
        reason = resolveBulkArchiveReason({
          mode: "infer",
          inference: buildInferenceFromRow({
            recommendedOffer: pi?.recommendedOffer,
            reviewStatus: pi?.reviewStatus,
            email: contact?.email,
            phone: contact?.phone,
            websiteUrl: contact ? resolveProspectWebsiteUrl(contact) : null,
            discoveryAttentionReason:
              pai?.attentionReason != null ? String(pai.attentionReason) : null,
          }),
        });
      } else {
        reason = resolveBulkArchiveReason({
          mode: params.mode,
          oneReason: params.oneReason,
          inference: {},
        });
      }

      const single = await archiveProspect({
        workspaceUserId: params.workspaceUserId,
        actorUserId: params.actorUserId,
        contactId,
        reason,
        note: params.note,
        cancelQueue: params.cancelQueue,
      });
      result.items.push({
        contactId,
        ok: single.ok,
        status: single.status,
        reason: single.reason,
        archiveReason: single.archiveReason ?? reason,
      });
      if (single.ok) {
        if (single.reason === "already_archived") result.skipped += 1;
        else result.archived = (result.archived || 0) + 1;
      } else if (
        single.reason === "campaign_queued" ||
        single.reason === "campaign_sending"
      ) {
        result.blocked += 1;
      } else if (single.reason === "not_found") {
        result.skipped += 1;
      } else {
        result.failed += 1;
      }
    } catch {
      result.failed += 1;
      result.items.push({ contactId, ok: false, reason: "error" });
    }
  }
  return result;
}

export async function restoreProspect(params: {
  workspaceUserId: string;
  actorUserId: string;
  contactId: string;
}): Promise<{ ok: boolean; status?: ProspectLifecycleStatus; reason?: string }> {
  if (!(await assertContactInWorkspace(params.contactId, params.workspaceUserId))) {
    return { ok: false, reason: "not_found" };
  }
  const piRows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, params.contactId))
    .limit(1);
  const pi = piRows[0];
  if (!pi) return { ok: false, reason: "not_found" };

  const current = parseProspectLifecycleStatus(
    (pi as { lifecycleStatus?: string }).lifecycleStatus,
  );
  if (current === "active") {
    return { ok: true, status: "active", reason: "already_active" };
  }
  if (current === "deleted") {
    return { ok: false, reason: "permanently_deleted" };
  }
  if (!isProspectLifecycleRestorable(current)) {
    return { ok: false, reason: "not_restorable" };
  }

  const now = new Date();
  await db
    .update(prospectIntelligence)
    .set({
      lifecycleStatus: "active",
      restoredAt: now,
      archivedAt: null,
      archivedByUserId: null,
      archiveReason: null,
      archiveNote: null,
      trashedAt: null,
      trashedByUserId: null,
      updatedAt: now,
    })
    .where(eq(prospectIntelligence.contactId, params.contactId));

  return { ok: true, status: "active" };
}

export async function bulkRestoreProspects(params: {
  workspaceUserId: string;
  actorUserId: string;
  contactIds: string[];
}): Promise<ProspectLifecycleBulkResult> {
  const ids = Array.from(new Set(params.contactIds.filter(Boolean))).slice(
    0,
    PROSPECT_LIFECYCLE_BULK_LIMIT,
  );
  const result = emptyLifecycleBulkResult(ids.length);
  for (const contactId of ids) {
    const single = await restoreProspect({
      workspaceUserId: params.workspaceUserId,
      actorUserId: params.actorUserId,
      contactId,
    });
    result.items.push({
      contactId,
      ok: single.ok,
      status: single.status,
      reason: single.reason,
    });
    if (single.ok) {
      if (single.reason === "already_active") result.skipped += 1;
      else result.restored = (result.restored || 0) + 1;
    } else if (single.reason === "not_found" || single.reason === "permanently_deleted") {
      result.skipped += 1;
    } else {
      result.failed += 1;
    }
  }
  return result;
}

export async function trashProspect(params: {
  workspaceUserId: string;
  actorUserId: string;
  contactId: string;
  cancelQueue?: boolean;
}): Promise<{ ok: boolean; status?: ProspectLifecycleStatus; reason?: string }> {
  if (!(await assertContactInWorkspace(params.contactId, params.workspaceUserId))) {
    return { ok: false, reason: "not_found" };
  }
  const piRows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, params.contactId))
    .limit(1);
  const pi = piRows[0];
  if (!pi) return { ok: false, reason: "not_found" };

  const current = parseProspectLifecycleStatus(
    (pi as { lifecycleStatus?: string }).lifecycleStatus,
  );
  if (current === "deleted") return { ok: false, reason: "already_deleted" };
  if (current === "trashed") {
    return { ok: true, status: "trashed", reason: "already_trashed" };
  }

  const queueStatus = await loadQueueStatus(params.workspaceUserId, params.contactId);
  const block = getProspectArchiveBlockReason(queueStatus, {
    cancelQueue: params.cancelQueue === true,
  });
  if (block === "campaign_sending") {
    return { ok: false, reason: "campaign_sending" };
  }
  if (block === "campaign_queued") {
    return { ok: false, reason: "campaign_queued" };
  }
  if (params.cancelQueue && (queueStatus === "queued" || queueStatus === "paused")) {
    await cancelQueuedForContact(params.workspaceUserId, params.contactId);
  }

  const now = new Date();
  await db
    .update(prospectIntelligence)
    .set({
      lifecycleStatus: "trashed",
      trashedAt: now,
      trashedByUserId: params.actorUserId,
      updatedAt: now,
    })
    .where(eq(prospectIntelligence.contactId, params.contactId));

  return { ok: true, status: "trashed" };
}

export async function bulkTrashProspects(params: {
  workspaceUserId: string;
  actorUserId: string;
  contactIds: string[];
  cancelQueue?: boolean;
}): Promise<ProspectLifecycleBulkResult> {
  const ids = Array.from(new Set(params.contactIds.filter(Boolean))).slice(
    0,
    PROSPECT_LIFECYCLE_BULK_LIMIT,
  );
  const result = emptyLifecycleBulkResult(ids.length);
  for (const contactId of ids) {
    const single = await trashProspect({
      workspaceUserId: params.workspaceUserId,
      actorUserId: params.actorUserId,
      contactId,
      cancelQueue: params.cancelQueue,
    });
    result.items.push({
      contactId,
      ok: single.ok,
      status: single.status,
      reason: single.reason,
    });
    if (single.ok) {
      if (single.reason === "already_trashed") result.skipped += 1;
      else result.trashed = (result.trashed || 0) + 1;
    } else if (
      single.reason === "campaign_queued" ||
      single.reason === "campaign_sending"
    ) {
      result.blocked += 1;
    } else if (single.reason === "not_found") {
      result.skipped += 1;
    } else {
      result.failed += 1;
    }
  }
  return result;
}

/** Soft permanent delete — owner/admin only. Never deletes CRM contact. */
export async function softDeleteProspects(params: {
  workspaceUserId: string;
  actorUserId: string;
  contactIds: string[];
  expectedCount: number;
}): Promise<ProspectLifecycleBulkResult & { forbidden?: boolean }> {
  const allowed = await canManageWorkspaceOffers(
    params.actorUserId,
    params.workspaceUserId,
  );
  if (!allowed) {
    return { ...emptyLifecycleBulkResult(0), forbidden: true };
  }

  const ids = Array.from(new Set(params.contactIds.filter(Boolean))).slice(
    0,
    PROSPECT_LIFECYCLE_BULK_LIMIT,
  );
  if (ids.length !== params.expectedCount) {
    const result = emptyLifecycleBulkResult(ids.length);
    result.failed = ids.length;
    result.items = ids.map((contactId) => ({
      contactId,
      ok: false,
      reason: "expected_count_mismatch",
    }));
    return result;
  }

  const result = emptyLifecycleBulkResult(ids.length);
  const now = new Date();
  for (const contactId of ids) {
    if (!(await assertContactInWorkspace(contactId, params.workspaceUserId))) {
      result.skipped += 1;
      result.items.push({ contactId, ok: false, reason: "not_found" });
      continue;
    }
    const piRows = await db
      .select()
      .from(prospectIntelligence)
      .where(eq(prospectIntelligence.contactId, contactId))
      .limit(1);
    const pi = piRows[0];
    if (!pi) {
      result.skipped += 1;
      result.items.push({ contactId, ok: false, reason: "not_found" });
      continue;
    }
    const current = parseProspectLifecycleStatus(
      (pi as { lifecycleStatus?: string }).lifecycleStatus,
    );
    if (current === "deleted") {
      result.skipped += 1;
      result.items.push({
        contactId,
        ok: true,
        status: "deleted",
        reason: "already_deleted",
      });
      continue;
    }
    if (current !== "trashed") {
      result.blocked += 1;
      result.items.push({ contactId, ok: false, reason: "must_trash_first" });
      continue;
    }

    await db
      .update(prospectIntelligence)
      .set({
        lifecycleStatus: "deleted",
        deletedAt: now,
        deletedByUserId: params.actorUserId,
        updatedAt: now,
      })
      .where(eq(prospectIntelligence.contactId, contactId));

    result.deleted = (result.deleted || 0) + 1;
    result.items.push({ contactId, ok: true, status: "deleted" });
  }
  return result;
}

/** Map of contactId → lifecycle for discovery index. */
export async function loadProspectLifecycleByContactIds(
  contactIds: string[],
): Promise<Map<string, ProspectLifecycleStatus>> {
  const map = new Map<string, ProspectLifecycleStatus>();
  const ids = Array.from(new Set(contactIds.filter(Boolean)));
  if (ids.length === 0) return map;
  // Chunk to avoid oversized IN lists
  const chunkSize = 500;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const rows = await db
      .select({
        contactId: prospectIntelligence.contactId,
        lifecycleStatus: prospectIntelligence.lifecycleStatus,
      })
      .from(prospectIntelligence)
      .where(inArray(prospectIntelligence.contactId, chunk));
    for (const r of rows) {
      map.set(r.contactId, parseProspectLifecycleStatus(r.lifecycleStatus));
    }
  }
  return map;
}

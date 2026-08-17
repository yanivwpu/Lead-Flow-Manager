import { and, eq, inArray } from "drizzle-orm";
import {
  appointments,
  calendlyCanceledEventTombstones,
  campaignEnrollments,
  contactNotes,
  contacts,
  flowJobs,
} from "@shared/schema";
import {
  CONTACTS_BULK_DELETE_MAX,
  parseContactDeleteIds,
  type ContactDeletionRiskFlags,
} from "@shared/contactDeletion";
import { db } from "../drizzle/db";

export { CONTACTS_BULK_DELETE_MAX, parseContactDeleteIds };

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Explicit cleanup for tables that do not FK-cascade from contacts.
 * Must run before deleting the contact row so delayed flow_jobs cannot fire later.
 */
export async function purgeContactOwnedOrphans(
  tx: DbTx,
  contactIds: string[],
): Promise<void> {
  if (contactIds.length === 0) return;
  await tx.delete(contactNotes).where(inArray(contactNotes.contactId, contactIds));
  await tx.delete(appointments).where(inArray(appointments.contactId, contactIds));
  await tx.delete(flowJobs).where(inArray(flowJobs.contactId, contactIds));
  await tx
    .update(calendlyCanceledEventTombstones)
    .set({ contactId: null })
    .where(inArray(calendlyCanceledEventTombstones.contactId, contactIds));
}

/** Hard-delete contact rows after orphan cleanup. Conversations/messages cascade via FK. */
export async function deleteContactRecords(contactIds: string[], tx?: DbTx): Promise<number> {
  const unique = [...new Set(contactIds.filter((id) => typeof id === "string" && id.trim()))];
  if (unique.length === 0) return 0;

  const run = async (client: DbTx): Promise<number> => {
    await purgeContactOwnedOrphans(client, unique);
    const removed = await client
      .delete(contacts)
      .where(inArray(contacts.id, unique))
      .returning({ id: contacts.id });
    return removed.length;
  };

  if (tx) return run(tx);
  return db.transaction(run);
}

export type DeleteContactSafelyResult =
  | { ok: true; deleted: 1; deletedIds: [string] }
  | { ok: false; code: "not_found" | "forbidden" };

export type DeleteContactsSafelyResult =
  | { ok: true; deleted: number; deletedIds: string[] }
  | { ok: false; code: "invalid" | "empty" | "over_limit" | "not_owned_or_missing"; count?: number };

async function loadContactsForUpdate(
  tx: DbTx,
  ids: string[],
): Promise<{ id: string; userId: string }[]> {
  return tx
    .select({ id: contacts.id, userId: contacts.userId })
    .from(contacts)
    .where(inArray(contacts.id, ids));
}

/**
 * Permanent hard-delete for one contact. Distinguishes 404 vs 403 for the single-delete route.
 */
export async function deleteContactSafely(
  workspaceUserId: string,
  contactId: string,
): Promise<DeleteContactSafelyResult> {
  const id = typeof contactId === "string" ? contactId.trim() : "";
  if (!id) return { ok: false, code: "not_found" };

  return db.transaction(async (tx) => {
    const rows = await loadContactsForUpdate(tx, [id]);
    if (rows.length === 0) return { ok: false, code: "not_found" as const };
    if (rows[0].userId !== workspaceUserId) return { ok: false, code: "forbidden" as const };
    await deleteContactRecords([id], tx);
    return { ok: true as const, deleted: 1 as const, deletedIds: [id] as [string] };
  });
}

/**
 * Permanent hard-delete for many contacts.
 * Fail closed: any missing or foreign id deletes NOTHING.
 */
export async function deleteContactsSafely(
  workspaceUserId: string,
  contactIds: unknown,
): Promise<DeleteContactsSafelyResult> {
  const parsed = parseContactDeleteIds(contactIds, CONTACTS_BULK_DELETE_MAX);
  if (!parsed.ok) return parsed;

  return db.transaction(async (tx) => {
    const rows = await loadContactsForUpdate(tx, parsed.ids);
    if (rows.length !== parsed.ids.length) {
      return { ok: false as const, code: "not_owned_or_missing" as const };
    }
    if (rows.some((row) => row.userId !== workspaceUserId)) {
      return { ok: false as const, code: "not_owned_or_missing" as const };
    }
    const deleted = await deleteContactRecords(parsed.ids, tx);
    return { ok: true as const, deleted, deletedIds: parsed.ids };
  });
}

export async function summarizeContactDeletionRisks(
  workspaceUserId: string,
  contactIds: string[],
): Promise<ContactDeletionRiskFlags> {
  const unique = [...new Set(contactIds.filter((id) => typeof id === "string" && id.trim()))];
  const empty: ContactDeletionRiskFlags = {
    hasAppointments: false,
    hasActiveCampaignEnrollment: false,
    hasActiveFollowUp: false,
  };
  if (unique.length === 0) return empty;

  const owned = await db
    .select({
      id: contacts.id,
      followUp: contacts.followUp,
      followUpDate: contacts.followUpDate,
    })
    .from(contacts)
    .where(and(eq(contacts.userId, workspaceUserId), inArray(contacts.id, unique)));
  if (owned.length === 0) return empty;

  const ownedIds = owned.map((c) => c.id);
  const [apptRows, enrollmentRows] = await Promise.all([
    db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq(appointments.userId, workspaceUserId), inArray(appointments.contactId, ownedIds)))
      .limit(1),
    db
      .select({ id: campaignEnrollments.id })
      .from(campaignEnrollments)
      .where(
        and(
          eq(campaignEnrollments.userId, workspaceUserId),
          eq(campaignEnrollments.status, "active"),
          inArray(campaignEnrollments.contactId, ownedIds),
        ),
      )
      .limit(1),
  ]);

  return {
    hasAppointments: apptRows.length > 0,
    hasActiveCampaignEnrollment: enrollmentRows.length > 0,
    hasActiveFollowUp: owned.some(
      (c) =>
        !!c.followUpDate ||
        (typeof c.followUp === "string" && c.followUp.trim().length > 0),
    ),
  };
}

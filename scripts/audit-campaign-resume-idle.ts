/**
 * READ-ONLY: why Resume leaves Ready queue idle.
 * No sends, no mutations.
 * Run: npx tsx scripts/audit-campaign-resume-idle.ts
 */
import "dotenv/config";
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  prospectOutreachQueueItems,
  prospectOutreachSettings,
} from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import { isProspectOutreachQueueArmed } from "../shared/prospectBulkOutreach";
import { resolveEmailSenderForBulkOutreach } from "../server/prospectImport/prospectOutreachEligibilityService";

async function main() {
  const wid = await resolveProspectImportDestinationUserId();
  const now = new Date();

  const settingsRows = await db
    .select()
    .from(prospectOutreachSettings)
    .where(eq(prospectOutreachSettings.workspaceUserId, wid))
    .limit(1);
  const s = settingsRows[0];
  const settings = s
    ? {
        paused: s.paused,
        queueRunning: s.queueRunning,
        dailySendLimit: s.dailySendLimit,
        hourlySendLimit: s.hourlySendLimit,
        minDelaySeconds: s.minDelaySeconds,
        maxDelaySeconds: s.maxDelaySeconds,
        armed: isProspectOutreachQueueArmed({
          queueRunning: s.queueRunning,
          paused: s.paused,
        }),
      }
    : { missing: true, armed: false };

  const email = await resolveEmailSenderForBulkOutreach(wid);

  const active = await db
    .select({
      id: prospectOutreachQueueItems.id,
      name: contacts.name,
      queueStatus: prospectOutreachQueueItems.queueStatus,
      attempts: prospectOutreachQueueItems.attempts,
      lastError: prospectOutreachQueueItems.lastError,
      scheduledAt: prospectOutreachQueueItems.scheduledAt,
      startedAt: prospectOutreachQueueItems.startedAt,
      sentAt: prospectOutreachQueueItems.sentAt,
      batchId: prospectOutreachQueueItems.batchId,
      senderMailboxId: prospectOutreachQueueItems.senderMailboxId,
      updatedAt: prospectOutreachQueueItems.updatedAt,
    })
    .from(prospectOutreachQueueItems)
    .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, wid),
        inArray(prospectOutreachQueueItems.queueStatus, [
          "queued",
          "sending",
          "paused",
          "failed",
        ]),
      ),
    )
    .orderBy(asc(prospectOutreachQueueItems.scheduledAt));

  const dueNow = active.filter((r) => {
    if (r.queueStatus !== "queued") return false;
    if (!r.scheduledAt) return true;
    return r.scheduledAt.getTime() <= now.getTime();
  });

  const futureScheduled = active.filter(
    (r) =>
      r.queueStatus === "queued" &&
      r.scheduledAt &&
      r.scheduledAt.getTime() > now.getTime(),
  );

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const sentTodayRows = await db
    .select({ id: prospectOutreachQueueItems.id })
    .from(prospectOutreachQueueItems)
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, wid),
        eq(prospectOutreachQueueItems.queueStatus, "sent"),
        sql`${prospectOutreachQueueItems.sentAt} >= ${dayStart}`,
      ),
    );

  // Same filter claimNextDueQueueItem / listWorkspaceIdsWithDueQueue use
  const claimCandidates = await db
    .select({
      id: prospectOutreachQueueItems.id,
      scheduledAt: prospectOutreachQueueItems.scheduledAt,
      name: contacts.name,
    })
    .from(prospectOutreachQueueItems)
    .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, wid),
        eq(prospectOutreachQueueItems.queueStatus, "queued"),
        or(
          lte(prospectOutreachQueueItems.scheduledAt, now),
          sql`${prospectOutreachQueueItems.scheduledAt} IS NULL`,
        ),
      ),
    )
    .orderBy(asc(prospectOutreachQueueItems.scheduledAt))
    .limit(5);

  console.log(
    JSON.stringify(
      {
        now: now.toISOString(),
        settings,
        emailProbe: {
          emailConnected: email.emailConnected,
          mailboxIdPrefix: email.emailMailboxId?.slice(0, 8) || null,
        },
        counts: {
          active: active.length,
          byStatus: active.reduce(
            (acc, r) => {
              acc[r.queueStatus] = (acc[r.queueStatus] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          ),
          dueNow: dueNow.length,
          futureScheduled: futureScheduled.length,
          sentToday: sentTodayRows.length,
          claimCandidates: claimCandidates.length,
        },
        wouldWorkerClaim:
          settings && "armed" in settings && settings.armed === true
            ? claimCandidates.length > 0
              ? "yes_first_due"
              : "armed_but_zero_due"
            : "not_armed",
        claimCandidates: claimCandidates.map((c) => ({
          name: c.name,
          idPrefix: c.id.slice(0, 8),
          scheduledAt: c.scheduledAt?.toISOString() || null,
          msUntilDue: c.scheduledAt
            ? c.scheduledAt.getTime() - now.getTime()
            : 0,
        })),
        futureSample: futureScheduled.slice(0, 5).map((r) => ({
          name: r.name,
          scheduledAt: r.scheduledAt?.toISOString() || null,
          msUntilDue: r.scheduledAt
            ? r.scheduledAt.getTime() - now.getTime()
            : null,
        })),
        allActive: active.map((r) => ({
          name: r.name,
          status: r.queueStatus,
          attempts: r.attempts,
          err: r.lastError ? String(r.lastError).slice(0, 80) : null,
          scheduledAt: r.scheduledAt?.toISOString() || null,
          msUntilDue: r.scheduledAt
            ? r.scheduledAt.getTime() - now.getTime()
            : 0,
          due: !r.scheduledAt || r.scheduledAt.getTime() <= now.getTime(),
          batchIdPrefix: r.batchId?.slice(0, 8) || null,
          mailboxIdPrefix: r.senderMailboxId?.slice(0, 8) || null,
          updatedAt: r.updatedAt?.toISOString() || null,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

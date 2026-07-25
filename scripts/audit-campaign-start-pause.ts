/**
 * READ-ONLY audit: Campaigns Start → Paused bug.
 * Does NOT mutate data or send email.
 * Run: npx tsx scripts/audit-campaign-start-pause.ts
 */
import "dotenv/config";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  prospectOutreachQueueItems,
  prospectOutreachSettings,
} from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import { isProspectOutreachQueueArmed } from "../shared/prospectBulkOutreach";

async function main() {
  const wid = await resolveProspectImportDestinationUserId();
  const settingsRows = await db
    .select()
    .from(prospectOutreachSettings)
    .where(eq(prospectOutreachSettings.workspaceUserId, wid))
    .limit(1);
  const s = settingsRows[0];
  const settings = s
    ? {
        exists: true,
        paused: s.paused,
        queueRunning: s.queueRunning,
        dailySendLimit: s.dailySendLimit,
        minDelaySeconds: s.minDelaySeconds,
        maxDelaySeconds: s.maxDelaySeconds,
        armed: isProspectOutreachQueueArmed({
          queueRunning: s.queueRunning,
          paused: s.paused,
        }),
      }
    : { exists: false, armed: false };

  const active = await db
    .select({
      id: prospectOutreachQueueItems.id,
      contactId: prospectOutreachQueueItems.contactId,
      queueStatus: prospectOutreachQueueItems.queueStatus,
      attempts: prospectOutreachQueueItems.attempts,
      lastError: prospectOutreachQueueItems.lastError,
      scheduledAt: prospectOutreachQueueItems.scheduledAt,
      startedAt: prospectOutreachQueueItems.startedAt,
      updatedAt: prospectOutreachQueueItems.updatedAt,
      name: contacts.name,
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
    .orderBy(desc(prospectOutreachQueueItems.updatedAt))
    .limit(50);

  const byStatus: Record<string, number> = {};
  let attemptsZero = 0;
  let attemptsNonzero = 0;
  let withError = 0;
  for (const row of active) {
    byStatus[row.queueStatus] = (byStatus[row.queueStatus] || 0) + 1;
    if ((row.attempts || 0) === 0) attemptsZero += 1;
    else attemptsNonzero += 1;
    if (row.lastError) withError += 1;
  }

  console.log(
    JSON.stringify(
      {
        settings,
        activeCount: active.length,
        byStatus,
        attemptsZero,
        attemptsNonzero,
        withError,
        sample: active.slice(0, 20).map((r) => ({
          name: r.name,
          status: r.queueStatus,
          attempts: r.attempts,
          err: r.lastError ? String(r.lastError).slice(0, 100) : null,
          scheduledAt: r.scheduledAt?.toISOString() || null,
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

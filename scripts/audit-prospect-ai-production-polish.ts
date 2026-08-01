/**
 * READ-ONLY audit: discovery quota + latest LA campaign state.
 * Run: npx tsx scripts/audit-prospect-ai-production-polish.ts
 */
import "dotenv/config";
import { and, asc, count, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  emailMailboxes,
  prospectAiDiscoveryResults,
  prospectAiDiscoverySearches,
  prospectOutreachBatches,
  prospectOutreachQueueItems,
  prospectOutreachSettings,
} from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import { countMonthlyDiscoveryUsage } from "../server/prospectAI/prospectAIService";
import { isSenderNotConnectedFailure } from "../shared/prospectOutreachFailureScope";
import { isProspectOutreachQueueArmed } from "../shared/prospectBulkOutreach";
import { writeFileSync } from "node:fs";

async function main() {
  const wid = await resolveProspectImportDestinationUserId();
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const used = await countMonthlyDiscoveryUsage(wid);

  const [totalAll] = await db
    .select({ total: count() })
    .from(prospectAiDiscoveryResults)
    .where(eq(prospectAiDiscoveryResults.workspaceUserId, wid));
  const [sentToReview] = await db
    .select({ total: count() })
    .from(prospectAiDiscoveryResults)
    .where(
      and(
        eq(prospectAiDiscoveryResults.workspaceUserId, wid),
        isNotNull(prospectAiDiscoveryResults.sentToReviewAt),
      ),
    );
  const [monthRows] = await db
    .select({ total: count() })
    .from(prospectAiDiscoveryResults)
    .where(
      and(
        eq(prospectAiDiscoveryResults.workspaceUserId, wid),
        gte(prospectAiDiscoveryResults.createdAt, since),
      ),
    );

  const searches = await db
    .select({
      id: prospectAiDiscoverySearches.id,
      createdAt: prospectAiDiscoverySearches.createdAt,
      resultCount: prospectAiDiscoverySearches.resultCount,
      status: prospectAiDiscoverySearches.status,
      location: prospectAiDiscoverySearches.location,
      businessType: prospectAiDiscoverySearches.businessType,
    })
    .from(prospectAiDiscoverySearches)
    .where(eq(prospectAiDiscoverySearches.workspaceUserId, wid))
    .orderBy(desc(prospectAiDiscoverySearches.createdAt))
    .limit(15);

  const settingsRows = await db
    .select()
    .from(prospectOutreachSettings)
    .where(eq(prospectOutreachSettings.workspaceUserId, wid))
    .limit(1);
  const s = settingsRows[0];

  const batches = await db
    .select()
    .from(prospectOutreachBatches)
    .where(eq(prospectOutreachBatches.workspaceUserId, wid))
    .orderBy(desc(prospectOutreachBatches.createdAt))
    .limit(8);

  const latest = batches[0];
  let items: Array<{
    id: string;
    name: string | null;
    queueStatus: string;
    scheduledAt: Date | null;
    createdAt: Date | null;
    sentAt: Date | null;
    lastError: string | null;
    attempts: number | null;
  }> = [];

  if (latest) {
    items = await db
      .select({
        id: prospectOutreachQueueItems.id,
        name: contacts.name,
        queueStatus: prospectOutreachQueueItems.queueStatus,
        scheduledAt: prospectOutreachQueueItems.scheduledAt,
        createdAt: prospectOutreachQueueItems.createdAt,
        sentAt: prospectOutreachQueueItems.sentAt,
        lastError: prospectOutreachQueueItems.lastError,
        attempts: prospectOutreachQueueItems.attempts,
      })
      .from(prospectOutreachQueueItems)
      .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
      .where(eq(prospectOutreachQueueItems.batchId, latest.id))
      .orderBy(asc(prospectOutreachQueueItems.scheduledAt));
  }

  const mailbox = await db
    .select({
      email: emailMailboxes.emailAddress,
      syncStatus: emailMailboxes.syncStatus,
    })
    .from(emailMailboxes)
    .where(eq(emailMailboxes.workspaceUserId, wid))
    .limit(1);

  const statusCounts: Record<string, number> = {};
  for (const i of items) {
    statusCounts[i.queueStatus] = (statusCounts[i.queueStatus] || 0) + 1;
  }

  const out = {
    workspaceIdPrefix: wid.slice(0, 8),
    discovery: {
      usedThisUtcMonth: used,
      monthRowCount: Number(monthRows?.total || 0),
      totalAllTime: Number(totalAll?.total || 0),
      sentToReviewAllTime: Number(sentToReview?.total || 0),
      recentSearches: searches.map((row) => ({
        idPrefix: row.id.slice(0, 8),
        createdAt: row.createdAt,
        resultCount: row.resultCount,
        status: row.status,
        location: row.location,
        businessType: row.businessType,
      })),
      searchResultCountSumMonth: searches
        .filter((row) => row.createdAt && new Date(row.createdAt) >= since)
        .reduce((acc, row) => acc + Number(row.resultCount || 0), 0),
    },
    campaignControl: s
      ? {
          paused: s.paused,
          queueRunning: s.queueRunning,
          armed: isProspectOutreachQueueArmed({
            queueRunning: s.queueRunning,
            paused: s.paused,
          }),
        }
      : null,
    mailbox: mailbox[0] || null,
    latestBatch: latest
      ? {
          id: latest.id,
          status: latest.status,
          selectedCount: latest.selectedCount,
          queuedCount: latest.queuedCount,
          createdAt: latest.createdAt,
        }
      : null,
    recentBatches: batches.map((b) => ({
      id: b.id,
      status: b.status,
      queuedCount: b.queuedCount,
      createdAt: b.createdAt,
    })),
    itemStatusCounts: statusCounts,
    itemCount: items.length,
    sentCount: items.filter((i) => i.queueStatus === "sent" || Boolean(i.sentAt)).length,
    staleSenderErrorCount: items.filter((i) => isSenderNotConnectedFailure(i.lastError)).length,
    queueOrderByScheduledAt: items.map((i, idx) => ({
      idx,
      name: i.name,
      status: i.queueStatus,
      scheduledAt: i.scheduledAt,
      createdAt: i.createdAt,
      sentAt: i.sentAt,
      lastError: i.lastError,
      attempts: i.attempts,
    })),
  };

  writeFileSync("audit-production-polish-out.json", JSON.stringify(out, null, 2), "utf8");
  console.log("Wrote audit-production-polish-out.json");
  console.log(
    JSON.stringify(
      {
        discoveryUsed: out.discovery.usedThisUtcMonth,
        discoveryTotal: out.discovery.totalAllTime,
        campaignPaused: out.campaignControl?.paused,
        latestBatchId: out.latestBatch?.id,
        itemCount: out.itemCount,
        sentCount: out.sentCount,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

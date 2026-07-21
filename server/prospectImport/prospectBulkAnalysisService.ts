/**
 * Durable bulk AI analysis for Prospect Intelligence.
 * Jobs are claimed via DB lease; worker resumes unfinished contacts using item_results.
 */

import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  prospectBulkAnalysisJobs,
  prospectIntelligence,
  type ProspectBulkAnalysisJobRow,
} from "@shared/schema";
import type { ProspectBulkAnalysisJobSummary } from "@shared/prospectBulkOutreach";
import {
  failedContactIdsFromItemResults,
  prospectBulkAnalysisLog,
  recountBulkAnalysisItemResults,
  PROSPECT_BULK_ANALYSIS_LEASE_MS,
  type ProspectBulkAnalysisItemResults,
} from "@shared/prospectBulkSelection";
import { shouldSkipDefaultBulkReanalyze } from "@shared/prospectOutreachEligibility";
import { db } from "../../drizzle/db";
import { analyzeProspectContact } from "./prospectIntelligenceService";
import { resolveProspectImportDestinationUserId } from "./prospectImportService";
import type { ProspectIntelligenceListFilters } from "@shared/prospectImport";
import crypto from "crypto";

function mapJob(row: ProspectBulkAnalysisJobRow): ProspectBulkAnalysisJobSummary {
  const results = (row.itemResults || {}) as ProspectBulkAnalysisItemResults;
  const counts = recountBulkAnalysisItemResults(results);
  return {
    id: row.id,
    workspaceUserId: row.workspaceUserId,
    status: row.status as ProspectBulkAnalysisJobSummary["status"],
    progressCurrent: row.progressCurrent ?? counts.processed,
    progressTotal: row.progressTotal ?? 0,
    completed: row.resultCompleted ?? counts.completed,
    needsReview: row.resultNeedsReview ?? counts.needsReview,
    failed: row.resultFailed ?? counts.failed,
    skipped: row.resultSkipped ?? counts.skipped,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    parentJobId: row.parentJobId ?? null,
    failedContactIds: failedContactIdsFromItemResults(results),
  };
}

async function updateJob(
  jobId: string,
  patch: Partial<typeof prospectBulkAnalysisJobs.$inferInsert>,
): Promise<void> {
  await db
    .update(prospectBulkAnalysisJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(prospectBulkAnalysisJobs.id, jobId));
}

export async function createBulkAnalysisJob(params: {
  contactIds: string[];
  initiatedByUserId: string;
  workspaceUserId?: string;
  selectionMode?: "selected" | "filtered";
  force?: boolean;
  filtersSnapshot?: ProspectIntelligenceListFilters | null;
  parentJobId?: string | null;
}): Promise<ProspectBulkAnalysisJobSummary> {
  const ids = Array.from(new Set(params.contactIds.map((id) => String(id).trim()).filter(Boolean)));
  if (!ids.length) throw new Error("No prospects selected for analysis.");

  const workspaceUserId =
    params.workspaceUserId || (await resolveProspectImportDestinationUserId());

  // Merge into an existing *pending* job so Discover → Review handoffs keep enqueueing
  // without dropping contact IDs. If a job is already running, create a new pending job
  // (worker claims by created_at); do not return the running job without adding IDs.
  const pendingRows = await db
    .select()
    .from(prospectBulkAnalysisJobs)
    .where(
      and(
        eq(prospectBulkAnalysisJobs.workspaceUserId, workspaceUserId),
        eq(prospectBulkAnalysisJobs.status, "pending"),
      ),
    )
    .orderBy(desc(prospectBulkAnalysisJobs.createdAt))
    .limit(1);

  if (pendingRows[0]) {
    const existing = pendingRows[0];
    const prior = Array.isArray(existing.contactIds)
      ? (existing.contactIds as string[]).map(String)
      : [];
    const merged = Array.from(new Set([...prior, ...ids]));
    if (merged.length !== prior.length) {
      await updateJob(existing.id, {
        contactIds: merged,
        progressTotal: merged.length,
      });
      console.info(
        JSON.stringify(
          prospectBulkAnalysisLog("job_contacts_merged", {
            workspaceId: workspaceUserId,
            jobId: existing.id,
            status: "pending",
            progressTotal: merged.length,
            added: merged.length - prior.length,
          }),
        ),
      );
    }
    try {
      await db
        .update(prospectIntelligence)
        .set({ analysisStatus: "processing", updatedAt: new Date() })
        .where(
          and(
            inArray(prospectIntelligence.contactId, ids),
            inArray(prospectIntelligence.analysisStatus, ["pending", "failed"]),
          ),
        );
    } catch (err) {
      console.error("[ProspectBulkAnalysis] Failed to mark merged contacts processing:", err);
    }
    const refreshed = await db
      .select()
      .from(prospectBulkAnalysisJobs)
      .where(eq(prospectBulkAnalysisJobs.id, existing.id))
      .limit(1);
    return mapJob(refreshed[0] || existing);
  }

  const [row] = await db
    .insert(prospectBulkAnalysisJobs)
    .values({
      workspaceUserId,
      initiatedByUserId: params.initiatedByUserId,
      status: "pending",
      contactIds: ids,
      selectionMode: params.selectionMode || "selected",
      forceReanalyze: Boolean(params.force),
      progressTotal: ids.length,
      itemResults: {},
      filtersSnapshot: params.filtersSnapshot || null,
      parentJobId: params.parentJobId || null,
      updatedAt: new Date(),
    })
    .returning();

  console.info(
    JSON.stringify(
      prospectBulkAnalysisLog("job_created", {
        workspaceId: workspaceUserId,
        jobId: row.id,
        status: "pending",
        progressTotal: ids.length,
        parentJobId: params.parentJobId || null,
      }),
    ),
  );

  // Immediate UI: Imported → Analyzing… (status only; rows stay put client-side).
  try {
    await db
      .update(prospectIntelligence)
      .set({ analysisStatus: "processing", updatedAt: new Date() })
      .where(
        and(
          inArray(prospectIntelligence.contactId, ids),
          inArray(prospectIntelligence.analysisStatus, ["pending", "failed"]),
        ),
      );
  } catch (err) {
    console.error("[ProspectBulkAnalysis] Failed to mark contacts processing:", err);
  }

  // Durable worker claims — no setImmediate runner.
  return mapJob(row);
}

/**
 * Atomically claim next recoverable pending/running job (SKIP LOCKED).
 */
export async function claimNextBulkAnalysisJob(
  workerId: string,
): Promise<ProspectBulkAnalysisJobRow | null> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + PROSPECT_BULK_ANALYSIS_LEASE_MS);

  const claimed = await db.execute(sql`
    UPDATE prospect_bulk_analysis_jobs AS j
    SET
      status = 'running',
      lease_owner = ${workerId},
      lease_expires_at = ${leaseUntil},
      started_at = COALESCE(j.started_at, ${now}),
      updated_at = ${now}
    WHERE j.id = (
      SELECT id FROM prospect_bulk_analysis_jobs
      WHERE status IN ('pending', 'running')
        AND (lease_expires_at IS NULL OR lease_expires_at < ${now})
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING j.id
  `);

  const id = String((claimed as { rows?: Array<{ id?: string }> }).rows?.[0]?.id || "");
  if (!id) return null;

  const rows = await db
    .select()
    .from(prospectBulkAnalysisJobs)
    .where(eq(prospectBulkAnalysisJobs.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const results = (row.itemResults || {}) as ProspectBulkAnalysisItemResults;
  const processed = Object.keys(results).length;
  console.info(
    JSON.stringify(
      prospectBulkAnalysisLog(processed > 0 ? "job_resumed" : "job_claimed", {
        jobId: row.id,
        workspaceId: row.workspaceUserId,
        workerId,
        progressCurrent: processed,
        progressTotal: row.progressTotal,
      }),
    ),
  );
  if (processed > 0) {
    console.info(
      JSON.stringify(
        prospectBulkAnalysisLog("stale_job_recovered", {
          jobId: row.id,
          workspaceId: row.workspaceUserId,
          progressCurrent: processed,
        }),
      ),
    );
  }
  return row;
}

async function renewLease(jobId: string, workerId: string): Promise<boolean> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + PROSPECT_BULK_ANALYSIS_LEASE_MS);
  const updated = await db
    .update(prospectBulkAnalysisJobs)
    .set({
      leaseOwner: workerId,
      leaseExpiresAt: leaseUntil,
      updatedAt: now,
    })
    .where(
      and(
        eq(prospectBulkAnalysisJobs.id, jobId),
        eq(prospectBulkAnalysisJobs.leaseOwner, workerId),
        eq(prospectBulkAnalysisJobs.status, "running"),
      ),
    )
    .returning({ id: prospectBulkAnalysisJobs.id });
  return updated.length > 0;
}

/**
 * Process one claimed job to completion (or until lease lost).
 * Skips contacts already present in item_results (no duplicate AI work).
 */
export async function processClaimedBulkAnalysisJob(
  job: ProspectBulkAnalysisJobRow,
  workerId: string,
): Promise<void> {
  let itemResults: ProspectBulkAnalysisItemResults = {
    ...((job.itemResults || {}) as ProspectBulkAnalysisItemResults),
  };

  // Re-read contactIds each iteration so IDs merged into a pending/running job are not dropped.
  for (;;) {
    const freshRows = await db
      .select()
      .from(prospectBulkAnalysisJobs)
      .where(eq(prospectBulkAnalysisJobs.id, job.id))
      .limit(1);
    const fresh = freshRows[0];
    if (!fresh) return;
    const contactIds = (Array.isArray(fresh.contactIds) ? fresh.contactIds : []) as string[];
    const contactId = contactIds.find((id) => !itemResults[String(id)]);
    if (!contactId) break;

    if (!(await renewLease(job.id, workerId))) {
      console.info(
        JSON.stringify(
          prospectBulkAnalysisLog("job_lease_lost", {
            jobId: job.id,
            workerId,
            contactId,
          }),
        ),
      );
      return;
    }

    console.info(
      JSON.stringify(
        prospectBulkAnalysisLog("item_started", {
          jobId: job.id,
          workspaceId: job.workspaceUserId,
          contactId,
        }),
      ),
    );

    try {
      const existing = await db
        .select()
        .from(prospectIntelligence)
        .where(eq(prospectIntelligence.contactId, contactId))
        .limit(1);
      const row = existing[0];
      if (
        row &&
        shouldSkipDefaultBulkReanalyze({
          outreachStatus: row.outreachStatus,
          outreachSentAt: row.outreachSentAt,
          repliedAt: row.repliedAt,
          force: job.forceReanalyze,
        })
      ) {
        itemResults[contactId] = {
          status: "skipped",
          at: new Date().toISOString(),
          reason: "already_contacted",
        };
        console.info(
          JSON.stringify(
            prospectBulkAnalysisLog("item_completed", {
              jobId: job.id,
              contactId,
              status: "skipped",
              reason: "already_contacted",
            }),
          ),
        );
      } else {
        const intel = await analyzeProspectContact({
          contactId,
          force: job.forceReanalyze,
        });
        const needsReview = Boolean(intel.needsReview || intel.priority === "needs_review");
        itemResults[contactId] = {
          status: needsReview ? "needs_review" : "completed",
          at: new Date().toISOString(),
        };
        console.info(
          JSON.stringify(
            prospectBulkAnalysisLog("item_completed", {
              jobId: job.id,
              contactId,
              status: needsReview ? "needs_review" : "completed",
            }),
          ),
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      itemResults[contactId] = {
        status: "failed",
        at: new Date().toISOString(),
        reason: reason.substring(0, 200),
      };
      console.info(
        JSON.stringify(
          prospectBulkAnalysisLog("item_failed", {
            jobId: job.id,
            contactId,
            reason: reason.substring(0, 200),
          }),
        ),
      );
    }

    const counts = recountBulkAnalysisItemResults(itemResults);
    const totalNow = contactIds.length;
    await updateJob(job.id, {
      itemResults,
      progressCurrent: counts.processed,
      progressTotal: totalNow,
      resultCompleted: counts.completed,
      resultNeedsReview: counts.needsReview,
      resultFailed: counts.failed,
      resultSkipped: counts.skipped,
      leaseOwner: workerId,
      leaseExpiresAt: new Date(Date.now() + PROSPECT_BULK_ANALYSIS_LEASE_MS),
    });
  }

  const finalRows = await db
    .select()
    .from(prospectBulkAnalysisJobs)
    .where(eq(prospectBulkAnalysisJobs.id, job.id))
    .limit(1);
  const finalIds = (Array.isArray(finalRows[0]?.contactIds) ? finalRows[0]!.contactIds : []) as string[];
  const finalCounts = recountBulkAnalysisItemResults(itemResults);
  await updateJob(job.id, {
    status: "completed",
    completedAt: new Date(),
    itemResults,
    progressCurrent: finalIds.length,
    progressTotal: finalIds.length,
    resultCompleted: finalCounts.completed,
    resultNeedsReview: finalCounts.needsReview,
    resultFailed: finalCounts.failed,
    resultSkipped: finalCounts.skipped,
    leaseOwner: null,
    leaseExpiresAt: null,
  });

  console.info(
    JSON.stringify(
      prospectBulkAnalysisLog("job_completed", {
        jobId: job.id,
        workspaceId: job.workspaceUserId,
        completed: finalCounts.completed,
        failed: finalCounts.failed,
        skipped: finalCounts.skipped,
        needsReview: finalCounts.needsReview,
      }),
    ),
  );
}

/** Recover stale running jobs by clearing expired leases (claim will pick them up). */
export async function recoverStaleBulkAnalysisJobs(): Promise<number> {
  const now = new Date();
  const updated = await db
    .update(prospectBulkAnalysisJobs)
    .set({
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(prospectBulkAnalysisJobs.status, "running"),
        or(isNull(prospectBulkAnalysisJobs.leaseExpiresAt), lt(prospectBulkAnalysisJobs.leaseExpiresAt, now)),
      ),
    )
    .returning({ id: prospectBulkAnalysisJobs.id });

  for (const row of updated) {
    console.info(
      JSON.stringify(
        prospectBulkAnalysisLog("stale_job_recovered", {
          jobId: row.id,
          reason: "lease_expired",
        }),
      ),
    );
  }
  return updated.length;
}

export async function getBulkAnalysisJob(
  jobId: string,
): Promise<ProspectBulkAnalysisJobSummary | null> {
  const rows = await db
    .select()
    .from(prospectBulkAnalysisJobs)
    .where(eq(prospectBulkAnalysisJobs.id, jobId))
    .limit(1);
  return rows[0] ? mapJob(rows[0]) : null;
}

export async function getActiveOrRecentBulkAnalysisJob(
  workspaceUserId?: string,
): Promise<ProspectBulkAnalysisJobSummary | null> {
  const wid = workspaceUserId || (await resolveProspectImportDestinationUserId());
  const active = await db
    .select()
    .from(prospectBulkAnalysisJobs)
    .where(
      and(
        eq(prospectBulkAnalysisJobs.workspaceUserId, wid),
        inArray(prospectBulkAnalysisJobs.status, ["pending", "running"]),
      ),
    )
    .orderBy(desc(prospectBulkAnalysisJobs.createdAt))
    .limit(1);
  if (active[0]) return mapJob(active[0]);

  const recent = await db
    .select()
    .from(prospectBulkAnalysisJobs)
    .where(eq(prospectBulkAnalysisJobs.workspaceUserId, wid))
    .orderBy(desc(prospectBulkAnalysisJobs.createdAt))
    .limit(1);
  return recent[0] ? mapJob(recent[0]) : null;
}

/**
 * Retry only failed items from a completed/failed job — new child job, same workspace.
 * Does not re-queue successful contacts.
 */
export async function retryFailedBulkAnalysisItems(params: {
  jobId: string;
  initiatedByUserId: string;
  workspaceUserId?: string;
}): Promise<ProspectBulkAnalysisJobSummary> {
  const wid = params.workspaceUserId || (await resolveProspectImportDestinationUserId());
  const rows = await db
    .select()
    .from(prospectBulkAnalysisJobs)
    .where(
      and(
        eq(prospectBulkAnalysisJobs.id, params.jobId),
        eq(prospectBulkAnalysisJobs.workspaceUserId, wid),
      ),
    )
    .limit(1);
  const parent = rows[0];
  if (!parent) throw new Error("Analysis job not found");

  const failedIds = failedContactIdsFromItemResults(
    (parent.itemResults || {}) as ProspectBulkAnalysisItemResults,
  );
  if (!failedIds.length) throw new Error("No failed items to retry.");

  return createBulkAnalysisJob({
    contactIds: failedIds,
    initiatedByUserId: params.initiatedByUserId,
    workspaceUserId: wid,
    selectionMode: "selected",
    force: true,
    filtersSnapshot: (parent.filtersSnapshot as ProspectIntelligenceListFilters) || null,
    parentJobId: parent.id,
  });
}

/** Test helper — process a job synchronously without worker. */
export async function runBulkAnalysisJob(jobId: string): Promise<void> {
  const workerId = `sync-${crypto.randomBytes(4).toString("hex")}`;
  const rows = await db
    .select()
    .from(prospectBulkAnalysisJobs)
    .where(eq(prospectBulkAnalysisJobs.id, jobId))
    .limit(1);
  const job = rows[0];
  if (!job) return;
  await updateJob(jobId, {
    status: "running",
    leaseOwner: workerId,
    leaseExpiresAt: new Date(Date.now() + PROSPECT_BULK_ANALYSIS_LEASE_MS),
    startedAt: job.startedAt || new Date(),
  });
  const refreshed = await db
    .select()
    .from(prospectBulkAnalysisJobs)
    .where(eq(prospectBulkAnalysisJobs.id, jobId))
    .limit(1);
  if (refreshed[0]) await processClaimedBulkAnalysisJob(refreshed[0], workerId);
}

export const prospectBulkAnalysisService = {
  createBulkAnalysisJob,
  getBulkAnalysisJob,
  getActiveOrRecentBulkAnalysisJob,
  claimNextBulkAnalysisJob,
  processClaimedBulkAnalysisJob,
  recoverStaleBulkAnalysisJobs,
  retryFailedBulkAnalysisItems,
  runBulkAnalysisJob,
};

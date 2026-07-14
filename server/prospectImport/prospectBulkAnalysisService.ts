/**
 * Bulk AI analysis for selected / filtered Prospect Intelligence rows.
 * Runs as background job (setImmediate) — browser need not stay open.
 * Skips Outreach Sent / Replied by default unless force=true.
 */

import { and, eq, inArray } from "drizzle-orm";
import {
  prospectBulkAnalysisJobs,
  prospectIntelligence,
  type ProspectBulkAnalysisJobRow,
} from "@shared/schema";
import type { ProspectBulkAnalysisJobSummary } from "@shared/prospectBulkOutreach";
import { prospectBulkOutreachLog } from "@shared/prospectBulkOutreach";
import { shouldSkipDefaultBulkReanalyze } from "@shared/prospectOutreachEligibility";
import { db } from "../../drizzle/db";
import { analyzeProspectContact } from "./prospectIntelligenceService";
import { resolveProspectImportDestinationUserId } from "./prospectImportService";

const runningBulkJobs = new Set<string>();

function mapJob(row: ProspectBulkAnalysisJobRow): ProspectBulkAnalysisJobSummary {
  return {
    id: row.id,
    workspaceUserId: row.workspaceUserId,
    status: row.status as ProspectBulkAnalysisJobSummary["status"],
    progressCurrent: row.progressCurrent ?? 0,
    progressTotal: row.progressTotal ?? 0,
    completed: row.resultCompleted ?? 0,
    needsReview: row.resultNeedsReview ?? 0,
    failed: row.resultFailed ?? 0,
    skipped: row.resultSkipped ?? 0,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function createBulkAnalysisJob(params: {
  contactIds: string[];
  initiatedByUserId: string;
  workspaceUserId?: string;
  selectionMode?: "selected" | "filtered";
  force?: boolean;
}): Promise<ProspectBulkAnalysisJobSummary> {
  const ids = Array.from(new Set(params.contactIds.map((id) => String(id).trim()).filter(Boolean)));
  if (!ids.length) throw new Error("No prospects selected for analysis.");

  const workspaceUserId =
    params.workspaceUserId || (await resolveProspectImportDestinationUserId());

  const active = await db
    .select()
    .from(prospectBulkAnalysisJobs)
    .where(
      and(
        eq(prospectBulkAnalysisJobs.workspaceUserId, workspaceUserId),
        inArray(prospectBulkAnalysisJobs.status, ["pending", "running"]),
      ),
    )
    .limit(1);
  if (active[0]) {
    return mapJob(active[0]);
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
    })
    .returning();

  console.info(
    JSON.stringify(
      prospectBulkOutreachLog("analysis_batch_created", {
        workspaceId: workspaceUserId,
        batchId: row.id,
        status: "pending",
        progressTotal: ids.length,
      }),
    ),
  );

  setImmediate(() => {
    void runBulkAnalysisJob(row.id).catch((err) => {
      console.error("[ProspectBulkOutreach] analysis job failed:", err);
    });
  });

  return mapJob(row);
}

async function updateJob(
  jobId: string,
  patch: Partial<typeof prospectBulkAnalysisJobs.$inferInsert>,
): Promise<void> {
  await db.update(prospectBulkAnalysisJobs).set(patch).where(eq(prospectBulkAnalysisJobs.id, jobId));
}

export async function runBulkAnalysisJob(jobId: string): Promise<void> {
  if (runningBulkJobs.has(jobId)) return;
  runningBulkJobs.add(jobId);

  try {
    const rows = await db
      .select()
      .from(prospectBulkAnalysisJobs)
      .where(eq(prospectBulkAnalysisJobs.id, jobId))
      .limit(1);
    const job = rows[0];
    if (!job) return;

    await updateJob(jobId, { status: "running", startedAt: new Date() });

    const contactIds = (job.contactIds as string[]) || [];
    let completed = 0;
    let needsReview = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < contactIds.length; i++) {
      const contactId = contactIds[i];
      console.info(
        JSON.stringify(
          prospectBulkOutreachLog("analysis_item_queued", {
            workspaceId: job.workspaceUserId,
            batchId: jobId,
            prospectIntelligenceId: contactId,
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
          skipped += 1;
          console.info(
            JSON.stringify(
              prospectBulkOutreachLog("analysis_item_completed", {
                workspaceId: job.workspaceUserId,
                batchId: jobId,
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
          completed += 1;
          if (intel.needsReview || intel.priority === "needs_review") needsReview += 1;
          console.info(
            JSON.stringify(
              prospectBulkOutreachLog("analysis_item_completed", {
                workspaceId: job.workspaceUserId,
                batchId: jobId,
                contactId,
                status: intel.analysisStatus || "completed",
              }),
            ),
          );
        }
      } catch (err) {
        failed += 1;
        const reason = err instanceof Error ? err.message : String(err);
        console.info(
          JSON.stringify(
            prospectBulkOutreachLog("analysis_item_failed", {
              workspaceId: job.workspaceUserId,
              batchId: jobId,
              contactId,
              status: "failed",
              reason: reason.substring(0, 200),
            }),
          ),
        );
      }

      await updateJob(jobId, {
        progressCurrent: i + 1,
        resultCompleted: completed,
        resultNeedsReview: needsReview,
        resultFailed: failed,
        resultSkipped: skipped,
      });
    }

    await updateJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      progressCurrent: contactIds.length,
      resultCompleted: completed,
      resultNeedsReview: needsReview,
      resultFailed: failed,
      resultSkipped: skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: message.substring(0, 500),
    });
  } finally {
    runningBulkJobs.delete(jobId);
  }
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

export const prospectBulkAnalysisService = {
  createBulkAnalysisJob,
  getBulkAnalysisJob,
  runBulkAnalysisJob,
};

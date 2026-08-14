/**
 * DB-polled durable worker for prospect bulk AI analysis jobs.
 * Survives browser close and Railway/app restarts via lease + item_results resume.
 *
 * Production entrypoint: `server/index.ts` calls `startProspectBulkAnalysisWorker()`
 * during boot (same process as `npm start` / `dist/index.cjs`).
 *
 * The web app may boot without a valid OpenAI key, but this AI worker must refuse
 * to start when OPENAI_API_KEY is missing, looks like a Resend `re_…` key, or fails validation.
 */

import crypto from "crypto";
import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import {
  claimNextBulkAnalysisJob,
  countClaimableBulkAnalysisJobs,
  processClaimedBulkAnalysisJob,
  recoverOrphanedPendingQualifications,
  recoverStaleBulkAnalysisJobs,
} from "./prospectBulkAnalysisService";
import { healAbandonedProcessingAnalysis } from "./prospectIntelligenceService";
import { prospectBulkAnalysisLog } from "@shared/prospectBulkSelection";
import { PROSPECT_ORPHAN_SWEEP_INTERVAL_MS } from "@shared/prospectAnalysisOwnership";
import {
  describeOpenAiKeyRuntimeDiagnostics,
  detectForeignProspectAiDeployment,
  shouldStartProspectAiBulkWorker,
} from "@shared/prospectAiReliability";
import { db } from "../../drizzle/db";
import { prospectBulkAnalysisJobs, prospectIntelligence } from "@shared/schema";

const POLL_INTERVAL_MS = 5_000;
const FOREIGN_DEPLOY_LOOKBACK_MS = 30 * 60_000;
const workerId = `bulk-ai-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;

let workerTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let lastOrphanSweepAt = 0;
let tickCount = 0;
let workerStartBlocked = false;

async function tick(): Promise<void> {
  if (isRunning) {
    console.info(
      JSON.stringify(
        prospectBulkAnalysisLog("tick_skipped_busy", {
          workerId,
          tickCount,
        }),
      ),
    );
    return;
  }
  isRunning = true;
  tickCount += 1;
  try {
    console.info(
      JSON.stringify(
        prospectBulkAnalysisLog("tick_started", {
          workerId,
          tickCount,
        }),
      ),
    );
    // #region agent log
    if (tickCount <= 3) {
      void import("../debugSessionLog")
        .then(({ appendDebug34aeafLog }) => {
          appendDebug34aeafLog({
            hypothesisId: "C",
            runId: "pre-fix",
            location: "server/prospectImport/prospectBulkAnalysisWorker.ts:tick",
            message: "bulk_analysis_tick",
            data: { workerId, tickCount, pollIntervalMs: POLL_INTERVAL_MS },
          });
        })
        .catch(() => {});
    }
    // #endregion

    try {
      const recovered = await recoverStaleBulkAnalysisJobs();
      if (recovered > 0) {
        console.info(
          JSON.stringify(
            prospectBulkAnalysisLog("stale_leases_cleared", {
              workerId,
              recovered,
            }),
          ),
        );
      }
    } catch (err) {
      console.error(
        JSON.stringify(
          prospectBulkAnalysisLog("recover_stale_error", {
            workerId,
            error: err instanceof Error ? err.message : String(err),
          }),
        ),
      );
    }

    try {
      const healed = await healAbandonedProcessingAnalysis();
      if (healed > 0) {
        console.info(
          JSON.stringify(
            prospectBulkAnalysisLog("heal_processing_done", {
              workerId,
              healed,
            }),
          ),
        );
      }
    } catch (err) {
      console.error(
        JSON.stringify(
          prospectBulkAnalysisLog("heal_processing_error", {
            workerId,
            error: err instanceof Error ? err.message : String(err),
          }),
        ),
      );
    }

    const now = Date.now();
    if (now - lastOrphanSweepAt >= PROSPECT_ORPHAN_SWEEP_INTERVAL_MS) {
      lastOrphanSweepAt = now;
      try {
        const orphan = await recoverOrphanedPendingQualifications();
        if (orphan.recoveredContacts > 0) {
          console.info(
            JSON.stringify(
              prospectBulkAnalysisLog("orphan_sweep_done", {
                workerId,
                ...orphan,
              }),
            ),
          );
        }
      } catch (err) {
        console.error(
          JSON.stringify(
            prospectBulkAnalysisLog("orphan_sweep_error", {
              workerId,
              error: err instanceof Error ? err.message : String(err),
            }),
          ),
        );
      }
    }

    // Process at most one job per tick (bounded AI concurrency stays serial inside job).
    const job = await claimNextBulkAnalysisJob(workerId);
    if (job) {
      console.info(
        JSON.stringify(
          prospectBulkAnalysisLog("jobs_found", {
            workerId,
            jobId: job.id,
            status: job.status,
            progressTotal: job.progressTotal,
          }),
        ),
      );
      await processClaimedBulkAnalysisJob(job, workerId);
    } else {
      let claimable = 0;
      try {
        claimable = await countClaimableBulkAnalysisJobs();
      } catch {
        /* ignore diagnostic failure */
      }
      console.info(
        JSON.stringify(
          prospectBulkAnalysisLog("tick_idle", {
            workerId,
            tickCount,
            claimableJobs: claimable,
          }),
        ),
      );
      if (claimable > 0) {
        console.error(
          JSON.stringify(
            prospectBulkAnalysisLog("claim_missed_claimable_jobs", {
              workerId,
              claimableJobs: claimable,
            }),
          ),
        );
      }
    }
  } catch (err) {
    console.error(
      JSON.stringify(
        prospectBulkAnalysisLog("tick_error", {
          workerId,
          error: err instanceof Error ? err.message : String(err),
        }),
      ),
    );
  } finally {
    isRunning = false;
  }
}

function scheduleNext(): void {
  workerTimer = setTimeout(() => {
    void tick().finally(scheduleNext);
  }, POLL_INTERVAL_MS);
}

async function loadRecentAttemptDeploymentIds(): Promise<string[]> {
  const cutoff = new Date(Date.now() - FOREIGN_DEPLOY_LOOKBACK_MS);
  const rows = await db
    .select({
      rawResult: prospectIntelligence.rawResult,
      updatedAt: prospectIntelligence.updatedAt,
    })
    .from(prospectIntelligence)
    .where(gt(prospectIntelligence.updatedAt, cutoff))
    .orderBy(desc(prospectIntelligence.updatedAt))
    .limit(100);
  const ids: string[] = [];
  for (const row of rows) {
    const raw =
      row.rawResult && typeof row.rawResult === "object"
        ? (row.rawResult as Record<string, unknown>)
        : {};
    const id = String(raw.attemptRailwayDeploymentId || "").trim();
    if (id) ids.push(id);
  }
  return ids;
}

async function countForeignActiveLeases(): Promise<number> {
  const now = new Date();
  const rows = await db
    .select({
      leaseOwner: prospectBulkAnalysisJobs.leaseOwner,
    })
    .from(prospectBulkAnalysisJobs)
    .where(
      and(
        eq(prospectBulkAnalysisJobs.status, "running"),
        isNotNull(prospectBulkAnalysisJobs.leaseOwner),
        isNotNull(prospectBulkAnalysisJobs.leaseExpiresAt),
        gt(prospectBulkAnalysisJobs.leaseExpiresAt, now),
      ),
    );
  return rows.filter((r) => {
    const owner = String(r.leaseOwner || "");
    return owner && owner !== workerId;
  }).length;
}

async function warnIfForeignDeploymentsActive(
  currentDeploymentId: string | null,
): Promise<void> {
  try {
    const recentIds = await loadRecentAttemptDeploymentIds();
    const foreign = detectForeignProspectAiDeployment({
      currentDeploymentId,
      recentDeploymentIds: recentIds,
    });
    const foreignLeases = await countForeignActiveLeases();
    if (foreign.foreignDetected || foreignLeases > 0) {
      console.error(
        JSON.stringify(
          prospectBulkAnalysisLog("foreign_deployment_warning", {
            workerId,
            severity: "high",
            message:
              "Multiple deployments may be consuming the production Prospect AI queue. Stop every non-production Railway/Replit/local worker connected to this DATABASE_URL.",
            currentDeploymentId: currentDeploymentId || null,
            foreignDeploymentIds: foreign.foreignDeploymentIds,
            foreignActiveLeaseCount: foreignLeases,
          }),
        ),
      );
      console.error(
        `[ProspectBulkAnalysis] CRITICAL: foreign Prospect AI deployment activity detected. currentDeploymentId=${currentDeploymentId || "none"} foreign=${foreign.foreignDeploymentIds.join(",") || "none"} foreignLeases=${foreignLeases}`,
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify(
        prospectBulkAnalysisLog("foreign_deployment_check_error", {
          workerId,
          error: err instanceof Error ? err.message : String(err),
        }),
      ),
    );
  }
}

export function startProspectBulkAnalysisWorker(): void {
  if (workerTimer || workerStartBlocked) return;

  const keyDiag = describeOpenAiKeyRuntimeDiagnostics();
  const gate = shouldStartProspectAiBulkWorker(keyDiag);

  // #region agent log
  void import("../debugSessionLog")
    .then(({ appendDebug34aeafLog }) => {
      appendDebug34aeafLog({
        hypothesisId: "C",
        runId: "pre-fix",
        location: "server/prospectImport/prospectBulkAnalysisWorker.ts:start",
        message: "bulk_analysis_worker_start_attempt",
        data: {
          redisUrlConfigured: Boolean(String(process.env.REDIS_URL || "").trim()),
          nodeEnv: process.env.NODE_ENV || null,
          gateStart: gate.start,
          gateReason: gate.reason,
          pollIntervalMs: POLL_INTERVAL_MS,
          workerKind: "db_poll_not_bullmq",
        },
      });
    })
    .catch(() => {});
  // #endregion


  const ownership = {
    workerId,
    railwayProjectId: keyDiag.railwayProjectId,
    railwayProjectName: keyDiag.railwayProjectName,
    railwayServiceName: keyDiag.railwayServiceName,
    railwayEnvironmentName: keyDiag.railwayEnvironmentName,
    railwayDeploymentId: keyDiag.railwayDeploymentId,
    openaiKeySource: keyDiag.selectedSource,
    openaiKeyPrefixClass: keyDiag.prefixClass,
    openaiKeyLength: keyDiag.keyLength,
    openaiKeyOk: keyDiag.ok,
    resendKeyPrefixClass: keyDiag.resendKeyPrefixClass,
  };

  if (!gate.start) {
    workerStartBlocked = true;
    console.error(
      JSON.stringify(
        prospectBulkAnalysisLog("worker_start_blocked", {
          ...ownership,
          reason: gate.reason,
        }),
      ),
    );
    console.error(
      [
        "",
        "================================================================================",
        "[ProspectBulkAnalysis] FATAL: Prospect AI worker REFUSED TO START",
        `Reason: ${gate.reason}`,
        `OpenAI key class: ${keyDiag.prefixClass} (source=${keyDiag.selectedSource})`,
        `Railway project: ${keyDiag.railwayProjectName || keyDiag.railwayProjectId || "unknown"}`,
        `Railway service: ${keyDiag.railwayServiceName || "unknown"}`,
        `Railway deployment: ${keyDiag.railwayDeploymentId || "unknown"}`,
        "Web app will continue, but Prospect AI Review jobs will NOT be processed.",
        "Fix OPENAI_API_KEY to a valid sk-… key (keep RESEND_API_KEY as re_…), then redeploy.",
        "================================================================================",
        "",
      ].join("\n"),
    );
    return;
  }

  console.info(
    JSON.stringify(
      prospectBulkAnalysisLog("worker_started", {
        ...ownership,
        pollIntervalMs: POLL_INTERVAL_MS,
        orphanSweepIntervalMs: PROSPECT_ORPHAN_SWEEP_INTERVAL_MS,
      }),
    ),
  );
  console.info(
    `[ProspectBulkAnalysis] worker started workerId=${workerId} project=${keyDiag.railwayProjectName || keyDiag.railwayProjectId || "unknown"} service=${keyDiag.railwayServiceName || "unknown"} deployment=${keyDiag.railwayDeploymentId || "unknown"} openaiKey=${keyDiag.prefixClass} resendKey=${keyDiag.resendKeyPrefixClass}`,
  );

  // Immediate pass on boot so pending/stale jobs resume quickly after deploy.
  void warnIfForeignDeploymentsActive(keyDiag.railwayDeploymentId).finally(() => {
    void tick().finally(scheduleNext);
  });
}

export function stopProspectBulkAnalysisWorker(): void {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
}

/** Test helper — exposes busy flag without starting timers. */
export function __testGetBulkAnalysisWorkerBusy(): boolean {
  return isRunning;
}

/** Test helper — whether startup was blocked by key validation. */
export function __testGetBulkAnalysisWorkerStartBlocked(): boolean {
  return workerStartBlocked;
}

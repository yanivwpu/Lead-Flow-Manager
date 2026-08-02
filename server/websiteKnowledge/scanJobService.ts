/**
 * Durable, leased scan jobs.
 *
 * Extraction is one fetch plus one model call per source; a workspace with nine sources
 * cannot finish inside an HTTP request. Jobs survive a browser close or a Railway restart
 * via the lease plus per-source `item_results`, following the prospect bulk-analysis pattern.
 */

import crypto from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { aiKnowledgeScanJobs, type AiKnowledgeScanJobRow } from "@shared/schema";
import { listLiveFacts } from "./factStore";
import { applyMergeOperations } from "./factStore";
import {
  getKnowledgeSourcesByIds,
  listKnowledgeSources,
  markSourceScanning,
  recordSourceScanOutcome,
  type SourceStatus,
} from "./sourceStore";
import { scanSourceIntoDrafts, type ScanPipelineDeps } from "./scanPipeline";

const LEASE_MS = 5 * 60 * 1000;
const STALE_LEASE_MS = 10 * 60 * 1000;

export type ScanJobItemResult = {
  url: string;
  status: "pending" | "scanned" | "unchanged" | "failed" | "empty";
  label?: string;
  added?: number;
  changed?: number;
  unchanged?: number;
  retiring?: number;
  suggestions?: number;
  notes?: string[];
  error?: string;
  finishedAt?: string;
};

export type ScanJobView = {
  id: string;
  status: string;
  progressCurrent: number;
  progressTotal: number;
  factsProposed: number;
  errorMessage: string | null;
  createdAt: string | null;
  completedAt: string | null;
  items: Record<string, ScanJobItemResult>;
};

export function toScanJobView(row: AiKnowledgeScanJobRow): ScanJobView {
  return {
    id: row.id,
    status: row.status,
    progressCurrent: row.progressCurrent ?? 0,
    progressTotal: row.progressTotal ?? 0,
    factsProposed: row.factsProposed ?? 0,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    items: (row.itemResults as Record<string, ScanJobItemResult>) ?? {},
  };
}

/** A job already waiting or running for this workspace, if there is one. */
export async function getActiveScanJob(
  userId: string,
): Promise<AiKnowledgeScanJobRow | undefined> {
  const rows = await db
    .select()
    .from(aiKnowledgeScanJobs)
    .where(
      and(
        eq(aiKnowledgeScanJobs.userId, userId),
        inArray(aiKnowledgeScanJobs.status, ["pending", "running"]),
      ),
    )
    .orderBy(sql`${aiKnowledgeScanJobs.createdAt} ASC`)
    .limit(1);
  return rows[0];
}

/**
 * Enqueue a scan, or hand back the one already in flight.
 *
 * Two jobs for the same workspace could otherwise be claimed by two instances and propose
 * against the same fact keys at once, which the live-state unique index would turn into a
 * failed scan. One job per workspace at a time removes the race instead of catching it.
 */
export async function createScanJob(
  userId: string,
  sourceIds?: string[],
): Promise<AiKnowledgeScanJobRow> {
  const active = await getActiveScanJob(userId);
  if (active) return active;

  const sources = sourceIds?.length
    ? await getKnowledgeSourcesByIds(userId, sourceIds)
    : await listKnowledgeSources(userId, { enabledOnly: true });

  const ids = sources.map((s) => s.id);
  const items: Record<string, ScanJobItemResult> = {};
  for (const source of sources) {
    items[source.id] = {
      url: source.url,
      label: source.customLabel || source.title || source.url,
      status: "pending",
    };
  }

  const inserted = await db
    .insert(aiKnowledgeScanJobs)
    .values({
      userId,
      status: "pending",
      sourceIds: ids as unknown as Record<string, unknown>[],
      itemResults: items as unknown as Record<string, unknown>,
      progressCurrent: 0,
      progressTotal: ids.length,
    })
    .returning();
  return inserted[0];
}

export async function getScanJob(
  userId: string,
  jobId: string,
): Promise<AiKnowledgeScanJobRow | undefined> {
  const rows = await db
    .select()
    .from(aiKnowledgeScanJobs)
    .where(and(eq(aiKnowledgeScanJobs.userId, userId), eq(aiKnowledgeScanJobs.id, jobId)));
  return rows[0];
}

export async function getLatestScanJob(
  userId: string,
): Promise<AiKnowledgeScanJobRow | undefined> {
  const rows = await db
    .select()
    .from(aiKnowledgeScanJobs)
    .where(eq(aiKnowledgeScanJobs.userId, userId))
    .orderBy(sql`${aiKnowledgeScanJobs.createdAt} DESC`)
    .limit(1);
  return rows[0];
}

/** Reclaim jobs whose owner died mid-run. */
export async function recoverStaleScanJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_LEASE_MS);
  const recovered = await db
    .update(aiKnowledgeScanJobs)
    .set({ status: "pending", leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(aiKnowledgeScanJobs.status, "running"),
        sql`${aiKnowledgeScanJobs.leaseExpiresAt} IS NOT NULL AND ${aiKnowledgeScanJobs.leaseExpiresAt} < ${cutoff}`,
      ),
    )
    .returning({ id: aiKnowledgeScanJobs.id });
  return recovered.length;
}

export async function claimNextScanJob(
  workerId: string,
): Promise<AiKnowledgeScanJobRow | undefined> {
  return db.transaction(async (tx) => {
    const picked = await tx.execute(sql`
      SELECT id FROM ai_knowledge_scan_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);
    const rows = (picked as unknown as { rows?: Array<{ id: string }> }).rows ?? [];
    const id = rows[0]?.id;
    if (!id) return undefined;

    const claimed = await tx
      .update(aiKnowledgeScanJobs)
      .set({
        status: "running",
        leaseOwner: workerId,
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiKnowledgeScanJobs.id, id))
      .returning();
    return claimed[0];
  });
}

const SOURCE_STATUS_BY_SCAN: Record<string, SourceStatus> = {
  scanned: "scanned",
  unchanged: "scanned",
  failed: "failed",
  empty: "stale",
};

/**
 * Sources are processed one at a time, each with its own budget and its own error
 * handling, so page order cannot change the outcome and a 90k-character page cannot
 * prevent the pricing page from being processed.
 *
 * Safe to call twice on the same job: a source that already recorded a result is skipped,
 * so a job recovered after a restart resumes instead of re-paying for every model call.
 */
export async function processScanJob(
  job: AiKnowledgeScanJobRow,
  deps?: Partial<ScanPipelineDeps>,
): Promise<void> {
  const userId = job.userId;
  const sourceIds = Array.isArray(job.sourceIds) ? (job.sourceIds as string[]) : [];
  const items: Record<string, ScanJobItemResult> = {
    ...((job.itemResults as Record<string, ScanJobItemResult>) ?? {}),
  };
  let processed = 0;
  let factsProposed = job.factsProposed ?? 0;

  for (const sourceId of sourceIds) {
    if (items[sourceId]?.finishedAt) {
      processed += 1;
      continue;
    }

    const sources = await getKnowledgeSourcesByIds(userId, [sourceId]);
    const source = sources[0];
    if (!source) {
      processed += 1;
      continue;
    }

    try {
      await markSourceScanning(userId, sourceId);
      // Reloaded per source so each merge sees the drafts the previous source just wrote.
      const existingFacts = await listLiveFacts(userId);

      const result = await scanSourceIntoDrafts({
        source: { id: source.id, url: source.url, contentHash: source.contentHash },
        existingFacts,
        deps,
      });

      if (result.operations.length > 0) {
        await applyMergeOperations(userId, result.operations);
      }

      await recordSourceScanOutcome(userId, sourceId, {
        status: SOURCE_STATUS_BY_SCAN[result.status] ?? "failed",
        detectedType: result.detectedType,
        title: result.title,
        contentHash: result.contentHash ?? source.contentHash,
        charCount: result.charCount ?? source.charCount,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
      });

      factsProposed += result.stats.added + result.stats.changed + result.stats.suggestions;
      items[sourceId] = {
        url: source.url,
        label: source.customLabel || result.title || source.title || source.url,
        status: result.status,
        added: result.stats.added,
        changed: result.stats.changed,
        unchanged: result.stats.unchanged,
        retiring: result.stats.retiring,
        suggestions: result.stats.suggestions,
        notes: result.notes.length ? result.notes : undefined,
        error: result.errorMessage,
        finishedAt: new Date().toISOString(),
      };
    } catch (err) {
      // One source cannot take the job down with it. Its published facts are untouched,
      // because a scan only ever writes drafts.
      const message = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
      console.error("[Knowledge] source scan failed", { sourceId, message });
      await recordSourceScanOutcome(userId, sourceId, {
        status: "failed",
        errorCode: "SCAN_FAILED",
        errorMessage: message,
      }).catch(() => {
        /* status is cosmetic next to finishing the job */
      });
      items[sourceId] = {
        url: source.url,
        label: source.customLabel || source.title || source.url,
        status: "failed",
        error: message,
        finishedAt: new Date().toISOString(),
      };
    }

    processed += 1;

    await db
      .update(aiKnowledgeScanJobs)
      .set({
        progressCurrent: processed,
        factsProposed,
        itemResults: items as unknown as Record<string, unknown>,
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        updatedAt: new Date(),
      })
      .where(eq(aiKnowledgeScanJobs.id, job.id));
  }

  await db
    .update(aiKnowledgeScanJobs)
    .set({
      status: "completed",
      progressCurrent: processed,
      factsProposed,
      itemResults: items as unknown as Record<string, unknown>,
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiKnowledgeScanJobs.id, job.id));
}

export async function failScanJob(jobId: string, message: string): Promise<void> {
  await db
    .update(aiKnowledgeScanJobs)
    .set({
      status: "failed",
      errorMessage: message.slice(0, 500),
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiKnowledgeScanJobs.id, jobId));
}

export function newScanWorkerId(): string {
  return `knowledge-scan-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
}

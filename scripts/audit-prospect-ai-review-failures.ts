/**
 * Read-only: recent Prospect AI qualification failures (no Places / no retries).
 * Run: npx tsx scripts/audit-prospect-ai-review-failures.ts
 */
import { desc, eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  prospectBulkAnalysisJobs,
  prospectIntelligence,
} from "../shared/schema";

async function main() {
  const failed = await db
    .select({
      contactId: prospectIntelligence.contactId,
      analysisStatus: prospectIntelligence.analysisStatus,
      reviewStatus: prospectIntelligence.reviewStatus,
      errorMessage: prospectIntelligence.errorMessage,
      aiModel: prospectIntelligence.aiModel,
      updatedAt: prospectIntelligence.updatedAt,
      analyzedAt: prospectIntelligence.analyzedAt,
      name: contacts.name,
    })
    .from(prospectIntelligence)
    .innerJoin(contacts, eq(contacts.id, prospectIntelligence.contactId))
    .where(eq(prospectIntelligence.analysisStatus, "failed"))
    .orderBy(desc(prospectIntelligence.updatedAt))
    .limit(30);

  const jobs = await db
    .select({
      id: prospectBulkAnalysisJobs.id,
      status: prospectBulkAnalysisJobs.status,
      resultFailed: prospectBulkAnalysisJobs.resultFailed,
      errorMessage: prospectBulkAnalysisJobs.errorMessage,
      itemResults: prospectBulkAnalysisJobs.itemResults,
      createdAt: prospectBulkAnalysisJobs.createdAt,
      completedAt: prospectBulkAnalysisJobs.completedAt,
    })
    .from(prospectBulkAnalysisJobs)
    .orderBy(desc(prospectBulkAnalysisJobs.createdAt))
    .limit(5);

  const miamiFailed = failed.filter((r) =>
    /blackbook|chariff|coldwell|oliver ruiz|david freed|miami|keller|realty/i.test(
      String(r.name || ""),
    ),
  );

  const errorBuckets = new Map<string, number>();
  for (const row of failed) {
    const key = String(row.errorMessage || "(empty)").slice(0, 160);
    errorBuckets.set(key, (errorBuckets.get(key) || 0) + 1);
  }

  const [olderOk] = await db
    .select({
      contactId: prospectIntelligence.contactId,
      analysisStatus: prospectIntelligence.analysisStatus,
      name: contacts.name,
      updatedAt: prospectIntelligence.updatedAt,
      errorMessage: prospectIntelligence.errorMessage,
    })
    .from(prospectIntelligence)
    .innerJoin(contacts, eq(contacts.id, prospectIntelligence.contactId))
    .where(eq(prospectIntelligence.analysisStatus, "completed"))
    .orderBy(desc(prospectIntelligence.updatedAt))
    .limit(1);

  console.log(
    JSON.stringify(
      {
        failedCount: failed.length,
        miamiFailedSample: miamiFailed.slice(0, 8).map((r) => ({
          name: r.name,
          errorMessage: r.errorMessage,
          aiModel: r.aiModel,
          updatedAt: r.updatedAt?.toISOString?.() ?? null,
        })),
        errorBuckets: [...errorBuckets.entries()].map(([error, count]) => ({ error, count })),
        recentJobs: jobs.map((j) => ({
          idPrefix: String(j.id).slice(0, 8),
          status: j.status,
          resultFailed: j.resultFailed,
          errorMessage: j.errorMessage,
          createdAt: j.createdAt?.toISOString?.() ?? null,
          itemResultSample: summarizeItemResults(j.itemResults),
        })),
        olderCompleted: olderOk
          ? {
              name: olderOk.name,
              analysisStatus: olderOk.analysisStatus,
              updatedAt: olderOk.updatedAt?.toISOString?.() ?? null,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

function summarizeItemResults(raw: unknown): Array<{ status?: string; reason?: string; count: number }> {
  if (!raw || typeof raw !== "object") return [];
  const buckets = new Map<string, number>();
  for (const v of Object.values(raw as Record<string, unknown>)) {
    const row = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    const key = `${String(row.status || "?")}|${String(row.reason || "").slice(0, 120)}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return [...buckets.entries()].map(([k, count]) => {
    const [status, reason] = k.split("|");
    return { status, reason, count };
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

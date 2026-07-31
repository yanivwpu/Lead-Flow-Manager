/**
 * Read-only audit: Miami Prospect AI Review qualification status regression.
 * Does not mutate data. Does not call Places.
 *
 * Run: npx tsx scripts/audit-miami-qualification-status.ts
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts, prospectImportJobs, prospectIntelligence } from "../shared/schema";
import {
  isProspectDecisionQualified,
  isQualifiedForEmailCampaign,
  matchesProspectReviewWorkFilter,
  resolveProspectReviewWorkState,
} from "../shared/prospectAiReviewState";
import { isValidProspectEmail } from "../shared/prospectContactEnrichment";

function uxFromRow(row: {
  analysisStatus: string | null;
  reviewStatus: string | null;
  needsReview: boolean | null;
  enrichmentStatus: string | null;
  enrichmentTriggeredBy: string | null;
  recommendedOffer: string | null;
  email: string | null;
  websiteUrlUsed: string | null;
  enrichmentEmailFound: boolean | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
}) {
  const offer = String(row.recommendedOffer || "").toLowerCase();
  return {
    analysisStatus: row.analysisStatus,
    reviewStatus: row.reviewStatus,
    needsReview: row.needsReview,
    enrichmentStatus: row.enrichmentStatus,
    enrichmentTriggeredBy: row.enrichmentTriggeredBy,
    enrichmentEmailFound: row.enrichmentEmailFound,
    websiteUrlUsed: row.websiteUrlUsed,
    email: row.email,
    approvedAt: row.approvedAt,
    approvedByUserId: row.approvedByUserId,
    notQualified: offer === "not_a_fit",
  };
}

function filterBucket(ux: ReturnType<typeof uxFromRow>) {
  if (matchesProspectReviewWorkFilter(ux, "not_qualified")) return "not_qualified";
  if (matchesProspectReviewWorkFilter(ux, "qualified")) return "qualified";
  if (matchesProspectReviewWorkFilter(ux, "needs_review")) return "needs_review";
  return "other";
}

/** Legacy campaign-ready Qualified (pre manual-decision filter). */
function legacyCampaignQualified(ux: ReturnType<typeof uxFromRow>) {
  if (ux.notQualified) return false;
  // Pre-change: Qualified tab ≈ campaign hard gates WITHOUT requiring approved.
  // Reconstruct by temporarily treating approved for gate comparison is wrong.
  // Instead: old isQualifiedForEmailCampaign ignored reviewStatus — simulate that.
  const withoutDecisionGate = {
    ...ux,
    reviewStatus: "approved" as const,
  };
  return isQualifiedForEmailCampaign(withoutDecisionGate);
}

function repairEvidence(row: {
  reviewStatus: string | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  enrichmentTriggeredBy: string | null;
  enrichmentStatus: string | null;
  recommendedOffer: string | null;
}) {
  const reasons: string[] = [];
  const review = String(row.reviewStatus || "").toLowerCase();
  const offer = String(row.recommendedOffer || "").toLowerCase();
  if (offer === "not_a_fit") {
    return { eligible: false, reasons: ["explicit_not_a_fit"] };
  }
  if (review === "approved") {
    reasons.push("reviewStatus_approved");
  }
  if (row.approvedAt) reasons.push("approvedAt_set");
  if (row.approvedByUserId) reasons.push("approvedByUserId_set");
  if (String(row.enrichmentTriggeredBy || "").toLowerCase() === "approve") {
    reasons.push("enrichmentTriggeredBy_approve");
  }
  // Clear legacy approval evidence that should map to Qualified even if reviewStatus was overwritten
  const eligible =
    review === "approved" ||
    Boolean(row.approvedAt) ||
    Boolean(row.approvedByUserId) ||
    String(row.enrichmentTriggeredBy || "").toLowerCase() === "approve";
  return { eligible, reasons };
}

async function main() {
  // Prefer Miami discovery import batches, fall back to Miami-like contact signals.
  const miamiJobs = await db
    .select({
      id: prospectImportJobs.id,
      batchName: prospectImportJobs.batchName,
      createdAt: prospectImportJobs.createdAt,
    })
    .from(prospectImportJobs)
    .where(
      or(
        ilike(prospectImportJobs.batchName, "%Miami%"),
        ilike(prospectImportJobs.batchName, "%miami%"),
      ),
    )
    .orderBy(desc(prospectImportJobs.createdAt))
    .limit(20);

  const rows = await db
    .select({
      contactId: contacts.id,
      name: contacts.name,
      email: contacts.email,
      batchNameMeta: sql<string | null>`coalesce(
        (${contacts.sourceDetails}->'prospectImport'->>'batchName')::text,
        (${contacts.customFields}->'prospectImport'->>'batchName')::text,
        (${contacts.sourceDetails}->'prospectAi'->>'batchName')::text
      )`,
      importJobId: prospectIntelligence.importJobId,
      analysisStatus: prospectIntelligence.analysisStatus,
      reviewStatus: prospectIntelligence.reviewStatus,
      needsReview: prospectIntelligence.needsReview,
      recommendedOffer: prospectIntelligence.recommendedOffer,
      priority: prospectIntelligence.priority,
      potentialFit: prospectIntelligence.potentialFit,
      enrichmentStatus: prospectIntelligence.enrichmentStatus,
      enrichmentTriggeredBy: prospectIntelligence.enrichmentTriggeredBy,
      enrichmentEmailFound: prospectIntelligence.enrichmentEmailFound,
      websiteUrlUsed: prospectIntelligence.websiteUrlUsed,
      approvedAt: prospectIntelligence.approvedAt,
      approvedByUserId: prospectIntelligence.approvedByUserId,
      analyzedAt: prospectIntelligence.analyzedAt,
      websiteAnalyzedAt: prospectIntelligence.websiteAnalyzedAt,
      updatedAt: prospectIntelligence.updatedAt,
      createdAt: prospectIntelligence.createdAt,
    })
    .from(contacts)
    .innerJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
    .where(
      or(
        ilike(sql`coalesce(${contacts.sourceDetails}::text, '')`, "%Miami%"),
        ilike(contacts.name, "%Miami%"),
        ilike(sql`coalesce(${contacts.notes}, '')`, "%Miami%"),
        ilike(
          sql`coalesce((${contacts.sourceDetails}->'prospectImport'->>'batchName')::text, '')`,
          "%Miami%",
        ),
        ilike(
          sql`coalesce((${contacts.sourceDetails}->'prospectAi'->>'batchName')::text, '')`,
          "%Miami%",
        ),
      ),
    )
    .orderBy(desc(prospectIntelligence.updatedAt))
    .limit(200);

  const miamiJobIds = new Set(miamiJobs.map((j) => j.id));
  const miamiish = rows.filter((r) => {
    if (r.importJobId && miamiJobIds.has(r.importJobId)) return true;
    const hay = `${r.name || ""} ${r.batchNameMeta || ""}`.toLowerCase();
    return /miami/.test(hay) || /miami/.test(String(r.websiteUrlUsed || "").toLowerCase());
  });

  // Prefer the latest Miami batch of ~20 if identifiable
  const byJob = new Map<string, typeof miamiish>();
  for (const r of miamiish) {
    const key = r.importJobId || "none";
    const list = byJob.get(key) || [];
    list.push(r);
    byJob.set(key, list);
  }
  let target = miamiish;
  let targetBatch: { id: string; batchName: string | null; count: number } | null = null;
  for (const job of miamiJobs) {
    const list = byJob.get(job.id) || [];
    if (list.length >= 15 && list.length <= 25) {
      target = list;
      targetBatch = { id: job.id, batchName: job.batchName, count: list.length };
      break;
    }
  }
  if (!targetBatch) {
    // largest miami job
    let best: { id: string; batchName: string | null; count: number } | null = null;
    for (const job of miamiJobs) {
      const list = byJob.get(job.id) || [];
      if (!best || list.length > best.count) {
        best = { id: job.id, batchName: job.batchName, count: list.length };
        target = list.length ? list : target;
      }
    }
    targetBatch = best;
  }

  const prospects = target.slice(0, 40).map((r) => {
    const ux = uxFromRow(r);
    const repair = repairEvidence(r);
    const currentFilter = filterBucket(ux);
    const wouldLegacyCampaignQualify = legacyCampaignQualified(ux);
    return {
      contactId: r.contactId,
      name: r.name,
      batchName: r.batchNameMeta,
      importJobId: r.importJobId,
      reviewStatus: r.reviewStatus,
      needsReview: r.needsReview,
      recommendedOffer: r.recommendedOffer,
      not_a_fit: String(r.recommendedOffer || "").toLowerCase() === "not_a_fit",
      aiRecommendation: {
        potentialFit: r.potentialFit,
        priority: r.priority,
        recommendedOffer: r.recommendedOffer,
        needsReview: r.needsReview,
      },
      enrichmentStatus: r.enrichmentStatus,
      enrichmentTriggeredBy: r.enrichmentTriggeredBy,
      emailPresent: isValidProspectEmail(r.email),
      email: r.email ? "[redacted-has-email]" : null,
      approvedAt: r.approvedAt?.toISOString?.() ?? null,
      approvedByUserId: r.approvedByUserId ? String(r.approvedByUserId).slice(0, 8) : null,
      analyzedAt: r.analyzedAt?.toISOString?.() ?? null,
      websiteAnalyzedAt: r.websiteAnalyzedAt?.toISOString?.() ?? null,
      updatedAt: r.updatedAt?.toISOString?.() ?? null,
      decisionQualified: isProspectDecisionQualified(ux),
      campaignEligible: isQualifiedForEmailCampaign(ux),
      workState: resolveProspectReviewWorkState(ux),
      uiFilterNow: currentFilter,
      legacyCampaignQualifiedTab: wouldLegacyCampaignQualify,
      /** Would appear to regress: was campaign-Qualified, now Needs Review */
      regressionCandidate:
        wouldLegacyCampaignQualify &&
        currentFilter === "needs_review" &&
        !ux.notQualified,
      repairEligible: repair.eligible && currentFilter !== "qualified" && !ux.notQualified,
      repairReasons: repair.reasons,
      likelyCause:
        currentFilter === "not_qualified"
          ? "explicit_not_a_fit"
          : currentFilter === "qualified"
            ? "reviewStatus_approved"
            : repair.eligible
              ? "ui_mapping_or_overwritten_reviewStatus_with_approval_evidence"
              : wouldLegacyCampaignQualify
                ? "ui_mapping_only_campaign_ready_never_explicitly_approved"
                : "undecided_needs_review",
    };
  });

  const counts = {
    total: prospects.length,
    ui: {
      needs_review: prospects.filter((p) => p.uiFilterNow === "needs_review").length,
      qualified: prospects.filter((p) => p.uiFilterNow === "qualified").length,
      not_qualified: prospects.filter((p) => p.uiFilterNow === "not_qualified").length,
    },
    reviewStatus: prospects.reduce(
      (acc, p) => {
        const k = String(p.reviewStatus || "null");
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    withApprovedAt: prospects.filter((p) => p.approvedAt).length,
    withApproveTrigger: prospects.filter(
      (p) => String(p.enrichmentTriggeredBy || "").toLowerCase() === "approve",
    ).length,
    regressionCandidates: prospects.filter((p) => p.regressionCandidate).length,
    repairEligible: prospects.filter((p) => p.repairEligible).length,
    enrichedNoDecisionNeedsReview: prospects.filter(
      (p) =>
        p.uiFilterNow === "needs_review" &&
        String(p.enrichmentStatus || "").toLowerCase() === "completed" &&
        !p.repairEligible,
    ).length,
  };

  const dryRunRepair = prospects
    .filter((p) => p.repairEligible)
    .map((p) => ({
      contactId: p.contactId,
      name: p.name,
      before: {
        reviewStatus: p.reviewStatus,
        uiFilter: p.uiFilterNow,
        needsReview: p.needsReview,
      },
      after: {
        reviewStatus: "approved",
        uiFilter: "qualified",
        needsReview: false,
      },
      reasons: p.repairReasons,
    }));

  const out = {
    auditedAt: new Date().toISOString(),
    miamiJobs: miamiJobs.slice(0, 10),
    targetBatch,
    counts,
    dryRunRepairCount: dryRunRepair.length,
    dryRunRepair,
    prospects,
  };

  writeFileSync("audit-miami-qualification-status.json", JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        targetBatch,
        counts,
        dryRunRepairCount: dryRunRepair.length,
        sampleRepair: dryRunRepair.slice(0, 5),
        sampleProspects: prospects.slice(0, 5).map((p) => ({
          name: p.name,
          reviewStatus: p.reviewStatus,
          uiFilterNow: p.uiFilterNow,
          approvedAt: p.approvedAt,
          enrichmentTriggeredBy: p.enrichmentTriggeredBy,
          likelyCause: p.likelyCause,
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

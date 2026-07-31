/**
 * Audit + dry-run repair for Los Angeles Prospect AI Review batch.
 * Defaults to dry-run (no writes). Does not call Places / AI.
 *
 * Dry-run:  npx tsx scripts/audit-repair-la-qualification.ts
 * Apply:    npx tsx scripts/audit-repair-la-qualification.ts --apply
 * Location: optional --location "Los Angeles" (default)
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  prospectAiDiscoverySearches,
  prospectIntelligence,
} from "../shared/schema";
import {
  explainQualifiedForCampaign,
  isProspectAwaitingHumanReview,
  isProspectDecisionQualified,
  matchesProspectReviewWorkFilter,
} from "../shared/prospectAiReviewState";
import { isValidProspectEmail } from "../shared/prospectContactEnrichment";
import { readProspectQualificationSource } from "../shared/prospectAutoQualify";
import { proposeProspectQualificationRepair } from "../shared/prospectQualificationRepair";

const APPLY = process.argv.includes("--apply");
const locArgIdx = process.argv.indexOf("--location");
const LOCATION =
  locArgIdx >= 0 && process.argv[locArgIdx + 1]
    ? String(process.argv[locArgIdx + 1])
    : "Los Angeles";

function filterBucket(ux: Parameters<typeof matchesProspectReviewWorkFilter>[0]) {
  if (matchesProspectReviewWorkFilter(ux, "not_qualified")) return "not_qualified";
  if (matchesProspectReviewWorkFilter(ux, "needs_review")) return "needs_review";
  if (isProspectDecisionQualified(ux)) return "qualified";
  return "other";
}

async function main() {
  const searches = await db
    .select({
      id: prospectAiDiscoverySearches.id,
      businessType: prospectAiDiscoverySearches.businessType,
      location: prospectAiDiscoverySearches.location,
      createdAt: prospectAiDiscoverySearches.createdAt,
    })
    .from(prospectAiDiscoverySearches)
    .where(ilike(prospectAiDiscoverySearches.location, `%${LOCATION}%`))
    .orderBy(desc(prospectAiDiscoverySearches.createdAt))
    .limit(20);

  const rows = await db
    .select({
      contactId: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      batchNameMeta: sql<string | null>`coalesce(
        (${contacts.sourceDetails}->'prospectAi'->>'batchName')::text,
        (${contacts.customFields}->'prospectAi'->>'batchName')::text,
        (${contacts.sourceDetails}->'prospectImport'->>'batchName')::text
      )`,
      discoverySourceMeta: sql<string | null>`coalesce(
        (${contacts.sourceDetails}->'prospectAi'->>'discoverySource')::text,
        (${contacts.sourceDetails}->'prospectAi'->>'provider')::text
      )`,
      businessTypeMeta: sql<string | null>`coalesce(
        (${contacts.sourceDetails}->'prospectAi'->>'businessType')::text,
        (${contacts.customFields}->'prospectAi'->>'businessType')::text
      )`,
      websiteMeta: sql<string | null>`coalesce(
        (${contacts.sourceDetails}->'prospectAi'->>'websiteUrl')::text,
        (${contacts.customFields}->'prospectAi'->>'websiteUrl')::text
      )`,
      analysisStatus: prospectIntelligence.analysisStatus,
      reviewStatus: prospectIntelligence.reviewStatus,
      needsReview: prospectIntelligence.needsReview,
      priority: prospectIntelligence.priority,
      recommendedOffer: prospectIntelligence.recommendedOffer,
      potentialFit: prospectIntelligence.potentialFit,
      leadScore: prospectIntelligence.leadScore,
      confidence: prospectIntelligence.confidence,
      businessType: prospectIntelligence.businessType,
      industry: prospectIntelligence.industry,
      companyName: prospectIntelligence.companyName,
      realEstateLikelihood: prospectIntelligence.realEstateLikelihood,
      reasoningSummary: prospectIntelligence.reasoningSummary,
      suggestedOutreachAngle: prospectIntelligence.suggestedOutreachAngle,
      suggestedFirstMessage: prospectIntelligence.suggestedFirstMessage,
      suggestedOutreachSubject: prospectIntelligence.suggestedOutreachSubject,
      approvedAt: prospectIntelligence.approvedAt,
      approvedByUserId: prospectIntelligence.approvedByUserId,
      enrichmentStatus: prospectIntelligence.enrichmentStatus,
      enrichmentTriggeredBy: prospectIntelligence.enrichmentTriggeredBy,
      enrichmentEmailFound: prospectIntelligence.enrichmentEmailFound,
      websiteUrlUsed: prospectIntelligence.websiteUrlUsed,
      rawResult: prospectIntelligence.rawResult,
      aiVersion: prospectIntelligence.aiVersion,
      analyzedAt: prospectIntelligence.analyzedAt,
      updatedAt: prospectIntelligence.updatedAt,
    })
    .from(contacts)
    .innerJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
    .where(
      or(
        ilike(sql`coalesce(${contacts.sourceDetails}::text, '')`, `%${LOCATION}%`),
        ilike(sql`coalesce(${contacts.customFields}::text, '')`, `%${LOCATION}%`),
        ilike(sql`coalesce(${contacts.notes}, '')`, `%${LOCATION}%`),
        ilike(contacts.name, `%${LOCATION}%`),
        ilike(
          sql`coalesce((${contacts.sourceDetails}->'prospectAi'->>'batchName')::text, '')`,
          `%${LOCATION}%`,
        ),
        ilike(
          sql`coalesce((${contacts.customFields}->'prospectAi'->>'batchName')::text, '')`,
          `%${LOCATION}%`,
        ),
      ),
    )
    .orderBy(desc(prospectIntelligence.updatedAt))
    .limit(200);

  // Prefer rows whose batch/name clearly references LOCATION; cap at 50.
  const locationRe = new RegExp(LOCATION.replace(/\s+/g, "\\s+"), "i");
  const filtered = rows.filter((r) => {
    const hay = `${r.name || ""} ${r.batchNameMeta || ""} ${r.websiteUrlUsed || ""}`;
    return locationRe.test(hay) || locationRe.test(String(r.batchNameMeta || ""));
  });
  const prospects = (filtered.length >= 20 ? filtered : rows).slice(0, 50);

  const audited = prospects.map((row) => {
    const raw =
      row.rawResult && typeof row.rawResult === "object"
        ? (row.rawResult as Record<string, unknown>)
        : {};
    const qualificationSource = readProspectQualificationSource(raw);
    const websiteUrl =
      String(row.websiteUrlUsed || "").trim() ||
      String(row.websiteMeta || "").trim() ||
      null;
    const businessType =
      String(row.businessType || row.businessTypeMeta || "").trim() || null;
    const batchName = String(row.batchNameMeta || "").trim() || null;
    const offer = String(row.recommendedOffer || "").toLowerCase();
    const ux = {
      analysisStatus: row.analysisStatus,
      reviewStatus: row.reviewStatus,
      needsReview: row.needsReview,
      enrichmentStatus: row.enrichmentStatus,
      enrichmentTriggeredBy: row.enrichmentTriggeredBy,
      approvedAt: row.approvedAt,
      approvedByUserId: row.approvedByUserId,
      email: row.email,
      websiteUrl,
      suggestedFirstMessage: row.suggestedFirstMessage,
      suggestedOutreachSubject: row.suggestedOutreachSubject,
      notQualified: offer === "not_a_fit",
      qualificationSource,
      rawResult: raw,
    };
    const bucket = filterBucket(ux);
    const campaign = explainQualifiedForCampaign(ux);

    const repair = proposeProspectQualificationRepair({
      contactId: row.contactId,
      name: row.name,
      company: row.companyName,
      companyName: row.companyName,
      businessType,
      industry: row.industry,
      websiteUrl,
      batchName:
        batchName ||
        (businessType ? `Prospect AI: ${businessType} in ${LOCATION}` : null),
      importReason: "Local prospect discovery",
      discoverySource: String(row.discoverySourceMeta || "google_places"),
      analysisStatus: row.analysisStatus,
      reviewStatus: row.reviewStatus,
      needsReview: row.needsReview,
      priority: row.priority,
      recommendedOffer: row.recommendedOffer,
      potentialFit: row.potentialFit,
      leadScore: row.leadScore,
      confidence: row.confidence,
      realEstateLikelihood: row.realEstateLikelihood,
      reasoningSummary: row.reasoningSummary,
      suggestedOutreachAngle: row.suggestedOutreachAngle,
      approvedAt: row.approvedAt,
      approvedByUserId: row.approvedByUserId,
      enrichmentTriggeredBy: row.enrichmentTriggeredBy,
      rawResult: raw,
      qualificationSource,
    });

    const proposedBucket =
      repair.action === "auto_qualify" || repair.action === "keep_qualified"
        ? "qualified"
        : repair.action === "keep_not_qualified"
          ? "not_qualified"
          : repair.action === "keep_needs_review"
            ? "needs_review"
            : bucket;

    return {
      contactId: row.contactId,
      name: row.name,
      batchName,
      reviewStatus: row.reviewStatus,
      approvedAt: row.approvedAt,
      qualificationSource,
      recommendedOffer: row.recommendedOffer,
      needsReview: row.needsReview,
      priority: row.priority,
      analysisStatus: row.analysisStatus,
      leadScore: row.leadScore,
      potentialFit: row.potentialFit,
      confidence: row.confidence,
      businessType,
      industry: row.industry,
      emailPresent: isValidProspectEmail(row.email),
      phonePresent: Boolean(String(row.phone || "").trim()),
      enrichmentStatus: row.enrichmentStatus,
      hasOutreach: Boolean(
        String(row.suggestedFirstMessage || "").trim() ||
          String(row.suggestedOutreachSubject || "").trim(),
      ),
      aiVersion: row.aiVersion,
      analyzedAt: row.analyzedAt,
      filterBucket: bucket,
      awaitingHumanReview: isProspectAwaitingHumanReview(ux),
      decisionQualified: isProspectDecisionQualified(ux),
      campaignReady: campaign.ok,
      campaignBlock: campaign.ok ? null : { code: campaign.code, message: campaign.message },
      contradictionReadyVsNeeds: campaign.ok && bucket === "needs_review",
      contradictionReadyVsNotQualified: campaign.ok && bucket === "not_qualified",
      reasoningSummary: row.reasoningSummary,
      repair,
      proposedBucket,
    };
  });

  const currentCounts = {
    all: audited.length,
    needsReview: audited.filter((r) => r.filterBucket === "needs_review").length,
    notQualified: audited.filter((r) => r.filterBucket === "not_qualified").length,
    qualified: audited.filter((r) => r.filterBucket === "qualified").length,
    campaignReady: audited.filter((r) => r.campaignReady).length,
    missingEmail: audited.filter((r) => !r.emailPresent).length,
    contradictions: audited.filter(
      (r) => r.contradictionReadyVsNeeds || r.contradictionReadyVsNotQualified,
    ).length,
  };

  const proposedQualified = audited.filter((r) => r.proposedBucket === "qualified");
  const proposedCounts = {
    all: audited.length,
    needsReview: audited.filter((r) => r.proposedBucket === "needs_review").length,
    notQualified: audited.filter((r) => r.proposedBucket === "not_qualified").length,
    qualified: proposedQualified.length,
    wouldAutoQualify: audited.filter((r) => r.repair.action === "auto_qualify").length,
    preservedManual: audited.filter((r) => r.repair.preservedManualDecision).length,
    staleSoftNotAFit: audited.filter((r) => r.repair.staleSoftNotAFit).length,
    genuineStrongReject: audited.filter((r) => r.repair.genuineStrongReject).length,
    campaignReady: proposedQualified.filter((r) => r.emailPresent && r.hasOutreach).length,
    missingEmail: proposedQualified.filter((r) => !r.emailPresent).length,
    outreachBlocked: proposedQualified.filter((r) => r.emailPresent && !r.hasOutreach).length,
  };

  const out = {
    mode: APPLY ? "apply" : "dry-run",
    location: LOCATION,
    discoverySearches: searches,
    currentCounts,
    proposedCounts,
    needsReviewRows: audited.filter((r) => r.filterBucket === "needs_review"),
    notQualifiedRows: audited.filter((r) => r.filterBucket === "not_qualified"),
    repairPlan: audited.map((r) => ({
      contactId: r.contactId,
      name: r.name,
      currentBucket: r.filterBucket,
      proposedBucket: r.proposedBucket,
      action: r.repair.action,
      reason: r.repair.reason,
      staleSoftNotAFit: r.repair.staleSoftNotAFit,
      genuineStrongReject: r.repair.genuineStrongReject,
      preservedManualDecision: r.repair.preservedManualDecision,
      before: r.repair.before,
      after: r.repair.after,
      leadScore: r.leadScore,
      potentialFit: r.potentialFit,
      recommendedOffer: r.recommendedOffer,
      qualificationSource: r.qualificationSource,
      aiVersion: r.aiVersion,
      emailPresent: r.emailPresent,
      hasOutreach: r.hasOutreach,
      campaignReady: r.campaignReady,
      campaignBlock: r.campaignBlock,
      reasoningSummary: String(r.reasoningSummary || "").slice(0, 240),
    })),
  };

  const outFile = "audit-repair-la-qualification-dry-run.json";
  writeFileSync(outFile, JSON.stringify({ ...out, all: audited }, null, 2));

  if (!APPLY) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          location: LOCATION,
          matched: audited.length,
          discoverySearches: searches.map((s) => ({
            id: s.id,
            businessType: s.businessType,
            location: s.location,
          })),
          currentCounts,
          proposedCounts,
          sampleNeedsReview: out.needsReviewRows.slice(0, 8).map((r) => ({
            name: r.name,
            repairReason: r.repair.reason,
            reviewStatus: r.reviewStatus,
            qualificationSource: r.qualificationSource,
            recommendedOffer: r.recommendedOffer,
            needsReview: r.needsReview,
            leadScore: r.leadScore,
            campaignReady: r.campaignReady,
            campaignBlock: r.campaignBlock,
            aiVersion: r.aiVersion,
          })),
          sampleNotQualified: out.notQualifiedRows.slice(0, 12).map((r) => ({
            name: r.name,
            repairReason: r.repair.reason,
            staleSoftNotAFit: r.repair.staleSoftNotAFit,
            genuineStrongReject: r.repair.genuineStrongReject,
            preservedManual: r.repair.preservedManualDecision,
            leadScore: r.leadScore,
            potentialFit: r.potentialFit,
            recommendedOffer: r.recommendedOffer,
            qualificationSource: r.qualificationSource,
            aiVersion: r.aiVersion,
            reasoningSummary: String(r.reasoningSummary || "").slice(0, 160),
          })),
          wrote: outFile,
        },
        null,
        2,
      ),
    );
    return;
  }

  let updated = 0;
  for (const row of audited) {
    if (row.repair.action !== "auto_qualify" || !row.repair.after) continue;
    const after = row.repair.after;
    const patch: Record<string, unknown> = {
      reviewStatus: after.reviewStatus,
      needsReview: after.needsReview,
      recommendedOffer: after.recommendedOffer,
      updatedAt: new Date(),
    };
    if (after.approvedAt === "set_now") patch.approvedAt = new Date();
    if (after.approvedAt === "clear") patch.approvedAt = null;
    if (after.approvedByUserId === "clear") patch.approvedByUserId = null;
    if (after.rawResultPatch) patch.rawResult = after.rawResultPatch;
    await db
      .update(prospectIntelligence)
      .set(patch)
      .where(eq(prospectIntelligence.contactId, row.contactId));
    updated += 1;
  }

  console.log(
    JSON.stringify({ mode: "apply", matched: audited.length, updated, wrote: outFile }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

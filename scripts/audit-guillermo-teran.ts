/**
 * Read-only audit: Guillermo Teran Group qualification status.
 * Run: npx tsx scripts/audit-guillermo-teran.ts
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts, prospectIntelligence } from "../shared/schema";
import {
  hasLegacyProspectApprovalEvidence,
  isProspectDecisionQualified,
  isQualifiedForEmailCampaign,
  matchesProspectReviewWorkFilter,
  resolveProspectReviewWorkState,
} from "../shared/prospectAiReviewState";
import { isValidProspectEmail } from "../shared/prospectContactEnrichment";

async function main() {
  const rows = await db
    .select({
      contactId: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      notes: contacts.notes,
      sourceDetails: contacts.sourceDetails,
      customFields: contacts.customFields,
      reviewStatus: prospectIntelligence.reviewStatus,
      recommendedOffer: prospectIntelligence.recommendedOffer,
      needsReview: prospectIntelligence.needsReview,
      potentialFit: prospectIntelligence.potentialFit,
      priority: prospectIntelligence.priority,
      reasoningSummary: prospectIntelligence.reasoningSummary,
      approvedAt: prospectIntelligence.approvedAt,
      approvedByUserId: prospectIntelligence.approvedByUserId,
      enrichmentTriggeredBy: prospectIntelligence.enrichmentTriggeredBy,
      enrichmentStatus: prospectIntelligence.enrichmentStatus,
      enrichmentEmailFound: prospectIntelligence.enrichmentEmailFound,
      enrichmentResult: prospectIntelligence.enrichmentResult,
      websiteUrlUsed: prospectIntelligence.websiteUrlUsed,
      websiteAnalyzedAt: prospectIntelligence.websiteAnalyzedAt,
      analyzedAt: prospectIntelligence.analyzedAt,
      updatedAt: prospectIntelligence.updatedAt,
      createdAt: prospectIntelligence.createdAt,
      analysisStatus: prospectIntelligence.analysisStatus,
    })
    .from(contacts)
    .innerJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
    .where(
      or(
        ilike(contacts.name, "%Teran%"),
        ilike(contacts.name, "%Guillermo%"),
        ilike(sql`coalesce(${contacts.notes}, '')`, "%Teran%"),
        ilike(sql`coalesce(${contacts.sourceDetails}::text, '')`, "%Teran%"),
      ),
    )
    .limit(20);

  const out = rows.map((r) => {
    const offer = String(r.recommendedOffer || "").toLowerCase();
    const ux = {
      analysisStatus: r.analysisStatus,
      reviewStatus: r.reviewStatus,
      needsReview: r.needsReview,
      enrichmentStatus: r.enrichmentStatus,
      enrichmentTriggeredBy: r.enrichmentTriggeredBy,
      enrichmentEmailFound: r.enrichmentEmailFound,
      websiteUrlUsed: r.websiteUrlUsed,
      email: r.email,
      approvedAt: r.approvedAt,
      approvedByUserId: r.approvedByUserId,
      notQualified: offer === "not_a_fit",
    };
    const er = (r.enrichmentResult || {}) as Record<string, unknown>;
    const pc = (er.publicContacts || {}) as { emails?: string[]; phones?: string[]; socialProfiles?: unknown };
    const sd = (r.sourceDetails || {}) as Record<string, unknown>;
    return {
      contactId: r.contactId,
      name: r.name,
      emailPresent: isValidProspectEmail(r.email),
      phonePresent: Boolean(String(r.phone || "").trim()),
      reviewStatus: r.reviewStatus,
      recommendedOffer: r.recommendedOffer,
      needsReview: r.needsReview,
      potentialFit: r.potentialFit,
      priority: r.priority,
      reasoningSummary: r.reasoningSummary,
      approvedAt: r.approvedAt?.toISOString?.() ?? null,
      approvedByUserId: r.approvedByUserId,
      enrichmentTriggeredBy: r.enrichmentTriggeredBy,
      enrichmentStatus: r.enrichmentStatus,
      enrichmentEmailFound: r.enrichmentEmailFound,
      websiteUrlUsed: r.websiteUrlUsed,
      websiteAnalyzedAt: r.websiteAnalyzedAt?.toISOString?.() ?? null,
      analyzedAt: r.analyzedAt?.toISOString?.() ?? null,
      updatedAt: r.updatedAt?.toISOString?.() ?? null,
      createdAt: r.createdAt?.toISOString?.() ?? null,
      analysisStatus: r.analysisStatus,
      enrichmentPublicEmails: pc.emails || [],
      enrichmentHasSocial: Boolean(pc.socialProfiles),
      contactEmailMatchesEnrichment:
        r.email && Array.isArray(pc.emails)
          ? pc.emails.some((e) => String(e).toLowerCase() === String(r.email).toLowerCase())
          : false,
      emailLikelySource:
        r.enrichmentEmailFound === true
          ? "enrichment"
          : r.email
            ? "contact_field_manual_or_discovery"
            : "none",
      hasLegacyApproval: hasLegacyProspectApprovalEvidence(ux),
      decisionQualified: isProspectDecisionQualified(ux),
      campaignEligible: isQualifiedForEmailCampaign(ux),
      workState: resolveProspectReviewWorkState(ux),
      uiFilter: matchesProspectReviewWorkFilter(ux, "not_qualified")
        ? "not_qualified"
        : matchesProspectReviewWorkFilter(ux, "qualified")
          ? "qualified"
          : matchesProspectReviewWorkFilter(ux, "needs_review")
            ? "needs_review"
            : "other",
      verdict:
        offer === "not_a_fit" && !hasLegacyProspectApprovalEvidence(ux)
          ? "A_ai_not_a_fit_no_human_qualify"
          : offer === "not_a_fit" && hasLegacyProspectApprovalEvidence(ux)
            ? "B_or_conflict_human_approved_but_not_a_fit_wins_today"
            : "other",
      sourceDetailsKeys: Object.keys(sd),
    };
  });

  writeFileSync("audit-guillermo-teran.json", JSON.stringify({ count: out.length, out }, null, 2));
  console.log(JSON.stringify({ count: out.length, out }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

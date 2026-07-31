/**
 * Read-only: recent Prospect AI enrichment failures (esp. after manual email).
 * Run: npx tsx scripts/audit-enrichment-failures-manual-email.ts
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { and, desc, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts, prospectEnrichmentJobs, prospectIntelligence } from "../shared/schema";
import { isValidProspectEmail } from "../shared/prospectContactEnrichment";

async function main() {
  const rows = await db
    .select({
      contactId: contacts.id,
      name: contacts.name,
      email: contacts.email,
      enrichmentStatus: prospectIntelligence.enrichmentStatus,
      enrichmentEmailFound: prospectIntelligence.enrichmentEmailFound,
      enrichmentErrorMessage: prospectIntelligence.enrichmentErrorMessage,
      enrichmentResult: prospectIntelligence.enrichmentResult,
      websiteUrlUsed: prospectIntelligence.websiteUrlUsed,
      enrichmentTriggeredBy: prospectIntelligence.enrichmentTriggeredBy,
      reviewStatus: prospectIntelligence.reviewStatus,
      recommendedOffer: prospectIntelligence.recommendedOffer,
      approvedAt: prospectIntelligence.approvedAt,
      updatedAt: prospectIntelligence.updatedAt,
    })
    .from(contacts)
    .innerJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
    .where(
      and(
        eq(prospectIntelligence.enrichmentStatus, "failed"),
        or(isNotNull(contacts.email), ne(contacts.email, "")),
      ),
    )
    .orderBy(desc(prospectIntelligence.updatedAt))
    .limit(25);

  const jobs = await db
    .select({
      id: prospectEnrichmentJobs.id,
      contactId: prospectEnrichmentJobs.contactId,
      status: prospectEnrichmentJobs.status,
      errorMessage: prospectEnrichmentJobs.errorMessage,
      triggerSource: prospectEnrichmentJobs.triggerSource,
      result: prospectEnrichmentJobs.result,
      completedAt: prospectEnrichmentJobs.completedAt,
      createdAt: prospectEnrichmentJobs.createdAt,
    })
    .from(prospectEnrichmentJobs)
    .where(eq(prospectEnrichmentJobs.status, "failed"))
    .orderBy(desc(prospectEnrichmentJobs.completedAt))
    .limit(25);

  const mapped = rows.map((r) => {
    const er = (r.enrichmentResult || {}) as Record<string, unknown>;
    return {
      contactId: r.contactId,
      name: r.name,
      hasValidEmail: isValidProspectEmail(r.email),
      enrichmentEmailFound: r.enrichmentEmailFound,
      enrichmentErrorMessage: r.enrichmentErrorMessage,
      failureClass: er.failureClass ?? null,
      outcomeClass: er.outcomeClass ?? null,
      crawlSucceeded: er.crawlSucceeded ?? null,
      websiteUrlUsed: r.websiteUrlUsed,
      enrichmentTriggeredBy: r.enrichmentTriggeredBy,
      reviewStatus: r.reviewStatus,
      updatedAt: r.updatedAt?.toISOString?.() ?? null,
      bugPattern:
        isValidProspectEmail(r.email) && r.enrichmentEmailFound !== true
          ? "manual_or_existing_email_ignored_on_failed_enrich"
          : isValidProspectEmail(r.email) && er.crawlSucceeded === false
            ? "crawl_failed_despite_valid_email"
            : "other",
    };
  });

  const out = {
    failedWithEmailOnContact: mapped.length,
    bugPatternCounts: mapped.reduce(
      (acc, m) => {
        acc[m.bugPattern] = (acc[m.bugPattern] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    sample: mapped.slice(0, 10),
    recentFailedJobs: jobs.slice(0, 10).map((j) => {
      const res = (j.result || {}) as Record<string, unknown>;
      return {
        jobId: j.id,
        contactId: j.contactId,
        errorMessage: j.errorMessage,
        triggerSource: j.triggerSource,
        failureClass: res.failureClass ?? null,
        outcomeClass: res.outcomeClass ?? null,
        crawlSucceeded: res.crawlSucceeded ?? null,
        emailFound: res.emailFound ?? null,
        completedAt: j.completedAt?.toISOString?.() ?? null,
      };
    }),
  };
  writeFileSync("audit-enrichment-failures-manual-email.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

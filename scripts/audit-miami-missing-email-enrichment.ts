/**
 * Audit Miami prospects stuck on Missing Email after enrichment.
 * Read-only: DB state + live crawl of websiteUrlUsed (no writes).
 *
 * Run: npx tsx scripts/audit-miami-missing-email-enrichment.ts
 */
import "dotenv/config";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts, prospectEnrichmentJobs, prospectIntelligence } from "../shared/schema";
import { fetchPublicHtmlPage } from "../server/websiteKnowledgeScraper";
import {
  extractEmailsFromHtml,
  extractPublicContactsFromHtml,
  selectBestProspectEmail,
  shouldApplyScrapedProspectEmail,
} from "../server/prospectImport/prospectWebsiteContactExtract";
import { resolveProspectWebsiteUrl } from "../server/prospectImport/prospectWebsiteUrl";
import {
  canEnrichProspect,
  explainCanEnrichProspect,
  resolveProspectNeedsReviewBadge,
} from "../shared/prospectAiReviewState";

const GUIDED = ["/", "/contact", "/contact-us", "/about", "/about-us", "/team", "/services"];

async function crawlAudit(websiteUrl: string) {
  const base = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`);
  const origin = `${base.protocol}//${base.host}`;
  const pages: Array<Record<string, unknown>> = [];
  const allEmails = new Set<string>();
  let homepageOk = false;
  let homepageHtml = "";

  for (const path of GUIDED) {
    const url = path === "/" ? origin + "/" : origin + path;
    try {
      const page = await fetchPublicHtmlPage(url);
      const html = page.html || "";
      if (path === "/") {
        homepageOk = true;
        homepageHtml = html;
      }
      const contactsFound = extractPublicContactsFromHtml(html, page.finalUrl || url);
      const emails = contactsFound.emails;
      emails.forEach((e) => allEmails.add(e.toLowerCase()));
      const best = selectBestProspectEmail(emails, {
        websiteUrl: page.finalUrl || url,
        extractions: contactsFound.emailExtractions,
      });
      pages.push({
        path,
        requestedUrl: url,
        ok: true,
        finalUrl: page.finalUrl,
        htmlLen: html.length,
        mailtoCount: (html.match(/mailto:/gi) || []).length,
        emails,
        bestEmail: best,
        emailExtractions: contactsFound.emailExtractions?.slice(0, 8),
      });
    } catch (err) {
      pages.push({
        path,
        requestedUrl: url,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    origin,
    homepageOk,
    homepageHasAnyEmailPattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(homepageHtml),
    pagesVisited: pages,
    allEmailsFound: [...allEmails],
    bestAcrossPages: selectBestProspectEmail([...allEmails], { websiteUrl: origin }),
  };
}

async function main() {
  const nameFilter = process.argv.find((a) => a.startsWith("--name="))?.slice(7) || "DREAM LAND";

  const rows = await db
    .select({
      contactId: contacts.id,
      userId: contacts.userId,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      notes: contacts.notes,
      sourceDetails: contacts.sourceDetails,
      customFields: contacts.customFields,
      enrichmentStatus: prospectIntelligence.enrichmentStatus,
      enrichmentProvider: prospectIntelligence.enrichmentProvider,
      websiteUrlUsed: prospectIntelligence.websiteUrlUsed,
      enrichmentEmailFound: prospectIntelligence.enrichmentEmailFound,
      enrichmentPhoneFound: prospectIntelligence.enrichmentPhoneFound,
      enrichmentErrorMessage: prospectIntelligence.enrichmentErrorMessage,
      enrichmentResult: prospectIntelligence.enrichmentResult,
      enrichmentJobId: prospectIntelligence.enrichmentJobId,
      websiteAnalyzedAt: prospectIntelligence.websiteAnalyzedAt,
      analysisStatus: prospectIntelligence.analysisStatus,
      reviewStatus: prospectIntelligence.reviewStatus,
      needsReview: prospectIntelligence.needsReview,
      updatedAt: prospectIntelligence.updatedAt,
    })
    .from(contacts)
    .innerJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
    .where(
      or(
        ilike(contacts.name, `%${nameFilter}%`),
        and(
          ilike(sql`coalesce(${contacts.sourceDetails}::text, '')`, "%Miami%"),
          or(isNull(contacts.email), eq(contacts.email, "")),
          eq(prospectIntelligence.enrichmentStatus, "completed"),
        ),
      ),
    )
    .orderBy(desc(prospectIntelligence.updatedAt))
    .limit(nameFilter.toLowerCase().includes("dream") ? 5 : 25);

  // Prefer exact Dream Land + any completed missing email miami
  const dream = rows.filter((r) => /dream\s*land/i.test(r.name || ""));
  const others = rows.filter((r) => !/dream\s*land/i.test(r.name || "")).slice(0, 8);
  const targets = [...dream, ...others].slice(0, 10);

  const reports = [];
  for (const r of targets) {
    const resolved = resolveProspectWebsiteUrl({
      notes: r.notes,
      sourceDetails: r.sourceDetails as Record<string, unknown> | null,
      customFields: r.customFields as Record<string, unknown> | null,
    });
    const website = String(r.websiteUrlUsed || resolved || "").trim();

    let job: Record<string, unknown> | null = null;
    if (r.enrichmentJobId) {
      const jobRows = await db
        .select({
          id: prospectEnrichmentJobs.id,
          status: prospectEnrichmentJobs.status,
          provider: prospectEnrichmentJobs.provider,
          errorMessage: prospectEnrichmentJobs.errorMessage,
          progressCurrent: prospectEnrichmentJobs.progressCurrent,
          progressTotal: prospectEnrichmentJobs.progressTotal,
          createdAt: prospectEnrichmentJobs.createdAt,
          updatedAt: prospectEnrichmentJobs.updatedAt,
        })
        .from(prospectEnrichmentJobs)
        .where(eq(prospectEnrichmentJobs.id, r.enrichmentJobId))
        .limit(1);
      job = (jobRows[0] as unknown as Record<string, unknown>) || null;
    }

    const er = (r.enrichmentResult || {}) as Record<string, unknown>;
    const publicContacts = (er.publicContacts || {}) as { emails?: string[]; contactPageUrls?: string[] };
    const pagesScanned =
      ((er.websiteIntelligence as { pagesScanned?: unknown } | undefined)?.pagesScanned as unknown) ||
      null;

    const reviewInput = {
      email: r.email,
      websiteUrl: website,
      websiteUrlUsed: r.websiteUrlUsed,
      enrichmentStatus: r.enrichmentStatus,
      analysisStatus: r.analysisStatus,
      reviewStatus: r.reviewStatus,
      needsReview: r.needsReview,
      notQualified: false,
      outcome: null,
    };
    const enrichExplain = explainCanEnrichProspect(reviewInput);
    const badge = resolveProspectNeedsReviewBadge(reviewInput);

    let liveCrawl: Record<string, unknown> | null = null;
    if (website) {
      try {
        liveCrawl = await crawlAudit(website);
      } catch (err) {
        liveCrawl = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    const storedEmails = Array.isArray(publicContacts.emails) ? publicContacts.emails : [];
    const bestFromStored = selectBestProspectEmail(storedEmails, { websiteUrl: website });
    const wouldApply =
      bestFromStored && shouldApplyScrapedProspectEmail(r.email, bestFromStored)
        ? bestFromStored
        : null;

    reports.push({
      name: r.name,
      contactId: r.contactId,
      contactsEmail: r.email,
      enrichmentStatus: r.enrichmentStatus,
      enrichmentEmailFound: r.enrichmentEmailFound,
      enrichmentPhoneFound: r.enrichmentPhoneFound,
      enrichmentErrorMessage: r.enrichmentErrorMessage,
      websiteUrlUsed: r.websiteUrlUsed,
      resolvedWebsiteFromContact: resolved,
      websiteAnalyzedAt: r.websiteAnalyzedAt,
      reviewStatus: r.reviewStatus,
      analysisStatus: r.analysisStatus,
      needsReview: r.needsReview,
      enrichmentJob: job,
      storedEnrichmentResultSummary: {
        provider: er.provider,
        websiteUrl: er.websiteUrl,
        emailFound: er.emailFound,
        phoneFound: er.phoneFound,
        emailsInResult: storedEmails,
        bestFromStoredResult: bestFromStored,
        wouldApplyToContactEmail: wouldApply,
        pagesScanned,
        contactPageUrls: publicContacts.contactPageUrls || [],
      },
      badge,
      canEnrichNow: canEnrichProspect(reviewInput),
      enrichExplain,
      liveCrawl,
    });
  }

  console.log(JSON.stringify({ count: reports.length, reports }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

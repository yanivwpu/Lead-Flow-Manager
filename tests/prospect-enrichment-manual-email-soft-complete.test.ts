/**
 * Manual email + website crawl failure → soft-complete (not red failed).
 * Run: npx tsx tests/prospect-enrichment-manual-email-soft-complete.test.ts
 */
import assert from "node:assert/strict";
import {
  resolveEnrichmentFinalizeDecision,
  resolveProspectEnrichmentOutcomeClass,
} from "../shared/prospectEnrichmentOutcome";
import { shouldApplyScrapedProspectEmail } from "../server/prospectImport/prospectWebsiteContactExtract";
import { resolveProspectTimelineStates } from "../shared/prospectReviewUx";

{
  // Soft-complete when crawl fails but contact already has a valid email
  const soft = resolveEnrichmentFinalizeDecision({
    crawlSucceeded: false,
    failureClass: "website_fetch_failed",
    providerEmailFound: false,
    contactEmail: "hello@jackcodengroup.com",
  });
  assert.equal(soft.enrichmentStatus, "completed");
  assert.equal(soft.enrichmentEmailFound, true);
  assert.equal(soft.softCompleteWithExistingEmail, true);
  assert.equal(soft.outcomeClass, "completed_email_present_website_failed");
  assert.equal(soft.enrichmentErrorMessage, null);
}

{
  // Hard-fail when crawl fails and no valid email
  const hard = resolveEnrichmentFinalizeDecision({
    crawlSucceeded: false,
    failureClass: "website_fetch_failed",
    providerEmailFound: false,
    contactEmail: null,
  });
  assert.equal(hard.enrichmentStatus, "failed");
  assert.equal(hard.enrichmentEmailFound, false);
  assert.equal(hard.softCompleteWithExistingEmail, false);
  assert.equal(hard.outcomeClass, "failed_fetch");
  assert.match(hard.enrichmentErrorMessage || "", /could not be reached/i);
}

{
  // Success crawl: contact email counts even if scrape found none
  const done = resolveEnrichmentFinalizeDecision({
    crawlSucceeded: true,
    failureClass: null,
    providerEmailFound: false,
    contactEmail: "owner@example.com",
  });
  assert.equal(done.enrichmentStatus, "completed");
  assert.equal(done.enrichmentEmailFound, true);
  assert.equal(done.softCompleteWithExistingEmail, false);
  assert.equal(done.outcomeClass, "completed_email_found");
}

{
  // Manual email must not be overwritten by scraped candidate
  assert.equal(
    shouldApplyScrapedProspectEmail("owner@manual.example", "info@scraped.example"),
    false,
  );
}

{
  // Timeline Enriched stage is done (not red) after soft-complete
  const timeline = resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    enrichmentEmailFound: true,
    email: "hello@jackcodengroup.com",
    websiteUrl: "http://www.jackcodengroup.com/",
  });
  // [aiReview, enriched, campaign]
  assert.equal(timeline[1], "done");
  assert.notEqual(timeline[1], "failed");
  assert.equal(
    resolveProspectEnrichmentOutcomeClass({
      enrichmentStatus: "completed",
      enrichmentEmailFound: true,
      email: "hello@jackcodengroup.com",
      websiteUrl: "http://www.jackcodengroup.com/",
      enrichmentResult: {
        crawlSucceeded: false,
        failureClass: "website_fetch_failed",
        outcomeClass: "completed_email_present_website_failed",
        websiteCrawlFailed: true,
      },
    }),
    "completed_email_present_website_failed",
  );
}

console.log("prospect-enrichment-manual-email-soft-complete: ok");

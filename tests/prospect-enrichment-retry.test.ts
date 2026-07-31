/**
 * Prospect enrichment retry / outcome rules.
 * Run: npx tsx tests/prospect-enrichment-retry.test.ts
 */
import assert from "node:assert/strict";
import {
  canEnrichProspect,
  enrichActionLabel,
  explainCanEnrichProspect,
  isProspectEnrichmentRetryable,
  summarizeSelectionActionAvailability,
} from "../shared/prospectAiReviewState";
import {
  classifyAllPagesFailed,
  resolveMissingEmailDetail,
  resolveProspectEnrichmentOutcomeClass,
} from "../shared/prospectEnrichmentOutcome";
import {
  classifyProspectWebsiteUrl,
  isSocialProfileUrl,
  pickOfficialWebsiteUrl,
  websiteMatchesBusinessSignals,
} from "../shared/prospectWebsiteClassification";
import { selectBestProspectEmail } from "../server/prospectImport/prospectWebsiteContactExtract";
import { resolveProspectOfficialWebsiteUrl } from "../server/prospectImport/prospectWebsiteUrl";
import type { Contact } from "../shared/schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function baseUx(over: Record<string, unknown> = {}) {
  return {
    analysisStatus: "completed",
    reviewStatus: "pending",
    needsReview: false,
    enrichmentStatus: "none",
    websiteUrl: "https://realbrokersmiami.com/",
    email: null,
    enrichmentEmailFound: false,
    ...over,
  };
}

{
  // All page fetches fail → failure class (not completed success)
  const pages = [
    { url: "https://a.com/", status: "failed", reason: "This operation was aborted" },
    { url: "https://a.com/contact", status: "failed", reason: "HTTP 404" },
  ];
  assert.equal(classifyAllPagesFailed(pages), "website_timeout");
  assert.equal(
    classifyAllPagesFailed([
      { status: "failed", reason: "HTTP 404" },
      { status: "failed", reason: "HTTP 500" },
    ]),
    "website_fetch_failed",
  );
}

{
  // Soft-complete: crawl failed but manual/contact email present → not failed_fetch
  const soft = baseUx({
    enrichmentStatus: "completed",
    enrichmentEmailFound: true,
    email: "owner@jackcodengroup.com",
    websiteUrl: "http://www.jackcodengroup.com/",
    enrichmentResult: {
      crawlSucceeded: false,
      failureClass: "website_fetch_failed",
      outcomeClass: "completed_email_present_website_failed",
      websiteCrawlFailed: true,
    },
  });
  assert.equal(
    resolveProspectEnrichmentOutcomeClass(soft),
    "completed_email_present_website_failed",
  );
  assert.equal(isProspectEnrichmentRetryable(soft), false);
  assert.equal(canEnrichProspect(soft), false);
  assert.equal(explainCanEnrichProspect(soft).code, "already_enriched");
}

{
  // Hard-fail: crawl failed and no email → failed_fetch + retry
  const hard = baseUx({
    enrichmentStatus: "failed",
    enrichmentEmailFound: false,
    email: null,
    websiteUrl: "http://www.jackcodengroup.com/",
    enrichmentErrorMessage: "Website could not be reached",
    enrichmentResult: {
      crawlSucceeded: false,
      failureClass: "website_fetch_failed",
      outcomeClass: "failed_fetch",
    },
  });
  assert.equal(resolveProspectEnrichmentOutcomeClass(hard), "failed_fetch");
  assert.equal(isProspectEnrichmentRetryable(hard), true);
  assert.equal(enrichActionLabel(hard), "Retry Enrichment");
}


{
  // Completed / no-email + valid website → retry available
  const emptyComplete = baseUx({
    enrichmentStatus: "completed",
    enrichmentEmailFound: false,
    enrichmentResult: {
      crawlSucceeded: true,
      outcomeClass: "completed_no_email",
      websiteIntelligence: {
        pagesScanned: [{ url: "https://realbrokersmiami.com/", status: "scanned" }],
      },
    },
  });
  assert.equal(isProspectEnrichmentRetryable(emptyComplete), true);
  assert.equal(canEnrichProspect(emptyComplete), true);
  assert.equal(enrichActionLabel(emptyComplete), "Retry Enrichment");
}

{
  // Completed / email found → retry disabled
  const done = baseUx({
    enrichmentStatus: "completed",
    enrichmentEmailFound: true,
    email: "info@realbrokers.miami",
  });
  assert.equal(isProspectEnrichmentRetryable(done), false);
  assert.equal(canEnrichProspect(done), false);
  assert.equal(explainCanEnrichProspect(done).code, "already_enriched");
}

{
  // No website → clear no-website reason
  const none = baseUx({ websiteUrl: null, websiteUrlUsed: null, enrichmentStatus: "failed" });
  const detail = resolveMissingEmailDetail(none);
  assert.equal(detail?.code, "no_website");
  assert.match(detail?.reason || "", /No public website found/i);
  assert.equal(isProspectEnrichmentRetryable(none), false);
  assert.equal(explainCanEnrichProspect(none).code, "missing_website");
}

{
  // Facebook URL → social_profile_only
  assert.equal(isSocialProfileUrl("https://www.facebook.com/miamirealestateopportunities/"), true);
  assert.equal(classifyProspectWebsiteUrl("https://facebook.com/x"), "social");
  assert.equal(
    pickOfficialWebsiteUrl([
      "https://www.facebook.com/miamirealestateopportunities/",
      "https://dreamland.example/",
    ]),
    "https://dreamland.example/",
  );

  const social = baseUx({
    websiteUrl: "https://www.facebook.com/miamirealestateopportunities/",
    enrichmentStatus: "completed",
    enrichmentEmailFound: false,
  });
  assert.equal(resolveProspectEnrichmentOutcomeClass(social), "social_profile_only");
  assert.equal(isProspectEnrichmentRetryable(social), false);
  assert.equal(explainCanEnrichProspect(social).code, "social_profile_only");
  assert.match(
    resolveMissingEmailDetail(social)?.reason || "",
    /social profile/i,
  );
}

{
  // resolveProspectOfficialWebsiteUrl ignores social-only
  const contact = {
    id: "c1",
    userId: "ws",
    name: "DREAM LAND",
    sourceDetails: {
      prospectAi: { website: "https://www.facebook.com/miamirealestateopportunities/" },
    },
    customFields: {},
  } as Contact;
  assert.equal(resolveProspectOfficialWebsiteUrl(contact), null);
}

{
  // Manually corrected website enables retry (official URL present + failed)
  const corrected = baseUx({
    websiteUrl: "https://dreamlandrealty.example/",
    enrichmentStatus: "failed",
    enrichmentErrorMessage: "Website updated — ready to retry",
  });
  assert.equal(isProspectEnrichmentRetryable(corrected), true);
  assert.equal(canEnrichProspect(corrected), true);
}

{
  // Real Brokers-style same-domain mailto ranking
  const best = selectBestProspectEmail(["noreply@vendor.com", "info@realbrokers.miami"], {
    websiteUrl: "https://www.realbrokersmiami.com/",
    extractions: [
      { email: "info@realbrokers.miami", method: "mailto" },
      { email: "noreply@vendor.com", method: "standard_text" },
    ],
  });
  assert.equal(best, "info@realbrokers.miami");
}

{
  // Bulk selection: only eligible enrich; mixed counts
  const rows = [
    baseUx({ enrichmentStatus: "none", websiteUrl: "https://a.example" }),
    baseUx({
      enrichmentStatus: "completed",
      enrichmentEmailFound: true,
      email: "a@b.com",
      websiteUrl: "https://b.example",
    }),
    baseUx({ enrichmentStatus: "failed", websiteUrl: null, websiteUrlUsed: null }),
    baseUx({ enrichmentStatus: "completed", enrichmentEmailFound: false, websiteUrl: "https://c.example" }),
  ];
  let enrichable = 0;
  let already = 0;
  let unavailable = 0;
  for (const r of rows) {
    const ex = explainCanEnrichProspect(r);
    if (ex.ok) enrichable += 1;
    else if (ex.code === "already_enriched") already += 1;
    else unavailable += 1;
  }
  assert.equal(enrichable, 2); // first + retry empty-complete
  assert.equal(already, 1);
  assert.equal(unavailable, 1);
  const summary = summarizeSelectionActionAvailability({
    selectedCount: 4,
    enrichableCount: enrichable,
    qualifiedCount: 0,
    alreadyEnrichedCount: already,
    unavailableCount: unavailable,
    firstEnrich: explainCanEnrichProspect(rows[2]!),
  });
  assert.equal(summary.line, "4 selected");
  assert.match(summary.detail || "", /2 can be enriched/);
  assert.match(summary.detail || "", /1 already enriched/);
  assert.match(summary.detail || "", /1 unavailable/);
}

{
  // Website match validation rejects weak guesses
  const weak = websiteMatchesBusinessSignals({
    websiteUrl: "https://random-corp.example",
    businessName: "Dream Land Group Real Estate",
    pageTitle: "Home",
  });
  assert.equal(weak.ok, false);
  const strong = websiteMatchesBusinessSignals({
    websiteUrl: "https://dreamlandgroup.example",
    businessName: "Dream Land Group Real Estate",
    pageTitle: "Dream Land Group | Miami",
  });
  assert.equal(strong.ok, true);
}

{
  // Retry path must not call discover / Places (source contract)
  const svc = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectEnrichmentService.ts"),
    "utf8",
  );
  assert.ok(svc.includes("retryFailedEnrichment"));
  assert.ok(svc.includes("Does not call Places"));
  assert.ok(!/discoverPlaces|searchText|places:search/i.test(svc));
  assert.ok(svc.includes("force: true"));
  // Duplicate active job guard
  assert.ok(svc.includes('inArray(prospectEnrichmentJobs.status, ["pending", "running"])'));
}

{
  // False-completed fix present in provider + job processor
  const provider = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectWebsiteEnrichmentProvider.ts"),
    "utf8",
  );
  assert.ok(provider.includes("crawlSucceeded: false"));
  assert.ok(provider.includes("social_profile_only"));
  const enrichmentSvc = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectEnrichmentService.ts"),
    "utf8",
  );
  assert.ok(enrichmentSvc.includes('enrichmentStatus: "failed"'));
  assert.ok(enrichmentSvc.includes("resolveEnrichmentFinalizeDecision"));
  assert.ok(enrichmentSvc.includes("softCompleteWithExistingEmail"));
}

console.log("prospect-enrichment-retry.test.ts: all assertions passed");

/**
 * Prospect AI public email discovery accuracy regressions.
 * Covers Aromas-del-Peru-style multi-location + extraction sources + ranking + limits.
 *
 * Run: npx tsx tests/prospect-email-enrichment-accuracy.test.ts
 */
import assert from "node:assert/strict";
import {
  extractEmailsFromEmbeddedJson,
  extractEmailsFromHtml,
  extractEmailsFromJsonLd,
  extractPublicContactsFromHtml,
  isInventedMailboxGuess,
  selectBestProspectEmail,
  selectBestProspectEmailDetailed,
} from "../server/prospectImport/prospectWebsiteContactExtract";
import {
  buildEnrichmentPageQueue,
  buildGuidedEnrichmentUrls,
  discoverEmailBearingUrlsFromHtml,
  pageLooksJavaScriptHeavy,
  PROSPECT_ENRICH_MAX_DISCOVERED,
  PROSPECT_ENRICH_MAX_PAGES,
  PROSPECT_ENRICH_GUIDED_PATHS,
} from "../server/prospectImport/prospectWebsitePageDiscovery";
import {
  readProspectLocationSignals,
  scoreLocationPageMatch,
} from "../server/prospectImport/prospectWebsiteLocationSignals";
import {
  isProspectEnrichmentHeadlessEnabled,
  PROSPECT_ENRICH_MAX_RENDER_PAGES,
} from "../server/prospectImport/prospectWebsiteRenderFallback";
import {
  resolveEnrichmentFinalizeDecision,
  resolveMissingEmailDetail,
  resolveProspectEnrichmentOutcomeClass,
} from "../shared/prospectEnrichmentOutcome";
import type { Contact } from "../shared/schema";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`fail ${name}`);
    throw err;
  }
}

const aromasContact = {
  id: "c-aromas",
  userId: "u1",
  name: "Aromas del Peru — Pompano Beach",
  email: null,
  phone: "(954) 943-0550",
  notes: null,
  sourceDetails: {
    prospectAi: {
      city: "Pompano Beach",
      address: "1357 S Federal Hwy, Pompano Beach, FL 33062",
      postalCode: "33062",
    },
  },
  customFields: {},
} as unknown as Contact;

/** Fixture: multi-location site; only Pompano block publishes the email. */
const AROMAS_LOCATIONS_HTML = `
<!DOCTYPE html><html><body>
  <nav>
    <a href="/locations">Locations</a>
    <a href="/locations/pompano-beach/">Pompano Beach</a>
    <a href="/locations/miami/">Miami</a>
    <a href="/contact">Contact</a>
  </nav>
  <section id="pompano">
    <h2>Aromas del Peru — Pompano Beach</h2>
    <p>1357 S Federal Hwy, Pompano Beach, FL 33062</p>
    <p>Phone: (954) 943-0550</p>
    <p>Email: nastete@aromasperu.com</p>
  </section>
  <section id="miami">
    <h2>Aromas del Peru — Miami</h2>
    <p>Call (305) 555-0100</p>
  </section>
</body></html>`;

const AROMAS_POMPANO_PAGE = `
<html><body>
  <h1>Pompano Beach</h1>
  <address>1357 S Federal Hwy, Pompano Beach, FL 33062</address>
  <p><a href="tel:+19549430550">(954) 943-0550</a></p>
  <p><a href="mailto:nastete@aromasperu.com">nastete@aromasperu.com</a></p>
</body></html>`;

run("1. Email visible in static contact block", () => {
  const c = extractPublicContactsFromHtml(
    `<div class="contact"><p>Reach us at hello@bright-dental.example</p></div>`,
    "https://bright-dental.example/contact",
  );
  assert.ok(c.emails.includes("hello@bright-dental.example"));
});

run("2. mailto email", () => {
  const emails = extractEmailsFromHtml(
    `<a href="mailto:team@acme.example">Email</a>`,
    "https://acme.example/contact",
  );
  assert.equal(emails[0]?.email, "team@acme.example");
  assert.equal(emails[0]?.method, "mailto");
});

run("3. Email in JSON-LD", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Restaurant",
    email: "info@jsonld-resto.example",
  })}</script>`;
  const found = extractEmailsFromJsonLd(html, "https://jsonld-resto.example/");
  assert.ok(found.some((e) => e.email === "info@jsonld-resto.example" && e.method === "json_ld"));
});

run("4. Email in embedded JSON state", () => {
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { location: { email: "desk@nextstate.example" } } },
  })}</script>`;
  const found = extractEmailsFromEmbeddedJson(html, "https://nextstate.example/locations/pompano");
  assert.ok(found.some((e) => e.email === "desk@nextstate.example" && e.method === "embedded_json"));
});

run("5. Multi-location: matched location email wins over corporate", () => {
  const corporate = extractPublicContactsFromHtml(
    `<footer>Corporate: hq@aromasperu.com</footer>`,
    "https://aromasperu.com/",
  );
  const location = extractPublicContactsFromHtml(
    AROMAS_POMPANO_PAGE,
    "https://aromasperu.com/locations/pompano-beach/",
  );
  const emails = [...corporate.emails, ...location.emails];
  const extractions = [...(corporate.emailExtractions || []), ...(location.emailExtractions || [])];
  const best = selectBestProspectEmailDetailed(emails, {
    websiteUrl: "https://aromasperu.com/",
    extractions,
    locationScoreByUrl: {
      "https://aromasperu.com/locations/pompano-beach/": 120,
      "https://aromasperu.com/": 0,
    },
  });
  assert.equal(best?.email, "nastete@aromasperu.com");
  assert.ok((best?.score || 0) > 0);
});

run("6. JS-heavy page detection (render fallback gate)", () => {
  const emptyRoot = `<div id="root"></div><script src="/app.js"></script>`;
  assert.equal(pageLooksJavaScriptHeavy(emptyRoot, 20), true);
  assert.equal(pageLooksJavaScriptHeavy(`<p>${"x".repeat(500)}</p>`, 500), false);
  assert.ok(PROSPECT_ENRICH_MAX_RENDER_PAGES <= 2);
  // Headless off by default — cost controlled
  const prev = process.env.PROSPECT_ENRICHMENT_HEADLESS;
  delete process.env.PROSPECT_ENRICHMENT_HEADLESS;
  assert.equal(isProspectEnrichmentHeadlessEnabled(), false);
  if (prev !== undefined) process.env.PROSPECT_ENRICHMENT_HEADLESS = prev;
});

run("7. Obfuscated email", () => {
  const c = extractPublicContactsFromHtml(
    `<p>Write nastete [at] aromasperu [dot] com</p>`,
    "https://aromasperu.com/locations/pompano-beach/",
  );
  assert.ok(c.emails.includes("nastete@aromasperu.com"));
});

run("8. Corporate email ranked below matched-location email", () => {
  const best = selectBestProspectEmail(
    ["info@aromasperu.com", "nastete@aromasperu.com"],
    {
      websiteUrl: "https://aromasperu.com",
      extractions: [
        {
          email: "info@aromasperu.com",
          method: "standard_text",
          sourceUrl: "https://aromasperu.com/",
        },
        {
          email: "nastete@aromasperu.com",
          method: "mailto",
          sourceUrl: "https://aromasperu.com/locations/pompano-beach/",
          matchedLocationEvidence: ["path_matches_city:Pompano Beach", "phone_match"],
        },
      ],
      locationScoreByUrl: {
        "https://aromasperu.com/locations/pompano-beach/": 130,
        "https://aromasperu.com/": 0,
      },
    },
  );
  assert.equal(best, "nastete@aromasperu.com");
});

run("9. No public email remains Missing Email / completed_no_email", () => {
  const c = extractPublicContactsFromHtml(`<html><body><h1>Welcome</h1></body></html>`, "https://no-mail.example/");
  assert.equal(c.emails.length, 0);
  const decision = resolveEnrichmentFinalizeDecision({
    crawlSucceeded: true,
    providerEmailFound: false,
    contactEmail: null,
  });
  assert.equal(decision.outcomeClass, "completed_no_email");
  const detail = resolveMissingEmailDetail({
    enrichmentStatus: "completed",
    enrichmentEmailFound: false,
    websiteUrl: "https://no-mail.example/",
    websiteUrlUsed: "https://no-mail.example/",
    enrichmentResult: { outcomeClass: "completed_no_email", crawlSucceeded: true },
  });
  assert.equal(detail?.code, "no_email_on_website");
});

run("10. No guessed/invented addresses", () => {
  const c = extractPublicContactsFromHtml(
    `<html><body><p>Visit aromasperu.com for menus</p></body></html>`,
    "https://aromasperu.com/",
  );
  assert.equal(c.emails.length, 0);
  assert.equal(isInventedMailboxGuess("info@aromasperu.com", []), true);
  assert.equal(isInventedMailboxGuess("info@aromasperu.com", ["info@aromasperu.com"]), false);
});

run("11. Crawl/page limits enforced", () => {
  assert.ok(PROSPECT_ENRICH_MAX_PAGES <= 10);
  assert.ok(PROSPECT_ENRICH_MAX_DISCOVERED <= 8);
  assert.ok(PROSPECT_ENRICH_GUIDED_PATHS.some((p) => p.path === "/locations"));
  const guided = buildGuidedEnrichmentUrls("https://aromasperu.com/");
  assert.ok(guided.length <= PROSPECT_ENRICH_GUIDED_PATHS.length + 1);
  const discovered = discoverEmailBearingUrlsFromHtml(AROMAS_LOCATIONS_HTML, "https://aromasperu.com/");
  assert.ok(discovered.length <= PROSPECT_ENRICH_MAX_DISCOVERED);
  assert.ok(discovered.some((d) => d.url.includes("pompano")));
});

run("12. Existing enrichment finalize remains compatible (email found)", () => {
  const decision = resolveEnrichmentFinalizeDecision({
    crawlSucceeded: true,
    providerEmailFound: true,
    contactEmail: null,
  });
  assert.equal(decision.enrichmentStatus, "completed");
  assert.equal(decision.outcomeClass, "completed_email_found");
  assert.equal(decision.enrichmentEmailFound, true);
});

run("Aromas-style: location signals + queue prefer Pompano pages", () => {
  const signals = readProspectLocationSignals(aromasContact);
  assert.equal(signals.city, "Pompano Beach");
  assert.ok(signals.phoneDigits?.includes("9549430550") || signals.phoneDigits === "9549430550");

  const queue = buildEnrichmentPageQueue({
    homepage: "https://aromasperu.com/",
    contact: aromasContact,
  });
  assert.ok(
    queue.some(
      (p) =>
        p.url.includes("pompano") ||
        p.key === "guided_location_city" ||
        p.key === "guided_brand_city" ||
        p.key === "guided_brand_city_short",
    ),
    "queue should include Pompano location candidates",
  );
  assert.ok(
    !queue.some((p) => /pompanobeachpompanobeach/i.test(p.url)),
    "brand+city slug must not duplicate the city",
  );
  assert.ok(
    queue.some((p) => /aromasdelperu.*pompano/i.test(p.url)),
    "expected /aromasdelperupompano-style guided URL",
  );

  const locScore = scoreLocationPageMatch(
    signals,
    "https://aromasperu.com/locations/pompano-beach/",
    AROMAS_POMPANO_PAGE,
  );
  assert.ok(locScore.score >= 40, `expected strong location score, got ${locScore.score}`);
  assert.ok(locScore.evidence.some((e) => e.includes("city") || e === "phone_match"));

  const contacts = extractPublicContactsFromHtml(
    AROMAS_POMPANO_PAGE,
    "https://aromasperu.com/locations/pompano-beach/",
  );
  assert.ok(contacts.emails.includes("nastete@aromasperu.com"));
  const best = selectBestProspectEmailDetailed(contacts.emails, {
    websiteUrl: "https://aromasperu.com/",
    extractions: contacts.emailExtractions,
    locationScoreByUrl: {
      "https://aromasperu.com/locations/pompano-beach/": locScore.score,
    },
  });
  assert.equal(best?.email, "nastete@aromasperu.com");
});

run("Incomplete search outcome surfaces distinct Missing Email detail", () => {
  const decision = resolveEnrichmentFinalizeDecision({
    crawlSucceeded: true,
    providerEmailFound: false,
    contactEmail: null,
    providerOutcomeClass: "completed_search_incomplete",
  });
  assert.equal(decision.outcomeClass, "completed_search_incomplete");
  const outcome = resolveProspectEnrichmentOutcomeClass({
    enrichmentStatus: "completed",
    enrichmentEmailFound: false,
    websiteUrl: "https://aromasperu.com/",
    websiteUrlUsed: "https://aromasperu.com/",
    enrichmentResult: { outcomeClass: "completed_search_incomplete", crawlSucceeded: true },
  });
  assert.equal(outcome, "completed_search_incomplete");
  const detail = resolveMissingEmailDetail({
    enrichmentStatus: "completed",
    enrichmentEmailFound: false,
    websiteUrl: "https://aromasperu.com/",
    websiteUrlUsed: "https://aromasperu.com/",
    enrichmentResult: { outcomeClass: "completed_search_incomplete", crawlSucceeded: true },
  });
  assert.equal(detail?.code, "email_search_incomplete");
  assert.ok(detail?.canRetry);
});

run("Static locations hub discovers Pompano email without inventing", () => {
  const hub = extractPublicContactsFromHtml(AROMAS_LOCATIONS_HTML, "https://aromasperu.com/locations");
  assert.ok(hub.emails.includes("nastete@aromasperu.com"));
  assert.ok(!hub.emails.includes("info@aromasperu.com"));
});

console.log("prospect-email-enrichment-accuracy.test.ts: all assertions passed");

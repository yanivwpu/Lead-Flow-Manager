/**
 * Per-source deterministic extraction.
 *
 * The fixture is a generic advertising / directory-listing page modelled on the production
 * case that started this work (four paid tiers plus a free one). No real business name.
 *
 * Run: npx tsx tests/website-knowledge-extraction.test.ts
 */
import assert from "node:assert/strict";
import {
  classifyPage,
  cleanHtmlToStructuredText,
  extractDeterministicFacts,
  extractFaqPairsFromText,
  extractJsonLdBlocks,
  extractPricingPlansFromText,
  findPricesInText,
  prepareHtmlPage,
} from "../server/websiteKnowledge/extractPage";
import { scanSourceIntoDrafts } from "../server/websiteKnowledge/scanPipeline";
import { parseFactData } from "../shared/businessKnowledgeFacts";
import type { FactCandidate, FactDataMap } from "../shared/businessKnowledgeFacts";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const CTX = { sourceId: "src-1", sourceUrl: "https://example.test/advertising", sourceTitle: "Advertising" };

const ADVERTISING_HTML = `<!doctype html>
<html>
<head><title>Advertising Options | Example Directory</title></head>
<body>
<header><nav><a href="/">Home</a><a href="/advertising">Advertising</a></nav></header>
<main>
  <h1>Advertising Options</h1>
  <p>Choose the plan that fits your business.</p>

  <div class="card">
    <h3>Free Listing</h3>
    <div class="price">$0 per month</div>
    <ul>
      <li>Basic business name and phone</li>
      <li>Standard search placement</li>
    </ul>
  </div>

  <div class="card">
    <h3>Business Listing</h3>
    <div class="price">$29 per month</div>
    <ul>
      <li>Business profile page</li>
      <li>Category listing</li>
      <li>Website, phone, and map</li>
      <li>Local SEO visibility</li>
      <li>Be found by people exploring Northgate</li>
    </ul>
  </div>

  <div class="card">
    <h3>Featured Listing</h3>
    <div class="price">$99 per month</div>
    <ul>
      <li>Everything in Business Listing</li>
      <li>Homepage feature rotation</li>
      <li>Monthly performance report</li>
    </ul>
  </div>

  <div class="card">
    <h3>Annual Spotlight</h3>
    <div class="price">$999 per year</div>
    <ul>
      <li>All Featured Listing benefits</li>
      <li>Dedicated category banner</li>
    </ul>
  </div>

  <p>Questions? Email <a href="mailto:Sales@Example.test">Sales@Example.test</a> or call
     <a href="tel:+1-555-0100">+1 555 0100</a>. Book a walkthrough at
     <a href="https://calendly.com/example/walkthrough">this link</a>.</p>
</main>
<footer><p>© Example Directory</p></footer>
</body>
</html>`;

const FAQ_HTML = `<!doctype html>
<html>
<head><title>FAQ</title></head>
<body><main>
<h1>Frequently Asked Questions</h1>
<h3>How long does approval take?</h3>
<p>Most listings are approved within one business day.</p>
<h3>Can I cancel at any time?</h3>
<p>Yes. Cancel from your dashboard and billing stops at the end of the current period.</p>
</main></body>
</html>`;

const JSONLD_HTML = `<!doctype html>
<html><head><title>Shop</title>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "Do you offer refunds?",
          "acceptedAnswer": { "@type": "Answer", "text": "<p>Refunds are available within 14 days.</p>" } }
      ]
    },
    {
      "@type": "LocalBusiness",
      "name": "Example Directory",
      "telephone": "+1 555 0100",
      "address": { "@type": "PostalAddress", "streetAddress": "1 Market St", "addressLocality": "Springfield", "addressRegion": "FL", "postalCode": "33060" },
      "openingHours": ["Mo-Fr 09:00-17:00"]
    }
  ]
}
</script>
</head><body><main><h1>Shop</h1><p>Welcome to the shop page with plenty of readable content for the extractor.</p></main></body></html>`;

function plans(candidates: FactCandidate[]): FactDataMap["pricing_plan"][] {
  return candidates
    .filter((c) => c.factType === "pricing_plan")
    .map((c) => c.data as FactDataMap["pricing_plan"]);
}

function planNamed(candidates: FactCandidate[], name: string): FactDataMap["pricing_plan"] {
  const found = plans(candidates).find((p) => p.name === name);
  assert.ok(found, `expected a plan named ${name}, got ${plans(candidates).map((p) => p.name).join(", ")}`);
  return found!;
}

// --- 1. Prices are read exactly, with their billing period -----------------

run("price parsing keeps amount, currency and billing period", () => {
  const hits = findPricesInText("Business Listing $49 per month");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].amount, 49);
  assert.equal(hits[0].currency, "USD");
  assert.equal(hits[0].billingPeriod, "month");
});

run("price parsing handles thousands separators and decimals", () => {
  assert.equal(findPricesInText("$1,299.00 per year")[0].amount, 1299);
  assert.equal(findPricesInText("€1.299,50 per month")[0].amount, 1299.5);
  assert.equal(findPricesInText("USD 49/mo")[0].billingPeriod, "month");
  assert.equal(findPricesInText("£25 one-time")[0].billingPeriod, "once");
});

run("an amount with no billing period is not asserted as a price", () => {
  // Ambiguous: could be a deposit, a crossed-out price, or a total. The AI pass may
  // still propose it, but the deterministic tier must not claim it.
  assert.equal(findPricesInText("Setup costs $250 and includes onboarding").length, 0);
});

run("every advertised tier is extracted with its exact price", () => {
  const page = prepareHtmlPage(ADVERTISING_HTML, CTX.sourceUrl);
  const found = extractPricingPlansFromText(page.text, CTX);
  const byName = Object.fromEntries(plans(found).map((p) => [p.name, p]));

  assert.deepEqual(Object.keys(byName).sort(), [
    "Annual Spotlight",
    "Business Listing",
    "Featured Listing",
    "Free Listing",
  ]);
  assert.equal(byName["Business Listing"].price.amount, 29);
  assert.equal(byName["Business Listing"].price.currency, "USD");
  assert.equal(byName["Business Listing"].price.billingPeriod, "month");
  assert.equal(byName["Annual Spotlight"].price.amount, 999);
  assert.equal(byName["Annual Spotlight"].price.billingPeriod, "year");
  assert.equal(byName["Free Listing"].price.amount, 0);
});

// --- 2 & 4. Benefits stay with their own plan ------------------------------

run("benefits attach to the plan they were printed under", () => {
  const page = prepareHtmlPage(ADVERTISING_HTML, CTX.sourceUrl);
  const found = extractPricingPlansFromText(page.text, CTX);
  const business = planNamed(found, "Business Listing");
  // The production regression: the $29 tier's five benefits collapsed into the phrase
  // "basic visibility". They must survive extraction verbatim and in full.
  assert.deepEqual(business.benefits, [
    "Business profile page",
    "Category listing",
    "Website, phone, and map",
    "Local SEO visibility",
    "Be found by people exploring Northgate",
  ]);
});

run("no benefit bleeds across plan boundaries", () => {
  const page = prepareHtmlPage(ADVERTISING_HTML, CTX.sourceUrl);
  const found = extractPricingPlansFromText(page.text, CTX);
  const free = planNamed(found, "Free Listing");
  const featured = planNamed(found, "Featured Listing");
  const annual = planNamed(found, "Annual Spotlight");

  assert.ok(!free.benefits.some((b) => /category listing/i.test(b)));
  assert.ok(!featured.benefits.some((b) => /local seo/i.test(b)));
  assert.deepEqual(annual.benefits, [
    "All Featured Listing benefits",
    "Dedicated category banner",
  ]);
});

run("the paraphrase that caused the bug is never introduced", () => {
  const page = prepareHtmlPage(ADVERTISING_HTML, CTX.sourceUrl);
  const { candidates } = extractDeterministicFacts(page, ADVERTISING_HTML, "src-1");
  const serialized = JSON.stringify(candidates).toLowerCase();
  assert.ok(!serialized.includes("basic visibility"));
  assert.ok(!page.text.toLowerCase().includes("basic visibility"));
});

// --- 3. Nothing is invented -------------------------------------------------

run("extraction introduces no wording that is not on the page", () => {
  const page = prepareHtmlPage(ADVERTISING_HTML, CTX.sourceUrl);
  const found = extractPricingPlansFromText(page.text, CTX);
  const haystack = page.text.toLowerCase();
  for (const plan of plans(found)) {
    assert.ok(haystack.includes(plan.name.toLowerCase()), `invented plan name: ${plan.name}`);
    for (const benefit of plan.benefits) {
      assert.ok(haystack.includes(benefit.toLowerCase()), `invented benefit: ${benefit}`);
    }
  }
});

// --- 5. FAQ pairing ---------------------------------------------------------

run("FAQ questions pair with their own answer", () => {
  const page = prepareHtmlPage(FAQ_HTML, "https://example.test/faq");
  assert.equal(page.detectedType, "faq");
  const found = extractFaqPairsFromText(page.text, {
    sourceId: "src-faq",
    sourceUrl: "https://example.test/faq",
    sourceTitle: "FAQ",
  });
  const faqs = found.map((c) => c.data as FactDataMap["faq"]);
  const approval = faqs.find((f) => /approval/i.test(f.question));
  const cancel = faqs.find((f) => /cancel/i.test(f.question));
  assert.ok(approval && /one business day/i.test(approval.answer));
  assert.ok(cancel && /end of the current period/i.test(cancel.answer));
  assert.ok(!approval!.answer.includes("Cancel from your dashboard"));
});

run("JSON-LD FAQ, address, hours and phone are read literally", () => {
  const page = prepareHtmlPage(JSONLD_HTML, "https://example.test/shop");
  const { candidates } = extractDeterministicFacts(page, JSONLD_HTML, "src-shop");
  const byType = (t: string) => candidates.filter((c) => c.factType === t);

  const faq = byType("faq")[0]?.data as FactDataMap["faq"] | undefined;
  assert.ok(faq && faq.answer === "Refunds are available within 14 days.");

  const location = byType("location")[0]?.data as FactDataMap["location"] | undefined;
  assert.equal(location?.city, "Springfield");
  assert.equal(location?.postalCode, "33060");

  const hours = byType("business_hours")[0]?.data as FactDataMap["business_hours"] | undefined;
  assert.deepEqual(hours?.entries, [{ days: "Monday–Friday", opens: "09:00", closes: "17:00" }]);
});

// --- Contact + booking ------------------------------------------------------

run("mailto, tel and booking links become contact facts", () => {
  const page = prepareHtmlPage(ADVERTISING_HTML, CTX.sourceUrl);
  const { candidates } = extractDeterministicFacts(page, ADVERTISING_HTML, "src-1");
  const emails = candidates.filter((c) => c.factType === "contact_method");
  const booking = candidates.filter((c) => c.factType === "booking_link");
  assert.ok(emails.some((c) => (c.data as FactDataMap["contact_method"]).value === "sales@example.test"));
  assert.ok(emails.some((c) => (c.data as FactDataMap["contact_method"]).kind === "phone"));
  assert.equal((booking[0].data as FactDataMap["booking_link"]).url, "https://calendly.com/example/walkthrough");
});

// --- Deterministic facts outrank model output -------------------------------

run("deterministic facts are tagged website_verified", () => {
  const page = prepareHtmlPage(ADVERTISING_HTML, CTX.sourceUrl);
  const { candidates } = extractDeterministicFacts(page, ADVERTISING_HTML, "src-1");
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((c) => c.origin === "website_verified"));
});

// --- Page preparation -------------------------------------------------------

run("structured text keeps list items on their own lines", () => {
  const text = cleanHtmlToStructuredText(ADVERTISING_HTML);
  assert.ok(text.includes("\n- Local SEO visibility"));
  assert.ok(text.includes("Business Listing\n$29 per month"));
});

run("navigation and footer chrome are dropped", () => {
  const text = cleanHtmlToStructuredText(ADVERTISING_HTML);
  assert.ok(!text.includes("© Example Directory"));
});

run("content hash is stable for identical content and differs otherwise", () => {
  const a = prepareHtmlPage(ADVERTISING_HTML, CTX.sourceUrl);
  const b = prepareHtmlPage(ADVERTISING_HTML, CTX.sourceUrl);
  const c = prepareHtmlPage(ADVERTISING_HTML.replace("$29 per month", "$39 per month"), CTX.sourceUrl);
  assert.equal(a.contentHash, b.contentHash);
  assert.notEqual(a.contentHash, c.contentHash);
});

run("page type is classified from the URL path", () => {
  assert.equal(classifyPage({ url: "https://example.test/advertising" }), "pricing");
  assert.equal(classifyPage({ url: "https://example.test/faq" }), "faq");
  assert.equal(classifyPage({ url: "https://example.test/return-policy" }), "policy");
  assert.equal(classifyPage({ url: "https://example.test/about-us" }), "about");
  assert.equal(classifyPage({ url: "https://example.test/" }), "other");
});

run("a client-rendered page is reported, not guessed at", () => {
  const page = prepareHtmlPage(`<html><head><title>App</title></head><body><div id="root"></div></body></html>`, "https://example.test/app");
  assert.equal(page.renderedEmpty, true);
  const { candidates, notes } = extractDeterministicFacts(page, "<html></html>", "src-app");
  assert.equal(candidates.length, 0);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /rendered in the browser/i);
});

run("malformed JSON-LD does not break the page", () => {
  const html = `<script type="application/ld+json">{ not json </script><script type="application/ld+json">{"@type":"Product","name":"Widget"}</script>`;
  const blocks = extractJsonLdBlocks(html);
  assert.equal(blocks.length, 1);
});

// --- 7. Policies keep their conditions ---------------------------------------

run("a policy fact keeps every condition attached to it", () => {
  const parsed = parseFactData("policy", {
    category: "refunds",
    title: "Refund policy",
    details: "Refunds are issued to the original payment method.",
    conditions: [
      "Requested within 14 days of purchase",
      "Listing must not have received paid placement",
      "Setup fees are non-refundable",
    ],
  });
  assert.ok(parsed.ok);
  const policy = parsed.ok ? (parsed.data as FactDataMap["policy"]) : null;
  assert.equal(policy!.conditions.length, 3);
  assert.match(policy!.conditions[2], /Setup fees/);

  // A different policy on the same page must not absorb them.
  const other = parseFactData("policy", {
    category: "cancellation",
    title: "Cancellation policy",
    details: "Cancel any time from the dashboard.",
    conditions: ["Billing stops at the end of the current period"],
  });
  assert.ok(other.ok);
  assert.equal((other.ok ? (other.data as FactDataMap["policy"]) : null)!.conditions.length, 1);
});

// --- 8 & 9. Per-source isolation ---------------------------------------------

/** A long, unrelated page: the shape that used to consume the whole extraction budget. */
const HUGE_GUIDES_HTML = `<!doctype html><html><head><title>Guides</title></head><body><main>
<h1>Neighbourhood guides</h1>
${Array.from({ length: 600 }, (_, i) => `<p>Guide entry ${i}: a long paragraph about the area with no pricing information whatsoever, repeated to make this page far larger than the pricing page.</p>`).join("\n")}
</main></body></html>`;

const FIXTURES: Record<string, string> = {
  "https://example.test/advertising": ADVERTISING_HTML,
  "https://example.test/guides": HUGE_GUIDES_HTML,
  "https://example.test/faq": FAQ_HTML,
};

function fixtureDeps() {
  return {
    fetchPage: async (url: string) => {
      const html = FIXTURES[url];
      if (!html) throw new Error(`no fixture for ${url}`);
      return { page: prepareHtmlPage(html, url), rawHtml: html };
    },
    // The AI pass is stubbed out: these cases are about which sources get processed,
    // not about what a model returns.
    extractAi: async () => ({ candidates: [], rejected: 0, attempted: false }),
    now: () => new Date("2026-08-02T00:00:00.000Z"),
  };
}

async function scanAll(urls: string[]) {
  const results = [];
  for (const url of urls) {
    results.push(
      await scanSourceIntoDrafts({
        source: { id: `src:${url}`, url, contentHash: null },
        existingFacts: [],
        deps: fixtureDeps(),
      }),
    );
  }
  return results;
}

function planNamesFrom(results: Awaited<ReturnType<typeof scanAll>>): string[] {
  return results
    .flatMap((r) => r.candidates)
    .filter((c) => c.factType === "pricing_plan")
    .map((c) => (c.data as FactDataMap["pricing_plan"]).name)
    .sort();
}

await (async () => {
  const urls = [
    "https://example.test/guides",
    "https://example.test/advertising",
    "https://example.test/faq",
  ];

  const results = await scanAll(urls);
  run("a huge unrelated page cannot starve the pricing page", () => {
    const guides = results.find((r) => r.sourceId === "src:https://example.test/guides")!;
    const pricing = results.find((r) => r.sourceId === "src:https://example.test/advertising")!;
    assert.ok(guides.charCount! > pricing.charCount!, "the guides fixture should be the larger page");
    assert.equal(pricing.status, "scanned");
    const plans = pricing.candidates.filter((c) => c.factType === "pricing_plan");
    assert.equal(plans.length, 4);
  });

  const reversed = await scanAll([...urls].reverse());
  run("source order does not change the extracted facts", () => {
    assert.deepEqual(planNamesFrom(results), planNamesFrom(reversed));
  });

  run("one failing source does not stop the others", async () => {
    const withDeadUrl = [...urls, "https://example.test/missing"];
    const out = [];
    for (const url of withDeadUrl) {
      out.push(
        await scanSourceIntoDrafts({
          source: { id: `src:${url}`, url, contentHash: null },
          existingFacts: [],
          deps: fixtureDeps(),
        }),
      );
    }
    const failed = out.find((r) => r.sourceId === "src:https://example.test/missing")!;
    assert.equal(failed.status, "failed");
    assert.equal(failed.operations.length, 0, "a failed source must propose nothing");
    assert.equal(planNamesFrom(out).length, 4, "the other sources still produced their facts");
  });

  run("an unchanged page re-verifies without proposing changes", async () => {
    const page = prepareHtmlPage(ADVERTISING_HTML, "https://example.test/advertising");
    const result = await scanSourceIntoDrafts({
      source: {
        id: "src:https://example.test/advertising",
        url: "https://example.test/advertising",
        contentHash: page.contentHash,
      },
      existingFacts: [],
      deps: fixtureDeps(),
    });
    assert.equal(result.status, "unchanged");
    assert.equal(result.stats.added, 0);
    assert.equal(result.stats.changed, 0);
  });
})();

console.log("\nAll website knowledge extraction tests passed.");

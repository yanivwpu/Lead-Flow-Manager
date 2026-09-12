/**
 * Business Knowledge scan / review / publish regressions.
 *
 * Realistic WhachatCRM pricing HTML (split $49 + /mo spans, Free at $0/mo, yearly
 * $490 on the same card) plus classification and deleted-source review sync.
 *
 * Run: npx tsx tests/website-knowledge-scan-review.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateHomepageHtml,
  generateMarketingPageSsrHtml,
  injectHomepageSeoMeta,
  injectPageMeta,
} from "../server/seo";
import {
  formatCanonicalAmountWithPeriod,
  getFreePlanMonthlyPriceUsd,
  getPaidPlanMonthlyPriceUsd,
  getPaidPlanYearlyPriceUsd,
  REALTOR_GROWTH_ENGINE_NAME,
  REALTOR_GROWTH_ENGINE_ONETIME_USD,
} from "../shared/pricingEntitlements";
import {
  extractDeterministicFacts,
  extractPricingPlansFromText,
  findPricesInText,
  prepareHtmlPage,
} from "../server/websiteKnowledge/extractPage";
import { parseAiExtractionResponse } from "../server/websiteKnowledge/extractFactsAi";
import { combineCandidates, scanSourceIntoDrafts } from "../server/websiteKnowledge/scanPipeline";
import { mergeFactsForSource, planSourceRemovalOperations } from "../server/websiteKnowledge/mergeFacts";
import {
  buildKnowledgeExtractionArtifact,
  decideKnowledgeScanReuse,
  KNOWLEDGE_EXTRACTOR_VERSION,
  parseKnowledgeExtractionArtifact,
} from "../server/websiteKnowledge/extractionArtifact";
import { partitionConflicts } from "../server/websiteKnowledge/publishFacts";
import {
  factKey,
  formatFactValue,
  listedPlanPrices,
  parseFactData,
  type FactCandidate,
  type FactDataMap,
  type FactOrigin,
  type FactType,
  type KnowledgeFact,
} from "../shared/businessKnowledgeFacts";
import { buildKnowledgeReviewPayload, knowledgeReviewStepStatus } from "../shared/knowledgeReview";
import {
  SOURCE_REMOVED_REVIEW_MESSAGE,
  classifyExtractedCandidate,
  collectReviewReasons,
  isDraftFromRemovedSource,
  mergePricingPlanCandidates,
  normalizeExtractedMoney,
  parseBillingPeriod,
  parseExplicitAmount,
  sanitizeExtractedCandidates,
  validateFactForPublish,
} from "../shared/knowledgeExtractionGuards";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const CTX = {
  sourceId: "src-pricing",
  sourceUrl: "https://whachatcrm.com/pricing",
  sourceTitle: "WhachatCRM Pricing",
};

const WHACHAT_PRICING_HTML = `<!doctype html>
<html>
<head><title>WhachatCRM Pricing | Prospect AI, Unified Inbox & WhatsApp CRM</title></head>
<body>
<header>
  <nav>
    <a href="/">Home</a>
    <a href="/pricing">Pricing</a>
    <a href="/features">Features</a>
    <a href="https://facebook.com/whachatcrm">Facebook</a>
    <a href="/auth">Start free</a>
  </nav>
</header>
<main>
  <h1>Simple pricing. Everything you need to grow.</h1>
  <p>Start free. Upgrade when you’re ready to scale.</p>
  <p>14-day free Pro trial · AI Brain included · 0% markup on Meta fees · No setup fees</p>
  <p>Prospect AI included on every plan</p>

  <h2>Industries</h2>
  <p>Use cases we serve</p>
  <ul>
    <li>Real estate</li>
    <li>Agencies</li>
  </ul>

  <section data-testid="plan-card-free">
    <h3>Free</h3>
    <div>
      <span class="text-3xl">$0</span>
      <span class="text-sm">/mo</span>
    </div>
    <ul>
      <li>50 Prospect AI discoveries/month</li>
      <li>Unified Inbox</li>
    </ul>
    <a href="/auth">Start free</a>
  </section>

  <section data-testid="plan-card-pro">
    <h3>Pro</h3>
    <div>
      <span class="text-3xl">$49</span>
      <span class="text-sm">/mo</span>
    </div>
    <p>Billed $490/year</p>
    <ul>
      <li>AI Brain included</li>
      <li>14-day Pro trial</li>
    </ul>
    <a href="/auth">Start 14-day Pro trial</a>
  </section>

  <p>Questions? <a href="mailto:hello@whachatcrm.com">hello@whachatcrm.com</a></p>
  <p>Book a walkthrough at <a href="https://calendly.com/whachat/demo">Book a demo</a>.</p>
  <p>Follow us on <a href="https://facebook.com/whachatcrm">Facebook</a>.</p>
</main>
</body>
</html>`;

function plansFrom(candidates: FactCandidate[]): FactDataMap["pricing_plan"][] {
  return candidates
    .filter((c) => c.factType === "pricing_plan")
    .map((c) => c.data as FactDataMap["pricing_plan"]);
}

function planNamed(candidates: FactCandidate[], name: string): FactDataMap["pricing_plan"] {
  const found = plansFrom(candidates).find((p) => p.name === name);
  assert.ok(found, `expected plan ${name}, got ${plansFrom(candidates).map((p) => p.name).join(", ")}`);
  return found!;
}

function fact(
  factType: FactType,
  data: unknown,
  overrides: Partial<KnowledgeFact> = {},
): KnowledgeFact {
  const parsed = parseFactData(factType, data);
  assert.equal(parsed.ok, true, parsed.ok === false ? parsed.error : "");
  const key = overrides.factKey ?? factKey(parsed.factType, parsed.data);
  return {
    id: overrides.id ?? `fact-${key}`,
    userId: overrides.userId ?? "user-a",
    factType: parsed.factType,
    factKey: key,
    data: parsed.data,
    state: overrides.state ?? "draft",
    proposedAction: overrides.proposedAction ?? "add",
    origin: (overrides.origin ?? "website_verified") as FactOrigin,
    confidence: overrides.confidence ?? 0.9,
    isPinned: overrides.isPinned ?? false,
    userEdited: overrides.userEdited ?? false,
    conflictGroup: null,
    conflictResolution: null,
    supersededByFactId: null,
    sourceId: overrides.sourceId ?? "src-pricing",
    sourceUrl: overrides.sourceUrl ?? CTX.sourceUrl,
    sourceTitle: overrides.sourceTitle ?? CTX.sourceTitle,
    excerpt: overrides.excerpt ?? null,
    provenance: overrides.provenance ?? [
      { sourceId: overrides.sourceId ?? "src-pricing", url: CTX.sourceUrl, verifiedAt: "2026-09-01T00:00:00.000Z" },
    ],
    reviewReasons: overrides.reviewReasons,
    firstSeenAt: "2026-09-01T00:00:00.000Z",
    lastVerifiedAt: "2026-09-01T00:00:00.000Z",
    publishedAt: overrides.publishedAt ?? null,
    retiredAt: null,
  };
}

function candidate(partial: {
  factType: FactType;
  data: unknown;
  confidence?: number;
}): FactCandidate {
  const parsed = parseFactData(partial.factType, partial.data);
  assert.equal(parsed.ok, true, parsed.ok === false ? parsed.error : "");
  return {
    factType: parsed.factType,
    factKey: factKey(parsed.factType, parsed.data),
    data: parsed.data,
    origin: "ai_extracted",
    confidence: partial.confidence ?? 0.7,
    sourceId: CTX.sourceId,
    sourceUrl: CTX.sourceUrl,
    sourceTitle: CTX.sourceTitle,
    excerpt: null,
  };
}

function factsFromScan(
  result: { operations: Array<{ kind: string; candidate?: FactCandidate; proposedAction?: KnowledgeFact["proposedAction"]; provenance?: KnowledgeFact["provenance"] }> },
  userId = "user-a",
): KnowledgeFact[] {
  const out: KnowledgeFact[] = [];
  for (const op of result.operations) {
    if (op.kind !== "upsert_draft" || !op.candidate) continue;
    const scanned = op.candidate;
    out.push(
      fact(scanned.factType, scanned.data, {
        id: `draft-${scanned.factKey}`,
        userId,
        origin: scanned.origin,
        confidence: scanned.confidence,
        sourceId: scanned.sourceId ?? CTX.sourceId,
        sourceUrl: scanned.sourceUrl ?? CTX.sourceUrl,
        sourceTitle: scanned.sourceTitle ?? CTX.sourceTitle,
        excerpt: scanned.excerpt,
        proposedAction: op.proposedAction ?? "add",
        provenance: op.provenance ?? [],
        reviewReasons: scanned.reviewReasons,
        state: "draft",
      }),
    );
  }
  return out;
}

function pricingScanDeps(aiCalls: { n: number }) {
  return {
    fetchPage: async () => ({
      page: prepareHtmlPage(WHACHAT_PRICING_HTML, CTX.sourceUrl),
      rawHtml: WHACHAT_PRICING_HTML,
    }),
    extractAi: async () => {
      aiCalls.n += 1;
      return { candidates: [] as FactCandidate[], rejected: 0, attempted: false };
    },
    now: () => new Date("2026-09-11T00:00:00.000Z"),
  };
}

function reviewPending(payload: ReturnType<typeof buildKnowledgeReviewPayload>): number {
  return payload.totals.new + payload.totals.changed + payload.totals.removing + payload.totals.suggested;
}

// --- Amount / interval defaults ---------------------------------------------

run("an empty or missing amount stays unknown and never becomes 0", () => {
  assert.equal(parseExplicitAmount(""), undefined);
  assert.equal(parseExplicitAmount("   "), undefined);
  assert.equal(parseExplicitAmount(null), undefined);
  assert.equal(parseExplicitAmount(undefined), undefined);
  assert.equal(parseExplicitAmount({}), undefined);
  const omitted = normalizeExtractedMoney({ currency: "USD", billingPeriod: "month" }, { planName: "Pro" });
  assert.equal("money" in omitted && omitted.money, null);
});

run("an unknown billing frequency is never stored as one-time", () => {
  assert.equal(parseBillingPeriod(""), undefined);
  assert.equal(parseBillingPeriod("unknown"), undefined);
  assert.equal(parseBillingPeriod("once"), "once");
  const omitted = normalizeExtractedMoney({ amount: 49, currency: "USD" }, { planName: "Pro" });
  assert.ok("reason" in omitted && /one-time/i.test(omitted.reason));
  assert.equal("money" in omitted ? omitted.money : "missing", null);
  assert.equal(findPricesInText("Pro $49").length, 0);
});

run("a paid plan never keeps an inferred $0 price", () => {
  const omitted = normalizeExtractedMoney(
    { amount: 0, currency: "USD", billingPeriod: "once" },
    { planName: "Pro" },
  );
  assert.equal("money" in omitted ? omitted.money : "missing", null);
});

// --- Realistic WhachatCRM pricing HTML --------------------------------------

run("WhachatCRM Free extracts as $0/month, not one-time", () => {
  const page = prepareHtmlPage(WHACHAT_PRICING_HTML, CTX.sourceUrl);
  const found = extractPricingPlansFromText(page.text, CTX);
  const free = planNamed(found, "Free");
  const prices = listedPlanPrices(free);
  assert.equal(prices.length, 1);
  assert.equal(prices[0].amount, 0);
  assert.equal(prices[0].billingPeriod, "month");
  assert.notEqual(prices[0].billingPeriod, "once");
});

run("WhachatCRM Pro extracts as $49/month and $490/year", () => {
  const page = prepareHtmlPage(WHACHAT_PRICING_HTML, CTX.sourceUrl);
  const found = extractPricingPlansFromText(page.text, CTX);
  const pro = planNamed(found, "Pro");
  const prices = listedPlanPrices(pro);
  const month = prices.find((p) => p.billingPeriod === "month");
  const year = prices.find((p) => p.billingPeriod === "year");
  assert.equal(month?.amount, 49);
  assert.equal(year?.amount, 490);
  assert.ok(!prices.some((p) => p.amount === 0));
  assert.ok(!prices.some((p) => p.billingPeriod === "once"));
});

run("split price spans ($49 then /mo) stay one monthly price", () => {
  const html = `<main>${"x".repeat(80)}<h3>Pro</h3><span>$49</span><span>/mo</span></main>`;
  const page = prepareHtmlPage(html, CTX.sourceUrl);
  assert.match(page.text, /\$49\s*\/mo/);
  const hits = findPricesInText(page.text);
  assert.ok(hits.some((h) => h.amount === 49 && h.billingPeriod === "month"));
});

run("deterministic extraction does not invent $0 one-time for Free or Pro", () => {
  const page = prepareHtmlPage(WHACHAT_PRICING_HTML, CTX.sourceUrl);
  const { candidates } = extractDeterministicFacts(page, WHACHAT_PRICING_HTML, CTX.sourceId);
  const serialized = JSON.stringify(plansFrom(candidates));
  assert.ok(!/one-time/i.test(serialized));
  for (const plan of plansFrom(candidates)) {
    const summary = formatFactValue({ factType: "pricing_plan", data: plan });
    assert.ok(!/one-time/i.test(summary), summary);
    if (plan.name === "Pro") {
      assert.ok(!listedPlanPrices(plan).some((p) => p.amount === 0));
    }
  }
});

run("AI JSON that invents $0 one-time is stripped before review", () => {
  const { candidates } = parseAiExtractionResponse(
    JSON.stringify({
      facts: [
        {
          factType: "pricing_plan",
          data: {
            name: "Free",
            price: { amount: 0, currency: "USD", billingPeriod: "once" },
            benefits: [],
          },
          excerpt: "Free",
          confidence: 0.9,
        },
        {
          factType: "pricing_plan",
          data: {
            name: "Pro",
            price: { amount: 0, currency: "USD", billingPeriod: "once" },
            benefits: ["AI Brain included"],
          },
          excerpt: "Pro",
          confidence: 0.9,
        },
      ],
    }),
    CTX,
  );
  const free = planNamed(candidates, "Free");
  const pro = planNamed(candidates, "Pro");
  assert.equal(listedPlanPrices(free).length, 0);
  assert.equal(listedPlanPrices(pro).length, 0);
  assert.ok((candidates.find((c) => c.factKey.includes("pro"))?.reviewReasons || []).length > 0);
});

run("AI JSON with real monthly and yearly prices keeps both", () => {
  const { candidates } = parseAiExtractionResponse(
    JSON.stringify({
      facts: [
        {
          factType: "pricing_plan",
          data: {
            name: "Pro",
            price: { amount: 49, currency: "USD", billingPeriod: "month" },
            additionalPrices: [{ amount: 490, currency: "USD", billingPeriod: "year" }],
            benefits: ["AI Brain included"],
          },
          excerpt: "Pro $49/mo billed $490/year",
          confidence: 0.9,
        },
      ],
    }),
    CTX,
  );
  const pro = planNamed(candidates, "Pro");
  const prices = listedPlanPrices(pro);
  assert.deepEqual(
    prices.map((p) => [p.amount, p.billingPeriod]),
    [
      [49, "month"],
      [490, "year"],
    ],
  );
});

run("a missing price on a named plan stays unknown after the AI parse", () => {
  const { candidates } = parseAiExtractionResponse(
    JSON.stringify({
      facts: [
        {
          factType: "pricing_plan",
          data: { name: "Enterprise", benefits: ["Custom limits"] },
          excerpt: "Enterprise",
          confidence: 0.8,
        },
      ],
    }),
    CTX,
  );
  const plan = planNamed(candidates, "Enterprise");
  assert.equal(listedPlanPrices(plan).length, 0);
  const view = buildKnowledgeReviewPayload({
    facts: [fact("pricing_plan", plan)],
  }).sections.flatMap((s) => s.facts)[0];
  assert.equal(view.needsReview, true);
  assert.ok(view.reviewReasons.some((r) => /unknown|could not be read/i.test(r)));
});

// --- Classification ----------------------------------------------------------

run("industries, social links and signup CTAs are not Locations/Hours or Contact/Booking", () => {
  const raw: FactCandidate[] = [
    candidate({ factType: "location", data: { name: "Real estate" } }),
    candidate({ factType: "service_area", data: { area: "Agencies", notes: "Use cases we serve" } }),
    candidate({
      factType: "booking_link",
      data: { url: "https://facebook.com/whachatcrm", label: "Facebook" },
    }),
    candidate({
      factType: "call_to_action",
      data: { label: "Start free", url: "https://whachatcrm.com/auth" },
    }),
    candidate({
      factType: "call_to_action",
      data: { label: "Home", url: "https://whachatcrm.com/" },
    }),
    candidate({
      factType: "booking_link",
      data: { url: "https://calendly.com/whachat/demo", label: "Book a demo" },
    }),
  ];
  const kept = sanitizeExtractedCandidates(raw);
  assert.equal(kept.filter((c) => c.factType === "location" || c.factType === "service_area").length, 0);
  assert.equal(kept.filter((c) => c.factType === "booking_link").length, 1);
  assert.equal(
    (kept.find((c) => c.factType === "booking_link")?.data as FactDataMap["booking_link"]).url,
    "https://calendly.com/whachat/demo",
  );
  assert.ok(kept.some((c) => c.factType === "audience"));
  assert.ok(kept.some((c) => c.factType === "social_link"));
  assert.ok(!kept.some((c) => /start free/i.test(JSON.stringify(c.data))));

  const facts = kept.map((c, i) =>
    fact(c.factType, c.data, { id: `c-${i}`, origin: "ai_extracted" }),
  );
  const payload = buildKnowledgeReviewPayload({ facts });
  const locations = payload.sections.find((s) => s.id === "locations");
  const contact = payload.sections.find((s) => s.id === "contact");
  assert.ok(!locations || locations.facts.length === 0);
  assert.equal((contact?.facts || []).filter((f) => /facebook|start free|real estate|agencies/i.test(f.summary)).length, 0);
  assert.ok(payload.sections.some((s) => s.id === "overview" && s.facts.some((f) => f.factType === "audience")));
  assert.ok(payload.sections.some((s) => s.id === "social"));
});

run("live WhachatCRM HTML does not file Facebook or Start free as booking", () => {
  const page = prepareHtmlPage(WHACHAT_PRICING_HTML, CTX.sourceUrl);
  const { candidates } = extractDeterministicFacts(page, WHACHAT_PRICING_HTML, CTX.sourceId);
  const booking = candidates.filter((c) => c.factType === "booking_link");
  const contact = candidates.filter((c) => c.factType === "contact_method");
  const ctas = candidates.filter((c) => c.factType === "call_to_action");
  assert.ok(booking.every((c) => /calendly/i.test((c.data as FactDataMap["booking_link"]).url)));
  assert.ok(!contact.some((c) => /facebook/i.test(JSON.stringify(c.data))));
  assert.ok(!ctas.some((c) => /start free|trial/i.test((c.data as FactDataMap["call_to_action"]).label)));
  assert.ok(!candidates.some((c) => c.factType === "location" || c.factType === "service_area"));
});

run("low-confidence navigation text is omitted rather than published as a fact", () => {
  const classified = classifyExtractedCandidate(
    candidate({ factType: "custom_fact", data: { label: "Home", value: "Home" }, confidence: 0.3 }),
  );
  assert.equal(classified.keep, false);
});

function productionShapedMarketingHtml(route: string): string {
  const shell = `<!DOCTYPE html><html><head><title>Home</title></head><body><div id="root"></div></body></html>`;
  const withMeta = injectPageMeta(shell, route);
  const body = generateMarketingPageSsrHtml(route);
  if (!body) return withMeta;
  return withMeta.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

function productionShapedHomepageHtml(): string {
  const index = readFileSync(join(process.cwd(), "client/index.html"), "utf8");
  const withMeta = injectHomepageSeoMeta(index, "en");
  return withMeta.replace(
    '<div id="root"></div>',
    `<div id="root">${generateHomepageHtml("en")}</div>`,
  );
}

const CANONICAL_FREE = formatCanonicalAmountWithPeriod(getFreePlanMonthlyPriceUsd(), "month");
const CANONICAL_PRO_MONTH = formatCanonicalAmountWithPeriod(getPaidPlanMonthlyPriceUsd("pro"), "month");
const CANONICAL_PRO_YEAR = formatCanonicalAmountWithPeriod(getPaidPlanYearlyPriceUsd("pro"), "year");
const CANONICAL_RGE = formatCanonicalAmountWithPeriod(REALTOR_GROWTH_ENGINE_ONETIME_USD, "once");

async function scanProductionHtml(id: string, url: string, html: string, extra?: {
  artifact?: ReturnType<typeof buildKnowledgeExtractionArtifact> | null;
  forceReextract?: boolean;
  aiCandidates?: FactCandidate[];
}) {
  const aiCalls = { n: 0 };
  const result = await scanSourceIntoDrafts({
    source: {
      id,
      url,
      contentHash: extra?.artifact?.contentHash ?? null,
      extractionArtifact: extra?.artifact ?? null,
      forceReextract: extra?.forceReextract,
    },
    existingFacts: [],
    deps: {
      fetchPage: async () => ({ page: prepareHtmlPage(html, url), rawHtml: html }),
      extractAi: async () => {
        aiCalls.n += 1;
        return { candidates: extra?.aiCandidates ?? [], rejected: 0, attempted: Boolean(extra?.aiCandidates?.length) };
      },
      now: () => new Date("2026-09-11T00:00:00.000Z"),
    },
  });
  return { result, aiCalls };
}

run("production-shaped pricing HTML contains canonical crawlable amounts and JSON-LD offers", () => {
  const html = productionShapedMarketingHtml("/pricing");
  assert.match(html, new RegExp(`Free: ${CANONICAL_FREE.replace(/\$/g, "\\$")}`));
  assert.match(html, new RegExp(`Pro: ${CANONICAL_PRO_MONTH.replace(/\$/g, "\\$")}`));
  assert.match(html, new RegExp(`Pro: ${CANONICAL_PRO_YEAR.replace(/\$/g, "\\$")}`));
  assert.match(html, new RegExp(`${REALTOR_GROWTH_ENGINE_NAME}: ${CANONICAL_RGE.replace(/\$/g, "\\$")}`));
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /"price":49/);
  assert.match(html, /"price":490/);
  assert.match(html, /"price":0/);
  assert.match(html, /"price":199/);
  assert.match(html, /P1M/);
  assert.match(html, /P1Y/);
  assert.match(html, /one-time/);
});

await (async () => {
  const name = "production pricing HTML feeds fetch → extraction → artifact → merge → review";
  try {
    const html = productionShapedMarketingHtml("/pricing");
    const { result, aiCalls } = await scanProductionHtml("src-prod-pricing", "https://www.whachatcrm.com/pricing", html, {
      aiCandidates: [
        candidate({
          factType: "booking_link",
          data: { url: "https://www.whachatcrm.com/pricing", label: "View WhachatCRM plans" },
        }),
      ],
    });
    assert.equal(result.status, "scanned");
    assert.ok(aiCalls.n >= 1);
    assert.ok(result.extractionArtifact);
    assert.equal(result.extractionArtifact?.extractorVersion, KNOWLEDGE_EXTRACTOR_VERSION);

    const facts = factsFromScan(result);
    const payload = buildKnowledgeReviewPayload({ facts });
    const pricing = payload.sections.find((s) => s.id === "pricing");
    const offerings = payload.sections.find((s) => s.id === "offerings");
    const contact = payload.sections.find((s) => s.id === "contact");
    const other = payload.sections.find((s) => s.id === "other");

    const free = planNamed(result.candidates, "Free");
    const pro = planNamed(result.candidates, "Pro");
    const freePrices = listedPlanPrices(free);
    const proPrices = listedPlanPrices(pro);
    assert.equal(freePrices.find((p) => p.billingPeriod === "month")?.amount, getFreePlanMonthlyPriceUsd());
    assert.equal(proPrices.find((p) => p.billingPeriod === "month")?.amount, getPaidPlanMonthlyPriceUsd("pro"));
    assert.equal(proPrices.find((p) => p.billingPeriod === "year")?.amount, getPaidPlanYearlyPriceUsd("pro"));
    assert.ok(!proPrices.some((p) => p.amount === 0 && p.billingPeriod === "once"));
    assert.ok(!result.candidates.some((c) => c.factType === "pricing_plan" && /growth engine/i.test(JSON.stringify(c.data))));

    const rge = result.candidates.find(
      (c) => c.factType === "product" && /realtor growth engine/i.test((c.data as FactDataMap["product"]).name),
    );
    assert.ok(rge, "RGE must be a product, not a Free/Pro tier");
    const rgePrice = (rge!.data as FactDataMap["product"]).price;
    assert.equal(rgePrice?.amount, REALTOR_GROWTH_ENGINE_ONETIME_USD);
    assert.equal(rgePrice?.billingPeriod, "once");

    assert.ok(pricing?.facts.some((f) => f.factType === "pricing_plan" && /Free/.test(f.summary) && !/not listed/i.test(f.display?.headline || f.summary)));
    assert.ok(pricing?.facts.some((f) => /Pro/.test(f.summary) && /49/.test(f.display?.headline || f.summary)));
    assert.ok(pricing?.facts.some((f) => /Pro/.test(f.summary) && /490/.test(f.display?.headline || f.summary)));
    assert.ok(offerings?.facts.some((f) => /Realtor Growth Engine/.test(f.summary) && /199/.test(f.summary)));
    assert.ok(!(contact?.facts || []).some((f) => /View WhachatCRM plans/i.test(f.summary)));
    assert.ok(!(other?.facts || []).some((f) => /View WhachatCRM plans/i.test(f.summary)));
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
})();

await (async () => {
  const name = "production RGE and homepage classify destinations, not anchor text";
  try {
    const rgeHtml = productionShapedMarketingHtml("/realtor-growth-engine");
    assert.match(rgeHtml, /View WhachatCRM plans/);
    assert.match(rgeHtml, new RegExp(`${REALTOR_GROWTH_ENGINE_NAME}: ${CANONICAL_RGE.replace(/\$/g, "\\$")}`));
    const rgeScan = await scanProductionHtml(
      "src-rge",
      "https://www.whachatcrm.com/realtor-growth-engine",
      rgeHtml,
    );
    const rgeFacts = factsFromScan(rgeScan.result);
    const rgeReview = buildKnowledgeReviewPayload({ facts: rgeFacts });
    const rgeContact = rgeReview.sections.find((s) => s.id === "contact");
    assert.ok(!(rgeContact?.facts || []).some((f) => /View WhachatCRM plans/i.test(f.summary)));
    assert.ok(
      rgeScan.result.candidates.some(
        (c) => c.factType === "product" && (c.data as FactDataMap["product"]).price?.amount === REALTOR_GROWTH_ENGINE_ONETIME_USD,
      ),
    );

    const homeHtml = productionShapedHomepageHtml();
    assert.match(homeHtml, /Book a Demo/);
    assert.match(homeHtml, /href="\/contact"/);
    const homeScan = await scanProductionHtml("src-home", "https://www.whachatcrm.com/", homeHtml);
    const homeFacts = factsFromScan(homeScan.result);
    const homeReview = buildKnowledgeReviewPayload({ facts: homeFacts });
    const homeContact = homeReview.sections.find((s) => s.id === "contact");
    const homeOther = homeReview.sections.find((s) => s.id === "other");
    assert.ok(
      (homeContact?.facts || []).some((f) => /Book a Demo/i.test(f.summary) && f.factType === "booking_link"),
      "Book a Demo must land under Contact and Booking",
    );
    assert.ok(!(homeOther?.facts || []).some((f) => /Book a Demo/i.test(f.summary)));
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
})();

await (async () => {
  const name = "forced re-extract after an older artifact does not replay stale prices";
  try {
    const html = productionShapedMarketingHtml("/pricing");
    const page = prepareHtmlPage(html, "https://www.whachatcrm.com/pricing");
    const stale = buildKnowledgeExtractionArtifact({
      contentHash: page.contentHash,
      extractorVersion: 2,
      extractedAt: "2026-08-01T00:00:00.000Z",
      candidates: [
        candidate({
          factType: "pricing_plan",
          data: { name: "Pro", price: null, additionalPrices: [], benefits: [] },
        }),
      ],
    });
    assert.equal(stale.extractorVersion, 2);

    const withoutForce = await scanProductionHtml("src-stale", "https://www.whachatcrm.com/pricing", html, {
      artifact: stale,
    });
    assert.equal(withoutForce.result.status, "reanalyzed");
    assert.ok(withoutForce.aiCalls.n >= 1);
    const pro = planNamed(withoutForce.result.candidates, "Pro");
    assert.equal(listedPlanPrices(pro).find((p) => p.billingPeriod === "month")?.amount, getPaidPlanMonthlyPriceUsd("pro"));

    const matchingStale = { ...stale, extractorVersion: KNOWLEDGE_EXTRACTOR_VERSION };
    const forced = await scanProductionHtml("src-force", "https://www.whachatcrm.com/pricing", html, {
      artifact: matchingStale,
      forceReextract: true,
    });
    assert.equal(forced.result.status, "reanalyzed");
    assert.ok(forced.aiCalls.n >= 1);
    const forcedPro = planNamed(forced.result.candidates, "Pro");
    assert.equal(listedPlanPrices(forcedPro).find((p) => p.billingPeriod === "month")?.amount, getPaidPlanMonthlyPriceUsd("pro"));
    assert.notEqual(listedPlanPrices(forcedPro).length, 0);
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
})();

run("extractor-version invalidation is on the deployed scan job/worker path", () => {
  assert.equal(KNOWLEDGE_EXTRACTOR_VERSION, 5);
  const repo = process.cwd();
  const worker = readFileSync(join(repo, "server/websiteKnowledge/scanJobWorker.ts"), "utf8");
  const service = readFileSync(join(repo, "server/websiteKnowledge/scanJobService.ts"), "utf8");
  const pipeline = readFileSync(join(repo, "server/websiteKnowledge/scanPipeline.ts"), "utf8");
  const index = readFileSync(join(repo, "server/index.ts"), "utf8");
  assert.match(worker, /processScanJob/);
  assert.match(worker, /from "\.\/scanJobService"/);
  assert.match(service, /forceReextract: items\[sourceId\]\?\.forceReextract === true/);
  assert.match(service, /parseKnowledgeExtractionArtifact/);
  assert.match(service, /scanSourceIntoDrafts/);
  assert.match(pipeline, /KNOWLEDGE_EXTRACTOR_VERSION/);
  assert.match(index, /startKnowledgeScanWorker/);
});

run("destination semantics keep View plans out of booking and Book a Demo in booking", () => {
  const kept = sanitizeExtractedCandidates([
    candidate({
      factType: "booking_link",
      data: { url: "https://www.whachatcrm.com/pricing", label: "View WhachatCRM plans" },
    }),
    candidate({
      factType: "call_to_action",
      data: { url: "https://www.whachatcrm.com/pricing", label: "View WhachatCRM plans" },
    }),
    candidate({
      factType: "booking_link",
      data: { url: "https://www.whachatcrm.com/realtor-growth-engine", label: "Realtor Growth Engine" },
    }),
    candidate({
      factType: "call_to_action",
      data: { url: "https://www.whachatcrm.com/contact", label: "Book a Demo" },
    }),
    candidate({
      factType: "call_to_action",
      data: { url: "https://www.whachatcrm.com/auth", label: "Start free" },
    }),
  ]);
  assert.ok(!kept.some((c) => /View WhachatCRM plans/i.test(JSON.stringify(c.data))));
  assert.ok(!kept.some((c) => c.factType === "booking_link" && /realtor-growth-engine/i.test((c.data as FactDataMap["booking_link"]).url)));
  const demo = kept.find((c) => c.factType === "booking_link" && /Book a Demo/i.test(JSON.stringify(c.data)));
  assert.ok(demo);
  assert.match((demo!.data as FactDataMap["booking_link"]).url, /\/contact/);
  assert.ok(!kept.some((c) => c.factType === "call_to_action" && /Book a Demo/i.test(JSON.stringify(c.data))));
});

// --- Deleted source review / publish ----------------------------------------

run("a removed source disappears from review immediately and cannot be published", () => {
  const publishedPlan = fact(
    "pricing_plan",
    {
      name: "Pro",
      price: { amount: 49, currency: "USD", billingPeriod: "month" },
      additionalPrices: [{ amount: 490, currency: "USD", billingPeriod: "year" }],
      benefits: ["AI Brain included"],
    },
    { id: "pub-1", state: "published", proposedAction: null, publishedAt: "2026-08-01T00:00:00.000Z" },
  );
  const draft = fact(
    "pricing_plan",
    {
      name: "Pro",
      price: { amount: 0, currency: "USD", billingPeriod: "once" },
      benefits: [],
    },
    { id: "draft-1", state: "draft", proposedAction: "update" },
  );
  draft.factKey = publishedPlan.factKey;

  const ops = planSourceRemovalOperations([publishedPlan, draft], "src-pricing");
  assert.ok(ops.some((op) => op.kind === "discard_draft" && op.factId === "draft-1"));
  assert.ok(!ops.some((op) => op.kind === "propose_retire"));

  const payload = buildKnowledgeReviewPayload({
    facts: [publishedPlan, draft],
    activeSourceIds: [],
  });
  assert.ok(payload.notices.some((n) => n.message === SOURCE_REMOVED_REVIEW_MESSAGE));
  assert.ok(!payload.sections.some((s) => s.facts.some((f) => f.id === "draft-1")));
  assert.ok(payload.sections.some((s) => s.facts.some((f) => f.id === "pub-1" && f.state === "published")));

  assert.equal(isDraftFromRemovedSource(draft, new Set()), true);
  const invalid = validateFactForPublish(draft);
  assert.equal(invalid.ok, false);
});

run("published knowledge is unchanged by a scan — only drafts are proposed", () => {
  const live = fact(
    "pricing_plan",
    {
      name: "Pro",
      price: { amount: 49, currency: "USD", billingPeriod: "month" },
      benefits: ["AI Brain included"],
    },
    { id: "pub-1", state: "published", proposedAction: null, publishedAt: "2026-08-01T00:00:00.000Z" },
  );
  const incoming: FactCandidate = {
    factType: "pricing_plan",
    factKey: live.factKey,
    data: {
      name: "Pro",
      price: { amount: 0, currency: "USD", billingPeriod: "once" },
      additionalPrices: [],
      priceQualifier: "exact",
      benefits: ["AI Brain included"],
    },
    origin: "ai_extracted",
    confidence: 0.5,
    sourceId: "src-pricing",
    sourceUrl: CTX.sourceUrl,
    sourceTitle: CTX.sourceTitle,
    excerpt: "Pro",
  };
  const merged = mergeFactsForSource({
    sourceId: "src-pricing",
    existingFacts: [live],
    candidates: [incoming],
    now: new Date("2026-09-11T00:00:00.000Z"),
  });
  assert.ok(merged.operations.every((op) => op.kind !== "touch_verified" || op.factId === live.id));
  assert.ok(merged.operations.some((op) => op.kind === "upsert_draft"));
  assert.equal(live.data, incoming.data === live.data ? incoming.data : live.data);
  assert.equal((live.data as FactDataMap["pricing_plan"]).price?.amount, 49);
});

run("publish rejects a paid Pro draft stored at $0 and reports the item", () => {
  const draft = fact(
    "pricing_plan",
    {
      name: "Pro",
      price: { amount: 0, currency: "USD", billingPeriod: "once" },
      benefits: ["AI Brain included"],
    },
    { id: "bad-pro", state: "draft", proposedAction: "add" },
  );
  const result = validateFactForPublish(draft);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected rejection");
  assert.ok(result.reasons.some((r) => /\$0/.test(r)));
});

run("user-edited drafts survive source removal", () => {
  const edited = fact(
    "faq",
    { question: "Is Prospect AI included?", answer: "Yes, on every plan." },
    { id: "edit-1", userEdited: true, state: "draft", proposedAction: "add" },
  );
  const ops = planSourceRemovalOperations([edited], "src-pricing");
  assert.ok(!ops.some((op) => op.kind === "discard_draft"));
  assert.ok(ops.some((op) => op.kind === "touch_verified" && op.factId === "edit-1"));
});

run("deterministic prices outrank an AI $0 hallucination for the same plan", () => {
  const page = prepareHtmlPage(WHACHAT_PRICING_HTML, CTX.sourceUrl);
  const deterministic = extractPricingPlansFromText(page.text, CTX);
  const ai: FactCandidate[] = [
    {
      ...deterministic.find((c) => (c.data as FactDataMap["pricing_plan"]).name === "Pro")!,
      origin: "ai_extracted",
      confidence: 0.95,
      data: {
        name: "Pro",
        description: null,
        price: { amount: 0, currency: "USD", billingPeriod: "once" },
        additionalPrices: [],
        priceQualifier: "exact",
        benefits: [],
      },
    },
  ];
  const combined = combineCandidates(deterministic, ai);
  const pro = planNamed(combined, "Pro");
  const prices = listedPlanPrices(pro);
  assert.equal(prices.find((p) => p.billingPeriod === "month")?.amount, 49);
  assert.ok(!prices.some((p) => p.amount === 0 && p.billingPeriod === "once"));
});

run("equal-precedence price conflicts still partition without publishing either silently", () => {
  const a = fact(
    "pricing_plan",
    { name: "Pro", price: { amount: 49, currency: "USD", billingPeriod: "month" }, benefits: [] },
    { id: "a", state: "published", proposedAction: null, sourceId: "src-1" },
  );
  const b = fact(
    "pricing_plan",
    { name: "Pro", price: { amount: 99, currency: "USD", billingPeriod: "month" }, benefits: [] },
    { id: "b", state: "published", proposedAction: null, sourceId: "src-2" },
  );
  b.factKey = a.factKey;
  const { blockedKeys } = partitionConflicts([a, b]);
  assert.ok(blockedKeys.has(a.factKey));
});

// --- Discard + re-analyze recovery ------------------------------------------

run("checksum, artifact version, drafts, and published knowledge are separate", () => {
  const htmlUnchanged = decideKnowledgeScanReuse({
    pageContentHash: "abc",
    storedContentHash: "abc",
    artifact: null,
  });
  assert.equal(htmlUnchanged.action, "extract");
  assert.equal(htmlUnchanged.reason, "missing_artifact");

  const valid = buildKnowledgeExtractionArtifact({
    contentHash: "abc",
    candidates: [],
    extractedAt: "2026-09-11T00:00:00.000Z",
  });
  assert.equal(
    decideKnowledgeScanReuse({
      pageContentHash: "abc",
      storedContentHash: "abc",
      artifact: valid,
    }).action,
    "reuse_artifact",
  );
  assert.equal(
    decideKnowledgeScanReuse({
      pageContentHash: "abc",
      storedContentHash: "abc",
      artifact: { ...valid, extractorVersion: KNOWLEDGE_EXTRACTOR_VERSION + 1 },
    }).reason,
    "version_mismatch",
  );
  assert.equal(
    decideKnowledgeScanReuse({
      pageContentHash: "abc",
      storedContentHash: "abc",
      artifact: valid,
      forceReextract: true,
    }).reason,
    "force",
  );
  assert.equal(parseKnowledgeExtractionArtifact({ extractionArtifact: { extractorVersion: 2 } }), null);
});

await (async () => {
  const name = "discarding every draft then analyzing identical HTML recreates review facts";
  try {
    const firstAi = { n: 0 };
    const first = await scanSourceIntoDrafts({
      source: { id: CTX.sourceId, url: CTX.sourceUrl, contentHash: null },
      existingFacts: [],
      deps: pricingScanDeps(firstAi),
    });
    assert.equal(first.status, "scanned");
    assert.ok(first.stats.added > 0);
    assert.ok(first.extractionArtifact);

    const free = planNamed(first.candidates, "Free");
    const freePrices = listedPlanPrices(free);
    assert.equal(freePrices[0]?.amount, 0);
    assert.equal(freePrices[0]?.billingPeriod, "month");

    const pro = planNamed(first.candidates, "Pro");
    const proPrices = listedPlanPrices(pro);
    assert.equal(proPrices.find((p) => p.billingPeriod === "month")?.amount, 49);
    assert.equal(proPrices.find((p) => p.billingPeriod === "year")?.amount, 490);

    const drafts = factsFromScan(first);
    const firstReview = buildKnowledgeReviewPayload({
      facts: drafts,
      activeSourceIds: [CTX.sourceId],
    });
    assert.ok(firstReview.hasPendingChanges);
    assert.notEqual(
      knowledgeReviewStepStatus({
        pendingCount: reviewPending(firstReview),
        publishedCount: 0,
        lastScanFactsProposed: first.stats.added,
      }),
      "Nothing yet",
    );

    const discarded: KnowledgeFact[] = [];
    const reuseAi = { n: 0 };
    const second = await scanSourceIntoDrafts({
      source: {
        id: CTX.sourceId,
        url: CTX.sourceUrl,
        contentHash: first.contentHash ?? null,
        extractionArtifact: first.extractionArtifact,
      },
      existingFacts: discarded,
      deps: pricingScanDeps(reuseAi),
    });
    assert.equal(second.status, "reanalyzed");
    assert.ok(second.stats.added > 0, "unchanged HTML must recreate discarded drafts");
    assert.equal(reuseAi.n, 0, "valid artifact for this extractor version must be reused");

    const recovered = factsFromScan(second);
    assert.ok(recovered.length > 0);
    const recoveredReview = buildKnowledgeReviewPayload({
      facts: recovered,
      activeSourceIds: [CTX.sourceId],
    });
    assert.ok(recoveredReview.sections.some((section) => section.facts.length > 0));
    assert.ok(recoveredReview.hasPendingChanges);
    assert.notEqual(
      knowledgeReviewStepStatus({
        pendingCount: reviewPending(recoveredReview),
        publishedCount: 0,
        lastScanFactsProposed: second.stats.added,
      }),
      "Nothing yet",
    );

    const missingAi = { n: 0 };
    const missing = await scanSourceIntoDrafts({
      source: {
        id: CTX.sourceId,
        url: CTX.sourceUrl,
        contentHash: first.contentHash ?? null,
        extractionArtifact: null,
      },
      existingFacts: [],
      deps: pricingScanDeps(missingAi),
    });
    assert.equal(missing.status, "reanalyzed");
    assert.ok(missing.stats.added > 0);
    assert.ok(missingAi.n >= 1);

    const bumpAi = { n: 0 };
    const bumped = await scanSourceIntoDrafts({
      source: {
        id: CTX.sourceId,
        url: CTX.sourceUrl,
        contentHash: first.contentHash ?? null,
        extractionArtifact: first.extractionArtifact,
      },
      existingFacts: [],
      extractorVersion: KNOWLEDGE_EXTRACTOR_VERSION + 1,
      deps: pricingScanDeps(bumpAi),
    });
    assert.equal(bumped.status, "reanalyzed");
    assert.ok(bumpAi.n >= 1, "an extractor-version bump must reprocess unchanged content");

    const published = recovered.map((row, index) => ({
      ...row,
      id: `pub-${index}`,
      state: "published" as const,
      proposedAction: null,
      publishedAt: "2026-09-11T00:00:00.000Z",
    }));
    const publishedSnapshot = JSON.stringify(published.map((row) => row.data));
    const publishedAi = { n: 0 };
    const afterPublish = await scanSourceIntoDrafts({
      source: {
        id: CTX.sourceId,
        url: CTX.sourceUrl,
        contentHash: first.contentHash ?? null,
        extractionArtifact: second.extractionArtifact,
      },
      existingFacts: published,
      deps: pricingScanDeps(publishedAi),
    });
    assert.equal(afterPublish.status, "unchanged");
    assert.equal(publishedAi.n, 0);
    assert.equal(
      afterPublish.operations.some((op) => op.kind === "upsert_draft"),
      false,
    );
    assert.equal(JSON.stringify(published.map((row) => row.data)), publishedSnapshot);

    const foreign = fact(
      "pricing_plan",
      {
        name: "Other workspace plan",
        price: { amount: 99, currency: "USD", billingPeriod: "month" },
        benefits: [],
      },
      {
        id: "tenant-b-plan",
        userId: "user-b",
        sourceId: "src-other-tenant",
        state: "published",
        proposedAction: null,
        publishedAt: "2026-09-01T00:00:00.000Z",
      },
    );
    const isolated = await scanSourceIntoDrafts({
      source: {
        id: CTX.sourceId,
        url: CTX.sourceUrl,
        contentHash: first.contentHash ?? null,
        extractionArtifact: second.extractionArtifact,
      },
      existingFacts: [...published, foreign],
      deps: pricingScanDeps({ n: 0 }),
    });
    assert.equal(
      isolated.operations.some((op) => "factId" in op && op.factId === "tenant-b-plan"),
      false,
      "tenant B facts must not be touched by tenant A scans",
    );

    const forceAi = { n: 0 };
    const forced = await scanSourceIntoDrafts({
      source: {
        id: CTX.sourceId,
        url: CTX.sourceUrl,
        contentHash: first.contentHash ?? null,
        extractionArtifact: first.extractionArtifact,
        forceReextract: true,
      },
      existingFacts: published,
      deps: pricingScanDeps(forceAi),
    });
    assert.equal(forced.status, "reanalyzed");
    assert.ok(forceAi.n >= 1);
    assert.equal(JSON.stringify(published.map((row) => row.data)), publishedSnapshot);
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
})();

run("the review UI does not say Nothing yet after a scan that generated facts", () => {
  assert.notEqual(
    knowledgeReviewStepStatus({ pendingCount: 0, publishedCount: 0, lastScanFactsProposed: 17 }),
    "Nothing yet",
  );
  assert.equal(
    knowledgeReviewStepStatus({ pendingCount: 17, publishedCount: 0, lastScanFactsProposed: 17 }),
    "17 to review",
  );
  const ui = readFileSync(join(process.cwd(), "client/src/components/aibrain/BusinessKnowledgeSteps.tsx"), "utf8");
  assert.match(ui, /knowledgeReviewStepStatus/);
  assert.match(ui, /reanalyzed/);
  assert.match(ui, /button-force-reextract-knowledge/);
  assert.match(ui, /forceReextract: true/);
  const pipe = readFileSync(join(process.cwd(), "server/websiteKnowledge/scanPipeline.ts"), "utf8");
  assert.match(pipe, /decideKnowledgeScanReuse/);
  assert.match(pipe, /reanalyzed/);
  assert.doesNotMatch(pipe, /contentUnchanged: true/);
  const discard = readFileSync(join(process.cwd(), "server/websiteKnowledge/factStore.ts"), "utf8");
  const discardFn = discard.slice(discard.indexOf("export async function discardDraftFacts"));
  assert.doesNotMatch(discardFn.slice(0, 400), /contentHash|extractionArtifact/);
  const routes = readFileSync(join(process.cwd(), "server/websiteKnowledge/knowledgeRoutes.ts"), "utf8");
  assert.match(routes, /forceReextract: body\.forceReextract === true/);
});

// --- Tenant isolation (source-level) ----------------------------------------

run("knowledge stores and publish stay tenant-scoped", () => {
  const repo = process.cwd();
  for (const rel of [
    "server/websiteKnowledge/factStore.ts",
    "server/websiteKnowledge/sourceStore.ts",
    "server/websiteKnowledge/publishFacts.ts",
    "server/websiteKnowledge/knowledgeRoutes.ts",
  ]) {
    const src = readFileSync(join(repo, rel), "utf8");
    if (rel.endsWith("knowledgeRoutes.ts")) {
      assert.ok(/req\.user/.test(src));
      assert.ok(!/body\.(userId|workspaceId)/.test(src));
      continue;
    }
    assert.match(src, /eq\(\w+\.userId,\s*userId\)/);
  }
  const del = readFileSync(join(repo, "server/websiteKnowledge/sourceStore.ts"), "utf8");
  assert.match(del, /planSourceRemovalOperations/);
  assert.match(del, /eq\(aiWebsiteKnowledgeSources\.userId,\s*userId\)/);
  assert.match(del, /eq\(businessKnowledgeFacts\.userId,\s*userId\)/);
  const pub = readFileSync(join(repo, "server/websiteKnowledge/publishFacts.ts"), "utf8");
  assert.match(pub, /validateFactForPublish/);
  assert.match(pub, /isDraftFromRemovedSource/);
  assert.match(pub, /itemErrors/);
});

function parentWhachatProductHtml(): string {
  return `<!doctype html>
<html>
<head>
<title>WhachatCRM Pricing | Prospect AI, Unified Inbox & WhatsApp CRM</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"WhachatCRM","url":"https://www.whachatcrm.com/pricing","offers":[
  {"@type":"Offer","name":"Free","price":0,"priceCurrency":"USD","priceSpecification":{"billingDuration":"P1M","unitCode":"MON"}},
  {"@type":"Offer","name":"Pro","price":49,"priceCurrency":"USD","priceSpecification":{"billingDuration":"P1M","unitCode":"MON"}},
  {"@type":"Offer","name":"Pro","price":490,"priceCurrency":"USD","priceSpecification":{"billingDuration":"P1Y","unitCode":"ANN"}},
  {"@type":"Offer","name":"Realtor Growth Engine","price":199,"priceCurrency":"USD","description":"Requires an active Pro plan.","url":"https://www.whachatcrm.com/realtor-growth-engine","priceSpecification":{"unitText":"one-time","billingDuration":"one-time"}}
]}
</script>
</head>
<body>
<main>
  <h1>Simple pricing. Everything you need to grow.</h1>
  <p>${"Canonical public pricing with enough readable content. ".repeat(8)}</p>
  <ul>
    <li>Free: $0/month</li>
    <li>Pro: $49/month</li>
    <li>Pro: $490/year</li>
    <li>Realtor Growth Engine: $199 one-time</li>
    <li>Requires an active Pro plan.</li>
    <li>MLS matching for Pro workspaces</li>
  </ul>
  <p><a href="/pricing">View WhachatCRM plans</a></p>
  <p><a href="/realtor-growth-engine">Realtor Growth Engine</a></p>
  <p><a href="/contact">Book a Demo</a></p>
</main>
</body>
</html>`;
}

function contaminatingAiJson(): string {
  return JSON.stringify({
    facts: [
      {
        factType: "pricing_plan",
        data: { name: "WhachatCRM", benefits: [] },
        excerpt: "WhachatCRM Pricing | Prospect AI, Unified Inbox & WhatsApp CRM",
        confidence: 0.7,
      },
      {
        factType: "pricing_plan",
        data: { name: "Free", benefits: ["50 Prospect AI discoveries/month"] },
        excerpt: "Free",
        confidence: 0.65,
      },
      {
        factType: "pricing_plan",
        data: {
          name: "Pro",
          price: { amount: REALTOR_GROWTH_ENGINE_ONETIME_USD, currency: "USD", billingPeriod: "once" },
          benefits: ["MLS matching for Pro workspaces", "Requires Pro"],
          description: "Realtor Growth Engine. Requires an active Pro plan.",
          planUrl: "https://www.whachatcrm.com/realtor-growth-engine",
        },
        excerpt: "Realtor Growth Engine $199 one-time Requires Pro",
        confidence: 0.9,
      },
      {
        factType: "booking_link",
        data: { url: "https://www.whachatcrm.com/pricing", label: "View WhachatCRM plans" },
        excerpt: "View WhachatCRM plans",
        confidence: 0.8,
      },
      {
        factType: "booking_link",
        data: { url: "https://www.whachatcrm.com/realtor-growth-engine", label: "Realtor Growth Engine" },
        excerpt: "Realtor Growth Engine",
        confidence: 0.8,
      },
      {
        factType: "call_to_action",
        data: { url: "https://www.whachatcrm.com/contact", label: "Book a Demo" },
        excerpt: "Book a Demo",
        confidence: 0.9,
      },
    ],
  });
}

function assertCanonicalCommercialIdentities(candidates: FactCandidate[]) {
  const planNames = plansFrom(candidates).map((plan) => plan.name);
  assert.ok(planNames.includes("Free"), `Free missing from ${planNames.join(", ")}`);
  assert.ok(planNames.includes("Pro"), `Pro missing from ${planNames.join(", ")}`);
  assert.ok(!planNames.some((name) => /whachatcrm/i.test(name)), `umbrella plan leaked: ${planNames.join(", ")}`);

  const free = planNamed(candidates, "Free");
  const freePrices = listedPlanPrices(free);
  assert.equal(freePrices.length, 1);
  assert.equal(freePrices[0]?.amount, getFreePlanMonthlyPriceUsd());
  assert.equal(freePrices[0]?.billingPeriod, "month");
  const freeFact = candidates.find((c) => c.factType === "pricing_plan" && (c.data as FactDataMap["pricing_plan"]).name === "Free")!;
  assert.ok(!collectReviewReasons(freeFact as unknown as KnowledgeFact).some((reason) => /could not be read|unknown|not listed/i.test(reason)));

  const pro = planNamed(candidates, "Pro");
  const proPrices = listedPlanPrices(pro);
  assert.equal(proPrices.find((p) => p.billingPeriod === "month")?.amount, getPaidPlanMonthlyPriceUsd("pro"));
  assert.equal(proPrices.find((p) => p.billingPeriod === "year")?.amount, getPaidPlanYearlyPriceUsd("pro"));
  assert.ok(!proPrices.some((p) => p.amount === REALTOR_GROWTH_ENGINE_ONETIME_USD || p.billingPeriod === "once"));
  assert.ok(!pro.benefits.some((b) => /mls matching|requires pro|growth engine/i.test(b)));

  const rge = candidates.find(
    (c) => c.factType === "product" && /realtor growth engine/i.test((c.data as FactDataMap["product"]).name),
  );
  assert.ok(rge, "RGE must remain a distinct product");
  const rgeData = rge!.data as FactDataMap["product"];
  assert.equal(rgeData.price?.amount, REALTOR_GROWTH_ENGINE_ONETIME_USD);
  assert.equal(rgeData.price?.billingPeriod, "once");
  assert.match(String(rgeData.description || ""), /requires/i);
}

function assertExpectedPricingReview(facts: KnowledgeFact[]) {
  const payload = buildKnowledgeReviewPayload({ facts });
  const pricing = payload.sections.find((s) => s.id === "pricing");
  const offerings = payload.sections.find((s) => s.id === "offerings");
  const contact = payload.sections.find((s) => s.id === "contact");

  const freeView = pricing?.facts.find((f) => f.display?.title === "Free");
  assert.ok(freeView, "Free must appear in pricing review");
  assert.match(freeView!.display?.headline || "", /0/);
  assert.ok(!/not listed/i.test(freeView!.display?.headline || ""));
  assert.equal(freeView!.needsReview, false);
  assert.ok(!freeView!.reviewReasons.some((r) => /could not be read|unknown/i.test(r)));

  const proView = pricing?.facts.find((f) => f.display?.title === "Pro");
  assert.ok(proView, "Pro must appear in pricing review");
  assert.match(proView!.display?.headline || "", /49/);
  assert.match(proView!.display?.headline || "", /490/);
  assert.ok(!/199/.test(proView!.display?.headline || ""));
  assert.ok(!(proView!.display?.bullets || []).some((b) => /mls matching for pro/i.test(b)));
  assert.equal(proView!.needsReview, false);

  assert.ok(!(pricing?.facts || []).some((f) => /whachatcrm/i.test(f.display?.title || f.summary)));

  const rgeView = offerings?.facts.find((f) => /Realtor Growth Engine/i.test(f.summary));
  assert.ok(rgeView, "RGE must appear under products");
  assert.match(rgeView!.summary, /199/);
  assert.match(rgeView!.summary, /requires/i);

  assert.ok(!(contact?.facts || []).some((f) => /\/pricing|realtor-growth-engine/i.test(f.summary)));
  assert.ok(
    (contact?.facts || []).some((f) => /Book a Demo/i.test(f.summary) && f.factType === "booking_link"),
    "Book a Demo must remain under Contact and Booking",
  );
}

run("parent Product named WhachatCRM with named Offers keeps Free, Pro, and RGE identities", () => {
  const html = parentWhachatProductHtml();
  const page = prepareHtmlPage(html, CTX.sourceUrl);
  const { candidates } = extractDeterministicFacts(page, html, CTX.sourceId);
  assertCanonicalCommercialIdentities(candidates);
});

run("explicit Free $0/month is a real price and does not warn", () => {
  const money = normalizeExtractedMoney(
    { amount: 0, currency: "USD", billingPeriod: "month" },
    { planName: "Free" },
  );
  assert.equal("money" in money && money.money?.amount, 0);
  assert.equal("money" in money && money.money?.billingPeriod, "month");
  const factRow = fact("pricing_plan", {
    name: "Free",
    price: { amount: 0, currency: "USD", billingPeriod: "month" },
    benefits: [],
  }, { reviewReasons: ["Price could not be read from the page and was left unknown."] });
  const reasons = collectReviewReasons(factRow);
  assert.ok(!reasons.some((r) => /could not be read|unknown/i.test(r)));
});

run("Pro monthly and yearly merge into one plan with both billing options", () => {
  const monthly = candidate({
    factType: "pricing_plan",
    data: { name: "Pro", price: { amount: 49, currency: "USD", billingPeriod: "month" }, benefits: ["AI Brain included"] },
  });
  const yearly = candidate({
    factType: "pricing_plan",
    data: { name: "Pro", price: { amount: 490, currency: "USD", billingPeriod: "year" }, benefits: [] },
  });
  const merged = mergePricingPlanCandidates(monthly, yearly);
  const prices = listedPlanPrices(merged.data as FactDataMap["pricing_plan"]);
  assert.deepEqual(
    prices.map((p) => [p.amount, p.billingPeriod]),
    [
      [49, "month"],
      [490, "year"],
    ],
  );
});

run("RGE stays a separate one-time product when it requires Pro", () => {
  const classified = classifyExtractedCandidate(
    candidate({
      factType: "pricing_plan",
      data: {
        name: "Realtor Growth Engine",
        description: "Requires an active Pro plan.",
        price: { amount: 199, currency: "USD", billingPeriod: "once" },
        benefits: ["MLS matching for Pro workspaces"],
      },
    }),
  );
  assert.equal(classified.keep, true);
  if (!classified.keep) throw new Error("expected keep");
  assert.equal(classified.candidate.factType, "product");
  const data = classified.candidate.data as FactDataMap["product"];
  assert.equal(data.name, "Realtor Growth Engine");
  assert.equal(data.price?.amount, 199);
  assert.equal(data.price?.billingPeriod, "once");
  assert.match(String(data.description || ""), /requires/i);
});

run("incomplete AI WhachatCRM fact cannot contaminate complete deterministic offers", () => {
  const html = parentWhachatProductHtml();
  const page = prepareHtmlPage(html, CTX.sourceUrl);
  const { candidates: deterministic } = extractDeterministicFacts(page, html, CTX.sourceId);
  const { candidates: ai } = parseAiExtractionResponse(contaminatingAiJson(), CTX, new Set(deterministic.map((c) => c.factKey)));
  const combined = combineCandidates(deterministic, ai);
  assertCanonicalCommercialIdentities(combined);
});

run("RGE features that mention Pro are not assigned to Pro", () => {
  const html = parentWhachatProductHtml();
  const page = prepareHtmlPage(html, CTX.sourceUrl);
  const { candidates } = extractDeterministicFacts(page, html, CTX.sourceId);
  const pro = planNamed(candidates, "Pro");
  assert.ok(!pro.benefits.some((b) => /mls matching for pro/i.test(b)));
  const rge = candidates.find((c) => c.factType === "product")!;
  assert.match((rge.data as FactDataMap["product"]).name, /Realtor Growth Engine/i);
});

run("destination URLs keep pricing and RGE links out of Contact and Booking", () => {
  const html = parentWhachatProductHtml();
  const page = prepareHtmlPage(html, CTX.sourceUrl);
  const { candidates } = extractDeterministicFacts(page, html, CTX.sourceId);
  const { candidates: ai } = parseAiExtractionResponse(contaminatingAiJson(), CTX);
  const combined = combineCandidates(candidates, ai);
  assert.ok(!combined.some((c) => c.factType === "booking_link" && /\/pricing|realtor-growth-engine/i.test((c.data as FactDataMap["booking_link"]).url)));
  assert.ok(combined.some((c) => c.factType === "booking_link" && /Book a Demo/i.test(JSON.stringify(c.data))));
});

await (async () => {
  const name = "force re-extract through the worker path preserves canonical identities";
  try {
    const html = parentWhachatProductHtml();
    const page = prepareHtmlPage(html, "https://www.whachatcrm.com/pricing");
    const stale = buildKnowledgeExtractionArtifact({
      contentHash: page.contentHash,
      extractorVersion: KNOWLEDGE_EXTRACTOR_VERSION,
      extractedAt: "2026-08-01T00:00:00.000Z",
      candidates: [
        candidate({ factType: "pricing_plan", data: { name: "WhachatCRM", benefits: [] } }),
        candidate({
          factType: "pricing_plan",
          data: {
            name: "Pro",
            price: { amount: 199, currency: "USD", billingPeriod: "once" },
            benefits: ["MLS matching for Pro workspaces"],
          },
        }),
      ],
    });
    const { result, aiCalls } = await scanProductionHtml("src-parent-force", "https://www.whachatcrm.com/pricing", html, {
      artifact: stale,
      forceReextract: true,
      aiCandidates: parseAiExtractionResponse(contaminatingAiJson(), {
        sourceId: "src-parent-force",
        sourceUrl: "https://www.whachatcrm.com/pricing",
        sourceTitle: "WhachatCRM Pricing",
      }).candidates,
    });
    assert.equal(result.status, "reanalyzed");
    assert.ok(aiCalls.n >= 1);
    assertCanonicalCommercialIdentities(result.candidates);
    const facts = factsFromScan(result);
    assertExpectedPricingReview(facts);
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
})();

await (async () => {
  const name = "review serialization of production pricing plus contaminating AI is exact";
  try {
    const html = productionShapedMarketingHtml("/pricing");
    const { result } = await scanProductionHtml("src-prod-ai", "https://www.whachatcrm.com/pricing", html, {
      forceReextract: true,
      aiCandidates: parseAiExtractionResponse(contaminatingAiJson(), {
        sourceId: "src-prod-ai",
        sourceUrl: "https://www.whachatcrm.com/pricing",
        sourceTitle: "WhachatCRM Pricing | Prospect AI, Unified Inbox & WhatsApp CRM",
      }).candidates,
    });
    assertCanonicalCommercialIdentities(result.candidates);
    const facts = factsFromScan(result);
    const payload = buildKnowledgeReviewPayload({ facts });
    const pricing = payload.sections.find((s) => s.id === "pricing");
    const offerings = payload.sections.find((s) => s.id === "offerings");
    const freeView = pricing?.facts.find((f) => f.display?.title === "Free");
    const proView = pricing?.facts.find((f) => f.display?.title === "Pro");
    const rgeView = offerings?.facts.find((f) => /Realtor Growth Engine/i.test(f.summary));
    assert.equal(freeView?.display?.headline, "USD 0 per month");
    assert.equal(freeView?.needsReview, false);
    assert.equal(proView?.display?.headline, "USD 49 per month · USD 490 per year");
    assert.equal(proView?.needsReview, false);
    assert.ok(rgeView);
    assert.match(rgeView!.summary, /USD 199 one-time/);
    assert.match(rgeView!.summary, /Requires an active Pro plan/i);
    assert.ok(!(pricing?.facts || []).some((f) => /whachatcrm/i.test(f.display?.title || f.summary)));
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
})();

function applyScanOperations(
  facts: KnowledgeFact[],
  result: Awaited<ReturnType<typeof scanSourceIntoDrafts>>,
  sourceId: string,
): KnowledgeFact[] {
  let next = [...facts];
  for (const op of result.operations) {
    if (op.kind === "upsert_draft") {
      next = next.filter((fact) => !(fact.state === "draft" && fact.factKey === op.factKey));
      next.push(
        fact(op.candidate.factType, op.candidate.data, {
          id: `draft-${op.factKey}-${sourceId}`,
          origin: op.candidate.origin,
          confidence: op.candidate.confidence,
          sourceId,
          sourceUrl: op.candidate.sourceUrl ?? null,
          sourceTitle: op.candidate.sourceTitle ?? null,
          excerpt: op.candidate.excerpt,
          proposedAction: op.proposedAction ?? "add",
          provenance: op.provenance ?? [],
          reviewReasons: op.candidate.reviewReasons,
          state: "draft",
        }),
      );
    } else if (op.kind === "discard_draft") {
      next = next.filter((row) => row.id !== op.factId);
    }
  }
  return next;
}

const ABOUT_CONTAMINATING_AI = JSON.stringify({
  facts: [
    { factType: "pricing_plan", data: { name: "WhachatCRM", benefits: [] }, excerpt: "WhachatCRM", confidence: 0.7 },
    { factType: "pricing_plan", data: { name: "Pro", benefits: ["Campaigns", "Broadcasts"] }, excerpt: "Pro", confidence: 0.6 },
    { factType: "location", data: { name: "Local & Service Businesses" }, excerpt: "Local & Service Businesses", confidence: 0.7 },
    { factType: "service_area", data: { area: "Local & Service Businesses" }, excerpt: "Local & Service Businesses", confidence: 0.7 },
    { factType: "service_area", data: { area: "local business prospects" }, excerpt: "discover local business prospects", confidence: 0.7 },
    { factType: "location", data: { name: "Med Spas & Wellness" }, excerpt: "Med Spas & Wellness", confidence: 0.7 },
    { factType: "service_area", data: { area: "Med Spas & Wellness" }, excerpt: "Med Spas & Wellness", confidence: 0.7 },
    { factType: "call_to_action", data: { label: "Book a Demo", url: "https://www.whachatcrm.com/contact" }, excerpt: "Book a Demo", confidence: 0.9 },
  ],
});

async function scanWorkspaceSource(
  id: string,
  url: string,
  html: string,
  existingFacts: KnowledgeFact[],
  aiJson: string,
) {
  return scanSourceIntoDrafts({
    source: { id, url, contentHash: null, forceReextract: true },
    existingFacts,
    deps: {
      fetchPage: async () => ({ page: prepareHtmlPage(html, url), rawHtml: html }),
      extractAi: async ({ knownFactKeys }) => {
        const parsed = parseAiExtractionResponse(
          aiJson,
          { sourceId: id, sourceUrl: url, sourceTitle: prepareHtmlPage(html, url).title },
          knownFactKeys,
        );
        return { candidates: parsed.candidates, rejected: parsed.rejected, attempted: true };
      },
      now: () => new Date("2026-09-12T00:00:00.000Z"),
    },
  });
}

async function assertCrossSourceWorkspace(order: "about-first" | "pricing-first") {
  const aboutHtml = productionShapedHomepageHtml();
  const pricingHtml = productionShapedMarketingHtml("/pricing");
  const about = { id: "src-about", url: "https://www.whachatcrm.com/", html: aboutHtml, ai: ABOUT_CONTAMINATING_AI };
  const pricing = {
    id: "src-pricing",
    url: "https://www.whachatcrm.com/pricing",
    html: pricingHtml,
    ai: JSON.stringify({
      facts: [
        {
          factType: "pricing_plan",
          data: { name: "Pro", benefits: ["Campaigns", "Broadcasts", "Templates"] },
          excerpt: "Pro features",
          confidence: 0.85,
        },
      ],
    }),
  };
  const sequence = order === "about-first" ? [about, pricing] : [pricing, about];
  let facts: KnowledgeFact[] = [];
  for (const source of sequence) {
    const result = await scanWorkspaceSource(source.id, source.url, source.html, facts, source.ai);
    assert.equal(result.extractionArtifact?.extractorVersion, KNOWLEDGE_EXTRACTOR_VERSION);
    facts = applyScanOperations(facts, result, source.id);
  }
  const payload = buildKnowledgeReviewPayload({ facts });
  const pricingSection = payload.sections.find((s) => s.id === "pricing");
  const offerings = payload.sections.find((s) => s.id === "offerings");
  const locations = payload.sections.find((s) => s.id === "locations");
  const contact = payload.sections.find((s) => s.id === "contact");
  const freeView = pricingSection?.facts.find((f) => f.display?.title === "Free");
  const proView = pricingSection?.facts.find((f) => f.display?.title === "Pro");
  assert.equal(freeView?.display?.headline, "USD 0 per month");
  assert.equal(freeView?.needsReview, false);
  assert.equal(proView?.display?.headline, "USD 49 per month · USD 490 per year");
  assert.equal(proView?.needsReview, false);
  assert.ok(!(proView?.display?.bullets || []).some((b) => /mls matching|realtor growth/i.test(b)));
  assert.ok(!(pricingSection?.facts || []).some((f) => /whachatcrm/i.test(f.display?.title || f.summary)));
  const rgeView = offerings?.facts.find((f) => /Realtor Growth Engine/i.test(f.summary));
  assert.ok(rgeView);
  assert.match(rgeView!.summary, /USD 199 one-time/);
  assert.match(rgeView!.summary, /Requires an active Pro plan/i);
  assert.ok(!(locations?.facts || []).some((f) => /Local & Service|local business prospects|Med Spas/i.test(f.summary)));
  assert.ok((contact?.facts || []).some((f) => /Book a Demo/i.test(f.summary) && f.factType === "booking_link"));
  assert.ok(!(contact?.facts || []).some((f) => /\/pricing|realtor-growth-engine/i.test(f.summary)));
}

await (async () => {
  const name = "workspace-wide merge keeps Pro prices and rejects About-page umbrella/location facts";
  try {
    await assertCrossSourceWorkspace("about-first");
    await assertCrossSourceWorkspace("pricing-first");
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
})();

console.log("\nAll website knowledge scan/review tests passed.");

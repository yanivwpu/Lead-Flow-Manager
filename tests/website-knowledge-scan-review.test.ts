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
  extractDeterministicFacts,
  extractPricingPlansFromText,
  findPricesInText,
  prepareHtmlPage,
} from "../server/websiteKnowledge/extractPage";
import { parseAiExtractionResponse } from "../server/websiteKnowledge/extractFactsAi";
import { combineCandidates } from "../server/websiteKnowledge/scanPipeline";
import { mergeFactsForSource, planSourceRemovalOperations } from "../server/websiteKnowledge/mergeFacts";
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
import { buildKnowledgeReviewPayload } from "../shared/knowledgeReview";
import {
  SOURCE_REMOVED_REVIEW_MESSAGE,
  classifyExtractedCandidate,
  isDraftFromRemovedSource,
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

console.log("\nAll website knowledge scan/review tests passed.");

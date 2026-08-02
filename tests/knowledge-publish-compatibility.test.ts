/**
 * Publish behaviour, Workspace Intelligence integration, and V1 compatibility.
 *
 * Covers requirements 18 (publish is atomic), 19 (the legacy summary survives migration),
 * and 20 (Workspace Intelligence changes identity once facts are published).
 *
 * The publish transaction itself needs a database; what is asserted here is the decision
 * logic it runs on plus the source-level guarantees that it is one transaction.
 *
 * Run: npx tsx tests/knowledge-publish-compatibility.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildFactNarrativeSummary,
  factKey,
  type FactOrigin,
  type FactType,
  type KnowledgeFact,
} from "../shared/businessKnowledgeFacts";
import { partitionConflicts } from "../server/websiteKnowledge/publishFacts";
import {
  assembleWorkspaceIntelligence,
  derivePrimaryOfferingsFromFacts,
  workspaceIntelligenceFingerprint,
} from "../shared/workspaceIntelligence";
import { buildKnowledgeReviewPayload } from "../shared/knowledgeReview";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const NOW = new Date("2026-08-02T12:00:00.000Z");
const REPO = process.cwd();

function fact(
  factType: FactType,
  data: unknown,
  overrides: Partial<KnowledgeFact> = {},
): KnowledgeFact {
  const key = overrides.factKey ?? factKey(factType, data);
  return {
    id: overrides.id ?? `fact-${key}`,
    factType,
    factKey: key,
    data,
    state: overrides.state ?? "published",
    proposedAction: overrides.proposedAction ?? null,
    origin: (overrides.origin ?? "website_verified") as FactOrigin,
    confidence: overrides.confidence ?? 0.9,
    isPinned: overrides.isPinned ?? false,
    userEdited: overrides.userEdited ?? false,
    conflictGroup: null,
    conflictResolution: null,
    supersededByFactId: overrides.supersededByFactId ?? null,
    sourceId: overrides.sourceId ?? "src-1",
    sourceUrl: overrides.sourceUrl ?? "https://example.test/pricing",
    sourceTitle: overrides.sourceTitle ?? "Pricing",
    excerpt: overrides.excerpt ?? null,
    provenance: overrides.provenance ?? [],
    firstSeenAt: "2026-07-01T00:00:00.000Z",
    lastVerifiedAt: overrides.lastVerifiedAt ?? "2026-08-01T00:00:00.000Z",
    publishedAt: overrides.publishedAt ?? "2026-07-01T00:00:00.000Z",
    retiredAt: null,
  };
}

const PLAN = fact("pricing_plan", {
  name: "Business Listing",
  description: null,
  price: { amount: 29, currency: "USD", billingPeriod: "month" },
  priceQualifier: "exact",
  benefits: ["Business profile page", "Category listing"],
});

const FAQ = fact("faq", {
  question: "Do you offer refunds?",
  answer: "Refunds are available within 14 days.",
});

// --- 18. Publishing is one transaction ---------------------------------------

run("publishing runs inside a single database transaction", () => {
  const src = readFileSync(join(REPO, "server/websiteKnowledge/publishFacts.ts"), "utf8");
  assert.ok(/await db\.transaction\(async \(tx\) => \{/.test(src));
  // Everything the publish writes must go through tx, never the ambient db handle.
  const body = src.slice(src.indexOf("db.transaction"));
  const writesOutsideTx = body.match(/\bawait db\s*\.\s*(update|insert|delete)/g);
  assert.equal(writesOutsideTx, null, "publish must not write outside its transaction");
});

run("a blocked conflict holds back only its own fact key", () => {
  const a = fact("pricing_plan", { name: "Business Listing", description: null, price: { amount: 29, currency: "USD", billingPeriod: "month" }, priceQualifier: "exact", benefits: [] }, { id: "a" });
  const b = fact("pricing_plan", { name: "Business Listing", description: null, price: { amount: 39, currency: "USD", billingPeriod: "month" }, priceQualifier: "exact", benefits: [] }, { id: "b", sourceId: "src-2" });
  b.factKey = a.factKey;

  const { blockedKeys } = partitionConflicts([a, b, FAQ]);
  assert.equal(blockedKeys.size, 1);
  assert.ok(blockedKeys.has(a.factKey));
  assert.ok(!blockedKeys.has(FAQ.factKey), "an unrelated fact must still be publishable");
});

run("a precedence conflict resolves instead of blocking", () => {
  const userValue = fact(
    "pricing_plan",
    { name: "Business Listing", description: null, price: { amount: 29, currency: "USD", billingPeriod: "month" }, priceQualifier: "exact", benefits: [] },
    { id: "user", origin: "user_edited", userEdited: true },
  );
  const scraped = fact(
    "pricing_plan",
    { name: "Business Listing", description: null, price: { amount: 39, currency: "USD", billingPeriod: "month" }, priceQualifier: "exact", benefits: [] },
    { id: "scraped", origin: "ai_extracted" },
  );
  scraped.factKey = userValue.factKey;

  const { blockedKeys, precedenceConflicts } = partitionConflicts([userValue, scraped]);
  assert.equal(blockedKeys.size, 0);
  assert.equal(precedenceConflicts.length, 1);
  assert.equal(precedenceConflicts[0].winner.id, "user");
});

// --- 19. The legacy summary survives ------------------------------------------

run("publishing never blanks the legacy summary when there are no facts", () => {
  const src = readFileSync(join(REPO, "server/websiteKnowledge/publishFacts.ts"), "utf8");
  assert.ok(
    /\.\.\.\(summary \? \{ websiteKnowledgeSummary: summary \} : \{\}\)/.test(src),
    "an empty fact set must leave websiteKnowledgeSummary alone",
  );
});

run("the prose summary is rebuilt from published facts with no model call", () => {
  const summary = buildFactNarrativeSummary([PLAN, FAQ]);
  assert.match(summary, /Business Listing: USD 29 per month/);
  assert.match(summary, /Do you offer refunds\?/);
  assert.ok(summary.includes("Pricing and Plans"));
});

run("a workspace with only the legacy summary still reports full V1 intelligence", () => {
  const intel = assembleWorkspaceIntelligence({
    knowledge: {
      websiteKnowledgeSummary: "We are a local business directory serving the Northgate area.",
      servicesProducts: "Directory listings",
    },
    publishedFacts: [],
  });
  assert.equal(intel.configured, true);
  assert.equal(intel.capabilities.hasWebsiteKnowledge, true);
  assert.equal(intel.capabilities.hasStructuredFacts, false);
  assert.match(intel.knowledgeBrief!, /local business directory/);
  assert.equal(intel.knowledgeFreshness.publishedFacts, 0);
});

run("a migrated legacy_summary fact ranks below anything extracted later", () => {
  const legacy = fact(
    "business_summary",
    { summary: "Old prose summary.", positioning: null },
    { id: "legacy", origin: "legacy_summary" },
  );
  const extracted = fact(
    "business_summary",
    { summary: "A local business directory.", positioning: null },
    { id: "fresh", origin: "ai_extracted" },
  );
  extracted.factKey = legacy.factKey;
  const { precedenceConflicts } = partitionConflicts([legacy, extracted]);
  assert.equal(precedenceConflicts[0].winner.id, "fresh");
});

// --- 20. Workspace Intelligence reacts to publishing --------------------------

run("published facts change the Workspace Intelligence fingerprint", () => {
  const before = assembleWorkspaceIntelligence({
    knowledge: { websiteKnowledgeSummary: "Directory.", updatedAt: new Date("2026-07-01") },
    publishedFacts: [],
    now: NOW,
  });
  const after = assembleWorkspaceIntelligence({
    knowledge: { websiteKnowledgeSummary: "Directory.", updatedAt: new Date("2026-07-01") },
    publishedFacts: [PLAN, FAQ],
    now: NOW,
  });
  assert.notEqual(
    workspaceIntelligenceFingerprint(before),
    workspaceIntelligenceFingerprint(after),
    "the cache key must move when facts are published, even with unchanged timestamps",
  );
});

run("publishing invalidates both intelligence caches", () => {
  const src = readFileSync(join(REPO, "server/websiteKnowledge/publishFacts.ts"), "utf8");
  assert.ok(src.includes("invalidateWorkspaceIntelligenceCache(userId)"));
  assert.ok(src.includes("invalidatePublishedFactsCache(userId)"));
});

run("offerings come from published facts rather than the prose blob", () => {
  const offerings = derivePrimaryOfferingsFromFacts([PLAN]);
  assert.deepEqual(offerings, ["Business Listing"]);

  const intel = assembleWorkspaceIntelligence({
    knowledge: { servicesProducts: "Listings; Advertising; Sponsorship" },
    publishedFacts: [PLAN],
    now: NOW,
  });
  assert.deepEqual(intel.primaryOfferings, ["Business Listing"]);
  assert.equal(intel.capabilities.hasStructuredFacts, true);
  assert.equal(intel.knowledgeFreshness.publishedFacts, 1);
});

run("the client snapshot carries freshness counts, not the facts themselves", () => {
  const intel = assembleWorkspaceIntelligence({
    knowledge: { websiteKnowledgeSummary: "Directory." },
    publishedFacts: [PLAN, FAQ],
    now: NOW,
  });
  assert.equal(intel.knowledgeFreshness.publishedFacts, 2);
  assert.ok(intel.knowledgeFreshness.newestVerifiedAt);
  assert.ok(
    !Object.prototype.hasOwnProperty.call(intel.knowledgeFreshness, "facts"),
    "the snapshot must not embed fact payloads",
  );
});

// --- Review payload -----------------------------------------------------------

run("the review payload groups facts and counts what changed", () => {
  const draft = fact(
    "pricing_plan",
    { name: "Business Listing", description: null, price: { amount: 39, currency: "USD", billingPeriod: "month" }, priceQualifier: "exact", benefits: [] },
    { id: "draft-1", state: "draft", proposedAction: "update" },
  );
  draft.factKey = PLAN.factKey;

  const payload = buildKnowledgeReviewPayload({ facts: [PLAN, FAQ, draft], now: NOW });
  const pricing = payload.sections.find((s) => s.id === "pricing")!;
  assert.ok(pricing);
  assert.equal(pricing.counts.changed, 1);
  assert.equal(payload.totals.changed, 1);
  assert.equal(payload.hasPendingChanges, true);

  const changedView = pricing.facts.find((f) => f.id === "draft-1")!;
  assert.equal(changedView.changeType, "changed");
  assert.match(changedView.previousSummary!, /USD 29 per month/);
  assert.match(changedView.summary, /USD 39 per month/);
  // Drafts sort above published values so what changed is seen first.
  assert.equal(pricing.facts[0].state, "draft");
});

run("a pricing plan reaches the review split into its parts", () => {
  const plan = fact("pricing_plan", {
    name: "Featured Business",
    description: null,
    price: { amount: 59, currency: "USD", billingPeriod: "month" },
    priceQualifier: "exact",
    benefits: ["Enhanced visibility in local searches", "Priority placement in your category"],
  });

  const payload = buildKnowledgeReviewPayload({ facts: [plan], now: NOW });
  const view = payload.sections.find((s) => s.id === "pricing")!.facts[0];

  assert.ok(view.display, "a plan must carry a laid-out form");
  assert.equal(view.display!.title, "Featured Business");
  assert.equal(view.display!.headline, "USD 59 per month");
  assert.deepEqual(view.display!.bullets, [
    "Enhanced visibility in local searches",
    "Priority placement in your category",
  ]);
  // Split for reading only: every part is the stored value, and the one-line form still
  // carries the whole fact for everything else that renders it.
  assert.match(view.summary, /^Featured Business: USD 59 per month — includes:/);
  for (const benefit of view.display!.bullets) {
    assert.ok(view.summary.includes(benefit), "the one-line form lost a benefit");
  }
});

run("fact types that read fine as one line are left alone", () => {
  const payload = buildKnowledgeReviewPayload({ facts: [FAQ], now: NOW });
  const view = payload.sections.flatMap((s) => s.facts).find((f) => f.factType === "faq")!;
  assert.equal(view.display, null);
});

run("with nothing proposed the review payload reports no pending changes", () => {
  const payload = buildKnowledgeReviewPayload({ facts: [PLAN, FAQ], now: NOW });
  assert.equal(payload.hasPendingChanges, false);
  assert.equal(payload.totals.published, 2);
  assert.equal(payload.conflicts.length, 0);
});

console.log("\nAll publish and compatibility tests passed.");

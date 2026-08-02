/**
 * Incremental merge rules — the guarantees that make a rescan safe.
 *
 * Covers requirements 10-16: adding a source preserves old facts, rescanning one source
 * leaves unrelated facts alone, a failed scan preserves what is published, user-edited
 * facts are protected, conflicting prices are flagged, duplicates merge with provenance,
 * and removing a source affects only the facts that depended on it.
 *
 * Run: npx tsx tests/knowledge-merge-rules.test.ts
 */
import assert from "node:assert/strict";
import {
  detectFactConflicts,
  factKey,
  factPrecedence,
  type FactCandidate,
  type FactOrigin,
  type FactType,
  type KnowledgeFact,
} from "../shared/businessKnowledgeFacts";
import {
  analyzeSourceRemoval,
  mergeFactsForSource,
  mergeProvenance,
  type FactMergeOperation,
} from "../server/websiteKnowledge/mergeFacts";

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
const PRICING_SRC = "src-pricing";
const ABOUT_SRC = "src-about";

function plan(name: string, amount: number, benefits: string[] = []) {
  return {
    name,
    description: null,
    price: { amount, currency: "USD", billingPeriod: "month" as const },
    priceQualifier: "exact" as const,
    benefits,
  };
}

function published(
  overrides: Partial<KnowledgeFact> & { factType: FactType; data: unknown },
): KnowledgeFact {
  const key = overrides.factKey ?? factKey(overrides.factType, overrides.data);
  return {
    id: overrides.id ?? `fact-${key}`,
    factType: overrides.factType,
    factKey: key,
    data: overrides.data,
    state: overrides.state ?? "published",
    proposedAction: overrides.proposedAction ?? null,
    origin: overrides.origin ?? "website_verified",
    confidence: overrides.confidence ?? 0.9,
    isPinned: overrides.isPinned ?? false,
    userEdited: overrides.userEdited ?? false,
    conflictGroup: overrides.conflictGroup ?? null,
    conflictResolution: overrides.conflictResolution ?? null,
    supersededByFactId: overrides.supersededByFactId ?? null,
    sourceId: overrides.sourceId ?? PRICING_SRC,
    sourceUrl: overrides.sourceUrl ?? "https://example.test/pricing",
    sourceTitle: overrides.sourceTitle ?? "Pricing",
    excerpt: overrides.excerpt ?? null,
    provenance:
      overrides.provenance ?? [
        {
          sourceId: overrides.sourceId ?? PRICING_SRC,
          url: overrides.sourceUrl ?? "https://example.test/pricing",
          title: "Pricing",
          verifiedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    firstSeenAt: overrides.firstSeenAt ?? "2026-07-01T00:00:00.000Z",
    lastVerifiedAt: overrides.lastVerifiedAt ?? "2026-07-01T00:00:00.000Z",
    publishedAt: overrides.publishedAt ?? "2026-07-01T00:00:00.000Z",
    retiredAt: overrides.retiredAt ?? null,
  };
}

function candidate(
  factType: FactType,
  data: unknown,
  overrides?: Partial<FactCandidate>,
): FactCandidate {
  return {
    factType,
    factKey: factKey(factType, data),
    data,
    origin: (overrides?.origin ?? "website_verified") as FactOrigin,
    confidence: overrides?.confidence ?? 0.9,
    sourceId: overrides?.sourceId ?? PRICING_SRC,
    sourceUrl: overrides?.sourceUrl ?? "https://example.test/pricing",
    sourceTitle: overrides?.sourceTitle ?? "Pricing",
    excerpt: overrides?.excerpt ?? null,
  };
}

function opsOfKind<K extends FactMergeOperation["kind"]>(
  ops: FactMergeOperation[],
  kind: K,
): Array<Extract<FactMergeOperation, { kind: K }>> {
  return ops.filter((o) => o.kind === kind) as Array<Extract<FactMergeOperation, { kind: K }>>;
}

// --- 10. Adding a source later preserves existing facts ----------------------

run("scanning a new source leaves facts from other sources untouched", () => {
  const existing = [
    published({ factType: "pricing_plan", data: plan("Business Listing", 29) }),
    published({
      factType: "faq",
      data: { question: "Do you offer refunds?", answer: "Within 14 days." },
      id: "fact-faq",
      sourceId: PRICING_SRC,
    }),
  ];

  const result = mergeFactsForSource({
    sourceId: ABOUT_SRC,
    existingFacts: existing,
    candidates: [
      candidate(
        "business_summary",
        { summary: "A local business directory.", positioning: null },
        { sourceId: ABOUT_SRC, sourceUrl: "https://example.test/about" },
      ),
    ],
    now: NOW,
  });

  assert.equal(result.stats.added, 1);
  assert.equal(result.stats.retiring, 0);
  const touched = result.operations.filter((o) => o.kind !== "upsert_draft");
  assert.deepEqual(touched, [], "no operation may target another source's facts");
});

// --- 11. Rescanning one source only proposes changes for its own facts -------

run("rescanning one source only proposes changes for the facts it supports", () => {
  const existing = [
    published({ factType: "pricing_plan", data: plan("Business Listing", 29) }),
    published({
      factType: "business_hours",
      data: { entries: [{ days: "Monday–Friday", opens: "09:00", closes: "17:00" }], timezone: null, notes: null },
      id: "fact-hours",
      sourceId: ABOUT_SRC,
      sourceUrl: "https://example.test/about",
      provenance: [
        { sourceId: ABOUT_SRC, url: "https://example.test/about", title: "About", verifiedAt: "2026-07-01T00:00:00.000Z" },
      ],
    }),
  ];

  const result = mergeFactsForSource({
    sourceId: PRICING_SRC,
    existingFacts: existing,
    candidates: [candidate("pricing_plan", plan("Business Listing", 39))],
    now: NOW,
  });

  const drafts = opsOfKind(result.operations, "upsert_draft");
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].proposedAction, "update");
  const affectedIds = result.operations
    .map((o) => ("factId" in o ? o.factId : o.targetFactId))
    .filter(Boolean);
  assert.ok(!affectedIds.includes("fact-hours"), "the other source's hours must not be touched");
});

// --- 12. A failed scan preserves published facts -----------------------------

run("a scan that produced nothing does not retire facts from other sources", () => {
  const existing = [published({ factType: "pricing_plan", data: plan("Business Listing", 29) })];
  const result = mergeFactsForSource({
    sourceId: ABOUT_SRC,
    existingFacts: existing,
    candidates: [],
    now: NOW,
  });
  assert.deepEqual(result.operations, []);
  assert.equal(result.stats.retiring, 0);
});

run("an unchanged content hash re-verifies without proposing anything", () => {
  const existing = [published({ factType: "pricing_plan", data: plan("Business Listing", 29) })];
  const result = mergeFactsForSource({
    sourceId: PRICING_SRC,
    existingFacts: existing,
    candidates: [],
    contentUnchanged: true,
    now: NOW,
  });
  const touched = opsOfKind(result.operations, "touch_verified");
  assert.equal(touched.length, 1);
  assert.equal(touched[0].verifiedAt, NOW.toISOString());
  assert.equal(opsOfKind(result.operations, "propose_retire").length, 0);
  assert.equal(result.stats.unchanged, 1);
});

// --- 13. User-edited facts are protected -------------------------------------

run("a scan cannot overwrite a user-edited fact, only suggest a change", () => {
  const existing = [
    published({
      factType: "pricing_plan",
      data: plan("Business Listing", 29),
      origin: "user_edited",
      userEdited: true,
    }),
  ];
  const result = mergeFactsForSource({
    sourceId: PRICING_SRC,
    existingFacts: existing,
    candidates: [candidate("pricing_plan", plan("Business Listing", 39), { origin: "ai_extracted" })],
    now: NOW,
  });
  const drafts = opsOfKind(result.operations, "upsert_draft");
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].proposedAction, "suggest");
  assert.equal(result.stats.suggestions, 1);
  assert.equal(result.stats.changed, 0);
});

run("a user-edited fact is never proposed for retirement when it leaves the page", () => {
  const existing = [
    published({
      factType: "pricing_plan",
      data: plan("Legacy Plan", 19),
      userEdited: true,
    }),
  ];
  const result = mergeFactsForSource({
    sourceId: PRICING_SRC,
    existingFacts: existing,
    candidates: [candidate("pricing_plan", plan("Business Listing", 29))],
    now: NOW,
  });
  assert.equal(opsOfKind(result.operations, "propose_retire").length, 0);
});

run("a pinned fact outranks a website-verified proposal", () => {
  const pinned = published({
    factType: "pricing_plan",
    data: plan("Business Listing", 29),
    isPinned: true,
  });
  assert.ok(factPrecedence(pinned) > factPrecedence(published({ factType: "pricing_plan", data: plan("X", 1) })));

  const result = mergeFactsForSource({
    sourceId: PRICING_SRC,
    existingFacts: [pinned],
    candidates: [candidate("pricing_plan", plan("Business Listing", 39))],
    now: NOW,
  });
  assert.equal(opsOfKind(result.operations, "upsert_draft")[0].proposedAction, "suggest");
});

// --- 14. Conflicting values are flagged, never silently resolved -------------

run("two equal-priority sources disagreeing on a price block each other", () => {
  const a = published({
    factType: "pricing_plan",
    data: plan("Business Listing", 29),
    id: "fact-a",
    sourceId: PRICING_SRC,
  });
  const b = published({
    factType: "pricing_plan",
    data: plan("Business Listing", 39),
    id: "fact-b",
    sourceId: ABOUT_SRC,
    sourceUrl: "https://example.test/about",
  });
  // Same fact key, different value: that is what makes it a conflict rather than two facts.
  b.factKey = a.factKey;

  const conflicts = detectFactConflicts([a, b]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].resolution, "blocked");
  assert.equal(conflicts[0].losers.length, 1);
});

run("a higher-priority source wins a conflict by precedence, not by recency", () => {
  const userValue = published({
    factType: "pricing_plan",
    data: plan("Business Listing", 29),
    id: "fact-user",
    origin: "user_edited",
    userEdited: true,
    lastVerifiedAt: "2026-01-01T00:00:00.000Z",
  });
  const scraped = published({
    factType: "pricing_plan",
    data: plan("Business Listing", 39),
    id: "fact-scraped",
    origin: "ai_extracted",
    lastVerifiedAt: NOW.toISOString(),
  });
  scraped.factKey = userValue.factKey;

  const conflicts = detectFactConflicts([userValue, scraped]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].resolution, "precedence");
  assert.equal(conflicts[0].winner.id, "fact-user");
});

// --- 15. Duplicate facts merge with provenance -------------------------------

run("the same value from a second source merges into one fact with both sources", () => {
  const existing = [published({ factType: "pricing_plan", data: plan("Business Listing", 29) })];
  const result = mergeFactsForSource({
    sourceId: ABOUT_SRC,
    existingFacts: existing,
    candidates: [
      candidate("pricing_plan", plan("Business Listing", 29), {
        sourceId: ABOUT_SRC,
        sourceUrl: "https://example.test/about",
      }),
    ],
    now: NOW,
  });

  const touched = opsOfKind(result.operations, "touch_verified");
  assert.equal(touched.length, 1, "a duplicate must not create a second fact");
  assert.equal(touched[0].provenance.length, 2);
  assert.deepEqual(
    touched[0].provenance.map((p) => p.sourceId).sort(),
    [ABOUT_SRC, PRICING_SRC].sort(),
  );
  assert.equal(result.stats.added, 0);
});

run("provenance merging keeps one entry per source and the newest verification", () => {
  const merged = mergeProvenance(
    [{ sourceId: "a", url: "https://a.test", title: "A", verifiedAt: "2026-01-01T00:00:00.000Z" }],
    { sourceId: "a", url: "https://a.test", title: "A", verifiedAt: "2026-08-01T00:00:00.000Z" },
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].verifiedAt, "2026-08-01T00:00:00.000Z");
});

// --- 16. Removing a source affects only dependent facts ----------------------

run("removing a source orphans only the facts it alone supported", () => {
  const soleSupport = published({
    factType: "pricing_plan",
    data: plan("Business Listing", 29),
    id: "fact-sole",
  });
  const twoSources = published({
    factType: "contact_method",
    data: { kind: "email", value: "sales@example.test", label: null },
    id: "fact-shared",
    provenance: [
      { sourceId: PRICING_SRC, url: "https://example.test/pricing", title: "Pricing", verifiedAt: "2026-07-01T00:00:00.000Z" },
      { sourceId: ABOUT_SRC, url: "https://example.test/about", title: "About", verifiedAt: "2026-07-01T00:00:00.000Z" },
    ],
  });
  const unrelated = published({
    factType: "business_hours",
    data: { entries: [{ days: "Monday", opens: "09:00", closes: "17:00" }], timezone: null, notes: null },
    id: "fact-unrelated",
    sourceId: ABOUT_SRC,
    provenance: [
      { sourceId: ABOUT_SRC, url: "https://example.test/about", title: "About", verifiedAt: "2026-07-01T00:00:00.000Z" },
    ],
  });

  const impact = analyzeSourceRemoval([soleSupport, twoSources, unrelated], PRICING_SRC);
  assert.deepEqual(impact.orphanedFacts.map((f) => f.id), ["fact-sole"]);
  assert.deepEqual(impact.retainedFacts.map((f) => f.id), ["fact-shared"]);
});

run("a fact backed by two sources survives one of them dropping it", () => {
  const shared = published({
    factType: "contact_method",
    data: { kind: "email", value: "sales@example.test", label: null },
    id: "fact-shared",
    provenance: [
      { sourceId: PRICING_SRC, url: "https://example.test/pricing", title: "Pricing", verifiedAt: "2026-07-01T00:00:00.000Z" },
      { sourceId: ABOUT_SRC, url: "https://example.test/about", title: "About", verifiedAt: "2026-07-01T00:00:00.000Z" },
    ],
  });

  const result = mergeFactsForSource({
    sourceId: PRICING_SRC,
    existingFacts: [shared],
    candidates: [],
    now: NOW,
  });

  assert.equal(opsOfKind(result.operations, "propose_retire").length, 0);
  const touched = opsOfKind(result.operations, "touch_verified");
  assert.equal(touched.length, 1);
  assert.deepEqual(touched[0].provenance.map((p) => p.sourceId), [ABOUT_SRC]);
});

run("a value that disappeared from its only source is proposed for retirement", () => {
  const existing = [published({ factType: "pricing_plan", data: plan("Retired Plan", 99) })];
  const result = mergeFactsForSource({
    sourceId: PRICING_SRC,
    existingFacts: existing,
    candidates: [candidate("pricing_plan", plan("Business Listing", 29))],
    now: NOW,
  });
  const retiring = opsOfKind(result.operations, "propose_retire");
  assert.equal(retiring.length, 1);
  assert.equal(retiring[0].factId, existing[0].id);
  assert.equal(result.stats.retiring, 1);
  // Proposed, not applied: the fact is still published until someone confirms.
  assert.equal(existing[0].state, "published");
});

console.log("\nAll knowledge merge rule tests passed.");

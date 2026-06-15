/**
 * BuyerMatchingTrace — mismatch detection + pipeline snapshots.
 * Run: npx tsx tests/buyer-matching-trace.test.ts
 */
import assert from "node:assert/strict";
import type { BuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { normalizeBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { buildBuyerPreferenceSearchChips } from "../shared/buyerPreferenceDisplay";
import {
  AI_RESPONSE_MISMATCH_FIELD,
  BUYER_MATCHING_TRACE_TAG,
  buildBuyerMatchingTraceId,
  detectAiResponseMismatches,
  detectChipProfileMismatches,
  detectMatchingListingsMismatches,
  detectProfileSnapshotMismatches,
  snapshotProfileTraceFields,
  traceBuyerMatchingCopilotDecision,
  traceBuyerMatchingPipeline,
} from "../shared/buyerMatchingTrace";
import {
  resetBuyerMatchingTraceRegistryForTests,
  resolveBuyerMatchingTraceId,
} from "../server/buyerMatchingTraceRegistry";

const NOW = new Date().toISOString();

function field<T>(value: T) {
  return { value, source: "explicit" as const, confidence: 1, updatedAt: NOW };
}

function profile(overrides: Partial<BuyerPreferenceProfile>): BuyerPreferenceProfile {
  return normalizeBuyerPreferenceProfile({
    schemaVersion: 1,
    profileStatus: "partial",
    ...overrides,
  });
}

function testTraceId() {
  const withMessage = buildBuyerMatchingTraceId("contact-1", "msg-9");
  assert.equal(withMessage, "contact-1:msg-9");

  const refresh = buildBuyerMatchingTraceId("contact-1", null, 1_700_000_000_000);
  assert.equal(refresh, "contact-1:refresh:1700000000000");
  console.log("  traceId generation: OK");
}

function testRegistryLifecycle() {
  resetBuyerMatchingTraceRegistryForTests();
  const bound = resolveBuyerMatchingTraceId("c-reg", "msg-a", "conv-1");
  assert.equal(bound, "c-reg:msg-a");
  const reused = resolveBuyerMatchingTraceId("c-reg");
  assert.equal(reused, "c-reg:msg-a");

  resetBuyerMatchingTraceRegistryForTests();
  const refresh = resolveBuyerMatchingTraceId("c-reg");
  assert.match(refresh, /^c-reg:refresh:\d+$/);
  console.log("  registry lifecycle: OK");
}

function testMergeVsPersistMismatch() {
  const merged = snapshotProfileTraceFields(
    profile({
      priceMax: field(1_000_000),
      propertyTypes: field(["house"]),
      transactionIntent: field("buy"),
    }),
  );
  const saved = snapshotProfileTraceFields(
    profile({
      priceMax: field(500_000),
      propertyTypes: field(["house"]),
      transactionIntent: field("buy"),
    }),
  );
  assert.notEqual(merged.priceMax, saved.priceMax, "fixture has price drift");
  const mismatches = detectProfileSnapshotMismatches(merged, saved, "merge", "persist");
  assert.ok(mismatches.some((m) => m.field === "priceMax"), "detects priceMax persistence drift");
  console.log("  merge vs persist mismatch: OK");
}

function testChipProfileMismatch() {
  const p = profile({
    priceMax: field(1_000_000),
    pool: field(true),
    targetAreas: field(["Pompano Beach"]),
    propertyTypes: field(["house"]),
    transactionIntent: field("buy"),
  });
  const chips = buildBuyerPreferenceSearchChips(p);
  const aligned = detectChipProfileMismatches(p, chips);
  assert.equal(aligned.length, 0, "aligned chips produce no mismatches");

  const mismatches = detectChipProfileMismatches(p, []);
  assert.ok(mismatches.length >= 2, "empty chips warn on missing budget/areas");
  console.log("  chip vs profile mismatch: OK");
}

function testMatchingListingsMismatch() {
  const p = profile({
    priceMax: field(500_000),
    transactionIntent: field("buy"),
    propertyTypes: field(["house"]),
  });
  const mismatches = detectMatchingListingsMismatches(p, [
    {
      listingId: "lst-1",
      city: "Miami",
      priceCents: 60_000_000,
      beds: 3,
      baths: 2,
      propertyType: "single_family",
    },
  ]);
  assert.ok(
    mismatches.some((m) => m.field === "priceMax"),
    "flags listing above budget max",
  );
  console.log("  matching vs listings mismatch: OK");
}

function testAiResponseMismatch() {
  const p = profile({
    transactionIntent: field("buy"),
    priceMax: field(500_000),
  });
  const saleMismatch = detectAiResponseMismatches({
    aiText: "Here are apartments for sale in your area",
    profile: p,
    listings: [
      {
        listingId: "rent-1",
        city: "Miami",
        priceCents: 2_500_00,
        beds: 2,
        baths: 2,
        propertyType: "apartment",
      },
    ],
  });
  assert.ok(
    saleMismatch.some((m) => m.field === AI_RESPONSE_MISMATCH_FIELD),
    "AI sale language vs rental-shaped prices",
  );

  const budgetMismatch = detectAiResponseMismatches({
    aiText: "I found options under $500k for you",
    profile: p,
    listings: [
      {
        listingId: "sale-1",
        city: "Miami",
        priceCents: 65_000_000,
        beds: 3,
        baths: 2,
        propertyType: "house",
      },
    ],
  });
  assert.ok(
    budgetMismatch.some((m) => m.field === AI_RESPONSE_MISMATCH_FIELD),
    "AI budget language vs over-budget listings",
  );
  console.log("  AI_RESPONSE_MISMATCH: OK");
}

function testPipelineTraceNoMismatch() {
  const prior = profile({
    priceMax: field(800_000),
    propertyTypes: field(["house"]),
    transactionIntent: field("buy"),
  });
  const saved = profile({
    priceMax: field(1_000_000),
    propertyTypes: field(["house"]),
    pool: field(true),
    targetAreas: field(["Pompano Beach"]),
    transactionIntent: field("buy"),
  });
  const mismatches = traceBuyerMatchingPipeline({
    traceId: buildBuyerMatchingTraceId("c1", "m1"),
    contactId: "c1",
    source: "test",
    message: "SFH with pool in Pompano up to 1M",
    previousProfile: prior,
    parsedPatch: {
      priceMax: field(1_000_000),
      pool: field(true),
    },
    mergedProfile: saved,
    savedProfile: saved,
  });
  assert.equal(mismatches.length, 0, "consistent pipeline has no mismatches");
  console.log("  zero-mismatch happy path: OK");
}

function testPipelineTracePersistMismatch() {
  const merged = profile({
    priceMax: field(1_000_000),
    pool: field(true),
    propertyTypes: field(["house"]),
    targetAreas: field(["Pompano Beach"]),
    transactionIntent: field("buy"),
  });
  const saved = profile({
    priceMax: field(500_000),
    pool: field(true),
    propertyTypes: field(["house"]),
    targetAreas: field(["Pompano Beach"]),
    transactionIntent: field("buy"),
  });
  const mismatches = traceBuyerMatchingPipeline({
    traceId: buildBuyerMatchingTraceId("c2"),
    contactId: "c2",
    source: "test",
    mergedProfile: merged,
    savedProfile: saved,
  });
  assert.ok(
    mismatches.some((m) => m.fromLayer === "merge" && m.toLayer === "persist" && m.field === "priceMax"),
    "flags merge→persist price drift",
  );
  console.log("  pipeline trace persist mismatch: OK");
}

function testCopilotTraceEmitsAiMismatch() {
  const p = profile({
    transactionIntent: field("buy"),
    propertyTypes: field(["townhouse"]),
  });
  const mismatches = traceBuyerMatchingCopilotDecision({
    traceId: buildBuyerMatchingTraceId("c3", "m3"),
    contactId: "c3",
    userId: "u1",
    source: "test:copilot",
    profile: p,
    listings: [
      {
        listingId: "th-1",
        city: "Tampa",
        priceCents: 3_200_00,
        beds: 3,
        baths: 2,
        propertyType: "apartment",
      },
    ],
    matchCount: 1,
    copilotDecisionReason: "show_matches",
    primaryRecommendation: "Share matching listings",
    qualificationState: "qualified",
    aiSuggestion: "Here are single-family homes for sale that match your criteria.",
  });
  assert.ok(
    mismatches.some((m) => m.field === AI_RESPONSE_MISMATCH_FIELD),
    "copilot trace includes AI_RESPONSE_MISMATCH",
  );
  console.log("  copilot AI mismatch: OK");
}

function testTagConstant() {
  assert.equal(BUYER_MATCHING_TRACE_TAG, "[BuyerMatchingTrace]");
  console.log("  tag constant: OK");
}

testTagConstant();
testTraceId();
testRegistryLifecycle();
testMergeVsPersistMismatch();
testChipProfileMismatch();
testMatchingListingsMismatch();
testAiResponseMismatch();
testPipelineTraceNoMismatch();
testPipelineTracePersistMismatch();
testCopilotTraceEmitsAiMismatch();
console.log("buyer-matching-trace.test.ts: OK");

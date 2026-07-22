/**
 * Prospect Review UX helpers.
 * Run: npx tsx tests/prospect-review-ux.test.ts
 */
import assert from "node:assert/strict";
import {
  buildProspectRowAiSummary,
  isProspectQualificationComplete,
  matchesProspectReviewFilter,
  mergeProspectRowsStableOrder,
  prospectAiProgressMessage,
  prospectMatchSummary,
  prospectReviewCompletionFlash,
  prospectReviewEmptyMessage,
  resolveProspectReviewLifecycle,
  resolveProspectTimelineStates,
} from "../shared/prospectReviewUx";

assert.equal(
  resolveProspectReviewLifecycle({ analysisStatus: "pending" }),
  "imported",
);
assert.equal(
  resolveProspectReviewLifecycle({ analysisStatus: "processing" }),
  "analyzing",
);
assert.equal(
  resolveProspectReviewLifecycle({
    analysisStatus: "completed",
    reviewStatus: "pending",
  }),
  "ready_for_approval",
);

// needs_review is a finished qualification outcome — not "still imported"
assert.equal(
  resolveProspectReviewLifecycle({
    analysisStatus: "needs_review",
    reviewStatus: "needs_review",
    needsReview: true,
  }),
  "ready_for_approval",
);
assert.equal(
  resolveProspectReviewLifecycle({
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
  }),
  "ready_for_approval",
);

assert.equal(isProspectQualificationComplete("completed"), true);
assert.equal(isProspectQualificationComplete("needs_review"), true);
assert.equal(isProspectQualificationComplete("pending"), false);
assert.equal(isProspectQualificationComplete("failed"), false);

assert.deepEqual(resolveProspectTimelineStates("analyzing"), [
  "done",
  "current",
  "todo",
  "todo",
]);
assert.deepEqual(resolveProspectTimelineStates("website_intelligence"), [
  "done",
  "done",
  "current",
  "todo",
]);
assert.deepEqual(resolveProspectTimelineStates("campaign_ready"), [
  "done",
  "done",
  "done",
  "current",
]);

assert.equal(prospectMatchSummary(91).label, "Excellent Match");
assert.equal(prospectMatchSummary(91).stars, 5);

assert.equal(
  prospectReviewEmptyMessage("review", true),
  "No businesses waiting for review.",
);

assert.equal(
  prospectReviewCompletionFlash(
    { analysisStatus: "processing", reviewStatus: "pending" },
    { analysisStatus: "completed", reviewStatus: "pending" },
  ),
  "✓ AI Review complete",
);

assert.equal(
  prospectReviewCompletionFlash(
    { analysisStatus: "pending", reviewStatus: "pending" },
    { analysisStatus: "needs_review", reviewStatus: "needs_review", needsReview: true },
  ),
  "✓ AI Review complete",
);

assert.ok(prospectAiProgressMessage("analysis", "x", 0).length > 5);
assert.ok(prospectAiProgressMessage("enrichment", "x", 0).length > 5);
assert.equal(matchesProspectReviewFilter("ready_for_approval", "review"), true);

const merged = mergeProspectRowsStableOrder(
  ["b", "a"],
  [
    { contactId: "a", name: "A" },
    { contactId: "c", name: "C" },
    { contactId: "b", name: "B" },
  ],
);
assert.deepEqual(merged.order, ["b", "a", "c"]);
assert.deepEqual(
  merged.items.map((i) => i.contactId),
  ["b", "a", "c"],
);

assert.equal(buildProspectRowAiSummary({ analysisStatus: "pending" }).showSummary, false);

console.log("prospect-review-ux.test.ts: all assertions passed");

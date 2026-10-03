import test from "node:test";
import assert from "node:assert/strict";
import { safeSeoRefreshFailure } from "../shared/seoRefreshFeedback";

test("refresh explains incomplete history without leaking raw errors", () => {
  const result = safeSeoRefreshFailure({ category: "REFRESH_DATA_UNAVAILABLE", message: "postgresql://secret" });
  assert.equal(result.category, "REFRESH_DATA_UNAVAILABLE");
  assert.match(result.message, /full comparison period/);
  assert.doesNotMatch(JSON.stringify(result), /postgresql|secret/);
});
test("quality failure retains only safe reviewer reasons", () => {
  const result = safeSeoRefreshFailure({ category: "NO_MATERIAL_IMPROVEMENT", audit: { reviewerScores: [
    { rejectionReasons: ["insufficient_evidence", "unsupported_fact:shopify", "https://secret", "token=private"] },
  ] } });
  assert.deepEqual(result.reasons, ["insufficient_evidence", "unsupported_fact:shopify"]);
  assert.match(result.message, /preserved/);
});
test("unknown provider errors receive generic feedback", () => {
  assert.deepEqual(safeSeoRefreshFailure({ category: "token=secret", message: "private" }), {
    category: "REFRESH_FAILED", message: "Draft refresh failed. The previous proposal was preserved.", reasons: [],
  });
});

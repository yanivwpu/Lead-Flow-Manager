/** Run: npx tsx tests/seo-daily-shipping.test.ts */
import assert from "node:assert/strict";
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/seo_test";
async function main() {
const { SEO_DAILY_SHIPPING_SCHEMA, selectDailySeoReviewCandidate } = await import("../server/seo/dailyShipping");

const content = "### How to evaluate a WhatsApp CRM\n\n" +
  "Review how shared inbox assignments, customer records, and follow-up workflows operate before selecting a CRM. " +
  "Compare your current response process with the workflows explained on WhachatCRM's own product pages.";
const proposal = {
  actionType: "content_expansion", proposedContent: content,
  insertionLocation: "Before the final call to action", targetQuery: "zoko alternative",
  factValidationStatus: "passed", generatedAt: "2026-10-30T12:00:00.000Z",
  explanation: "Add a useful, non-duplicative buyer evaluation section with first-party evidence.",
  expectedBenefit: "Help comparison-page readers evaluate team workflow fit.",
  confidence: .79, risk: "medium", automaticExecutionEligible: false,
  rollbackConcept: "Restore the previously verified page-content snapshot.",
  evidenceIds: ["example-first-party-page-snapshot"]
};
const candidate = (values: Record<string,unknown> = {}) => ({
  actionId: "c1", version: 1, targetPage: "https://www.whachatcrm.com/zoko-alternative",
  confidence: .79, impressions: 975, clicks: 0, proposal, ...values
});
assert.equal(selectDailySeoReviewCandidate([]), null);
assert.equal(selectDailySeoReviewCandidate([candidate({ impressions: 49 })]), null);
assert.equal(selectDailySeoReviewCandidate([candidate({ targetPage: "https://unknown.example/zoko-alternative" })]), null);
assert.equal(selectDailySeoReviewCandidate([candidate({ proposal: { ...proposal, factValidationStatus: "not_applicable" } })]), null);
assert.equal(selectDailySeoReviewCandidate([candidate({ proposal: { ...proposal, risk: "high" } })]), null);
assert.equal(selectDailySeoReviewCandidate([candidate({ proposal: { ...proposal, proposedContent: "Guaranteed more sales" } })]), null);
const chosen = selectDailySeoReviewCandidate([candidate({ impressions: 10 }), candidate({ actionId: "c2" })]);
assert.equal(chosen?.actionId, "c2");
assert.equal(chosen?.proposedContent, content);
assert.match(SEO_DAILY_SHIPPING_SCHEMA, /run_day date PRIMARY KEY/);
assert.match(SEO_DAILY_SHIPPING_SCHEMA, /needs_review/);
assert.doesNotMatch(SEO_DAILY_SHIPPING_SCHEMA, /auto.publish|social.credentials/i);
console.log("SEO daily shipping safety and deterministic review selection passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

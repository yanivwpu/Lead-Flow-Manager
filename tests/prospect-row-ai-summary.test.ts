/**
 * AI Review table row summary — completed qualification must populate the summary cell.
 * Run: npx tsx tests/prospect-row-ai-summary.test.ts
 */
import assert from "node:assert/strict";
import {
  buildProspectRowAiSummary,
  isProspectQualificationComplete,
  mergeProspectRowsStableOrder,
  resolveProspectReviewLifecycle,
} from "../shared/prospectReviewUx";

type Row = {
  contactId: string;
  intelligence: {
    analysisStatus?: string | null;
    leadScore?: number | null;
    priority?: string | null;
    businessType?: string | null;
    recommendedOffer?: string | null;
    suggestedOutreachAngle?: string | null;
    reasoningSummary?: string | null;
  };
};

/** Simulate list poll: pending empty summary → completed payload → stable merge keeps order. */
function simulatePollRefresh(params: {
  previousOrder: string[];
  previousItems: Row[];
  polledItems: Row[];
}): { order: string[]; summaries: ReturnType<typeof buildProspectRowAiSummary>[] } {
  const merged = mergeProspectRowsStableOrder(params.previousOrder, params.polledItems);
  return {
    order: merged.order,
    summaries: merged.items.map((row) => buildProspectRowAiSummary(row.intelligence)),
  };
}

{
  const empty = buildProspectRowAiSummary({ analysisStatus: "pending" });
  assert.equal(empty.showSummary, false);
}

{
  const summary = buildProspectRowAiSummary({
    analysisStatus: "needs_review",
    leadScore: 72,
    priority: "needs_review",
    businessType: "dental clinic",
    recommendedOffer: "general_demo",
    suggestedOutreachAngle: "Lead with inbox + booking for multi-location clinics.",
  });
  assert.equal(summary.showSummary, true);
  assert.equal(summary.matchLabel, "Strong Match");
  assert.equal(summary.matchStars, 4);
  assert.equal(summary.businessType, "dental clinic");
  assert.equal(summary.offerLabel, "general demo");
  assert.match(summary.angle || "", /inbox \+ booking/i);
  assert.equal(isProspectQualificationComplete("needs_review"), true);
  assert.equal(
    resolveProspectReviewLifecycle({
      analysisStatus: "needs_review",
      reviewStatus: "needs_review",
      needsReview: true,
    }),
    "ready_for_approval",
  );
}

{
  const summary = buildProspectRowAiSummary({
    analysisStatus: "completed",
    leadScore: 91,
    priority: "high",
    businessType: "agency",
    recommendedOffer: "partner_program",
    suggestedOutreachAngle: "",
    reasoningSummary: "Agency tags and website suggest partner fit.",
  });
  assert.equal(summary.showSummary, true);
  assert.equal(summary.matchLabel, "Excellent Match");
  assert.equal(summary.offerLabel, "partner program");
  assert.match(summary.angle || "", /partner fit/i);
}

// Regression: pending row with empty summary → poll returns needs_review data → summary appears
// without changing stable order / without navigation.
{
  const order = ["c-old", "c-pending", "c-other"];
  const previousItems: Row[] = [
    {
      contactId: "c-old",
      intelligence: {
        analysisStatus: "completed",
        leadScore: 88,
        priority: "high",
        businessType: "saas",
        recommendedOffer: "shopify_app",
        suggestedOutreachAngle: "Existing completed row",
      },
    },
    {
      contactId: "c-pending",
      intelligence: { analysisStatus: "pending" },
    },
    {
      contactId: "c-other",
      intelligence: { analysisStatus: "processing" },
    },
  ];

  const before = buildProspectRowAiSummary(previousItems[1].intelligence);
  assert.equal(before.showSummary, false);

  const polledItems: Row[] = [
    previousItems[0],
    {
      contactId: "c-pending",
      intelligence: {
        analysisStatus: "needs_review",
        leadScore: 64,
        priority: "needs_review",
        businessType: "local business",
        recommendedOffer: "general_demo",
        suggestedOutreachAngle: "Offer a short demo of unified messaging.",
        reasoningSummary: "Limited firmographics; recommend human review.",
      },
    },
    previousItems[2],
  ];

  const after = simulatePollRefresh({
    previousOrder: order,
    previousItems,
    polledItems,
  });

  assert.deepEqual(after.order, ["c-old", "c-pending", "c-other"]);
  assert.equal(after.summaries[0].showSummary, true);
  assert.equal(after.summaries[1].showSummary, true);
  assert.equal(after.summaries[1].matchLabel, "Good Match");
  assert.equal(after.summaries[1].businessType, "local business");
  assert.match(after.summaries[1].angle || "", /unified messaging/i);
  assert.equal(after.summaries[2].showSummary, false);
}

console.log("prospect-row-ai-summary.test.ts: all assertions passed");

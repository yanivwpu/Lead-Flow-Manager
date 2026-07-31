/**
 * Prospect AI Review toolbar / selection UX (layout + copy contracts).
 * Run: npx tsx tests/prospect-review-toolbar-ux.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatProspectReviewSelectionSummary,
  formatProspectSelectAllLabel,
  shouldShowSelectEntireScopeAction,
  PROSPECT_SELECTION_LABELS,
} from "../shared/prospectAiDisplay";
import { summarizeSelectionActionAvailability } from "../shared/prospectAiReviewState";

const root = process.cwd();
const panelSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
  "utf8",
);

{
  // Filters render above status tabs (source order)
  const filterIdx = panelSrc.indexOf('data-testid="pi-filter-row"');
  const tabsIdx = panelSrc.indexOf('data-testid="pi-status-tabs"');
  const toolbarIdx = panelSrc.indexOf('data-testid="pi-selection-toolbar"');
  assert.ok(filterIdx > 0 && tabsIdx > filterIdx, "filter row must precede status tabs");
  assert.ok(toolbarIdx > tabsIdx, "selection toolbar must follow status tabs");
}

{
  // Compact status tabs retain counts + filtering testids
  assert.ok(panelSrc.includes('data-testid={`pi-filter-${chip.id}`}'));
  assert.ok(panelSrc.includes("({count})"));
  assert.ok(panelSrc.includes('data-testid="pi-status-tabs"'));
  assert.ok(panelSrc.includes("h-6"));
  assert.ok(!panelSrc.includes("rounded-full px-2.5"));
}

{
  // Header checkbox selects visible rows; no Select page button
  assert.ok(panelSrc.includes('data-testid="pi-header-select-visible"'));
  assert.ok(panelSrc.includes("toggleVisibleHeaderCheckbox"));
  assert.ok(panelSrc.includes("indeterminate"));
  assert.ok(!panelSrc.includes("PROSPECT_SELECTION_LABELS.selectPage)"));
  assert.ok(!panelSrc.includes("{PROSPECT_SELECTION_LABELS.selectPage}"));
  assert.ok(!/Select page \(/.test(panelSrc));
}

{
  // Select entire batch / matching — only when scope > visible page
  assert.equal(
    shouldShowSelectEntireScopeAction({ visibleCount: 20, matchingCount: 20 }),
    false,
  );
  assert.equal(
    shouldShowSelectEntireScopeAction({ visibleCount: 20, matchingCount: 45 }),
    true,
  );
  assert.equal(formatProspectSelectAllLabel({ count: 20, batchActive: true }), "Select entire batch (20)");
  assert.equal(formatProspectSelectAllLabel({ count: 32, batchActive: false }), "Select all matching (32)");
  assert.ok(panelSrc.includes("showSelectEntireScope"));
  assert.ok(panelSrc.includes('data-testid="pi-select-entire-scope"'));
}

{
  // Clear selection only when selected
  assert.ok(panelSrc.includes('data-testid="pi-clear-selection"'));
  assert.ok(panelSrc.includes("selectedCount > 0"));
  assert.ok(panelSrc.includes("PROSPECT_SELECTION_LABELS.clearSelection"));
  assert.ok(!/>\s*Clear\s*</.test(panelSrc));
}

{
  // Human-readable mixed selection summary — no server-resolved
  const enrichSummary = formatProspectReviewSelectionSummary({
    selectedCount: 20,
    enrichableCount: 4,
    alreadyEnrichedCount: 11,
    unavailableCount: 5,
  });
  assert.equal(enrichSummary.headline, "20 selected");
  assert.match(enrichSummary.detail || "", /4 can be enriched/);
  assert.match(enrichSummary.detail || "", /11 already enriched/);
  assert.match(enrichSummary.detail || "", /5 unavailable/);

  const campaignSummary = formatProspectReviewSelectionSummary({
    selectedCount: 20,
    enrichableCount: 20,
    qualifiedCount: 11,
    notQualifiedCount: 7,
    needsReviewCount: 2,
  });
  assert.equal(campaignSummary.headline, "20 selected");
  assert.match(campaignSummary.detail || "", /11 ready for Campaign/i);
  assert.match(campaignSummary.detail || "", /7 not qualified/);
  assert.match(campaignSummary.detail || "", /2 need review/);

  assert.ok(!panelSrc.includes("server-resolved"));
}

{
  // Action buttons use eligible counts
  assert.ok(panelSrc.includes("`Enrich ${selectionEligibility.canEnrich}`") || panelSrc.includes("Enrich ${selectionEligibility.canEnrich}"));
  assert.ok(panelSrc.includes("Send ${selectionEligibility.qualified} to Campaign"));
  assert.ok(panelSrc.includes("startProspectEnrichment"));
  assert.ok(panelSrc.includes("explainQualifiedForCampaign(reviewUxInput(row)).ok"));
}

{
  // summarizeSelectionActionAvailability prefers campaign eligibility when present
  const avail = summarizeSelectionActionAvailability({
    selectedCount: 20,
    enrichableCount: 4,
    qualifiedCount: 11,
    alreadyEnrichedCount: 11,
    unavailableCount: 5,
    needsReviewCount: 2,
    notQualifiedCount: 7,
  });
  assert.equal(avail.line, "20 selected");
  assert.match(avail.detail || "", /11 ready for Campaign/i);
  assert.match(avail.detail || "", /2 need review/);
  assert.equal(avail.reason, null);
}

console.log("prospect-review-toolbar-ux.test.ts: all assertions passed");

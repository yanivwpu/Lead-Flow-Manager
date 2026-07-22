/**
 * Prospect AI layout stability.
 * Run: npx tsx tests/prospect-ai-layout.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROSPECT_AI_EMPTY_STATE_CLASS,
  PROSPECT_AI_PAGE_CONTAINER_CLASS,
  PROSPECT_AI_PROGRESS_COL_CLASS,
  PROSPECT_AI_PROGRESS_TIMELINE_CLASS,
  PROSPECT_AI_REVIEW_COLGROUP,
  PROSPECT_AI_REVIEW_TABLE_CLASS,
  PROSPECT_AI_TAB_BODY_CLASS,
  PROSPECT_AI_TAB_PANEL_CLASS,
} from "../shared/prospectAiLayout";

const root = join(import.meta.dirname, "..");

assert.ok(PROSPECT_AI_PAGE_CONTAINER_CLASS.includes("max-w-6xl"));
assert.ok(PROSPECT_AI_PAGE_CONTAINER_CLASS.includes("w-full"));
assert.ok(PROSPECT_AI_PAGE_CONTAINER_CLASS.includes("mx-auto"));
assert.ok(PROSPECT_AI_PAGE_CONTAINER_CLASS.includes("px-4"));
assert.ok(PROSPECT_AI_TAB_BODY_CLASS.includes("w-full"));
assert.ok(PROSPECT_AI_TAB_PANEL_CLASS.includes("w-full"));
assert.ok(PROSPECT_AI_EMPTY_STATE_CLASS.includes("w-full"));
assert.ok(PROSPECT_AI_REVIEW_TABLE_CLASS.includes("table-fixed"));
assert.ok(PROSPECT_AI_PROGRESS_COL_CLASS.includes("20rem"));
assert.ok(PROSPECT_AI_PROGRESS_TIMELINE_CLASS.includes("flex-nowrap"));
assert.ok(PROSPECT_AI_PROGRESS_TIMELINE_CLASS.includes("whitespace-nowrap"));
assert.ok(!PROSPECT_AI_PROGRESS_TIMELINE_CLASS.includes("flex-wrap"));
assert.equal(PROSPECT_AI_REVIEW_COLGROUP.progress, "prospect-ai-col-progress");

const pageSrc = readFileSync(join(root, "client/src/pages/ProspectAI.tsx"), "utf8");
assert.ok(pageSrc.includes("ProspectAiPageLayout"));
assert.ok(pageSrc.includes("ProspectAiTabBody"));
assert.ok(pageSrc.includes("PROSPECT_AI_TAB_PANEL_CLASS"));
assert.ok(pageSrc.includes("prospect-activity-tab"));
assert.ok(pageSrc.includes("prospect-ai-won-tab"));
assert.ok(pageSrc.includes("prospect-discover-tab"));
assert.ok(pageSrc.includes("ProspectAiEmptyState"));
assert.ok(!pageSrc.includes('className="mx-auto flex w-full max-w-6xl'));

const reviewSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
  "utf8",
);
assert.ok(reviewSrc.includes("PROSPECT_AI_PROGRESS_TIMELINE_CLASS"));
assert.ok(reviewSrc.includes("PROSPECT_AI_REVIEW_TABLE_CLASS"));
assert.ok(reviewSrc.includes("PROSPECT_AI_PROGRESS_COL_CLASS"));
assert.ok(reviewSrc.includes("prospect-ai-stage-label-short"));
assert.ok(!reviewSrc.includes('className="flex flex-wrap items-center gap-x-2 gap-y-1"'));
assert.ok(reviewSrc.includes("data-prospect-ai-layout=\"tab-body\""));

const campaignsSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectOutreachQueuePanel.tsx"),
  "utf8",
);
assert.ok(campaignsSrc.includes("w-full min-w-0"));
assert.ok(campaignsSrc.includes('data-prospect-ai-layout="tab-body"'));

const layoutComp = readFileSync(
  join(root, "client/src/components/prospectAi/ProspectAiPageLayout.tsx"),
  "utf8",
);
assert.ok(layoutComp.includes("PROSPECT_AI_PAGE_CONTAINER_CLASS"));
assert.ok(layoutComp.includes("PROSPECT_AI_EMPTY_STATE_CLASS"));
assert.ok(layoutComp.includes('data-prospect-ai-layout="page"'));
assert.ok(layoutComp.includes('data-prospect-ai-layout="empty-state"'));

const css = readFileSync(join(root, "client/src/index.css"), "utf8");
assert.ok(css.includes("scrollbar-gutter: stable"));
assert.ok(css.includes(".prospect-ai-progress-timeline"));
assert.ok(css.includes("flex-wrap: nowrap"));
assert.ok(css.includes("white-space: nowrap"));
assert.ok(css.includes("@media (max-width: 1279px)"));
assert.ok(css.includes(".prospect-ai-stage-label-short"));

const appLayout = readFileSync(join(root, "client/src/pages/AppLayout.tsx"), "utf8");
assert.ok(appLayout.includes("scrollbar-gutter:stable"));

console.log("prospect-ai-layout.test.ts: ok");

import assert from "node:assert/strict";
import {
  explainQualifiedForCampaign,
  isProspectCampaignReady,
  matchesProspectReviewWorkFilter,
  resolveProspectReviewPresentation,
  selectProspectCampaignReadyContactIds,
  type ProspectReviewStateInput,
} from "../shared/prospectAiReviewState";
import { resolveProspectOutreachEligibility } from "../shared/prospectOutreachEligibility";
import { buildAiGrowthAssistantModel } from "../shared/prospectAiPersonality";
import { readFileSync } from "node:fs";

const ready: ProspectReviewStateInput = {
  analysisStatus: "completed",
  reviewStatus: "approved",
  email: "prospect@example.com",
  suggestedFirstMessage: "An idea for your team.",
  suggestedOutreachSubject: "A quick idea",
  lifecycleStatus: "active",
};
const cases: Array<[string, ProspectReviewStateInput, boolean]> = [
  ["qualified, valid email and outreach", ready, true],
  ...["queued", "sending", "paused", "sent", "failed", "skipped", "cancelled"].map(
    (queueStatus): [string, ProspectReviewStateInput, boolean] =>
      [queueStatus, { ...ready, queueStatus }, false],
  ),
  ["prior outreach", { ...ready, priorOutreachDetected: true }, false],
  ["linked send", { ...ready, outreachMessageId: "message-1" }, false],
  ["outbound", { ...ready, hasOutboundMessage: true }, false],
  ["not qualified", { ...ready, reviewStatus: "pending", notQualified: true }, false],
  ["needs review", { ...ready, reviewStatus: "pending", needsReview: true }, false],
  ["missing email", { ...ready, email: null }, false],
  ["invalid email", { ...ready, email: "invalid" }, false],
  ["missing outreach", { ...ready, suggestedFirstMessage: null, suggestedOutreachSubject: null }, false],
  ["archived", { ...ready, lifecycleStatus: "archived" }, false],
  ["trashed", { ...ready, lifecycleStatus: "trashed" }, false],
  ["won", { ...ready, outcome: "won" }, false],
];
for (const [label, input, expected] of cases) {
  assert.equal(isProspectCampaignReady(input), expected, label);
  assert.equal(matchesProspectReviewWorkFilter(input, "campaign_ready"), expected, `${label} filter`);
  assert.equal(resolveProspectReviewPresentation(input).campaignReady, expected, `${label} badge`);
}
// Preserve existing human approval rules, including stale advisory Needs Review flags.
assert.equal(isProspectCampaignReady({ ...ready, needsReview: true, priority: "needs_review" }), true);
// Stale timestamps alone still do not constitute traceable outreach.
assert.equal(isProspectCampaignReady({ ...ready, outreachStatus: "outreach_sent", outreachSentAt: "2026-01-01" }), true);

const rows = Array.from({ length: 10 }, (_, i) => ({
  ...ready, contactId: `c${i}`, ...(i < 3 ? { queueStatus: "queued" } : {}),
}));
const selected = new Set(rows.map((row) => row.contactId));
assert.equal(rows.filter((row) => matchesProspectReviewWorkFilter(row, "campaign_ready")).length, 7);
const sendIds = selectProspectCampaignReadyContactIds(rows, selected);
assert.deepEqual(sendIds, rows.slice(3).map((row) => row.contactId));
for (const row of rows.filter((row) => sendIds.includes(row.contactId))) {
  assert.equal(explainQualifiedForCampaign(row).ok, true);
  const backend = resolveProspectOutreachEligibility({
    ...row, emailConnected: true, preferredChannel: "auto", alreadyQueued: Boolean(row.queueStatus),
  });
  assert.equal(backend.anyEligible, true, "bulk selection shares Send hard gates");
  assert.equal(backend.summaryReason, "eligible");
}
const prior = { ...ready, contactId: "prior", priorOutreachDetected: true };
assert.deepEqual(selectProspectCampaignReadyContactIds([prior], new Set(["prior"])), []);
assert.equal(resolveProspectOutreachEligibility({ ...ready, alreadyQueued: true, emailConnected: true }).summaryReason, "duplicate_queued");

// Backend success metadata patches the cache: the next render immediately loses
// those IDs from the filter, count, selection, and assistant send recommendation.
const updated = rows.map((row) => sendIds.includes(row.contactId) ? { ...row, queueStatus: "queued" } : row);
assert.equal(updated.filter(isProspectCampaignReady).length, 0);
assert.deepEqual(selectProspectCampaignReadyContactIds(updated, selected), []);
assert.doesNotMatch(JSON.stringify(buildAiGrowthAssistantModel(updated)), /Send 10|Send 7|All 10 prospects are Campaign Ready/);

const panel = readFileSync(new URL("../client/src/components/settings/ProspectIntelligencePanel.tsx", import.meta.url), "utf8");
assert.match(panel, /if \(workFilter === "campaign_ready"\) return isProspectCampaignReady\(ux\);[\s\S]*?if \(pinnedVisibleIds/);
assert.match(panel, /contactIds: queuePreviewContactIds/);
assert.match(panel, /const ids = data\.queuedContactIds/);
assert.match(panel, /setResolvedFilteredIds\(\(prev\) => \{[\s\S]*?prev\.filter\(\(id\) => ready\.has\(id\)\)/);
const queueService = readFileSync(new URL("../server/prospectImport/prospectOutreachQueueService.ts", import.meta.url), "utf8");
assert.match(queueService, /queuedItemIds,\s*queuedContactIds,/);
console.log(`prospect-campaign-ready-semantics: ${cases.length} eligibility cases, count, bulk selection, and reconciliation passed`);

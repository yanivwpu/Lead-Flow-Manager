import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildProspectOutreachEligibilityInput, evaluateProspectCampaignReadinessBatch, type CampaignReadinessCandidate, type CampaignReadinessQueueEntry } from "../server/prospectImport/prospectCampaignReadinessEvaluation";
import { PROSPECT_MESSAGE_CREATION_DEFAULTS, type ProspectMessageCreationSettings } from "../shared/prospectMessageCreation";
import { buildQueueDedupKey, groupCampaignSkipReasons } from "../shared/prospectBulkOutreach";
import { isProspectCampaignReady, matchesProspectReviewWorkFilter, resolveProspectReviewPresentation, selectProspectCampaignReadyContactIds, countProspectReviewWorkStates } from "../shared/prospectAiReviewState";
import { buildAiGrowthAssistantModel } from "../shared/prospectAiPersonality";
import { detectPriorProspectOutreach } from "../shared/prospectPriorOutreach";
import type { Contact } from "../shared/schema";

const workspaceUserId = "workspace-1";
function candidate(id: string, patch: Partial<CampaignReadinessCandidate["input"]> = {}, lifecycleStatus = "active"): CampaignReadinessCandidate {
  return { contactId: id, name: id, lifecycleStatus, input: {
    analysisStatus: "completed", reviewStatus: "approved", email: `${id}@example.com`,
    suggestedFirstMessage: "An idea for your team.", emailConnected: true, outreachStatus: "not_sent", ...patch,
  } };
}
function queueEntry(id: string, email: string, queueStatus = "queued"): CampaignReadinessQueueEntry {
  return { contactId: id, selectedChannel: "email", recipientIdentity: email, queueStatus,
    dedupKey: buildQueueDedupKey({ workspaceUserId, contactId: id, channel: "email", recipientIdentity: email }) };
}
function evaluate(rows: CampaignReadinessCandidate[], queueEntries: CampaignReadinessQueueEntry[] = [], messageSettings: ProspectMessageCreationSettings = PROSPECT_MESSAGE_CREATION_DEFAULTS, contactIds = rows.map((r) => r.contactId)) {
  return evaluateProspectCampaignReadinessBatch({ workspaceUserId, contactIds, candidates: new Map(rows.map((row) => [row.contactId, row])), queueEntries, preferredChannel: "auto", messageSettings });
}
function reviewRows(rows: CampaignReadinessCandidate[], evaluated: ReturnType<typeof evaluate>) {
  return rows.map((row) => ({ ...row.input, contactId: row.contactId, lifecycleStatus: row.lifecycleStatus, ...evaluated.readiness.get(row.contactId)! }));
}

// Each final backend gate must also remove the row from the tab, badge and selection.
const cases: Array<[string, CampaignReadinessCandidate, CampaignReadinessQueueEntry[], string | null]> = [
  ["ready", candidate("ready"), [], null],
  ["actively queued", candidate("queued", { alreadyQueued: true }), [queueEntry("queued", "queued@example.com")], "duplicate_queued"],
  ["queue history", candidate("history"), [queueEntry("history", "history@example.com", "cancelled")], "already_in_campaign"],
  ["another campaign recipient", candidate("duplicate", { email: " SHARED@EXAMPLE.COM " }), [queueEntry("other-contact", "shared@example.com")], "duplicate_recipient"],
  ["dedup collision", candidate("collision"), [{ ...queueEntry("other-contact", "other@example.com"), dedupKey: buildQueueDedupKey({ workspaceUserId, contactId: "collision", channel: "email", recipientIdentity: "collision@example.com" }) }], "dedup_key_collision"],
  ["prior outreach", candidate("sent", { outreachStatus: "outreach_sent" }), [], "already_outreach_sent"],
  ["replied", candidate("replied", { outreachStatus: "replied" }), [], "already_replied"],
  ["not qualified", candidate("not-fit", { notQualified: true, reviewStatus: "pending" }), [], "not_qualified"],
  ["needs review", candidate("needs-review", { reviewStatus: "pending", needsReview: true }), [], "not_approved"],
  ["archived", candidate("archived", {}, "archived"), [], "inactive_prospect"],
  ["trashed", candidate("trashed", {}, "trashed"), [], "inactive_prospect"],
  ["deleted", candidate("deleted", {}, "deleted"), [], "inactive_prospect"],
  ["missing body with only subject", candidate("subject-only", { suggestedFirstMessage: "", suggestedOutreachSubject: "Hi" }), [], "missing_message_snapshot"],
  ["suppressed", candidate("suppressed", { suppressed: true }), [], "suppressed"],
  ["opted out", candidate("opted-out", { optedOut: true }), [], "opted_out"],
  ["sender disconnected", candidate("disconnected", { emailConnected: false }), [], "sender_not_connected"],
  ["automations paused", candidate("paused", { automationsPaused: true }), [], "automations_paused"],
  ["won", candidate("won", { outcome: "won" }), [], "already_in_campaign"],
];
for (const [label, row, queue, reason] of cases) {
  const evaluation = evaluate([row], queue);
  const ready = reason === null;
  assert.equal(evaluation.readiness.get(row.contactId)?.campaignReady, ready, label);
  assert.equal(evaluation.readiness.get(row.contactId)?.campaignReadyBlockCode, reason, label);
  assert.equal(evaluation.preview.willQueue, Number(ready), `${label} preview parity`);
  const review = reviewRows([row], evaluation)[0];
  assert.equal(isProspectCampaignReady(review), ready, `${label} Review readiness`);
  assert.equal(matchesProspectReviewWorkFilter(review, "campaign_ready"), ready, `${label} row visibility`);
  assert.equal(resolveProspectReviewPresentation(review).campaignReady, ready, `${label} badge`);
  assert.equal(selectProspectCampaignReadyContactIds([review], new Set([row.contactId])).length, Number(ready), `${label} Send selection`);
}

// Six ready rows => select all / send six => backend will queue six, with no skips.
const six = Array.from({ length: 6 }, (_, i) => candidate(`ready-${i}`));
const allReady = evaluate(six);
const allReview = reviewRows(six, allReady);
const selectedIds = selectProspectCampaignReadyContactIds(allReview, new Set(six.map((r) => r.contactId)));
assert.equal(selectedIds.length, 6);
assert.deepEqual(evaluate(six, [], undefined, selectedIds).preview, { selectedCount: 6, willQueue: 6, skips: [], eligibleByChannel: { email: 6 }, notBulkEligible: 0, preferredChannel: "auto" });
assert.equal(buildAiGrowthAssistantModel(allReview).nextAction, "Send all 6 to Campaign.");

// Production reproduction: five hidden backend queue/recipient blockers, one ready.
const sixQualified = Array.from({ length: 6 }, (_, i) => candidate(`qualified-${i}`));
const activeEntries = sixQualified.slice(0, 5).map((r, i) => queueEntry(i < 2 ? r.contactId : `other-${i}`, r.input.email!));
const evaluated = evaluate(sixQualified, activeEntries);
assert.equal(evaluated.preview.willQueue, 1);
assert.equal(groupCampaignSkipReasons(evaluated.preview.skips)[0].count, 5);
const reviews = reviewRows(sixQualified, evaluated);
const visible = reviews.filter((r) => matchesProspectReviewWorkFilter(r, "campaign_ready"));
assert.equal(visible.length, 1);
const sendIds = selectProspectCampaignReadyContactIds(reviews, new Set(reviews.map((r) => r.contactId)));
assert.deepEqual(sendIds, ["qualified-5"]);
const preview = evaluate(sixQualified, activeEntries, undefined, sendIds).preview;
assert.equal(preview.selectedCount, 1);
assert.equal(preview.willQueue, 1);
assert.equal(preview.skips.length, 0);
assert.equal(buildAiGrowthAssistantModel(reviews).nextAction, "Send 1 to Campaign.");

// Within-batch duplicate winners are deterministic across list order and preview order.
const duplicates = [candidate("z", { email: "same@example.com" }), candidate("a", { email: "SAME@example.com" })];
assert.equal(evaluate(duplicates).readiness.get("a")?.campaignReady, true);
assert.equal(evaluate([...duplicates].reverse()).readiness.get("a")?.campaignReady, true);
assert.equal(evaluate(duplicates).readiness.get("z")?.campaignReadyBlockCode, "duplicate_recipient");
const winnerIds = selectProspectCampaignReadyContactIds(reviewRows(duplicates, evaluate(duplicates)), new Set(["z", "a"]));
assert.equal(evaluate(duplicates, [], undefined, winnerIds).preview.skips.length, 0);

// Template creation generates the body later; an absent saved message is not a blocker.
for (const mode of ["use_my_template", "ai_assisted_template"] as const) {
  const settings = { ...PROSPECT_MESSAGE_CREATION_DEFAULTS, mode, templateBody: mode === "use_my_template" ? "Hi {{business_name}}" : "Hi {{business_name}}, {{ai_opening}}" };
  const row = candidate(`template-${mode}`, { suggestedFirstMessage: null, suggestedOutreachSubject: null });
  const result = evaluate([row], [], settings);
  assert.equal(result.preview.willQueue, 1, mode);
  assert.equal(result.readiness.get(row.contactId)?.campaignReady, true, mode);
  const presentation = resolveProspectReviewPresentation(reviewRows([row], result)[0]);
  assert.equal(presentation.rowBadge?.label, "Campaign Ready", `${mode} should not show Outreach Needed`);
  assert.equal(evaluate([row], [], { ...settings, templateBody: "" }).preview.willQueue, 0, "empty template cannot generate");
  assert.equal(evaluate([row], [], settings).preview.skips.length, 0);
}
assert.equal(evaluate([candidate("bad-template")], [], { ...PROSPECT_MESSAGE_CREATION_DEFAULTS, mode: "use_my_template", templateBody: "{{ai_opening}}" }).preview.willQueue, 0, "invalid template cannot silently use PI message");

// Traceable prior history is loaded into the same input as per-contact send eligibility.
const priorOutreach = detectPriorProspectOutreach({ emailConversations: [{ id: "outbound", subject: "Idea for Example", hasOutbound: true }] });
const input = buildProspectOutreachEligibilityInput({
  contact: { id: "traceable", userId: workspaceUserId, email: "traceable@example.com" } as Contact,
  intelligence: { analysisStatus: "completed", reviewStatus: "approved", suggestedFirstMessage: "Hi" }, priorOutreach,
  connections: { emailConnected: true, emailMailboxId: "mailbox", smsConnected: false, whatsappConnected: false, facebookConnected: false, instagramConnected: false },
  suppression: { suppressed: false, optedOut: false, reason: null, detail: null }, alreadyQueued: false, websiteUrl: null,
});
assert.equal(evaluate([{ ...candidate("traceable"), input }]).preview.skips[0].reason, "already_outreach_sent");

// Archived, trashed and deleted records must not influence active assistant work.
const inactive = ["archived", "trashed", "deleted"].flatMap((lifecycleStatus) => [
  { ...candidate("closed").input, lifecycleStatus, campaignReady: true },
  { ...candidate("blocked").input, lifecycleStatus, campaignReady: false, campaignReadyBlockCode: "missing_message_snapshot" as const },
  { analysisStatus: "failed", lifecycleStatus },
  { analysisStatus: "processing", lifecycleStatus },
]);
assert.equal(countProspectReviewWorkStates(inactive).qualified, 0);
assert.equal(countProspectReviewWorkStates(inactive).qualificationFailed, 0);
assert.deepEqual(buildAiGrowthAssistantModel(inactive, { failedQualificationCount: 12 }), buildAiGrowthAssistantModel([]));
assert.deepEqual(buildAiGrowthAssistantModel([...allReview, ...inactive]), buildAiGrowthAssistantModel(allReview));

// Integration contracts: both backend paths call the batch source; the client consumes
// the result and refetches after rejection without any per-row preview requests.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
assert.match(read("server/prospectImport/prospectOutreachQueueService.ts"), /export async function previewQueueBatch[\s\S]*?batchEvaluateProspectCampaignReadiness/);
assert.match(read("server/prospectImport/prospectIntelligenceService.ts"), /reviewItems[\s\S]*?batchEvaluateProspectCampaignReadiness[\s\S]*?readiness.get/);
assert.match(read("client/src/components/settings/ProspectIntelligencePanel.tsx"), /campaignReady: row.campaignReady === true/);
assert.match(read("client/src/components/settings/ProspectIntelligencePanel.tsx"), /if \(data.preview\?\.skips.length\)[\s\S]*?campaignReady: false[\s\S]*?invalidateQueries/);
assert.match(read("server/prospectImport/prospectOutreachQueueService.ts"), /if \(previewSkippedIds.has\(contactId\)\) continue/);
console.log(`prospect-authoritative-campaign-readiness: ${cases.length} backend cases, 6/6 and 1/6 parity, deterministic recipients, templates, active assistant scope passed`);

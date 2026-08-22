/**
 * Per-contact Pause Automations (A–P).
 * Run: npx tsx tests/contact-automations-pause.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildContactAutomationPausePatch,
  contactHasAutomationsPaused,
  shouldFreezeDueCampaignEnrollmentOnPause,
  shouldRearmCampaignEnrollmentAfterContactResume,
} from "../shared/contactAutomationsPause";
import {
  automationSendGuardBlockUserMessage,
} from "../shared/automationSendGuardMessages";
import { contactHasDoNotContact, evaluateAutomationSendGuard } from "../server/automationSendGuard";
import { noReplyJobSkipReasonFromSend } from "../server/automationNoReply";
import { resolveProspectOutreachEligibility } from "../shared/prospectOutreachEligibility";
import { prospectOutreachEligibilityReasonLabel } from "../shared/prospectBulkOutreach";
import { storage } from "../server/storage";

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fakeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    userId: "ws-1",
    name: "Test Contact",
    tag: "New",
    pipelineStage: "Lead",
    automationsPaused: false,
    automationsPausedAt: null,
    automationsPausedByUserId: null,
    customFields: {},
    leadScore: 40,
    ...overrides,
  };
}

async function withStubbedContact<T>(
  contact: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const orig = storage.getContact.bind(storage);
  (storage as { getContact: typeof storage.getContact }).getContact = async () => contact as never;
  try {
    return await fn();
  } finally {
    storage.getContact = orig;
  }
}

function testHelpers() {
  assert.equal(contactHasAutomationsPaused({ automationsPaused: false }), false);
  assert.equal(contactHasAutomationsPaused({ automationsPaused: true }), true);
  assert.equal(contactHasAutomationsPaused({}), false);

  const pause = buildContactAutomationPausePatch(true, "user-9", new Date("2026-08-22T12:00:00.000Z"));
  assert.equal(pause.automationsPaused, true);
  assert.equal(pause.automationsPausedByUserId, "user-9");
  assert.equal(pause.automationsPausedAt?.toISOString(), "2026-08-22T12:00:00.000Z");

  const resume = buildContactAutomationPausePatch(false, "user-9");
  assert.equal(resume.automationsPaused, false);
  assert.equal(resume.automationsPausedAt, null);
  assert.equal(resume.automationsPausedByUserId, null);

  const now = new Date("2026-08-22T12:00:00.000Z");
  assert.equal(
    shouldFreezeDueCampaignEnrollmentOnPause({ status: "active", nextRunAt: now }, now),
    true,
  );
  assert.equal(
    shouldFreezeDueCampaignEnrollmentOnPause(
      { status: "active", nextRunAt: new Date("2026-08-25T12:00:00.000Z") },
      now,
    ),
    false,
  );
  assert.equal(
    shouldRearmCampaignEnrollmentAfterContactResume({ status: "active", nextRunAt: null }),
    true,
  );
  assert.equal(
    shouldRearmCampaignEnrollmentAfterContactResume({
      status: "completed",
      nextRunAt: null,
    }),
    false,
  );
  assert.equal(
    shouldRearmCampaignEnrollmentAfterContactResume({
      status: "active",
      nextRunAt: new Date("2026-08-25T12:00:00.000Z"),
    }),
    false,
  );
}

async function testGuardAActiveSends() {
  const decision = await withStubbedContact(fakeContact(), () =>
    evaluateAutomationSendGuard({
      userId: "ws-1",
      contactId: "c1",
      source: "workflow",
      idempotencyKey: "w4-active",
    }),
  );
  assert.equal(decision.ok, true);
}

async function testGuardBPausedBlocks() {
  const decision = await withStubbedContact(fakeContact({ automationsPaused: true }), () =>
    evaluateAutomationSendGuard({
      userId: "ws-1",
      contactId: "c1",
      source: "workflow",
      idempotencyKey: "w4-paused",
    }),
  );
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.reason, "automations_paused");
  }
  assert.equal(
    noReplyJobSkipReasonFromSend("guard_skipped", "automations_paused"),
    "automations_paused",
  );
  assert.ok(
    automationSendGuardBlockUserMessage("automations_paused").toLowerCase().includes("paused"),
  );
}

function testCManualNotInGuard() {
  const guard = read("server/automationSendGuard.ts");
  assert.doesNotMatch(guard, /aiMode/);
  assert.doesNotMatch(guard, /composer/);
  assert.match(guard, /contactHasAutomationsPaused/);
  const nr = read("server/automationNoReply.ts");
  assert.doesNotMatch(nr, /aiMode/);
  assert.match(nr, /automations_paused/);
}

async function testDTimerSource() {
  const decision = await withStubbedContact(fakeContact({ automationsPaused: true }), () =>
    evaluateAutomationSendGuard({
      userId: "ws-1",
      contactId: "c1",
      source: "delayed_job",
      channel: "whatsapp",
      idempotencyKey: "w2-paused",
    }),
  );
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.reason, "automations_paused");
  const timers = read("server/automationTimerHandlers.ts");
  assert.match(timers, /markAutomationTimerJobSkipped\(job\.id, send\.skipReason/);
  assert.match(timers, /source:\s*"delayed_job"/);
}

async function testECampaign() {
  const decision = await withStubbedContact(fakeContact({ automationsPaused: true }), () =>
    evaluateAutomationSendGuard({
      userId: "ws-1",
      contactId: "c1",
      source: "campaign",
      idempotencyKey: "camp-paused",
    }),
  );
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.reason, "automations_paused");
  const campaign = read("server/campaignExecution.ts");
  assert.match(campaign, /contactHasAutomationsPaused/);
  assert.match(campaign, /reason === "automations_paused"/);
  assert.match(campaign, /status: paused \|\| guardedSend\.reason === "duplicate" \? "active" : "cancelled"/);
  assert.match(campaign, /syncCampaignEnrollmentsForContactAutomationPause/);
  assert.doesNotMatch(campaign, /deleteCampaignEnrollment/);
}

async function testFChatbot() {
  const decision = await withStubbedContact(fakeContact({ automationsPaused: true }), () =>
    evaluateAutomationSendGuard({
      userId: "ws-1",
      contactId: "c1",
      source: "chatbot",
      idempotencyKey: "bot-paused",
    }),
  );
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.reason, "automations_paused");
  const bot = read("server/chatbotEngine.ts");
  assert.match(bot, /source:\s*"chatbot"/);
  assert.match(bot, /withAutomationSendGuard/);
}

async function testGAiAuto() {
  const decision = await withStubbedContact(fakeContact({ automationsPaused: true }), () =>
    evaluateAutomationSendGuard({
      userId: "ws-1",
      contactId: "c1",
      source: "ai_auto",
      idempotencyKey: "auto-paused",
    }),
  );
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.reason, "automations_paused");
  const routes = read("server/routes.ts");
  assert.match(routes, /source:\s*"ai_auto"/);
  assert.match(routes, /evaluateAutomationSendGuard/);
}

function testHProspectOutreach() {
  const blocked = resolveProspectOutreachEligibility({
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    email: "lead@acme.test",
    emailConnected: true,
    automationsPaused: true,
    preferredChannel: "email",
    suggestedFirstMessage: "Hi there — quick question.",
  });
  assert.equal(blocked.anyEligible, false);
  assert.equal(blocked.summaryReason, "automations_paused");
  assert.equal(prospectOutreachEligibilityReasonLabel("automations_paused"), "Automations paused");

  const dnc = resolveProspectOutreachEligibility({
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    email: "lead@acme.test",
    emailConnected: true,
    suppressed: true,
    automationsPaused: true,
    suppressionDetail: "dnc",
    preferredChannel: "email",
    suggestedFirstMessage: "Hi there — quick question.",
  });
  assert.equal(dnc.summaryReason, "suppressed");

  const queue = read("server/prospectImport/prospectOutreachQueueService.ts");
  assert.match(queue, /queueStatus: "skipped"/);
  assert.match(queue, /lastError: "automations_paused"/);
  assert.doesNotMatch(queue, /discovery/);
}

function testIManualInboxSend() {
  const contacts = read("server/routes/contacts.ts");
  assert.match(
    contacts,
    /guardedSources = new Set\(\["ai_auto", "workflow", "delayed_job", "template", "broadcast", "follow_up", "booking_flow", "chatbot", "campaign"\]\)/,
  );
  assert.match(contacts, /const guarded = guardedSource/);
  assert.match(contacts, /withAutomationSendGuard/);
}

function testJInboundUnrelated() {
  const persist = read("server/channelService.ts");
  assert.doesNotMatch(persist, /automationsPaused/);
  const inbound = read("server/emailChannel/persistInbound.ts");
  assert.doesNotMatch(inbound, /automationsPaused/);
}

function testKCopilotSuggestion() {
  const routes = read("server/routes.ts");
  assert.match(routes, /source:\s*"ai_auto"/);
  assert.match(routes, /evaluateAutomationSendGuard/);
  assert.match(routes, /wantsAuto/);
  const panel = read("client/src/components/InboxLeadDetailsPanel.tsx");
  assert.match(panel, /button-ai-pause/);
  assert.match(panel, /Temporarily pause AI for this conversation/);
  assert.match(panel, /button-toggle-automations-pause/);
}

function testLResumeDoesNotReplay() {
  const contacts = read("server/routes/contacts.ts");
  assert.doesNotMatch(contacts, /requeueNoReplyJob/);
  assert.doesNotMatch(contacts, /markNoReplyJobPending/);
  const campaign = read("server/campaignExecution.ts");
  assert.match(campaign, /shouldRearmCampaignEnrollmentAfterContactResume/);
  const nr = read("server/automationNoReply.ts");
  assert.match(nr, /markNoReplyJobSkipped\(job\.id, skipReason\)/);
}

async function testMResumeAllowsNew() {
  const decision = await withStubbedContact(fakeContact({ automationsPaused: false }), () =>
    evaluateAutomationSendGuard({
      userId: "ws-1",
      contactId: "c1",
      source: "workflow",
      idempotencyKey: "after-resume",
    }),
  );
  assert.equal(decision.ok, true);
}

function testNDncSeparate() {
  const dnc = contactHasDoNotContact(fakeContact({ tag: "Do Not Contact" }) as never);
  assert.equal(dnc.blocked, true);
  assert.equal(dnc.reason, "do_not_contact");
  assert.equal(contactHasAutomationsPaused({ automationsPaused: true }), true);
  assert.equal(contactHasAutomationsPaused(fakeContact({ tag: "Do Not Contact" })), false);

  const migration = read("migrations/0083_contacts_automations_paused.sql");
  assert.match(migration, /automations_paused boolean/);
  assert.doesNotMatch(migration, /do_not_contact/);
  const schema = read("shared/schema.ts");
  assert.match(schema, /automationsPaused: boolean\("automations_paused"\)/);
  const patches = read("server/startupSchemaPatches.ts");
  assert.match(patches, /tag: "0083_contacts_automations_paused"/);
  assert.match(patches, /ADD COLUMN IF NOT EXISTS automations_paused boolean NOT NULL DEFAULT false/);
  assert.match(patches, /ADD COLUMN IF NOT EXISTS automations_paused_at timestamp/);
  assert.match(patches, /ADD COLUMN IF NOT EXISTS automations_paused_by_user_id varchar/);
}

function testStartupPatchBeforeWorkers() {
  const indexSrc = read("server/index.ts");
  const patchCall = indexSrc.indexOf("await applyStartupSchemaPatches()");
  assert.ok(indexSrc.includes("contactsAutomationsPausedPatchOk"), "0083 patch result is gated");
  assert.ok(indexSrc.includes("patch 0083"), "failed 0083 aborts startup");
  const bulkWorker = indexSrc.indexOf("startProspectBulkAnalysisWorker()");
  const flowWorker = indexSrc.indexOf("startFlowJobWorker()");
  const outreachWorker = indexSrc.indexOf("startProspectOutreachQueueWorker()");
  const cron = indexSrc.indexOf("startCronJobs()");
  const listen = indexSrc.indexOf("httpServer.listen");
  assert.ok(patchCall > 0, "startup patches must be awaited in index.ts");
  assert.ok(bulkWorker > patchCall, "bulk worker after 0083 patch");
  assert.ok(flowWorker > patchCall, "flow/no-reply/timer worker after 0083 patch");
  assert.ok(outreachWorker > patchCall, "prospect outreach worker after 0083 patch");
  assert.ok(cron > patchCall, "cron after 0083 patch");
  assert.ok(listen > patchCall, "listen after 0083 patch");
}

function testOUiSameState() {
  const panel = read("client/src/components/InboxLeadDetailsPanel.tsx");
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  const composer = read("client/src/components/AIComposer.tsx");
  assert.match(panel, /contact\.automationsPaused/);
  assert.match(panel, /Automation Active/);
  assert.match(panel, /Automation Paused/);
  assert.match(panel, /Pause Automations/);
  assert.match(panel, /Resume Automations/);
  assert.match(panel, /onUpdateContact\(\{ automationsPaused:/);
  assert.match(inbox, /updateContact\(\{ automationsPaused:/);
  assert.match(inbox, /menu-toggle-automations-pause/);
  assert.match(inbox, /chip-automation-paused/);
  assert.match(inbox, /Automation Paused/);
  assert.match(composer, /does not pause workflows or follow-ups/);
}

async function testPTenantIsolation() {
  const decision = await withStubbedContact(fakeContact({ userId: "ws-owner" }), () =>
    evaluateAutomationSendGuard({
      userId: "other-ws",
      contactId: "c1",
      source: "workflow",
      idempotencyKey: "tenant",
    }),
  );
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.reason, "contact_wrong_user");

  const contacts = read("server/routes/contacts.ts");
  assert.match(contacts, /contact\.userId !== req\.user\.id/);
  assert.match(contacts, /status\(403\)\.json\(\{ error: "Forbidden" \}\)/);
  assert.match(contacts, /buildContactAutomationPausePatch\(req\.body\.automationsPaused === true, req\.user\.id\)/);
  assert.match(contacts, /delete body\.automationsPausedAt/);
  assert.match(contacts, /delete body\.automationsPausedByUserId/);
}

async function testHumanTemplateIgnoresPause() {
  const decision = await withStubbedContact(fakeContact({ automationsPaused: true }), () =>
    evaluateAutomationSendGuard({
      userId: "ws-1",
      contactId: "c1",
      source: "template",
      idempotencyKey: "human-tpl",
      ignoreAutomationsPaused: true,
    }),
  );
  assert.equal(decision.ok, true);
  const templates = read("server/routes/templates.ts");
  assert.match(templates, /ignoreAutomationsPaused: !isReEngagementCampaignSend/);
}

async function testBookingAndBroadcastSources() {
  for (const source of ["booking_flow", "broadcast", "follow_up"] as const) {
    const decision = await withStubbedContact(fakeContact({ automationsPaused: true }), () =>
      evaluateAutomationSendGuard({
        userId: "ws-1",
        contactId: "c1",
        source,
        idempotencyKey: `${source}-paused`,
      }),
    );
    assert.equal(decision.ok, false, source);
    if (!decision.ok) assert.equal(decision.reason, "automations_paused");
  }
  const booking = read("server/bookingFastPath.ts");
  assert.match(booking, /source:\s*"booking_flow"/);
}

async function testDncWinsOverPause() {
  const decision = await withStubbedContact(
    fakeContact({ automationsPaused: true, tag: "Do Not Contact" }),
    () =>
      evaluateAutomationSendGuard({
        userId: "ws-1",
        contactId: "c1",
        source: "workflow",
        idempotencyKey: "dnc-and-pause",
      }),
  );
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.reason, "do_not_contact");
}

const tests: Array<[string, () => void | Promise<void>]> = [
  ["helpers / campaign freeze-rearm", testHelpers],
  ["A: active contact send guard allows", testGuardAActiveSends],
  ["B: paused blocks + job reason automations_paused", testGuardBPausedBlocks],
  ["C: Manual mode is not the W4/send guard", testCManualNotInGuard],
  ["D: paused W2 delayed_job blocked + timer skip", testDTimerSource],
  ["E: paused campaign does not send / does not cancel", testECampaign],
  ["F: paused chatbot blocked", testFChatbot],
  ["G: paused AI auto blocked", testGAiAuto],
  ["H: prospect automated outreach blocked; discovery untouched", testHProspectOutreach],
  ["I: manual Inbox send unguarded without source", testIManualInboxSend],
  ["J: inbound persist does not check pause", testJInboundUnrelated],
  ["K: Copilot suggestion / snooze remains separate", testKCopilotSuggestion],
  ["L: resume does not replay skipped jobs", testLResumeDoesNotReplay],
  ["M: resume allows new automation", testMResumeAllowsNew],
  ["N: DNC remains separate", testNDncSeparate],
  ["startup patch 0083 before workers/listen", testStartupPatchBeforeWorkers],
  ["O: panel, kebab, chip share automationsPaused", testOUiSameState],
  ["P: tenant isolation", testPTenantIsolation],
  ["human template send ignores pause", testHumanTemplateIgnoresPause],
  ["booking/broadcast/follow_up inherit pause", testBookingAndBroadcastSources],
  ["DNC wins when both flags set", testDncWinsOverPause],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail - ${name}`, err);
  }
}
if (failed) process.exit(1);
console.log(`\n${tests.length} tests passed`);

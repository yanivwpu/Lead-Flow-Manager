/**
 * Trial downgrade: paid execution stops; data/config is preserved.
 * Run: npx tsx --test tests/trial-downgrade-entitlement-enforcement.test.ts
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN_LIMITS } from "../shared/schema";
import { getEffectivePlanForUser, isProAiTrialActive } from "../shared/trialEntitlements";
import {
  ENTITLEMENT_BLOCKED_REASON,
  ENTITLEMENT_SKIP_DEFER_MS,
  countDistinctWhatsAppNumbers,
  extraWhatsAppOutboundAllowed,
  FREE_PLAN_TEAM_SEAT_POLICY,
  isPrimaryWhatsAppNumber,
  nextEntitlementDeferAt,
  paidAutomationAllowedFromLimits,
  chatbotExecutionAllowedFromLimits,
  queuedJobEntitlementAction,
} from "../shared/paidAutomationEntitlements";
import {
  nextConversationUsageAfterPeriodCheck,
  trialExpiryConversationUsageReset,
} from "../shared/conversationUsagePeriod";
import { resolveUsagePeriodFromDates, startOfUtcMonth, startOfNextUtcMonth } from "../shared/usagePeriod";
import { subscriptionService } from "../server/subscriptionService";
import { storage } from "../server/storage";
import { processCampaignEnrollmentStep } from "../server/campaignExecution";
import { executeWorkflowActions } from "../server/workflowEngine";
import { evaluateChatbotInboundArbitration, triggerChatbotFlows } from "../server/chatbotEngine";
import { processNoReplyJob } from "../server/automationNoReply";
import { processAutomationTimerJob } from "../server/automationTimerHandlers";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const expiredFreeUser = {
  trialEndsAt: new Date("2026-08-01T00:00:00.000Z"),
  trialStatus: "expired" as const,
  trialPlan: "pro_ai",
  planOverrideEnabled: false,
  planOverride: null,
  billingPlan: "free",
  subscriptionStatus: "active",
  shopifyShop: null,
  shopifySubscriptionStatus: null,
};

const activeTrialUser = {
  ...expiredFreeUser,
  trialEndsAt: new Date("2026-12-01T00:00:00.000Z"),
  trialStatus: "active" as const,
};

test("A: trial active → effective Pro and paid automation allowed", () => {
  const now = new Date("2026-08-18T00:00:00.000Z");
  assert.equal(isProAiTrialActive(activeTrialUser, now), true);
  assert.equal(getEffectivePlanForUser(activeTrialUser, now), "pro");
  assert.equal(PLAN_LIMITS.pro.workflowsEnabled, true);
  assert.equal(PLAN_LIMITS.pro.chatbotEnabled, true);
  assert.equal(paidAutomationAllowedFromLimits(PLAN_LIMITS.pro), true);
  assert.equal(queuedJobEntitlementAction("workflow", true), "execute");
  assert.equal(queuedJobEntitlementAction("campaign", true), "execute");
});

test("B: trial expired → same workflow remains allowed to exist but must not execute", () => {
  const now = new Date("2026-08-18T00:00:00.000Z");
  assert.equal(getEffectivePlanForUser(expiredFreeUser, now), "free");
  assert.equal(PLAN_LIMITS.free.workflowsEnabled, false);
  assert.equal(paidAutomationAllowedFromLimits(PLAN_LIMITS.free), false);
  assert.equal(queuedJobEntitlementAction("workflow", false), "skip_terminal");
  const engine = read("server/workflowEngine.ts");
  assert.ok(engine.includes("if (!limits?.workflowsEnabled)"));
  assert.ok(engine.includes("entitlement_blocked"));
  assert.ok(!engine.includes("deleteWorkflow("));
});

test("C/D: campaign and drip due after expiry defer without sending or deleting", () => {
  assert.equal(queuedJobEntitlementAction("campaign", false), "defer_keep_active");
  assert.equal(queuedJobEntitlementAction("drip", false), "defer_keep_active");
  const campaign = read("server/campaignExecution.ts");
  const drips = read("server/notifications.ts");
  assert.ok(campaign.includes("resolveExecutionEntitlement"));
  assert.ok(campaign.includes("nextEntitlementDeferAt"));
  assert.ok(!campaign.includes("deleteCampaignEnrollment"));
  assert.ok(drips.includes("resolveExecutionEntitlement"));
  assert.ok(drips.includes("nextEntitlementDeferAt"));
  assert.match(drips, /feature:\s*"drip"/);
  assert.match(drips, /nextSendAt:\s*nextEntitlementDeferAt\(\)/);
});

test("E: chatbot flow stored; execution gated by chatbotEnabled", () => {
  assert.equal(chatbotExecutionAllowedFromLimits(PLAN_LIMITS.free), false);
  assert.equal(chatbotExecutionAllowedFromLimits(PLAN_LIMITS.pro), true);
  const bot = read("server/chatbotEngine.ts");
  assert.ok(bot.includes("chatbotAllowed"));
  assert.ok(bot.includes("ENTITLEMENT_BLOCKED_REASON"));
  assert.ok(!bot.includes("deleteChatbotFlow"));
});

test("F: flow / timer / no-reply jobs skip-terminal on Free (no send, no delete)", () => {
  assert.equal(queuedJobEntitlementAction("flow_job", false), "skip_terminal");
  assert.equal(queuedJobEntitlementAction("no_reply_job", false), "skip_terminal");
  assert.equal(queuedJobEntitlementAction("timer_job", false), "skip_terminal");
  const worker = read("server/flowJobWorker.ts");
  const nr = read("server/automationNoReply.ts");
  const timers = read("server/automationTimerHandlers.ts");
  assert.ok(worker.includes('feature: "flow_job"'));
  assert.ok(worker.includes("markFlowJobSkipped"));
  assert.ok(nr.includes('feature: "no_reply_job"'));
  assert.ok(nr.includes("markNoReplyJobSkipped"));
  assert.ok(timers.includes('feature: "timer_job"'));
  assert.ok(timers.includes("markAutomationTimerJobSkipped"));
});

test("G: prospect automated outreach pauses queue and keeps queued items", () => {
  assert.equal(queuedJobEntitlementAction("prospect_outreach", false), "pause_queue_keep_items");
  const svc = read("server/prospectImport/prospectOutreachQueueService.ts");
  assert.ok(svc.includes('feature: "prospect_outreach"'));
  assert.ok(svc.includes("pauseQueue"));
  assert.ok(svc.includes("nextQueueItemAfterInfraPause"));
  assert.ok(!svc.includes("DELETE FROM prospect_outreach_queue_items"));
});

test("H: upgrade again → saved config is executable; deferred campaign does not blast backlog", () => {
  assert.equal(queuedJobEntitlementAction("campaign", true), "execute");
  assert.equal(queuedJobEntitlementAction("prospect_outreach", true), "execute");
  const defer = nextEntitlementDeferAt(new Date("2026-08-18T12:00:00.000Z"));
  assert.equal(defer.getTime() - Date.parse("2026-08-18T12:00:00.000Z"), ENTITLEMENT_SKIP_DEFER_MS);
  const campaign = read("server/campaignExecution.ts");
  assert.ok(campaign.includes("currentStepIndex") === true);
  assert.match(campaign, /nextRunAt: nextEntitlementDeferAt\(\)/);
});

test("I: trial expiry sync does not delete workflows, campaigns, jobs, chatbot, team, channels, AI Brain", () => {
  const sync = read("server/trialEntitlements.ts");
  assert.ok(sync.includes("trialStatus: \"expired\""));
  assert.ok(!sync.includes("deleteWorkflow"));
  assert.ok(!sync.includes("deleteTeamMember"));
  assert.ok(!sync.includes("deleteRegisteredPhone"));
  assert.ok(!sync.includes("deleteChatbotFlow"));
  assert.ok(!sync.includes("aiBusinessKnowledge"));
});

test("J: Free conversation allowance uses UTC month when Stripe period is missing", () => {
  const now = new Date("2026-08-18T15:00:00.000Z");
  const free = resolveUsagePeriodFromDates(null, null, now);
  assert.equal(free.source, "utc_month");
  assert.equal(free.periodStart.toISOString(), startOfUtcMonth(now).toISOString());
  assert.equal(free.periodEnd.toISOString(), startOfNextUtcMonth(now).toISOString());

  const billed = resolveUsagePeriodFromDates(
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-09-01T00:00:00.000Z"),
    now,
  );
  assert.equal(billed.source, "billing_period");

  const rolled = nextConversationUsageAfterPeriodCheck({
    storedPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
    canonicalPeriodStart: startOfUtcMonth(now),
    conversationsUsed: 50,
    conversationsLimit: 50,
  });
  assert.equal(rolled.resetCounter, true);
  assert.equal(rolled.conversationsUsed, 0);
});

test("K: trial usage ≥50 does not permanently lock Free (no Stripe currentPeriodEnd)", () => {
  const now = new Date("2026-08-18T15:00:00.000Z");
  const firstStampOverLimit = nextConversationUsageAfterPeriodCheck({
    storedPeriodStart: null,
    canonicalPeriodStart: startOfUtcMonth(now),
    conversationsUsed: 80,
    conversationsLimit: 50,
  });
  assert.equal(firstStampOverLimit.resetCounter, true);
  assert.equal(firstStampOverLimit.conversationsUsed, 0);

  const expiry = trialExpiryConversationUsageReset(now);
  assert.equal(expiry.monthlyConversations, 0);
  assert.equal(expiry.conversationUsagePeriodStart.toISOString(), startOfUtcMonth(now).toISOString());

  const sync = read("server/trialEntitlements.ts");
  assert.ok(sync.includes("trialExpiryConversationUsageReset"));
  const sub = read("server/subscriptionService.ts");
  assert.ok(sub.includes("nextConversationUsageAfterPeriodCheck"));
});

test("L: AI Brain access is gated; knowledge rows are not deleted on expiry", () => {
  const now = new Date("2026-08-18T00:00:00.000Z");
  assert.equal(isProAiTrialActive(expiredFreeUser, now), false);
  const routes = read("server/routes.ts");
  assert.ok(routes.includes("effectiveHasAIBrain"));
  assert.ok(routes.includes("AI_BRAIN_REQUIRED"));
  const sync = read("server/trialEntitlements.ts");
  assert.ok(!sync.includes("deleteAiBusinessKnowledge"));
  assert.ok(!sync.includes("ai_business_knowledge"));
});

test("team seats: owner is the retained Free seat; memberships are not deleted", () => {
  assert.equal(FREE_PLAN_TEAM_SEAT_POLICY.retainedSeat, "workspace_owner");
  assert.equal(FREE_PLAN_TEAM_SEAT_POLICY.extraMembers, "retain_membership_do_not_delete");
  const teamInvite = read("server/routes.ts");
  assert.ok(teamInvite.includes("getTeamMemberCount"));
  assert.ok(teamInvite.includes("limits.maxUsers"));
  const sync = read("server/trialEntitlements.ts");
  assert.ok(!sync.includes("deleteTeamMember"));
});

test("extra WhatsApp: primary stays active; extras are outbound-inactive on Free; not disconnected", () => {
  assert.equal(isPrimaryWhatsAppNumber("+15550010001", "whatsapp:+15550010001"), true);
  assert.equal(
    extraWhatsAppOutboundAllowed({ maxWhatsappNumbers: 1, isPrimaryNumber: false }),
    false,
  );
  assert.equal(
    extraWhatsAppOutboundAllowed({ maxWhatsappNumbers: 5, isPrimaryNumber: false }),
    true,
  );
  assert.equal(countDistinctWhatsAppNumbers("+15550010001", ["+15550010001", "+15550010002"]), 2);
  const adapter = read("server/channelAdapters.ts");
  assert.ok(adapter.includes("extraWhatsAppOutboundAllowed"));
  const phones = read("server/routes.ts");
  assert.ok(phones.includes("countDistinctWhatsAppNumbers"));
  const sync = read("server/trialEntitlements.ts");
  assert.ok(!sync.includes("deleteRegisteredPhone"));
});

describe("runtime execution gates", { concurrency: false }, () => {
test("runtime: campaign due on Free defers and does not send", async () => {
  const origLimits = subscriptionService.getUserLimits.bind(subscriptionService);
  const origGet = storage.getCampaignEnrollmentById.bind(storage);
  const origUpdate = storage.updateCampaignEnrollment.bind(storage);
  const origCampaign = storage.getPresetCampaignForUser.bind(storage);
  let sent = false;
  let patch: Record<string, unknown> | null = null;
  (subscriptionService as { getUserLimits: typeof subscriptionService.getUserLimits }).getUserLimits = async () =>
    ({ workflowsEnabled: false, chatbotEnabled: false, followUpsEnabled: false, maxWhatsappNumbers: 1, plan: "free" }) as never;
  storage.getCampaignEnrollmentById = async () =>
    ({
      id: "enroll-1",
      userId: "user-1",
      campaignId: "camp-1",
      contactId: "contact-1",
      status: "active",
      currentStepIndex: 0,
      nextRunAt: new Date("2026-08-18T00:00:00.000Z"),
    }) as never;
  storage.updateCampaignEnrollment = async (_id, updates) => {
    patch = updates as Record<string, unknown>;
    return { id: "enroll-1", ...(updates as object) } as never;
  };
  storage.getPresetCampaignForUser = async () => {
    sent = true;
    return undefined;
  };
  try {
    await processCampaignEnrollmentStep("enroll-1");
    assert.equal(sent, false);
    assert.ok(patch && patch.nextRunAt instanceof Date);
    assert.equal(patch.status, undefined);
  } finally {
    subscriptionService.getUserLimits = origLimits;
    storage.getCampaignEnrollmentById = origGet;
    storage.updateCampaignEnrollment = origUpdate;
    storage.getPresetCampaignForUser = origCampaign;
  }
});

test("runtime: workflow executes when entitled and is blocked on Free without deleting", async () => {
  const origLimits = subscriptionService.getUserLimits.bind(subscriptionService);
  const origInc = storage.incrementWorkflowExecution.bind(storage);
  const origLog = storage.logWorkflowExecution.bind(storage);
  let executed = 0;
  storage.incrementWorkflowExecution = async () => {
    executed += 1;
  };
  storage.logWorkflowExecution = async (row) => row as never;
  const wf = {
    id: "wf-1",
    userId: "user-1",
    name: "Saved sequence",
    actions: [],
    triggerConditions: {},
    description: null,
  };
  try {
    (subscriptionService as { getUserLimits: typeof subscriptionService.getUserLimits }).getUserLimits = async () =>
      ({ workflowsEnabled: true, chatbotEnabled: true, plan: "pro" }) as never;
    const ok = await executeWorkflowActions(wf as never, null, { trigger: "test" });
    assert.equal(ok.success, true);
    assert.equal(executed, 1);

    (subscriptionService as { getUserLimits: typeof subscriptionService.getUserLimits }).getUserLimits = async () =>
      ({ workflowsEnabled: false, chatbotEnabled: false, plan: "free" }) as never;
    const blocked = await executeWorkflowActions(wf as never, null, { trigger: "test" });
    assert.equal(blocked.success, false);
    assert.equal(blocked.blockedReason, "entitlement_blocked");
    assert.equal(executed, 1);
  } finally {
    subscriptionService.getUserLimits = origLimits;
    storage.incrementWorkflowExecution = origInc;
    storage.logWorkflowExecution = origLog;
  }
});

test("runtime: chatbot inbound does not fire on Free", async () => {
  const origLimits = subscriptionService.getUserLimits.bind(subscriptionService);
  (subscriptionService as { getUserLimits: typeof subscriptionService.getUserLimits }).getUserLimits = async () =>
    ({ workflowsEnabled: false, chatbotEnabled: false, plan: "free" }) as never;
  try {
    const arb = await evaluateChatbotInboundArbitration({
      userId: "user-1",
      contactId: "c1",
      conversationId: "conv-1",
      channel: "whatsapp",
      message: "hello there",
      isNewConversation: true,
    });
    assert.equal(arb.flowMatched, false);
    assert.equal(arb.reason, ENTITLEMENT_BLOCKED_REASON);
    await triggerChatbotFlows({
      userId: "user-1",
      contactId: "c1",
      conversationId: "conv-1",
      channel: "whatsapp",
      message: "hello there",
      isNewConversation: true,
    });
  } finally {
    subscriptionService.getUserLimits = origLimits;
  }
});

test("runtime: no-reply and timer jobs skip on Free without marking failed", async () => {
  const origLimits = subscriptionService.getUserLimits.bind(subscriptionService);
  const origNr = storage.markNoReplyJobSkipped.bind(storage);
  const origTimer = storage.markAutomationTimerJobSkipped.bind(storage);
  const origWf = storage.getWorkflow.bind(storage);
  let nrReason = "";
  let timerReason = "";
  (subscriptionService as { getUserLimits: typeof subscriptionService.getUserLimits }).getUserLimits = async () =>
    ({ workflowsEnabled: false, chatbotEnabled: false, plan: "free" }) as never;
  storage.markNoReplyJobSkipped = async (_id, reason) => {
    nrReason = reason;
  };
  storage.markAutomationTimerJobSkipped = async (_id, reason) => {
    timerReason = reason;
  };
  storage.getWorkflow = async () => {
    throw new Error("should not load workflow");
  };
  try {
    await processNoReplyJob({
      id: "nr-1",
      userId: "user-1",
      workflowId: "wf-1",
      contactId: "c1",
    } as never);
    await processAutomationTimerJob({
      id: "t-1",
      userId: "user-1",
      kind: "w2_qualification",
      payload: { userId: "user-1", contactId: "c1", text: "hi" },
    } as never);
    assert.equal(nrReason, ENTITLEMENT_BLOCKED_REASON);
    assert.equal(timerReason, ENTITLEMENT_BLOCKED_REASON);
  } finally {
    subscriptionService.getUserLimits = origLimits;
    storage.markNoReplyJobSkipped = origNr;
    storage.markAutomationTimerJobSkipped = origTimer;
    storage.getWorkflow = origWf;
  }
});
});

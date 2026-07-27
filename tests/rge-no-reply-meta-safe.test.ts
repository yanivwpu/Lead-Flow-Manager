/**
 * Meta-safe RGE no-reply: last_inbound timing, channel policy, job outcomes.
 * Run: npx tsx tests/rge-no-reply-meta-safe.test.ts
 */
import assert from "node:assert/strict";
import {
  computeNoReplySchedule,
  customerRepliedAfterSilenceAnchor,
  lastInboundIdempotencyKey,
  resolveNoReplyAnchorMode,
  resolveNoReplyDelayMs,
} from "../shared/noReplyAnchor";
import { evaluateAutomationChannelSendPolicy } from "../shared/automationChannelSendPolicy";
import { computeConversationReplyWindowStatus, WHATSAPP_FREE_FORM_BUFFER_MS } from "../shared/conversationReplyWindow";
import {
  RGE_NO_REPLY_ANCHOR,
  RGE_W4_DELAY_HOURS,
  RGE_W5_DELAY_HOURS,
  RGE_W6_DELAY_HOURS,
  noReplyStageConditionsAllow,
  rgeW4NoReplyConditions,
} from "../shared/rgeNoReplyWorkflows";
import { onInboundMessageForNoReplyTimers, scheduleNoReplyJobsAfterTeamOutbound } from "../server/automationNoReply";
import { storage } from "../server/storage";
import { subscriptionService } from "../server/subscriptionService";
import type { Workflow } from "@shared/schema";

function hoursFrom(base: Date, h: number): Date {
  return new Date(base.getTime() + h * 3_600_000);
}

// ─── Unit: anchor helpers ─────────────────────────────────────────────────────

assert.equal(resolveNoReplyAnchorMode({}), "last_outbound");
assert.equal(resolveNoReplyAnchorMode({ anchor: "last_inbound" }), "last_inbound");
assert.equal(resolveNoReplyDelayMs({ delayHours: 20 }), 20 * 3_600_000);

{
  const inbound = new Date("2026-07-27T09:00:00.000Z");
  const now = new Date("2026-07-27T09:01:00.000Z");
  const sched = computeNoReplySchedule({
    anchor: "last_inbound",
    delayMs: 20 * 3_600_000,
    lastIncomingAt: inbound,
    now,
  });
  assert.ok(sched);
  assert.equal(sched!.runAt.toISOString(), "2026-07-28T05:00:00.000Z");
  assert.equal(sched!.silenceAnchorAt.toISOString(), inbound.toISOString());
}

{
  const inbound = new Date("2026-07-27T09:00:00.000Z");
  const now = new Date("2026-07-27T09:01:00.000Z");
  const out = computeNoReplySchedule({
    anchor: "last_outbound",
    delayMs: 24 * 3_600_000,
    lastIncomingAt: inbound,
    now,
  });
  assert.ok(out);
  assert.equal(out!.runAt.toISOString(), "2026-07-28T09:01:00.000Z");
}

assert.equal(
  customerRepliedAfterSilenceAnchor(new Date("2026-07-27T10:30:00Z"), new Date("2026-07-27T09:00:00Z")),
  true,
);
assert.equal(
  customerRepliedAfterSilenceAnchor(new Date("2026-07-27T09:00:00Z"), new Date("2026-07-27T09:00:00Z")),
  false,
);

// ─── Unit: channel send policy ────────────────────────────────────────────────

{
  const now = new Date("2026-07-27T12:00:00Z");
  const open = evaluateAutomationChannelSendPolicy({
    channel: "whatsapp",
    windowExpiresAt: hoursFrom(now, 12),
    now,
  });
  assert.equal(open.decision, "free_form");

  const closed = evaluateAutomationChannelSendPolicy({
    channel: "whatsapp",
    windowExpiresAt: hoursFrom(now, -1),
    now,
  });
  assert.equal(closed.decision, "skip");
  assert.equal(closed.decision === "skip" && closed.reason, "meta_window_closed_template_required");

  const tpl = evaluateAutomationChannelSendPolicy({
    channel: "whatsapp",
    windowExpiresAt: hoursFrom(now, -1),
    now,
    whatsappTemplateName: "followup_reengage",
  });
  assert.equal(tpl.decision, "template");

  const email = evaluateAutomationChannelSendPolicy({
    channel: "email",
    windowExpiresAt: null,
    now,
  });
  assert.equal(email.decision, "free_form");

  const sms = evaluateAutomationChannelSendPolicy({
    channel: "sms",
    windowExpiresAt: hoursFrom(now, -48),
    now,
  });
  assert.equal(sms.decision, "free_form");

  // IG must not inherit WhatsApp's 1h buffer: free-form until windowExpiresAt.
  const igDeadline = hoursFrom(now, 0.5);
  const ig = computeConversationReplyWindowStatus({
    channel: "instagram",
    windowExpiresAt: igDeadline,
    now,
  });
  assert.equal(ig.freeFormActive, true);
  assert.equal(ig.effectiveFreeFormDeadline?.getTime(), igDeadline.getTime());

  const waNearEdge = computeConversationReplyWindowStatus({
    channel: "whatsapp",
    windowExpiresAt: hoursFrom(now, 0.5),
    now,
  });
  assert.equal(waNearEdge.freeFormActive, false);
  assert.ok(
    waNearEdge.effectiveFreeFormDeadline!.getTime() ===
      hoursFrom(now, 0.5).getTime() - WHATSAPP_FREE_FORM_BUFFER_MS,
  );
}

assert.equal(RGE_W4_DELAY_HOURS, 20);
assert.equal(RGE_W5_DELAY_HOURS, 72);
assert.equal(RGE_W6_DELAY_HOURS, 168);
assert.equal(RGE_NO_REPLY_ANCHOR, "last_inbound");
assert.equal(
  noReplyStageConditionsAllow(rgeW4NoReplyConditions(), { pipelineStage: "Closed" }),
  false,
);

// ─── Integration: schedule from inbound; outbound must not push timer ─────────

type FakeJob = {
  id: string;
  workflowId: string;
  contactId: string;
  status: string;
  runAt: Date;
  idempotencyKey: string;
  anchorOutboundAt: Date;
  snapshotLastInboundAt: Date | null;
  scheduledReason?: string | null;
};

const jobs = new Map<string, FakeJob>();
let lastIncomingAt = new Date("2026-07-27T09:00:00.000Z");

const w4: Workflow = {
  id: "wf-w4",
  userId: "user-1",
  name: "Re-engagement Follow-Up",
  description: null,
  isActive: true,
  triggerType: "no_reply",
  triggerConditions: {
    type: "no_reply",
    delayHours: 20,
    anchor: "last_inbound",
    templateId: "realtor-growth-engine",
    templateKey: "W4",
    rgeConditions: rgeW4NoReplyConditions(),
  },
  actions: [{ type: "send_message_template", templateKey: "followup_24h" }],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const w5: Workflow = {
  ...w4,
  id: "wf-w5",
  name: "No Response Follow-Up (3d)",
  triggerConditions: {
    type: "no_reply",
    delayHours: 72,
    anchor: "last_inbound",
    templateId: "realtor-growth-engine",
    templateKey: "W5",
    rgeConditions: [{ type: "stage_not_in", stages: ["Closed", "Unqualified"] }],
  },
  actions: [{ type: "send_message_template", templateKey: "followup_3d" }],
};

const originals = {
  getUserLimits: subscriptionService.getUserLimits.bind(subscriptionService),
  getContact: storage.getContact.bind(storage),
  cancelPending: storage.cancelPendingNoReplyJobsForContact.bind(storage),
  cancelPendingWorkflows: storage.cancelPendingNoReplyJobsForContactWorkflows.bind(storage),
  getActive: storage.getActiveWorkflowsByTrigger.bind(storage),
  create: storage.createNoReplyJob.bind(storage),
  getByKey: storage.getNoReplyJobByIdempotencyKey.bind(storage),
  requeue: storage.requeueNoReplyJob.bind(storage),
};

(subscriptionService as any).getUserLimits = async () => ({ workflowsEnabled: true });
(storage as any).getContact = async () => ({
  id: "contact-1",
  pipelineStage: "New Lead",
  lastIncomingAt,
});
(storage as any).cancelPendingNoReplyJobsForContact = async () => {
  let n = 0;
  for (const [k, j] of jobs) {
    if (j.contactId === "contact-1" && j.status === "pending") {
      j.status = "cancelled";
      jobs.set(k, j);
      n++;
    }
  }
  return n;
};
(storage as any).cancelPendingNoReplyJobsForContactWorkflows = async (
  contactId: string,
  workflowIds: string[],
) => {
  let n = 0;
  for (const [k, j] of jobs) {
    if (j.contactId === contactId && j.status === "pending" && workflowIds.includes(j.workflowId)) {
      j.status = "cancelled";
      jobs.set(k, j);
      n++;
    }
  }
  return n;
};
(storage as any).getActiveWorkflowsByTrigger = async () => [w4, w5];
(storage as any).getNoReplyJobByIdempotencyKey = async (key: string) => {
  for (const j of jobs.values()) {
    if (j.idempotencyKey === key) return j as any;
  }
  return undefined;
};
(storage as any).requeueNoReplyJob = async (id: string, patch: any) => {
  for (const [k, j] of jobs) {
    if (j.id === id) {
      const next = {
        ...j,
        status: "pending",
        runAt: patch.runAt,
        anchorOutboundAt: patch.anchorOutboundAt,
        snapshotLastInboundAt: patch.snapshotLastInboundAt,
        scheduledReason: patch.scheduledReason,
      };
      jobs.set(k, next);
      return next as any;
    }
  }
  return undefined;
};
(storage as any).createNoReplyJob = async (job: any) => {
  const row: FakeJob = {
    id: `nr_${jobs.size + 1}`,
    workflowId: job.workflowId,
    contactId: job.contactId,
    status: job.status,
    runAt: job.runAt,
    idempotencyKey: job.idempotencyKey,
    anchorOutboundAt: job.anchorOutboundAt,
    snapshotLastInboundAt: job.snapshotLastInboundAt,
    scheduledReason: job.scheduledReason,
  };
  jobs.set(row.id, row);
  return row as any;
};

try {
  await onInboundMessageForNoReplyTimers({
    userId: "user-1",
    contactId: "contact-1",
    conversationId: "conv-wa",
    channel: "whatsapp",
    reschedule: true,
  });

  const pendingAfterInbound = [...jobs.values()].filter((j) => j.status === "pending");
  assert.equal(pendingAfterInbound.length, 2, "W4+W5 scheduled on inbound");
  const w4Job = pendingAfterInbound.find((j) => j.workflowId === "wf-w4")!;
  assert.equal(w4Job.runAt.toISOString(), "2026-07-28T05:00:00.000Z");
  assert.equal(
    w4Job.idempotencyKey,
    lastInboundIdempotencyKey({
      workflowId: "wf-w4",
      contactId: "contact-1",
      silenceAnchorAt: lastIncomingAt,
    }),
  );

  // Team outbound shortly after must NOT push W4 later
  const runAtBeforeOutbound = w4Job.runAt.toISOString();
  await scheduleNoReplyJobsAfterTeamOutbound({
    userId: "user-1",
    contactId: "contact-1",
    conversationId: "conv-wa",
    channel: "whatsapp",
  });
  const w4AfterOut = [...jobs.values()].find((j) => j.workflowId === "wf-w4" && j.status === "pending")!;
  assert.equal(w4AfterOut.runAt.toISOString(), runAtBeforeOutbound);

  // Second inbound resets timer
  lastIncomingAt = new Date("2026-07-27T10:30:00.000Z");
  await onInboundMessageForNoReplyTimers({
    userId: "user-1",
    contactId: "contact-1",
    conversationId: "conv-wa",
    channel: "whatsapp",
    reschedule: true,
  });
  const w4Reset = [...jobs.values()].find((j) => j.workflowId === "wf-w4" && j.status === "pending")!;
  assert.equal(w4Reset.runAt.toISOString(), "2026-07-28T06:30:00.000Z");

  // Email channel still schedules (policy free_form at send time — scheduling unrestricted)
  jobs.clear();
  lastIncomingAt = new Date("2026-07-27T09:00:00.000Z");
  await onInboundMessageForNoReplyTimers({
    userId: "user-1",
    contactId: "contact-1",
    conversationId: "conv-email",
    channel: "email",
    reschedule: true,
  });
  assert.equal([...jobs.values()].filter((j) => j.status === "pending").length, 2);

  console.log("PASS rge-no-reply-meta-safe: timing, reset, outbound non-shift, channel policy");
} finally {
  (subscriptionService as any).getUserLimits = originals.getUserLimits;
  (storage as any).getContact = originals.getContact;
  (storage as any).cancelPendingNoReplyJobsForContact = originals.cancelPending;
  (storage as any).cancelPendingNoReplyJobsForContactWorkflows = originals.cancelPendingWorkflows;
  (storage as any).getActiveWorkflowsByTrigger = originals.getActive;
  (storage as any).createNoReplyJob = originals.create;
  (storage as any).getNoReplyJobByIdempotencyKey = originals.getByKey;
  (storage as any).requeueNoReplyJob = originals.requeue;
}

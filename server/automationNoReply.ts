import type { NoReplyJob, Workflow } from "@shared/schema";
import { noReplyStageConditionsAllow as evaluateNoReplyStageRules } from "@shared/rgeNoReplyWorkflows";
import {
  computeNoReplySchedule,
  customerRepliedAfterSilenceAnchor,
  lastInboundIdempotencyKey,
  resolveNoReplyAnchorMode,
  resolveNoReplyDelayMs,
  type NoReplyAnchorMode,
} from "@shared/noReplyAnchor";
import { storage } from "./storage";
import { subscriptionService } from "./subscriptionService";
import { executeWorkflowActions, type WorkflowSendOutcome } from "./workflowEngine";
import { resolveLegacyChatForContact } from "./automationEventDispatcher";
import { logEntitlementSkip, resolveExecutionEntitlement } from "./paidAutomationGate";
import { ENTITLEMENT_BLOCKED_REASON } from "@shared/paidAutomationEntitlements";

function combinedNoReplyConditionRows(
  tc: Record<string, unknown> | undefined,
): { type?: string; value?: string; stages?: string[] }[] {
  return Array.isArray(tc?.rgeConditions)
    ? (tc!.rgeConditions as { type?: string; value?: string; stages?: string[] }[])
    : [];
}

function noReplyStageConditionsAllow(
  workflow: Workflow,
  contact: { pipelineStage?: string | null },
): boolean {
  const tc = workflow.triggerConditions as { rgeConditions?: { type?: string; stages?: string[] }[] } | undefined;
  return evaluateNoReplyStageRules(tc?.rgeConditions, contact);
}

function noReplyWorkflowMatchesConversation(workflow: Workflow, conversationChannel: string): boolean {
  const tc = workflow.triggerConditions as Record<string, unknown> | undefined;
  const arr = combinedNoReplyConditionRows(tc);
  if (arr.length > 0) {
    const ch = arr.find((c) => c.type === "channel");
    if (ch?.value) {
      return ch.value === conversationChannel;
    }
  }
  const flatChannel = tc?.channel as string | undefined;
  if (flatChannel && flatChannel !== "any") {
    return flatChannel === conversationChannel;
  }
  return true;
}

function workflowAnchor(workflow: Workflow): NoReplyAnchorMode {
  return resolveNoReplyAnchorMode(workflow.triggerConditions as Record<string, unknown>);
}

function silenceAnchorFromJob(job: NoReplyJob, mode: NoReplyAnchorMode): Date {
  if (mode === "last_inbound") {
    return job.snapshotLastInboundAt ?? job.anchorOutboundAt;
  }
  return job.anchorOutboundAt;
}

function mapSendOutcomeToSkipReason(outcome: WorkflowSendOutcome | undefined): string | null {
  switch (outcome) {
    case "skipped_meta_window":
    case "template_required":
      return outcome === "template_required"
        ? "meta_window_closed_template_required"
        : "skipped_meta_window";
    case "skipped_customer_replied":
      return "customer_replied_after_anchor";
    case "skipped_stage":
      return "stage_filter_no_match";
    case "guard_skipped":
      return "automation_send_guard";
    default:
      return null;
  }
}

async function upsertLastInboundNoReplyJob(params: {
  userId: string;
  workflow: Workflow;
  contactId: string;
  conversationId: string;
  silenceAnchorAt: Date;
  runAt: Date;
  scheduledReason: string;
}): Promise<"created" | "requeued" | "exists" | "skipped_terminal"> {
  const { userId, workflow, contactId, conversationId, silenceAnchorAt, runAt, scheduledReason } =
    params;
  const idempotencyKey = lastInboundIdempotencyKey({
    workflowId: workflow.id,
    contactId,
    silenceAnchorAt,
  });
  const existing = await storage.getNoReplyJobByIdempotencyKey(idempotencyKey);
  if (existing) {
    if (existing.status === "pending" || existing.status === "running") {
      return "exists";
    }
    if (existing.status === "completed" || existing.status === "skipped") {
      return "skipped_terminal";
    }
    // cancelled | failed → requeue for this inbound silence period
    await storage.requeueNoReplyJob(existing.id, {
      runAt,
      conversationId,
      anchorOutboundAt: silenceAnchorAt,
      snapshotLastInboundAt: silenceAnchorAt,
      scheduledReason,
    });
    return "requeued";
  }

  try {
    await storage.createNoReplyJob({
      userId,
      workflowId: workflow.id,
      contactId,
      conversationId,
      chatId: null,
      runAt,
      status: "pending",
      idempotencyKey,
      anchorOutboundAt: silenceAnchorAt,
      snapshotLastInboundAt: silenceAnchorAt,
      scheduledReason,
      stuckRecoveries: 0,
      failCount: 0,
      maxFailRetries: 3,
    });
    return "created";
  } catch (e: any) {
    if (String(e?.message || "").includes("duplicate") || e?.code === "23505") {
      return "exists";
    }
    throw e;
  }
}

/**
 * Schedule last_inbound no-reply workflows from contact.lastIncomingAt.
 * Does not push the silence clock when the team replies.
 */
async function scheduleLastInboundNoReplyJobs(params: {
  userId: string;
  contactId: string;
  conversationId: string;
  channel: string;
  scheduledReason: string;
  workflows: Workflow[];
}): Promise<number> {
  const { userId, contactId, conversationId, channel, scheduledReason, workflows } = params;
  const contact = await storage.getContact(contactId);
  if (!contact?.lastIncomingAt) return 0;

  let scheduled = 0;
  for (const wf of workflows) {
    if (workflowAnchor(wf) !== "last_inbound") continue;
    if (!noReplyWorkflowMatchesConversation(wf, channel)) continue;
    if (!noReplyStageConditionsAllow(wf, contact)) continue;

    const delayMs = resolveNoReplyDelayMs(wf.triggerConditions as Record<string, unknown>);
    const computed = computeNoReplySchedule({
      anchor: "last_inbound",
      delayMs,
      lastIncomingAt: contact.lastIncomingAt,
    });
    if (!computed) continue;

    const result = await upsertLastInboundNoReplyJob({
      userId,
      workflow: wf,
      contactId,
      conversationId,
      silenceAnchorAt: computed.silenceAnchorAt,
      runAt: computed.runAt,
      scheduledReason,
    });
    if (result === "created" || result === "requeued") scheduled++;
  }
  return scheduled;
}

async function scheduleLastOutboundNoReplyJobs(params: {
  userId: string;
  contactId: string;
  conversationId: string;
  channel: string;
  workflows: Workflow[];
}): Promise<number> {
  const { userId, contactId, conversationId, channel, workflows } = params;
  const contact = await storage.getContact(contactId);
  if (!contact) return 0;

  const outboundWorkflows = workflows.filter((wf) => workflowAnchor(wf) === "last_outbound");
  if (outboundWorkflows.length === 0) return 0;

  await storage.cancelPendingNoReplyJobsForContactWorkflows(
    contactId,
    outboundWorkflows.map((w) => w.id),
  );

  const anchorOutboundAt = new Date();
  const snapshotLastInboundAt = contact.lastIncomingAt ?? null;
  let scheduled = 0;

  for (const wf of outboundWorkflows) {
    if (!noReplyWorkflowMatchesConversation(wf, channel)) continue;
    if (!noReplyStageConditionsAllow(wf, contact)) continue;

    const delayMs = resolveNoReplyDelayMs(wf.triggerConditions as Record<string, unknown>);
    const computed = computeNoReplySchedule({
      anchor: "last_outbound",
      delayMs,
      lastIncomingAt: contact.lastIncomingAt,
      now: anchorOutboundAt,
    });
    if (!computed) continue;

    const idempotencyKey = `nr:${wf.id}:${contactId}:out:${anchorOutboundAt.getTime()}:${scheduled}`;
    try {
      await storage.createNoReplyJob({
        userId,
        workflowId: wf.id,
        contactId,
        conversationId,
        chatId: null,
        runAt: computed.runAt,
        status: "pending",
        idempotencyKey,
        anchorOutboundAt: computed.silenceAnchorAt,
        snapshotLastInboundAt,
        scheduledReason: "team_outbound",
        stuckRecoveries: 0,
        failCount: 0,
        maxFailRetries: 3,
      });
      scheduled++;
    } catch (e: any) {
      if (!String(e?.message || "").includes("duplicate") && e?.code !== "23505") {
        console.warn("[NoReplySchedule] insert failed:", e?.message || e);
      }
    }
  }
  return scheduled;
}

/**
 * Cancel pending no-reply timers on inbound.
 * When `reschedule` is true (normal inbound), also schedule last_inbound nurture jobs.
 * Handoff paths should pass reschedule: false.
 */
export async function onInboundMessageForNoReplyTimers(params: {
  userId: string;
  contactId: string;
  conversationId: string;
  channel: string;
  /** Default true. Set false for handoff (cancel only). */
  reschedule?: boolean;
}): Promise<void> {
  const { userId, contactId, conversationId, channel, reschedule = true } = params;
  await storage.cancelPendingNoReplyJobsForContact(contactId);
  if (!reschedule) return;

  const limits = await subscriptionService.getUserLimits(userId);
  if (!limits?.workflowsEnabled) return;

  const workflows = await storage.getActiveWorkflowsByTrigger(userId, "no_reply");
  if (workflows.length === 0) return;

  const scheduled = await scheduleLastInboundNoReplyJobs({
    userId,
    contactId,
    conversationId,
    channel,
    scheduledReason: "customer_inbound",
    workflows,
  });

  if (scheduled > 0) {
    console.log(
      JSON.stringify({
        tag: "[NoReplyJobsScheduled]",
        event: "customer_inbound",
        userId,
        contactId,
        scheduled,
      }),
    );
  }
}

/**
 * After a successful team outbound:
 * - last_outbound workflows: cancel + reschedule from now
 * - last_inbound workflows: ensure jobs exist from contact.lastIncomingAt (do not push timer later)
 */
export async function scheduleNoReplyJobsAfterTeamOutbound(params: {
  userId: string;
  contactId: string;
  conversationId: string;
  channel: string;
}): Promise<void> {
  const { userId, contactId, conversationId, channel } = params;
  const limits = await subscriptionService.getUserLimits(userId);
  if (!limits?.workflowsEnabled) return;

  const contact = await storage.getContact(contactId);
  if (!contact) return;

  const workflows = await storage.getActiveWorkflowsByTrigger(userId, "no_reply");
  if (workflows.length === 0) return;

  const outboundScheduled = await scheduleLastOutboundNoReplyJobs({
    userId,
    contactId,
    conversationId,
    channel,
    workflows,
  });

  const inboundScheduled = await scheduleLastInboundNoReplyJobs({
    userId,
    contactId,
    conversationId,
    channel,
    scheduledReason: "team_outbound_ensure",
    workflows,
  });

  const scheduled = outboundScheduled + inboundScheduled;
  if (scheduled > 0) {
    console.log(
      JSON.stringify({
        tag: "[NoReplyJobsScheduled]",
        event: "team_outbound",
        userId,
        contactId,
        outboundScheduled,
        inboundScheduled,
        scheduled,
      }),
    );
  }
}

export async function processNoReplyJob(job: NoReplyJob): Promise<void> {
  const entitlement = await resolveExecutionEntitlement(job.userId);
  if (!entitlement.paidAutomationAllowed) {
    logEntitlementSkip({
      feature: "no_reply_job",
      userId: job.userId,
      jobId: job.id,
      extra: { workflowId: job.workflowId, action: "skip_terminal" },
    });
    await storage.markNoReplyJobSkipped(job.id, ENTITLEMENT_BLOCKED_REASON);
    return;
  }

  const wf = await storage.getWorkflow(job.workflowId);
  if (!wf || !wf.isActive) {
    await storage.markNoReplyJobSkipped(job.id, "workflow_missing_or_inactive");
    return;
  }

  const mode = workflowAnchor(wf);
  const silenceAnchorAt = silenceAnchorFromJob(job, mode);
  const templateKey = (wf.triggerConditions as { templateKey?: string } | undefined)?.templateKey;

  const contact = await storage.getContact(job.contactId);
  if (!contact) {
    await storage.markNoReplyJobSkipped(job.id, "contact_missing");
    return;
  }

  if (customerRepliedAfterSilenceAnchor(contact.lastIncomingAt, silenceAnchorAt)) {
    console.log(
      JSON.stringify({
        tag: "[NoReplyJob]",
        event: "skipped_reply",
        jobId: job.id,
        workflowKey: templateKey ?? null,
        decision: "skipped_reply",
        anchorInboundAt: silenceAnchorAt.toISOString(),
        lastIncomingAt: contact.lastIncomingAt?.toISOString() ?? null,
      }),
    );
    await storage.markNoReplyJobSkipped(job.id, "customer_replied_after_anchor");
    return;
  }

  if (!noReplyStageConditionsAllow(wf, contact)) {
    console.log(
      JSON.stringify({
        tag: "[NoReplyJob]",
        event: "skipped_stage",
        jobId: job.id,
        workflowKey: templateKey ?? null,
        decision: "skipped_stage",
        pipelineStage: contact.pipelineStage ?? null,
      }),
    );
    await storage.markNoReplyJobSkipped(job.id, "stage_filter_no_match");
    return;
  }

  const conversation = job.conversationId
    ? await storage.getConversation(job.conversationId)
    : undefined;
  const channel = conversation?.channel ?? null;

  const chat = await resolveLegacyChatForContact(contact, job.userId);
  const exec = await executeWorkflowActions(
    wf,
    chat,
    {
      trigger: "no_reply",
      jobId: job.id,
      workflowId: wf.id,
      noReplyAnchor: mode,
      silenceAnchorAt: silenceAnchorAt.toISOString(),
    },
    contact,
    job.conversationId ?? undefined,
  );

  const sendOutcome = exec.sendOutcome;
  const skipReason = mapSendOutcomeToSkipReason(sendOutcome);

  console.log(
    JSON.stringify({
      tag: "[NoReplyJob]",
      event: "execution_result",
      jobId: job.id,
      workflowKey: templateKey ?? null,
      channel,
      anchorMode: mode,
      anchorInboundAt:
        mode === "last_inbound" ? silenceAnchorAt.toISOString() : null,
      anchorOutboundAt:
        mode === "last_outbound" ? silenceAnchorAt.toISOString() : null,
      scheduledAt: job.runAt?.toISOString?.() ?? job.runAt,
      windowDecision: sendOutcome ?? (exec.success ? "sent" : "failed"),
      decision: sendOutcome ?? (exec.success ? "sent" : "failed_internal"),
      success: exec.success,
      blockedReason: exec.blockedReason ?? null,
    }),
  );

  if (skipReason) {
    await storage.markNoReplyJobSkipped(job.id, skipReason);
    return;
  }

  if (sendOutcome === "failed_provider" || sendOutcome === "failed_internal") {
    await storage.markNoReplyJobFailed(job.id, sendOutcome);
    return;
  }

  if (!exec.success) {
    await storage.markNoReplyJobFailed(job.id, exec.blockedReason || "workflow_execution_failed");
    return;
  }

  await storage.markNoReplyJobCompleted(job.id);
}

import type { NoReplyJob, Workflow } from "@shared/schema";
import { storage } from "./storage";
import { subscriptionService } from "./subscriptionService";
import { executeWorkflowActions } from "./workflowEngine";
import { resolveLegacyChatForContact } from "./automationEventDispatcher";

function combinedNoReplyConditionRows(tc: Record<string, unknown> | undefined): { type?: string; value?: string; stages?: string[] }[] {
  const a = Array.isArray(tc?.conditions) ? (tc!.conditions as { type?: string; value?: string; stages?: string[] }[]) : [];
  const b = Array.isArray(tc?.rgeConditions) ? (tc!.rgeConditions as { type?: string; value?: string; stages?: string[] }[]) : [];
  return [...a, ...b];
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

/** RGE seed `stage_in` / `stage_not_in` rows live under `triggerConditions.rgeConditions`. */
function noReplyStageConditionsAllow(workflow: Workflow, contact: { pipelineStage?: string | null }): boolean {
  const tc = workflow.triggerConditions as { rgeConditions?: { type?: string; stages?: string[] }[] } | undefined;
  const rules = tc?.rgeConditions;
  if (!rules?.length) return true;
  const stage = (contact.pipelineStage || "").trim();
  for (const rule of rules) {
    const t = (rule.type || "").trim();
    const stages = Array.isArray(rule.stages) ? rule.stages.map((s) => String(s).trim()) : [];
    if (t === "stage_in") {
      if (stages.length > 0 && !stages.includes(stage)) return false;
    } else if (t === "stage_not_in") {
      if (stages.length > 0 && stages.includes(stage)) return false;
    }
  }
  return true;
}

/** Cancel pending no-reply timers when the customer sends an inbound message. */
export async function onInboundMessageForNoReplyTimers(contactId: string): Promise<void> {
  await storage.cancelPendingNoReplyJobsForContact(contactId);
}

/**
 * After a successful team outbound, (re)schedule durable no-reply workflow checks.
 * Prior pending jobs for the contact are cancelled first.
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

  await storage.cancelPendingNoReplyJobsForContact(contactId);

  const workflows = await storage.getActiveWorkflowsByTrigger(userId, "no_reply");
  if (workflows.length === 0) return;

  const anchorOutboundAt = new Date();
  const snapshotLastInboundAt = contact.lastIncomingAt ?? null;
  let scheduled = 0;

  for (const wf of workflows) {
    if (!noReplyWorkflowMatchesConversation(wf, channel)) continue;
    if (!noReplyStageConditionsAllow(wf, contact)) continue;
    const tc = wf.triggerConditions as {
      durationMinutes?: number;
      durationHours?: number;
      /** RGE seed workflows use `delayHours` on `no_reply` triggers (merged into triggerConditions). */
      delayHours?: number;
    };
    const mins = Number(tc.durationMinutes);
    const hours = Number(tc.durationHours);
    const delayHoursFromSeed = Number(tc.delayHours);
    const delayMs =
      Number.isFinite(mins) && mins > 0
        ? mins * 60_000
        : Number.isFinite(hours) && hours > 0
          ? hours * 3_600_000
          : Number.isFinite(delayHoursFromSeed) && delayHoursFromSeed > 0
            ? delayHoursFromSeed * 3_600_000
            : 24 * 3_600_000;
    const runAt = new Date(Date.now() + delayMs);
    const idempotencyKey = `nr:${wf.id}:${contactId}:${anchorOutboundAt.getTime()}:${scheduled}`;
    try {
      await storage.createNoReplyJob({
        userId,
        workflowId: wf.id,
        contactId,
        conversationId,
        chatId: null,
        runAt,
        status: "pending",
        idempotencyKey,
        anchorOutboundAt,
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

  if (scheduled > 0) {
    console.log(
      JSON.stringify({
        tag: "[NoReplyJobsScheduled]",
        userId,
        contactId,
        scheduled,
      })
    );
  }
}

export async function processNoReplyJob(job: NoReplyJob): Promise<void> {
  const wf = await storage.getWorkflow(job.workflowId);
  if (!wf || !wf.isActive) {
    await storage.markNoReplyJobSkipped(job.id, "workflow_missing_or_inactive");
    return;
  }
  const contact = await storage.getContact(job.contactId);
  if (!contact) {
    await storage.markNoReplyJobSkipped(job.id, "contact_missing");
    return;
  }
  if (contact.lastIncomingAt && contact.lastIncomingAt.getTime() > job.anchorOutboundAt.getTime()) {
    await storage.markNoReplyJobSkipped(job.id, "customer_replied_after_anchor");
    return;
  }
  if (!noReplyStageConditionsAllow(wf, contact)) {
    await storage.markNoReplyJobSkipped(job.id, "stage_filter_no_match");
    return;
  }
  const chat = await resolveLegacyChatForContact(contact, job.userId);
  await executeWorkflowActions(
    wf,
    chat,
    { trigger: "no_reply", jobId: job.id, workflowId: wf.id },
    contact,
    job.conversationId ?? undefined
  );
  await storage.markNoReplyJobCompleted(job.id);
}

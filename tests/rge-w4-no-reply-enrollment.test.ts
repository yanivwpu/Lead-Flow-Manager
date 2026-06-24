/**
 * RGE W4: widen no-reply enrollment from stage_in to stage_not_in.
 * Run: npx tsx tests/rge-w4-no-reply-enrollment.test.ts
 */
import assert from "node:assert/strict";
import {
  RGE_W4_EXCLUDED_PIPELINE_STAGES,
  noReplyStageConditionsAllow,
  rgeW4NoReplyConditions,
} from "../shared/rgeNoReplyWorkflows";
import { scheduleNoReplyJobsAfterTeamOutbound } from "../server/automationNoReply";
import { storage } from "../server/storage";
import { subscriptionService } from "../server/subscriptionService";
import type { Workflow } from "@shared/schema";

const w4Conditions = rgeW4NoReplyConditions();
const w4Workflow: Workflow = {
  id: "wf-w4",
  userId: "user-1",
  name: "No Response Follow-Up (24h)",
  description: null,
  isActive: true,
  triggerType: "no_reply",
  triggerConditions: {
    type: "no_reply",
    delayHours: 24,
    templateId: "realtor-growth-engine",
    templateKey: "W4",
    rgeConditions: w4Conditions,
  },
  actions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

assert.deepEqual(w4Conditions, [
  { type: "stage_not_in", stages: [...RGE_W4_EXCLUDED_PIPELINE_STAGES] },
]);

for (const stage of [
  "Proposal",
  "Open",
  "New Lead",
  "Responded",
  "Qualified (Hot)",
  "Qualified (Warm)",
  "Appointment Set",
  "Nurture / Follow-Up",
  "Under Contract",
]) {
  assert.equal(
    noReplyStageConditionsAllow(w4Conditions, { pipelineStage: stage }),
    true,
    `W4 should allow stage: ${stage}`,
  );
}

for (const stage of RGE_W4_EXCLUDED_PIPELINE_STAGES) {
  assert.equal(
    noReplyStageConditionsAllow(w4Conditions, { pipelineStage: stage }),
    false,
    `W4 should block stage: ${stage}`,
  );
}

type FakeNoReplyJob = {
  workflowId: string;
  contactId: string;
  status: string;
};

const originalGetUserLimits = subscriptionService.getUserLimits.bind(subscriptionService);
const originalGetContact = storage.getContact.bind(storage);
const originalCancelPending = storage.cancelPendingNoReplyJobsForContact.bind(storage);
const originalGetActiveWorkflows = storage.getActiveWorkflowsByTrigger.bind(storage);
const originalCreateNoReplyJob = storage.createNoReplyJob.bind(storage);

const createdJobs: FakeNoReplyJob[] = [];

(subscriptionService as any).getUserLimits = async () => ({ workflowsEnabled: true });
(storage as any).getContact = async () => ({
  id: "contact-proposal",
  pipelineStage: "Proposal",
  lastIncomingAt: new Date("2026-06-18T00:12:10Z"),
});
(storage as any).cancelPendingNoReplyJobsForContact = async () => 0;
(storage as any).getActiveWorkflowsByTrigger = async () => [w4Workflow];
(storage as any).createNoReplyJob = async (job: { workflowId: string; contactId: string; status: string }) => {
  createdJobs.push({
    workflowId: job.workflowId,
    contactId: job.contactId,
    status: job.status,
  });
  return { ...job, id: `nr_${createdJobs.length}`, createdAt: new Date() };
};

try {
  await scheduleNoReplyJobsAfterTeamOutbound({
    userId: "user-1",
    contactId: "contact-proposal",
    conversationId: "conv-1",
    channel: "facebook",
  });

  assert.equal(createdJobs.length, 1, "Proposal-stage contact should schedule one W4 no-reply job");
  assert.equal(createdJobs[0]!.workflowId, w4Workflow.id);
  assert.equal(createdJobs[0]!.status, "pending");

  console.log("PASS rge-w4-no-reply-enrollment: Proposal and other active stages enroll W4; terminal stages blocked.");
} finally {
  (subscriptionService as any).getUserLimits = originalGetUserLimits;
  (storage as any).getContact = originalGetContact;
  (storage as any).cancelPendingNoReplyJobsForContact = originalCancelPending;
  (storage as any).getActiveWorkflowsByTrigger = originalGetActiveWorkflows;
  (storage as any).createNoReplyJob = originalCreateNoReplyJob;
}

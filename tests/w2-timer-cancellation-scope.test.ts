import assert from "node:assert/strict";
import { scheduleW2FollowUpTimers } from "../server/automationTimerHandlers";
import { storage } from "../server/storage";

type FakeTimerJob = {
  id: string;
  userId: string;
  contactId: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
};

const originalCreateAutomationTimerJob = storage.createAutomationTimerJob.bind(storage);
const originalCancelPendingAutomationTimerJobsForUserContactKinds =
  storage.cancelPendingAutomationTimerJobsForUserContactKinds.bind(storage);

const jobs: FakeTimerJob[] = [];
const cancellationCalls: Array<{ userId: string; contactId: string; kinds: string[] }> = [];

(storage as any).createAutomationTimerJob = async (job: any) => {
  const row: FakeTimerJob = {
    id: `job_${jobs.length + 1}`,
    userId: job.userId,
    contactId: String(job.payload?.contactId || ""),
    kind: job.kind,
    status: job.status,
    payload: job.payload || {},
  };
  jobs.push(row);
  return { ...job, id: row.id, createdAt: new Date() };
};

(storage as any).cancelPendingAutomationTimerJobsForUserContactKinds = async (
  userId: string,
  contactId: string,
  kinds: string[]
) => {
  cancellationCalls.push({ userId, contactId, kinds });
  let cancelled = 0;
  for (const job of jobs) {
    if (
      job.userId === userId &&
      job.contactId === contactId &&
      job.status === "pending" &&
      kinds.includes(job.kind)
    ) {
      job.status = "cancelled";
      cancelled++;
    }
  }
  return cancelled;
};

try {
  const userId = "user_scope";
  const contactA = "contact_a";
  const contactB = "contact_b";

  await scheduleW2FollowUpTimers({
    userId,
    contactId: contactA,
    qualificationText: "Question for A",
    routingText: "Routing for A",
    snapshotInboundAt: new Date("2026-05-16T12:00:00Z"),
  });

  await scheduleW2FollowUpTimers({
    userId,
    contactId: contactB,
    qualificationText: "Question for B",
    routingText: "Routing for B",
    snapshotInboundAt: new Date("2026-05-16T12:01:00Z"),
  });

  assert.equal(
    jobs.filter((job) => job.contactId === contactA && job.status === "pending").length,
    2,
    "Scheduling W2 timers for contact B must not cancel contact A timers"
  );

  await scheduleW2FollowUpTimers({
    userId,
    contactId: contactA,
    qualificationText: "Replacement question for A",
    routingText: "Replacement routing for A",
    snapshotInboundAt: new Date("2026-05-16T12:02:00Z"),
  });

  assert.deepEqual(
    cancellationCalls.map((call) => ({ userId: call.userId, contactId: call.contactId, kinds: call.kinds })),
    [
      { userId, contactId: contactA, kinds: ["w2_qualification", "w2_routing"] },
      { userId, contactId: contactB, kinds: ["w2_qualification", "w2_routing"] },
      { userId, contactId: contactA, kinds: ["w2_qualification", "w2_routing"] },
    ],
    "W2 cancellation must always include userId, contactId, and workflow kinds"
  );

  assert.equal(
    jobs.filter((job) => job.contactId === contactA && job.status === "pending").length,
    2,
    "Rescheduling contact A should leave only the replacement A timers pending"
  );
  assert.equal(
    jobs.filter((job) => job.contactId === contactA && job.status === "cancelled").length,
    2,
    "Rescheduling contact A should cancel the previous A timers"
  );
  assert.equal(
    jobs.filter((job) => job.contactId === contactB && job.status === "pending").length,
    2,
    "Rescheduling contact A must not cancel contact B timers"
  );

  console.log("PASS W2 timer cancellation is scoped by userId, contactId, and workflow kind.");
} finally {
  (storage as any).createAutomationTimerJob = originalCreateAutomationTimerJob;
  (storage as any).cancelPendingAutomationTimerJobsForUserContactKinds =
    originalCancelPendingAutomationTimerJobsForUserContactKinds;
}

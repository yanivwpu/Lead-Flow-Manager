import type { AutomationTimerJob } from "@shared/schema";
import { storage } from "./storage";
import { sendUserWhatsAppMessage } from "./userTwilio";
import { sendMetaWhatsAppMessage } from "./userMeta";
import { withAutomationSendDedup } from "./automationSendGuard";

type W2QualPayload = {
  userId: string;
  contactId: string;
  text: string;
  twilioDigits?: string;
  metaFrom?: string;
};

type W2RoutePayload = {
  userId: string;
  contactId: string;
  text: string;
  twilioDigits?: string;
  metaFrom?: string;
};

export async function scheduleW2FollowUpTimers(params: {
  userId: string;
  contactId: string;
  qualificationText: string | null;
  routingText: string | null;
  twilioDigits?: string;
  metaFrom?: string;
  snapshotInboundAt: Date | null;
}): Promise<void> {
  const { userId, contactId, qualificationText, routingText, twilioDigits, metaFrom, snapshotInboundAt } = params;
  await storage.cancelPendingAutomationTimerJobsForUserKinds(userId, ["w2_qualification", "w2_routing"]);

  const baseKey = `${userId}:${contactId}:${Date.now()}`;

  if (qualificationText?.trim()) {
    const runAt = new Date(Date.now() + 3_000);
    const dedupKey = `w2q:${baseKey}`;
    await storage.createAutomationTimerJob({
      userId,
      kind: "w2_qualification",
      runAt,
      status: "pending",
      dedupKey,
      payload: {
        userId,
        contactId,
        text: qualificationText,
        twilioDigits,
        metaFrom,
      } satisfies W2QualPayload,
      snapshotLastInboundAt: snapshotInboundAt ?? undefined,
      stuckRecoveries: 0,
      failCount: 0,
      maxFailRetries: 3,
    });
  }

  if (routingText?.trim()) {
    const delayMs = qualificationText?.trim() ? 6_000 : 3_500;
    const runAt = new Date(Date.now() + delayMs);
    const dedupKey = `w2r:${baseKey}`;
    await storage.createAutomationTimerJob({
      userId,
      kind: "w2_routing",
      runAt,
      status: "pending",
      dedupKey,
      payload: {
        userId,
        contactId,
        text: routingText,
        twilioDigits,
        metaFrom,
      } satisfies W2RoutePayload,
      snapshotLastInboundAt: snapshotInboundAt ?? undefined,
      stuckRecoveries: 0,
      failCount: 0,
      maxFailRetries: 3,
    });
  }
}

async function sendW2Outbound(payload: W2QualPayload | W2RoutePayload, dedupKind: string): Promise<void> {
  const dedupKey = `${dedupKind}:${payload.userId}:${payload.contactId}:${payload.text.slice(0, 120)}`;
  const res = await withAutomationSendDedup(dedupKey, payload.userId, payload.contactId, async () => {
    if (payload.metaFrom) {
      await sendMetaWhatsAppMessage(payload.userId, payload.metaFrom, payload.text);
    } else if (payload.twilioDigits) {
      await sendUserWhatsAppMessage(payload.userId, payload.twilioDigits, payload.text);
    } else {
      throw new Error("no_send_target");
    }
  });
  if (!res.ok) {
    console.log(JSON.stringify({ tag: "[W2Timer]", skipped: true, dedupKey }));
  }
}

export async function processAutomationTimerJob(job: AutomationTimerJob): Promise<void> {
  const contact = await storage.getContact((job.payload as any).contactId as string);
  if (!contact) {
    await storage.markAutomationTimerJobSkipped(job.id, "contact_missing");
    return;
  }
  if (
    job.snapshotLastInboundAt &&
    contact.lastIncomingAt &&
    contact.lastIncomingAt.getTime() > job.snapshotLastInboundAt.getTime()
  ) {
    await storage.markAutomationTimerJobSkipped(job.id, "stop_on_reply");
    return;
  }

  if (job.kind === "w2_qualification") {
    await sendW2Outbound(job.payload as W2QualPayload, "w2_qual");
    await storage.markAutomationTimerJobCompleted(job.id);
    return;
  }
  if (job.kind === "w2_routing") {
    await sendW2Outbound(job.payload as W2RoutePayload, "w2_route");
    await storage.markAutomationTimerJobCompleted(job.id);
    return;
  }

  await storage.markAutomationTimerJobSkipped(job.id, `unknown_kind:${job.kind}`);
}

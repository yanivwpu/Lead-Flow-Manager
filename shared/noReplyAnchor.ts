/**
 * No-reply workflow timing: reusable anchor modes for CRM automation.
 * Default remains last_outbound so non-migrated workflows keep prior behavior.
 */

export type NoReplyAnchorMode = "last_outbound" | "last_inbound";

export type NoReplyTriggerConditions = {
  type?: string;
  anchor?: string;
  durationMinutes?: number;
  durationHours?: number;
  delayHours?: number;
  templateKey?: string;
  templateId?: string;
  channel?: string;
  rgeConditions?: unknown[];
};

export function resolveNoReplyAnchorMode(
  tc: NoReplyTriggerConditions | Record<string, unknown> | null | undefined,
): NoReplyAnchorMode {
  const raw = String((tc as NoReplyTriggerConditions | undefined)?.anchor || "")
    .trim()
    .toLowerCase();
  if (raw === "last_inbound" || raw === "inbound") return "last_inbound";
  return "last_outbound";
}

/** Delay in ms from triggerConditions; default 24h when unset/invalid. */
export function resolveNoReplyDelayMs(
  tc: NoReplyTriggerConditions | Record<string, unknown> | null | undefined,
): number {
  const c = tc as NoReplyTriggerConditions | undefined;
  const mins = Number(c?.durationMinutes);
  const hours = Number(c?.durationHours);
  const delayHoursFromSeed = Number(c?.delayHours);
  if (Number.isFinite(mins) && mins > 0) return mins * 60_000;
  if (Number.isFinite(hours) && hours > 0) return hours * 3_600_000;
  if (Number.isFinite(delayHoursFromSeed) && delayHoursFromSeed > 0) {
    return delayHoursFromSeed * 3_600_000;
  }
  return 24 * 3_600_000;
}

/**
 * Compute runAt + silence anchor for a no-reply job.
 * last_inbound: requires lastIncomingAt; runAt = inbound + delay (clamped to now if overdue).
 * last_outbound: silence anchor / runAt from `now` (outbound moment).
 */
export function computeNoReplySchedule(params: {
  anchor: NoReplyAnchorMode;
  delayMs: number;
  lastIncomingAt: Date | null | undefined;
  now?: Date;
}): { runAt: Date; silenceAnchorAt: Date } | null {
  const now = params.now ?? new Date();
  const delayMs = Math.max(0, params.delayMs);

  if (params.anchor === "last_inbound") {
    const inbound = params.lastIncomingAt;
    if (!inbound || Number.isNaN(new Date(inbound).getTime())) return null;
    const silenceAnchorAt = new Date(inbound);
    const rawRun = new Date(silenceAnchorAt.getTime() + delayMs);
    const runAt = rawRun.getTime() < now.getTime() ? new Date(now) : rawRun;
    return { runAt, silenceAnchorAt };
  }

  const silenceAnchorAt = new Date(now);
  return {
    runAt: new Date(now.getTime() + delayMs),
    silenceAnchorAt,
  };
}

/** True when contact inbound is newer than the job's silence anchor (customer replied). */
export function customerRepliedAfterSilenceAnchor(
  lastIncomingAt: Date | null | undefined,
  silenceAnchorAt: Date,
): boolean {
  if (!lastIncomingAt) return false;
  return lastIncomingAt.getTime() > silenceAnchorAt.getTime();
}

export function lastInboundIdempotencyKey(params: {
  workflowId: string;
  contactId: string;
  silenceAnchorAt: Date;
}): string {
  return `nr:${params.workflowId}:${params.contactId}:in:${params.silenceAnchorAt.getTime()}`;
}

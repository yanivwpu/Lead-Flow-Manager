/**
 * Durable per-contact automation pause (not DNC, not composer Manual, not Copilot snooze).
 */

export type ContactAutomationPauseFields = {
  automationsPaused: boolean;
  automationsPausedAt: Date | null;
  automationsPausedByUserId: string | null;
};

export function contactHasAutomationsPaused(contact: {
  automationsPaused?: boolean | null;
}): boolean {
  return contact.automationsPaused === true;
}

/**
 * Server-owned pause patch. Never trust client-supplied pausedAt / pausedByUserId.
 */
export function buildContactAutomationPausePatch(
  paused: boolean,
  actorUserId: string,
  at: Date = new Date(),
): ContactAutomationPauseFields {
  if (paused) {
    return {
      automationsPaused: true,
      automationsPausedAt: at,
      automationsPausedByUserId: actorUserId || null,
    };
  }
  return {
    automationsPaused: false,
    automationsPausedAt: null,
    automationsPausedByUserId: null,
  };
}

/** Active drip frozen while paused (due step held; not cancelled; not advanced). */
export function shouldRearmCampaignEnrollmentAfterContactResume(enrollment: {
  status: string;
  nextRunAt?: Date | string | null;
}): boolean {
  return enrollment.status === "active" && enrollment.nextRunAt == null;
}

/** Due (or already-null) active enrollments freeze until resume; future-dated stay scheduled. */
export function shouldFreezeDueCampaignEnrollmentOnPause(enrollment: {
  status: string;
  nextRunAt?: Date | string | null;
}, now: Date = new Date()): boolean {
  if (enrollment.status !== "active") return false;
  if (enrollment.nextRunAt == null) return true;
  const t = enrollment.nextRunAt instanceof Date
    ? enrollment.nextRunAt.getTime()
    : new Date(enrollment.nextRunAt).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

/**
 * Display-only Prospect AI campaign countdown helpers.
 * Server scheduledAt remains authoritative — no send/scheduling side effects.
 */

export type CampaignCountdownItemLike = {
  id: string;
  queueStatus: string;
  scheduledAt?: string | Date | null;
};

export type CampaignCountdownFormat = {
  kind: "countdown" | "shortly" | "none";
  /** Human fragment e.g. "1:24" or "Sending shortly…" */
  label: string;
  remainingMs: number;
};

/** Format remaining ms as m:ss (never negative). */
export function formatCountdownMmSs(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Countdown against scheduledAt using browser/server now.
 * overdue / missing schedule while queued → "Sending shortly…"
 */
export function formatCampaignSendCountdown(
  scheduledAt: string | Date | null | undefined,
  nowMs: number,
): CampaignCountdownFormat {
  if (scheduledAt == null || scheduledAt === "") {
    return { kind: "shortly", label: "Sending shortly…", remainingMs: 0 };
  }
  const dueMs = new Date(scheduledAt).getTime();
  if (!Number.isFinite(dueMs)) {
    return { kind: "shortly", label: "Sending shortly…", remainingMs: 0 };
  }
  const remainingMs = dueMs - nowMs;
  if (remainingMs <= 0) {
    return { kind: "shortly", label: "Sending shortly…", remainingMs: 0 };
  }
  return {
    kind: "countdown",
    label: formatCountdownMmSs(remainingMs),
    remainingMs,
  };
}

/**
 * Next Ready (queued) item by earliest scheduledAt.
 * Null/invalid scheduledAt sorts first (already due).
 */
export function selectNextQueuedCampaignItem<T extends CampaignCountdownItemLike>(
  items: readonly T[],
): T | null {
  const queued = items.filter((item) => String(item.queueStatus).toLowerCase() === "queued");
  if (!queued.length) return null;

  const ranked = [...queued].sort((a, b) => {
    const aMs = a.scheduledAt != null && a.scheduledAt !== "" ? new Date(a.scheduledAt).getTime() : Number.NEGATIVE_INFINITY;
    const bMs = b.scheduledAt != null && b.scheduledAt !== "" ? new Date(b.scheduledAt).getTime() : Number.NEGATIVE_INFINITY;
    const aValid = Number.isFinite(aMs) ? aMs : Number.NEGATIVE_INFINITY;
    const bValid = Number.isFinite(bMs) ? bMs : Number.NEGATIVE_INFINITY;
    if (aValid !== bValid) return aValid - bValid;
    return String(a.id).localeCompare(String(b.id));
  });
  return ranked[0] || null;
}

export type CampaignSendActivityStatus = {
  kind: "paused" | "complete" | "active_countdown" | "active_shortly" | "idle";
  label: string;
};

/**
 * Compact campaign-level status near Start / Pause / Resume.
 * Display only — does not arm or wake the worker.
 */
export function resolveCampaignSendActivityStatus(params: {
  queueRunning?: boolean | null;
  queuePaused?: boolean | null;
  items: readonly CampaignCountdownItemLike[];
  nowMs: number;
}): CampaignSendActivityStatus {
  // Campaign state badge already shows Paused — do not repeat copy here.
  if (params.queuePaused === true) {
    return { kind: "paused", label: "" };
  }

  const hasQueued = params.items.some((i) => String(i.queueStatus).toLowerCase() === "queued");
  const hasSending = params.items.some((i) => String(i.queueStatus).toLowerCase() === "sending");

  if (!hasQueued && !hasSending) {
    // Empty / finished queue: only label "complete" when the campaign was armed or paused.
    // Brand-new empty Campaigns tab stays quiet (existing empty-state copy handles it).
    if (params.queueRunning === true || params.queuePaused === true) {
      return { kind: "complete", label: "Campaign complete" };
    }
    return { kind: "idle", label: "" };
  }

  const armed = params.queueRunning === true && params.queuePaused !== true;
  if (!armed) {
    return { kind: "idle", label: "" };
  }

  const next = selectNextQueuedCampaignItem(params.items);
  if (!next) {
    // Sending in flight, nothing else queued
    if (hasSending) {
      return { kind: "active_shortly", label: "Sending active · Sending shortly…" };
    }
    return { kind: "complete", label: "Campaign complete" };
  }

  const countdown = formatCampaignSendCountdown(next.scheduledAt, params.nowMs);
  if (countdown.kind === "shortly") {
    return { kind: "active_shortly", label: "Sending active · Sending shortly…" };
  }
  return {
    kind: "active_countdown",
    label: `Sending active · Next email in ${countdown.label}`,
  };
}

/** Status cell suffix for the single next Ready row. */
export function formatNextQueuedStatusSuffix(
  scheduledAt: string | Date | null | undefined,
  nowMs: number,
): string {
  const countdown = formatCampaignSendCountdown(scheduledAt, nowMs);
  if (countdown.kind === "shortly") return "Sending shortly…";
  return `Sending in ${countdown.label}`;
}

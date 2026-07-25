/**
 * Display-only Prospect AI campaign countdown ticks.
 * Isolates 1s re-renders to this subtree — does not wake the worker or mutate schedule.
 */
import { useEffect, useState } from "react";
import {
  formatNextQueuedStatusSuffix,
  resolveCampaignSendActivityStatus,
  type CampaignCountdownItemLike,
} from "@shared/prospectCampaignCountdown";

function useSecondTicker(enabled: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return nowMs;
}

/** Compact campaign-level status near Start / Pause / Resume. */
export function CampaignSendActivityStatusLine(props: {
  queueRunning?: boolean | null;
  queuePaused?: boolean | null;
  items: readonly CampaignCountdownItemLike[];
}) {
  const armed = props.queueRunning === true && props.queuePaused !== true;
  const needsTick =
    props.queuePaused === true ||
    armed ||
    props.items.some((i) => {
      const s = String(i.queueStatus).toLowerCase();
      return s === "queued" || s === "sending";
    });
  const nowMs = useSecondTicker(needsTick);
  const status = resolveCampaignSendActivityStatus({
    queueRunning: props.queueRunning,
    queuePaused: props.queuePaused,
    items: props.items,
    nowMs,
  });
  if (!status.label) return null;
  return (
    <p
      className="text-sm text-gray-700"
      data-testid="po-campaign-send-activity"
      data-status-kind={status.kind}
    >
      {status.label}
    </p>
  );
}

/** Ready-row countdown suffix for the single next queued item. */
export function NextQueuedCountdownSuffix(props: {
  scheduledAt?: string | Date | null;
  enabled: boolean;
}) {
  const nowMs = useSecondTicker(props.enabled);
  if (!props.enabled) return null;
  const suffix = formatNextQueuedStatusSuffix(props.scheduledAt, nowMs);
  return (
    <span className="mt-0.5 block text-[10px] font-normal text-gray-500" data-testid="po-next-send-countdown">
      {suffix}
    </span>
  );
}

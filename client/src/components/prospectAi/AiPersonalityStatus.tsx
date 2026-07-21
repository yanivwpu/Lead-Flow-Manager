import { cn } from "@/lib/utils";
import type { AiPersonalityStatus } from "@shared/prospectAiPersonality";
import { shouldAnimateAiEmoji } from "@shared/prospectAiPersonality";

type Props = {
  emoji: string;
  active?: boolean;
  prefersReducedMotion?: boolean;
  className?: string;
  /** Accessible name; decorative emoji is hidden from AT when label provided via parent. */
  decorative?: boolean;
};

/**
 * Small inline emoji with optional one-shot / opacity pulse when AI is active.
 */
export function AiStatusEmoji({
  emoji,
  active = false,
  prefersReducedMotion = false,
  className,
  decorative = true,
}: Props) {
  const animate = shouldAnimateAiEmoji(active, prefersReducedMotion);
  return (
    <span
      className={cn(
        "inline-block text-[13px] leading-none align-middle",
        animate && "pi-emoji-active",
        className,
      )}
      aria-hidden={decorative ? true : undefined}
      data-testid="pi-ai-status-emoji"
      data-active={animate ? "true" : "false"}
    >
      {emoji}
    </span>
  );
}

export function AiPersonalityStatusView({
  status,
  prefersReducedMotion = false,
  className,
}: {
  status: AiPersonalityStatus;
  prefersReducedMotion?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[11px] text-emerald-900/80", className)}
      data-testid="pi-ai-personality-status"
      data-kind={status.kind}
    >
      <AiStatusEmoji
        emoji={status.emoji}
        active={status.active}
        prefersReducedMotion={prefersReducedMotion}
      />
      <span className={cn(status.active && !prefersReducedMotion && "pi-activity-line")}>
        {status.message}
      </span>
    </span>
  );
}

import { cn } from "@/lib/utils";
import type { AiGrowthAssistantModel } from "@shared/prospectAiPersonality";
import type { ReactNode } from "react";
import { AiStatusEmoji } from "./AiPersonalityStatus";

type Props = {
  model: AiGrowthAssistantModel;
  prefersReducedMotion?: boolean;
  className?: string;
  /** Optional right-side action (Campaigns Outreach Instructions). */
  trailing?: ReactNode;
};

/**
 * Compact daily-briefing card — real counts + next action only.
 */
export function AiGrowthAssistantCard({
  model,
  prefersReducedMotion = false,
  className,
  trailing,
}: Props) {
  return (
    <aside
      className={cn(
        "rounded-xl border border-violet-100/80 bg-gradient-to-r from-violet-50/80 via-white to-emerald-50/30 px-3 py-1.5 shadow-sm shadow-violet-900/[0.02]",
        className,
      )}
      data-testid="pi-ai-growth-assistant"
      data-idle={model.idle ? "true" : "false"}
      aria-live="polite"
    >
      {/* Desktop: briefing left + trailing right. Narrow: stack so trailing never clips away. */}
      <div
        className={cn(
          "flex gap-2.5",
          trailing
            ? "flex-col sm:flex-row sm:items-start sm:justify-between"
            : "flex-col",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-violet-950">
            <AiStatusEmoji
              emoji={model.titleEmoji}
              active={!model.idle}
              prefersReducedMotion={prefersReducedMotion}
            />
            <span>{model.title}</span>
          </div>
          <ul className="mt-0.5 space-y-0">
            {model.lines.map((line) => (
              <li
                key={`${line.emoji}-${line.text}`}
                className="flex items-start gap-1.5 text-[11px] leading-snug text-violet-950/80"
              >
                <AiStatusEmoji
                  emoji={line.emoji}
                  active={!model.idle}
                  prefersReducedMotion={prefersReducedMotion}
                />
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
          {model.nextAction ? (
            <p
              className="mt-1 border-t border-violet-100/80 pt-1 text-[11px] font-medium text-violet-900"
              data-testid="pi-ai-assistant-next-action"
            >
              <span className="text-violet-500 font-normal">Next: </span>
              {model.nextAction}
            </p>
          ) : null}
        </div>
        {trailing ? (
          <div
            className="w-full shrink-0 sm:w-auto sm:self-center"
            data-testid="pi-ai-assistant-trailing"
          >
            {trailing}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

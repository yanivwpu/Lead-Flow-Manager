import { cn } from "@/lib/utils";
import type { AiGrowthAssistantModel } from "@shared/prospectAiPersonality";
import { AiStatusEmoji } from "./AiPersonalityStatus";

type Props = {
  model: AiGrowthAssistantModel;
  prefersReducedMotion?: boolean;
  className?: string;
};

/**
 * Compact daily-briefing card — real counts + next action only.
 */
export function AiGrowthAssistantCard({
  model,
  prefersReducedMotion = false,
  className,
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
    </aside>
  );
}

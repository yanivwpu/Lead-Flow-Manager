import { Button } from "@/components/ui/button";
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
  /** Review N campaign-blocked Qualified prospects (filters table; not a new tab). */
  onReviewCampaignBlocked?: () => void;
  /** True when the campaign-blocked focus filter is active. */
  campaignBlockedFocusActive?: boolean;
  onClearCampaignBlockedFocus?: () => void;
};

/**
 * Compact daily-briefing card — real counts + next action only.
 */
export function AiGrowthAssistantCard({
  model,
  prefersReducedMotion = false,
  className,
  trailing,
  onReviewCampaignBlocked,
  campaignBlockedFocusActive = false,
  onClearCampaignBlockedFocus,
}: Props) {
  const showReviewCta =
    model.cta?.kind === "review_campaign_blocked" && typeof onReviewCampaignBlocked === "function";

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
          {model.blockerLines && model.blockerLines.length > 0 ? (
            <ul
              className="mt-1 space-y-0.5 border-t border-violet-100/80 pt-1 pl-0.5"
              data-testid="pi-ai-assistant-blockers"
            >
              {model.blockerLines.map((b) => (
                <li
                  key={b.code}
                  className="flex items-start gap-1.5 text-[11px] leading-snug text-violet-950/75"
                >
                  <span className="text-violet-400" aria-hidden>
                    •
                  </span>
                  <span>{b.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {showReviewCta ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={campaignBlockedFocusActive ? "secondary" : "default"}
                className="h-7 bg-brand-green text-[11px] hover:bg-emerald-700"
                onClick={onReviewCampaignBlocked}
                data-testid="pi-ai-assistant-review-blocked"
              >
                {model.cta!.label}
              </Button>
              {campaignBlockedFocusActive && onClearCampaignBlockedFocus ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] text-violet-800"
                  onClick={onClearCampaignBlockedFocus}
                  data-testid="pi-ai-assistant-clear-blocked-focus"
                >
                  Show all
                </Button>
              ) : null}
            </div>
          ) : null}
          {model.nextAction ? (
            <p
              className="mt-1 border-t border-violet-100/80 pt-1 text-[11px] font-medium text-violet-900"
              data-testid="pi-ai-assistant-next-action"
            >
              <span className="text-violet-500 font-normal">→ </span>
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

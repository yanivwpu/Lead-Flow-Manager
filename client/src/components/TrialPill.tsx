import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TrialPillProps {
  daysRemaining: number;
  onClick: () => void;
  highlight?: boolean;
  className?: string;
}

/** Compact trial indicator — full label for expanded sidebar / mobile header. */
export function TrialPill({ daysRemaining, onClick, highlight, className }: TrialPillProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="pill-trial-status"
      className={cn(
        "inline-flex w-full max-w-full min-w-0 items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-colors duration-200",
        highlight
          ? "border-amber-300/80 bg-amber-50 text-amber-950 shadow-sm"
          : "border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300",
        className,
      )}
    >
      <span className="shrink-0 opacity-80">{t("trial.pill.badge")}</span>
      <span className="shrink-0 text-slate-400" aria-hidden>
        ·
      </span>
      <span className="min-w-0 truncate tabular-nums">{t("trial.pill.daysLeftCompact", { days: daysRemaining })}</span>
    </button>
  );
}

interface TrialPillIconProps {
  daysRemaining: number;
  onClick: () => void;
  highlight?: boolean;
  tooltipSide?: "top" | "right" | "left" | "bottom";
  tooltipClassName?: string;
}

/** Icon-only trial badge for collapsed sidebar. */
export function TrialPillIcon({
  daysRemaining,
  onClick,
  highlight,
  tooltipSide = "right",
  tooltipClassName,
}: TrialPillIconProps) {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          data-testid="pill-trial-status-collapsed"
          aria-label={t("trial.pill.tooltipActive")}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200",
            highlight
              ? "border-amber-300/80 bg-amber-50 text-amber-700 shadow-sm"
              : "border-slate-200/90 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
          )}
        >
          <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={tooltipSide}
        className={cn(
          "border border-gray-200/90 bg-gray-100 text-gray-700 text-[11px] leading-snug shadow-none px-2.5 py-1.5 font-normal max-w-[200px]",
          tooltipClassName,
        )}
      >
        <p className="font-medium text-gray-900">{t("trial.pill.tooltipActive")}</p>
        <p className="mt-0.5 text-gray-600 tabular-nums">
          {t("trial.pill.daysLeftTooltip", { count: daysRemaining })}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

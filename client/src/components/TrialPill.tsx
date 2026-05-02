import { cn } from "@/lib/utils";

interface TrialPillProps {
  daysRemaining: number;
  onClick: () => void;
  highlight?: boolean;
}

/** Compact trial indicator — not inline with chat transcript. */
export function TrialPill({ daysRemaining, onClick, highlight }: TrialPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="pill-trial-status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-colors",
        highlight
          ? "border-amber-300/80 bg-amber-50 text-amber-950 shadow-sm"
          : "border-slate-200/90 bg-white/90 text-slate-700 hover:bg-slate-50 hover:border-slate-300",
      )}
    >
      <span className="opacity-80">Pro + AI Trial</span>
      <span className="text-slate-400">·</span>
      <span>{daysRemaining}d left</span>
    </button>
  );
}

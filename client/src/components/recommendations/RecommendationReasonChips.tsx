import { useState } from "react";
import { cn } from "@/lib/utils";

export interface RecommendationReasonChipsProps {
  reasons: string[];
  maxVisible?: number;
  formatReason?: (reason: string) => string;
}

export function RecommendationReasonChips({
  reasons,
  maxVisible = 4,
  formatReason = (reason) => reason,
}: RecommendationReasonChipsProps) {
  const [expanded, setExpanded] = useState(false);
  if (reasons.length === 0) return null;

  const labels = [...new Set(reasons.map(formatReason))];
  const visible = expanded ? labels : labels.slice(0, maxVisible);
  const hiddenCount = labels.length - visible.length;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", maxVisible <= 3 ? "mt-1" : "mt-1.5")}>
      {visible.map((label) => (
        <span
          key={label}
          className="inline-flex items-center rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-medium text-violet-800 ring-1 ring-violet-100/80"
        >
          {label}
        </span>
      ))}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600 hover:bg-gray-200/80"
          onClick={() => setExpanded(true)}
        >
          +{hiddenCount}
        </button>
      )}
      {expanded && labels.length > maxVisible && (
        <button
          type="button"
          className="text-[9px] font-medium text-gray-400 hover:text-gray-600"
          onClick={() => setExpanded(false)}
        >
          Less
        </button>
      )}
    </div>
  );
}

import { Lock, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface AIUpgradePromptProps {
  feature:     string;          // e.g. "Auto mode", "Workflow recommendations"
  requiredPlan: string;         // e.g. "Pro"
  reason?:     string;          // optional extra context
  size?:       "sm" | "md";    // compact vs default
  className?:  string;
}

export function AIUpgradePrompt({
  feature,
  requiredPlan,
  reason,
  size = "md",
  className,
}: AIUpgradePromptProps) {
  const [, setLocation] = useLocation();

  if (size === "sm") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium cursor-pointer hover:text-amber-700 transition-colors",
          className
        )}
        onClick={() => setLocation("/app/settings/billing")}
        data-testid="upgrade-prompt-sm"
      >
        <Lock className="w-2.5 h-2.5 shrink-0" />
        {requiredPlan} only · Upgrade ↗
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2 p-2 rounded-lg border border-amber-200 bg-amber-50",
        className
      )}
      data-testid="upgrade-prompt"
    >
      <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-amber-800 leading-snug">
          {feature} requires {requiredPlan}
        </p>
        {reason && (
          <p className="text-[10px] text-amber-700 leading-snug mt-0.5">{reason}</p>
        )}
        <button
          onClick={() => setLocation("/app/settings/billing")}
          className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 hover:text-amber-900 transition-colors"
          data-testid="button-upgrade-cta"
        >
          Upgrade plan <ArrowUpRight className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}

interface AICreditBadgeProps {
  creditsRemaining: number;
  monthlyLimit:     number;
  creditPercent:    number;
  planName:         string;
  className?:       string;
}

export function AICreditBadge({
  creditsRemaining,
  monthlyLimit,
  creditPercent,
  planName,
  className,
}: AICreditBadgeProps) {
  if (monthlyLimit === 0) return null;

  const isNear      = creditPercent >= 75;
  const isNearLimit = creditPercent >= 90;
  const isExhausted = creditPercent >= 100 || creditsRemaining <= 0;

  if (!isNear) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
        isExhausted
          ? "bg-red-50 text-red-600 border-red-200"
          : isNearLimit
          ? "bg-amber-50 text-amber-600 border-amber-200"
          : "bg-yellow-50 text-yellow-700 border-yellow-200",
        className
      )}
      title={`${creditsRemaining} of ${monthlyLimit} AI credits remaining this month (${planName} plan)`}
      data-testid="ai-credit-badge"
    >
      {isExhausted
        ? "AI credits exhausted"
        : `${creditsRemaining} credit${creditsRemaining === 1 ? "" : "s"} left`}
    </span>
  );
}

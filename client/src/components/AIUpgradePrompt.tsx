import { Lock, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { mustUseShopifyBilling } from "@/lib/shopifyBillingContext";
import { useShopifyShopHint } from "@/lib/shopifyBillingHint";
import { useSubscription } from "@/lib/subscription-context";
import { getUpgradeNavigationPath } from "@/lib/proAiTrialState";

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
  const shopHint = useShopifyShopHint();
  const { data: subscription } = useSubscription();
  const isShopify = mustUseShopifyBilling(subscription?.subscription, shopHint);

  const goUpgrade = () => {
    setLocation(getUpgradeNavigationPath({ shopHint, isShopify }));
  };

  if (size === "sm") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium cursor-pointer hover:text-amber-700 transition-colors",
          className
        )}
        onClick={goUpgrade}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            goUpgrade();
          }
        }}
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
          Unlock {feature}
        </p>
        {reason && (
          <p className="text-[10px] text-amber-700 leading-snug mt-0.5">{reason}</p>
        )}
        <button
          type="button"
          onClick={goUpgrade}
          className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 hover:text-amber-900 transition-colors"
          data-testid="button-upgrade-cta"
        >
          Upgrade to {requiredPlan} <ArrowUpRight className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}

/** @deprecated Customer-visible AI generation meters removed — fair use only. Kept as no-op for any stale imports. */
export function AICreditBadge(_props: {
  creditsRemaining: number;
  monthlyLimit: number;
  creditPercent: number;
  planName: string;
  className?: string;
}) {
  return null;
}

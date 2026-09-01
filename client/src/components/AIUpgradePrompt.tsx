import { Lock, ArrowUpRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { mustUseShopifyBilling } from "@/lib/shopifyBillingContext";
import { useShopifyShopHint } from "@/lib/shopifyBillingHint";
import { useSubscription } from "@/lib/subscription-context";
import { performInAppProUpgrade } from "@/lib/inAppProUpgrade";
import { resolveInAppUpgradeCta } from "@shared/pricingProCta";
import { inAppUpgradeCtaLabel } from "@/components/InAppProUpgradeButton";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

interface AIUpgradePromptProps {
  feature:     string;
  requiredPlan: string;
  reason?:     string;
  size?:       "sm" | "md";
  className?:  string;
}

export function AIUpgradePrompt({
  feature,
  requiredPlan,
  reason,
  size = "md",
  className,
}: AIUpgradePromptProps) {
  const { t } = useTranslation();
  const shopHint = useShopifyShopHint();
  const queryClient = useQueryClient();
  const { data: subscription } = useSubscription();
  const isShopify = mustUseShopifyBilling(subscription?.subscription, shopHint);
  const kind = resolveInAppUpgradeCta({
    canStartInternalTrial: !!subscription?.subscription?.canStartInternalTrial,
    isShopify,
  });
  const [loading, setLoading] = useState(false);

  const goUpgrade = async () => {
    setLoading(true);
    try {
      const result = await performInAppProUpgrade(kind, { shopHint });
      if (result === "started_trial") {
        await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const cta = loading ? null : inAppUpgradeCtaLabel(kind, t);

  if (size === "sm") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium cursor-pointer hover:text-amber-700 transition-colors",
          className
        )}
        onClick={() => void goUpgrade()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void goUpgrade();
          }
        }}
        data-testid="upgrade-prompt-sm"
        data-in-app-upgrade-cta={kind}
      >
        {loading ? <Loader2 className="w-2.5 h-2.5 shrink-0 animate-spin" /> : <Lock className="w-2.5 h-2.5 shrink-0" />}
        {cta ?? "…"}
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
          onClick={() => void goUpgrade()}
          className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 hover:text-amber-900 transition-colors"
          data-testid="button-upgrade-cta"
          data-in-app-upgrade-cta={kind}
        >
          {loading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <>{cta} <ArrowUpRight className="w-2.5 h-2.5" /></>}
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

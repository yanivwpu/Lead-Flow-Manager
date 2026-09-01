import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useShopifyShopHint } from "@/lib/shopifyBillingHint";
import { performInAppProUpgrade } from "@/lib/inAppProUpgrade";
import { shopifyManagedPricingInstructions } from "@/lib/shopifyCheckout";
import { resolveInAppUpgradeCta, type InAppUpgradeCtaKind } from "@shared/pricingProCta";

export function inAppUpgradeCtaLabel(
  kind: InAppUpgradeCtaKind,
  t: (key: string) => string,
): string {
  if (kind === "start_trial") return t("inAppUpgrade.startTrial");
  if (kind === "shopify_choose") return t("pricingPage.shopifyChoosePro");
  return t("inAppUpgrade.upgradePro");
}

export function InAppProUpgradeButton({
  canStartInternalTrial,
  isShopify,
  className,
  disabled,
  testId = "button-in-app-pro-upgrade",
  onStartedTrial,
}: {
  canStartInternalTrial: boolean;
  isShopify: boolean;
  className?: string;
  disabled?: boolean;
  testId?: string;
  onStartedTrial?: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const shopHint = useShopifyShopHint();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const kind = resolveInAppUpgradeCta({ canStartInternalTrial, isShopify });
  const label = inAppUpgradeCtaLabel(kind, t);

  const onClick = async () => {
    setLoading(true);
    try {
      const result = await performInAppProUpgrade(kind, { shopHint });
      if (result === "started_trial") {
        await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
        onStartedTrial?.();
      }
    } catch (error: any) {
      if (error?.message === "session_expired") return;
      if (error?.code === "shopify_unopened" || error?.message === "shopify_unopened") {
        toast({
          title: t("pricingPage.shopifyToastTitle"),
          description: t("pricingPage.shopifyToastHint"),
        });
        return;
      }
      toast({
        title: isShopify ? t("pricingPage.shopifyToastTitle") : "Error",
        description: isShopify
          ? shopifyManagedPricingInstructions(
              { error: error?.message },
              t("pricingPage.shopifyManagedPricingInstructions"),
            )
          : error?.message || "Failed to continue",
        variant: isShopify ? "default" : "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      className={className}
      disabled={disabled || loading}
      onClick={onClick}
      data-testid={testId}
      data-in-app-upgrade-cta={kind}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </Button>
  );
}

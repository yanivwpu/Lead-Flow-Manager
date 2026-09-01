import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { InAppProUpgradeButton } from "@/components/InAppProUpgradeButton";
import { useSubscription } from "@/lib/subscription-context";
import { mustUseShopifyBilling } from "@/lib/shopifyBillingContext";
import { useShopifyShopHint } from "@/lib/shopifyBillingHint";

interface UsageWarningBannerProps {
  conversationsUsed: number;
  conversationsLimit: number;
  planName: string;
}

export function UsageWarningBanner({ conversationsUsed, conversationsLimit, planName }: UsageWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { data: subscription } = useSubscription();
  const shopHint = useShopifyShopHint();
  const isShopify = mustUseShopifyBilling(subscription?.subscription, shopHint);

  const percentUsed = (conversationsUsed / conversationsLimit) * 100;
  const isAtLimit = percentUsed >= 100;

  if (dismissed || percentUsed < 80) {
    return null;
  }

  return (
    <div 
      className={`px-4 py-3 flex items-center justify-between ${
        isAtLimit 
          ? "bg-red-50 border-b border-red-200" 
          : "bg-amber-50 border-b border-amber-200"
      }`}
      data-testid="banner-usage-warning"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className={`h-5 w-5 shrink-0 ${isAtLimit ? "text-red-500" : "text-amber-500"}`} />
        <div>
          <span className={`font-medium ${isAtLimit ? "text-red-800" : "text-amber-800"}`}>
            {isAtLimit 
              ? "You've reached your conversation limit" 
              : `You've used ${Math.round(percentUsed)}% of your conversations`
            }
          </span>
          <span className={`ml-2 text-sm ${isAtLimit ? "text-red-600" : "text-amber-600"}`}>
            ({conversationsUsed} of {conversationsLimit} on {planName})
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <InAppProUpgradeButton
          canStartInternalTrial={!!subscription?.subscription?.canStartInternalTrial}
          isShopify={isShopify}
          className={
            isAtLimit
              ? "h-8 bg-red-600 px-3 text-sm hover:bg-red-700"
              : "h-8 bg-amber-600 px-3 text-sm hover:bg-amber-700"
          }
          testId="button-upgrade-banner"
        />
        {!isAtLimit && (
          <button 
            onClick={() => setDismissed(true)}
            className="text-amber-500 hover:text-amber-700 p-1"
            data-testid="button-dismiss-banner"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

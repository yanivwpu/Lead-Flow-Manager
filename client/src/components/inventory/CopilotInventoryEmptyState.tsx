import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useHideGrowthEngineForShopify } from "@/lib/shopifyMerchantExperience";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { RGE_INVENTORY_SETTINGS_PATH } from "@shared/rgePaths";

type Props = {
  compact?: boolean;
  className?: string;
};

export function CopilotInventoryEmptyState({ compact = true }: Props) {
  const { t: inboxText } = useTranslation();
  const hideGrowthEngine = useHideGrowthEngineForShopify();
  if (hideGrowthEngine) return null;

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white/80 px-2.5 py-2.5 space-y-2"
      data-testid="copilot-inventory-empty-state"
    >
      <div className="flex items-center gap-1.5">
        <Home className="h-3 w-3 text-brand-green shrink-0" aria-hidden />
        <span
          className={
            compact
              ? "text-[9px] font-semibold uppercase tracking-wide text-gray-500"
              : "text-xs font-semibold uppercase tracking-wide text-gray-600"
          }
        >
          {inboxText("inboxUi.inventoryIntelligence")}
        </span>
      </div>
      <p className={compact ? "text-[11px] font-medium text-gray-800" : "text-sm font-medium text-gray-900"}>
        {inboxText("inboxUi.connectInventoryToEnableMatchingListingsAndPrice")}
      </p>
      <p className={compact ? "text-[11px] text-gray-600 leading-snug" : "text-sm text-gray-600"}>
        {inboxText("inboxUi.setUpAnMlsOrResoFeedIn")}
      </p>
      <ul
        className={
          compact
            ? "text-[11px] text-gray-600 leading-snug space-y-0.5 list-disc pl-4"
            : "text-sm text-gray-600 leading-snug space-y-1 list-disc pl-5"
        }
      >
        <li>{inboxText("inboxUi.matchingListings")}</li>
        <li>{inboxText("inboxUi.priceReductionAlerts")}</li>
      </ul>
      <Button
        asChild
        variant="outline"
        size="sm"
        className={compact ? "h-7 text-[11px] mt-1" : "mt-2"}
        data-testid="button-open-inventory-settings"
      >
        <Link href={RGE_INVENTORY_SETTINGS_PATH}>{inboxText("inboxUi.openInventorySettings")}</Link>
      </Button>
    </div>
  );
}

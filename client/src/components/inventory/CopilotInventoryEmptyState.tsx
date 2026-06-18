import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { RGE_INVENTORY_SETTINGS_PATH } from "@shared/rgePaths";

type Props = {
  compact?: boolean;
  className?: string;
};

export function CopilotInventoryEmptyState({ compact = true }: Props) {
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
          Inventory Intelligence
        </span>
      </div>
      <p className={compact ? "text-[11px] font-medium text-gray-800" : "text-sm font-medium text-gray-900"}>
        Connect inventory to enable matching listings and price reduction alerts.
      </p>
      <p className={compact ? "text-[11px] text-gray-600 leading-snug" : "text-sm text-gray-600"}>
        Set up an MLS or RESO feed in your Growth Engine:
      </p>
      <ul
        className={
          compact
            ? "text-[11px] text-gray-600 leading-snug space-y-0.5 list-disc pl-4"
            : "text-sm text-gray-600 leading-snug space-y-1 list-disc pl-5"
        }
      >
        <li>Matching Listings</li>
        <li>Price Reduction Alerts</li>
      </ul>
      <Button
        asChild
        variant="outline"
        size="sm"
        className={compact ? "h-7 text-[11px] mt-1" : "mt-2"}
        data-testid="button-open-inventory-settings"
      >
        <Link href={RGE_INVENTORY_SETTINGS_PATH}>Open Inventory Settings</Link>
      </Button>
    </div>
  );
}

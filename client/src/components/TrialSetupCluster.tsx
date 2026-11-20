import { useSubscription } from "@/lib/subscription-context";
import { TrialPill, TrialPillIcon } from "@/components/TrialPill";
import { useOpenTrialModal } from "@/lib/trial-modal-context";
import { cn } from "@/lib/utils";
import { getDirection } from "@/lib/i18n";

interface TrialSetupClusterProps {
  className?: string;
  /** When true, show icon-only badge (collapsed desktop sidebar). */
  sidebarCollapsed?: boolean;
}

/**
 * Trial pill cluster. Desktop: Sidebar; mobile: absolute top-end of main (see AppLayout).
 */
export function TrialSetupCluster({ className, sidebarCollapsed }: TrialSetupClusterProps) {
  const openTrial = useOpenTrialModal();
  const { data: subscription, isLoading } = useSubscription();
  const isRTL = getDirection() === "rtl";
  const tooltipSide = isRTL ? "left" : "right";

  const subMeta = subscription?.subscription;
  const daysRem = subscription?.limits?.trialDaysRemaining ?? 0;
  const showTrialPill =
    !isLoading &&
    !!subscription?.limits?.isInTrial &&
    daysRem > 0 &&
    !subMeta?.isPaidSubscriber;
  const pillHighlight = daysRem <= 3 && daysRem > 0;

  if (!showTrialPill) return null;

  if (sidebarCollapsed !== undefined) {
    const slotClass = "col-start-1 row-start-1 flex items-center transition-opacity duration-[225ms] ease-in-out motion-reduce:transition-none";
    return (
      <div className={cn("grid h-9 grid-cols-[minmax(0,1fr)] overflow-hidden", className)}>
        <div inert={!sidebarCollapsed} className={cn(slotClass, !sidebarCollapsed && "opacity-0")}>
          <TrialPillIcon
            daysRemaining={daysRem}
            highlight={pillHighlight}
            onClick={() => openTrial()}
            tooltipSide={tooltipSide}
          />
        </div>
        <div inert={sidebarCollapsed} className={cn(slotClass, sidebarCollapsed && "opacity-0")}>
          <TrialPill
            daysRemaining={daysRem}
            highlight={pillHighlight}
            onClick={() => openTrial()}
            className="w-[175px] max-w-none shrink-0 whitespace-nowrap"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-none flex min-w-0 max-w-[calc(100%-1rem)] flex-row-reverse flex-wrap items-start justify-end gap-1.5 transition-all duration-200 ease-in-out sm:gap-2",
        className,
      )}
    >
      {subscription?.limits && (
        <TrialPill
          daysRemaining={daysRem}
          highlight={pillHighlight}
          onClick={() => openTrial()}
        />
      )}
    </div>
  );
}

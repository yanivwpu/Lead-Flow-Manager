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

  if (sidebarCollapsed) {
    return (
      <div
        className={cn(
          "pointer-events-auto flex w-full justify-center overflow-hidden transition-opacity duration-200 ease-in-out",
          className,
        )}
      >
        <TrialPillIcon
          daysRemaining={daysRem}
          highlight={pillHighlight}
          onClick={() => openTrial()}
          tooltipSide={tooltipSide}
        />
      </div>
    );
  }

  const isSidebarSlot = sidebarCollapsed === false;

  return (
    <div
      className={cn(
        "pointer-events-auto min-w-0 transition-all duration-200 ease-in-out",
        isSidebarSlot
          ? "w-full max-w-full overflow-hidden"
          : "pointer-events-none flex max-w-[calc(100%-1rem)] flex-row-reverse flex-wrap items-start justify-end gap-1.5 sm:gap-2",
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

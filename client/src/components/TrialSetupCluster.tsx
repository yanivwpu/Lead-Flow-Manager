import { useSubscription } from "@/lib/subscription-context";
import { TrialPill } from "@/components/TrialPill";
import { useOpenTrialModal } from "@/lib/trial-modal-context";
import { cn } from "@/lib/utils";

interface TrialSetupClusterProps {
  className?: string;
}

/**
 * Trial pill cluster. Desktop: Sidebar; mobile: absolute top-end of main (see AppLayout).
 */
export function TrialSetupCluster({ className }: TrialSetupClusterProps) {
  const openTrial = useOpenTrialModal();
  const { data: subscription, isLoading } = useSubscription();

  const subMeta = subscription?.subscription;
  const daysRem = subscription?.limits?.trialDaysRemaining ?? 0;
  const showTrialPill =
    !isLoading &&
    !!subscription?.limits?.isInTrial &&
    daysRem > 0 &&
    !subMeta?.isPaidSubscriber;
  const pillHighlight = daysRem <= 3 && daysRem > 0;

  if (!showTrialPill) return null;

  return (
    <div
      className={cn(
        "pointer-events-none flex flex-row-reverse flex-wrap items-start justify-end gap-1.5 sm:gap-2",
        className,
      )}
    >
      {subscription?.limits && (
        <div className="pointer-events-auto">
          <TrialPill
            daysRemaining={daysRem}
            highlight={pillHighlight}
            onClick={() => openTrial()}
          />
        </div>
      )}
    </div>
  );
}

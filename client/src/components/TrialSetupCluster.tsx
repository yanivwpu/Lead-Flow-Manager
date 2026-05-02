import { useQuery } from "@tanstack/react-query";
import { useSubscription } from "@/lib/subscription-context";
import { TrialPill } from "@/components/TrialPill";
import { ActivationChecklist, type ActivationStatusPayload } from "@/components/ActivationChecklist";
import { useOpenTrialModal } from "@/lib/trial-modal-context";
import { cn } from "@/lib/utils";

interface TrialSetupClusterProps {
  className?: string;
}

/**
 * Trial pill + Setup checklist. Desktop: lives in Sidebar; mobile: absolute top-end of main (see AppLayout).
 */
export function TrialSetupCluster({ className }: TrialSetupClusterProps) {
  const openTrial = useOpenTrialModal();
  const { data: subscription, isLoading } = useSubscription();
  const { data: activation, isPending: activationPending } = useQuery<ActivationStatusPayload>({
    queryKey: ["/api/activation-status"],
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const subMeta = subscription?.subscription;
  const daysRem = subscription?.limits?.trialDaysRemaining ?? 0;
  const showTrialPill =
    !isLoading &&
    !!subscription?.limits?.isInTrial &&
    daysRem > 0 &&
    !subMeta?.isPaidSubscriber;
  const pillHighlight = daysRem <= 3 && daysRem > 0;

  const showActivationChecklist =
    !activationPending && !!activation && !activation.checklistComplete;

  if (!showTrialPill && !showActivationChecklist) return null;

  return (
    <div
      className={cn(
        "pointer-events-none flex flex-row-reverse flex-wrap items-start justify-end gap-1.5 sm:gap-2",
        className,
      )}
    >
      {showTrialPill && subscription?.limits && (
        <div className="pointer-events-auto">
          <TrialPill
            daysRemaining={daysRem}
            highlight={pillHighlight}
            onClick={() => openTrial()}
          />
        </div>
      )}
      {showActivationChecklist && (
        <div className="pointer-events-auto max-w-[min(100%,14rem)] sm:max-w-none">
          <ActivationChecklist />
        </div>
      )}
    </div>
  );
}

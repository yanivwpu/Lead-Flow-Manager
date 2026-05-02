import { Button } from "@/components/ui/button";
import { upgradeToProAI } from "@/lib/upgradeRouting";
import { Loader2 } from "lucide-react";
import { useState } from "react";

interface TrialEndingSoonBannerProps {
  upgradeProviderLabel: string;
}

/** Last ~24h: compact reminder above main scroll area (not inside chat thread). */
export function TrialEndingSoonBanner({ upgradeProviderLabel }: TrialEndingSoonBannerProps) {
  const [loading, setLoading] = useState(false);

  return (
    <div
      className="shrink-0 px-4 py-2.5 border-b border-emerald-200/80 bg-emerald-50/95 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-emerald-950"
      role="status"
      data-testid="banner-trial-ending-soon"
    >
      <p className="font-medium">
        Your Pro + AI trial ends soon. Keep automations and AI replies active with an upgrade.
      </p>
      <Button
        size="sm"
        className="shrink-0 bg-emerald-700 hover:bg-emerald-800 text-white h-8 text-xs"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          try {
            await upgradeToProAI("/app/inbox");
          } finally {
            setLoading(false);
          }
        }}
        data-testid="button-trial-ending-upgrade"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Upgrade (${upgradeProviderLabel})`}
      </Button>
    </div>
  );
}

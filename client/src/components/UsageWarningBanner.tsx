import { AlertTriangle, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useState } from "react";

interface UsageWarningBannerProps {
  conversationsUsed: number;
  conversationsLimit: number;
  planName: string;
}

export function UsageWarningBanner({ conversationsUsed, conversationsLimit, planName }: UsageWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  
  const percentUsed = (conversationsUsed / conversationsLimit) * 100;
  const isWarning = percentUsed >= 80 && percentUsed < 100;
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
        <Link href="/pricing">
          <Button 
            size="sm" 
            className={isAtLimit 
              ? "bg-red-600 hover:bg-red-700" 
              : "bg-amber-600 hover:bg-amber-700"
            }
            data-testid="button-upgrade-banner"
          >
            <Zap className="h-4 w-4 mr-1" />
            Upgrade
          </Button>
        </Link>
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

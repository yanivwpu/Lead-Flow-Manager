import { Sparkles, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface TrialBannerProps {
  daysRemaining: number;
  planName: string;
}

export function TrialBanner({ daysRemaining, planName }: TrialBannerProps) {
  const isUrgent = daysRemaining <= 3;
  
  return (
    <div 
      className={`px-4 py-2.5 flex items-center justify-between ${
        isUrgent 
          ? "bg-gradient-to-r from-amber-500 to-orange-500" 
          : "bg-gradient-to-r from-brand-green to-emerald-600"
      }`}
      data-testid="banner-trial"
    >
      <div className="flex items-center gap-2 text-white">
        {isUrgent ? (
          <Clock className="h-4 w-4 shrink-0" />
        ) : (
          <Sparkles className="h-4 w-4 shrink-0" />
        )}
        <span className="text-sm font-medium">
          {isUrgent 
            ? `Only ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left in your Pro trial!` 
            : `${planName} - ${daysRemaining} days remaining`
          }
        </span>
      </div>
      <Link href="/pricing">
        <Button 
          size="sm" 
          variant="secondary"
          className="h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
          data-testid="button-upgrade-trial"
        >
          <Zap className="h-3 w-3 mr-1" />
          {isUrgent ? "Subscribe Now" : "View Plans"}
        </Button>
      </Link>
    </div>
  );
}

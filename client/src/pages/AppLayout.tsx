import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { Chats } from "./Chats";
import { FollowUps } from "./FollowUps";
import { Search } from "./Search";
import { Settings } from "./Settings";
import { Workflows } from "./Workflows";
import { Integrations } from "./Integrations";
import { Templates } from "./Templates";
import { HelpCenter } from "./HelpCenter";
import { UsageWarningBanner } from "@/components/UsageWarningBanner";
import { TrialBanner } from "@/components/TrialBanner";
import { OnboardingTour } from "@/components/OnboardingTour";
import { SubscriptionProvider, useSubscription } from "@/lib/subscription-context";

function AppContent() {
  const { data: subscription, isLoading } = useSubscription();
  const [showOnboarding, setShowOnboarding] = useState(false);
  
  const { data: user } = useQuery<{ onboardingCompleted?: boolean }>({
    queryKey: ["/api/auth/me"],
  });
  
  useEffect(() => {
    if (user && user.onboardingCompleted === false) {
      setShowOnboarding(true);
    }
  }, [user]);
  
  const showUsageBanner = !isLoading && subscription?.limits && 
    subscription.limits.conversationsLimit > 0 &&
    (subscription.limits.conversationsUsed / subscription.limits.conversationsLimit) >= 0.8;
  
  const showTrialBanner = !isLoading && subscription?.limits?.isInTrial && 
    subscription.limits.trialDaysRemaining > 0;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-white md:m-3 md:rounded-2xl md:shadow-sm border-gray-200 md:border overflow-hidden relative">
        {showTrialBanner && subscription?.limits && (
          <TrialBanner
            daysRemaining={subscription.limits.trialDaysRemaining}
            planName={subscription.limits.planName}
          />
        )}
        {showUsageBanner && !showTrialBanner && subscription?.limits && (
          <UsageWarningBanner
            conversationsUsed={subscription.limits.conversationsUsed}
            conversationsLimit={subscription.limits.conversationsLimit}
            planName={subscription.limits.planName}
          />
        )}
        <Switch>
          <Route path="/app/chats/:id" component={Chats} />
          <Route path="/app/chats" component={Chats} />
          <Route path="/app/followups" component={FollowUps} />
          <Route path="/app/workflows" component={Workflows} />
          <Route path="/app/templates" component={Templates} />
          <Route path="/app/integrations" component={Integrations} />
          <Route path="/app/search" component={Search} />
          <Route path="/app/settings" component={Settings} />
          <Route path="/app/help" component={HelpCenter} />
        </Switch>
      </main>
      
      <OnboardingTour 
        isOpen={showOnboarding} 
        onComplete={() => setShowOnboarding(false)} 
      />
    </div>
  );
}

export function AppLayout() {
  return (
    <SubscriptionProvider>
      <AppContent />
    </SubscriptionProvider>
  );
}

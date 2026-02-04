import { useState, useEffect, lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { Chats } from "./Chats";
import { FollowUps } from "./FollowUps";
import { UsageWarningBanner } from "@/components/UsageWarningBanner";
import { TrialBanner } from "@/components/TrialBanner";
import { OnboardingTour } from "@/components/OnboardingTour";
import { SubscriptionProvider, useSubscription } from "@/lib/subscription-context";
import { Loader2 } from "lucide-react";
import { supportedLanguages, type SupportedLanguage } from "@/lib/i18n";

const Search = lazy(() => import("./Search").then(m => ({ default: m.Search })));
const Settings = lazy(() => import("./Settings").then(m => ({ default: m.Settings })));
const Workflows = lazy(() => import("./Workflows").then(m => ({ default: m.Workflows })));
const Integrations = lazy(() => import("./Integrations").then(m => ({ default: m.Integrations })));
const Templates = lazy(() => import("./Templates").then(m => ({ default: m.Templates })));
const HelpCenter = lazy(() => import("./HelpCenter").then(m => ({ default: m.HelpCenter })));
const ChatbotBuilder = lazy(() => import("./ChatbotBuilder").then(m => ({ default: m.ChatbotBuilder })));
const UnifiedInbox = lazy(() => import("./UnifiedInbox").then(m => ({ default: m.UnifiedInbox })));
const WebsiteWidget = lazy(() => import("./WebsiteWidget").then(m => ({ default: m.WebsiteWidget })));
const AIBrain = lazy(() => import("./AIBrain").then(m => ({ default: m.AIBrain })));

const PageLoader = () => (
  <div className="flex h-full items-center justify-center">
    <Loader2 className="h-6 w-6 text-brand-green animate-spin" />
  </div>
);

function AppContent() {
  const { data: subscription, isLoading } = useSubscription();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingShown, setOnboardingShown] = useState(false);
  const { i18n } = useTranslation();
  
  const { data: user } = useQuery<{ onboardingCompleted?: boolean }>({
    queryKey: ["/api/auth/me"],
  });
  
  useEffect(() => {
    if (user && user.onboardingCompleted === false && !onboardingShown) {
      setShowOnboarding(true);
      setOnboardingShown(true);
    }
  }, [user, onboardingShown]);
  
  const showUsageBanner = !isLoading && subscription?.limits && 
    subscription.limits.conversationsLimit > 0 &&
    (subscription.limits.conversationsUsed / subscription.limits.conversationsLimit) >= 0.8;
  
  const showTrialBanner = !isLoading && subscription?.limits?.isInTrial && 
    subscription.limits.trialDaysRemaining > 0;

  const currentLang = (i18n.language || 'en') as SupportedLanguage;
  const isRTL = supportedLanguages[currentLang]?.dir === 'rtl';

  return (
    <div className="fixed inset-0 flex bg-gray-50 overflow-hidden" dir={isRTL ? 'rtl' : 'ltr'}>
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-white md:mx-3 md:rounded-2xl md:shadow-sm border-gray-200 md:border overflow-hidden relative pb-14 md:pb-0">
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
        <div className="flex-1 min-h-0 overflow-hidden">
          <Suspense fallback={<PageLoader />}>
            <Switch>
              <Route path="/app/inbox/:contactId" component={UnifiedInbox} />
              <Route path="/app/inbox" component={UnifiedInbox} />
              <Route path="/app/chats/:id" component={Chats} />
              <Route path="/app/chats" component={Chats} />
              <Route path="/app/followups" component={FollowUps} />
              <Route path="/app/workflows" component={Workflows} />
              <Route path="/app/chatbot" component={ChatbotBuilder} />
              <Route path="/app/templates" component={Templates} />
              <Route path="/app/widget" component={WebsiteWidget} />
              <Route path="/app/integrations" component={Integrations} />
              <Route path="/app/ai-brain" component={AIBrain} />
              <Route path="/app/search" component={Search} />
              <Route path="/app/settings" component={Settings} />
              <Route path="/app/help" component={HelpCenter} />
            </Switch>
          </Suspense>
        </div>
      </main>
      
      <OnboardingTour 
        isOpen={showOnboarding} 
        onComplete={() => setShowOnboarding(false)} 
      />
      <MobileNav />
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

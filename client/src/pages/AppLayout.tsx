import { useState, useEffect, lazy, Suspense, useMemo } from "react";
import { Switch, Route, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { UsageWarningBanner } from "@/components/UsageWarningBanner";
import { TrialModal } from "@/components/TrialModal";
import { TrialSetupCluster } from "@/components/TrialSetupCluster";
import { TrialModalOpenProvider } from "@/lib/trial-modal-context";
import { TrialEndingSoonBanner } from "@/components/TrialEndingSoonBanner";
import { ActivationSetupModal } from "@/components/ActivationSetupModal";
import {
  type ActivationStatusPayload,
  activationSetupModalStorageKey,
  readActivationSetupModalLastShownDay,
  writeActivationSetupModalLastShownDay,
  todayLocalYYYYMMDD,
} from "@/lib/activationStatus";
import { useAuth } from "@/lib/auth-context";
import { SubscriptionProvider, useSubscription } from "@/lib/subscription-context";
import { getUpgradeProvider } from "@/lib/upgradeRouting";
import { Loader2 } from "lucide-react";
import { supportedLanguages, type SupportedLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const FollowUps = lazy(() => import("./FollowUps").then(m => ({ default: m.FollowUps })));

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
const RealtorGrowthEngine = lazy(() => import("./RealtorGrowthEngine").then(m => ({ default: m.RealtorGrowthEngine })));
const Contacts = lazy(() => import("./Contacts").then(m => ({ default: m.Contacts })));

const PageLoader = () => (
  <div className="flex h-full items-center justify-center">
    <Loader2 className="h-6 w-6 text-gray-500 animate-spin" />
  </div>
);

function AppContent() {
  const { user } = useAuth();
  const { data: subscription, isLoading } = useSubscription();
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  /** Same-tab: after dismiss or CTA, avoid re-open until localStorage day key updates on next render. */
  const [activationIntroDismissedSession, setActivationIntroDismissedSession] = useState(false);
  const { i18n } = useTranslation();

  const activationDayKey = activationSetupModalStorageKey(user?.id);
  const shownActivationModalToday =
    typeof window !== "undefined" &&
    readActivationSetupModalLastShownDay(activationDayKey) === todayLocalYYYYMMDD();

  const markActivationSetupModalShownToday = () => {
    writeActivationSetupModalLastShownDay(activationDayKey, todayLocalYYYYMMDD());
  };

  const { data: activation, isPending: activationPending } = useQuery<ActivationStatusPayload>({
    queryKey: ["/api/activation-status"],
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (activation?.hasAnyMessagingChannel) {
      setActivationIntroDismissedSession(false);
    }
  }, [activation?.hasAnyMessagingChannel]);

  const showActivationIntroModal =
    !activationPending &&
    !!activation &&
    !activation.hasAnyMessagingChannel &&
    !activationIntroDismissedSession &&
    !shownActivationModalToday;

  const showUsageBanner =
    !isLoading &&
    subscription?.limits &&
    subscription.limits.conversationsLimit > 0 &&
    subscription.limits.conversationsUsed / subscription.limits.conversationsLimit >= 0.8;

  const subMeta = subscription?.subscription;
  const daysRem = subscription?.limits?.trialDaysRemaining ?? 0;

  const trialEndsMs = subMeta?.trialEndsAt ? new Date(subMeta.trialEndsAt).getTime() : 0;
  const hoursLeft = trialEndsMs ? (trialEndsMs - Date.now()) / (1000 * 60 * 60) : 999;
  const showTrialEndingSoon =
    !isLoading &&
    !!subscription?.limits?.isInTrial &&
    !subMeta?.isPaidSubscriber &&
    hoursLeft > 0 &&
    hoursLeft <= 24;

  const upgradeProvider = useMemo(() => getUpgradeProvider(subMeta ?? null), [subMeta]);

  const currentLang = (i18n.language || "en") as SupportedLanguage;
  const isRTL = supportedLanguages[currentLang]?.dir === "rtl";

  return (
    <div
      className="fixed top-0 left-0 right-0 flex bg-gray-50 overflow-hidden"
      style={{ height: "var(--app-height, 100dvh)" }}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <TrialModalOpenProvider openTrialModal={() => setTrialModalOpen(true)}>
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 bg-white md:mx-3 md:rounded-2xl md:shadow-sm border-gray-200 md:border overflow-hidden relative pb-14 md:pb-0">
          {showTrialEndingSoon && (
            <TrialEndingSoonBanner
              upgradeProviderLabel={upgradeProvider === "shopify" ? "Shopify" : "Stripe"}
            />
          )}
          {/* Mobile: trial pill — absolute so main scroll area has no extra top row */}
          <div
            className={cn(
              "pointer-events-none absolute z-40 flex max-w-[calc(100%-1rem)] justify-end end-3 md:hidden",
              showTrialEndingSoon ? "top-14 sm:top-[3.25rem]" : "top-2.5 sm:top-3",
            )}
          >
            <TrialSetupCluster />
          </div>
        <ActivationSetupModal
          open={showActivationIntroModal}
          onOpenChange={(open) => {
            if (!open) {
              setActivationIntroDismissedSession(true);
              markActivationSetupModalShownToday();
            }
          }}
          onChannelCta={() => {
            setActivationIntroDismissedSession(true);
            markActivationSetupModalShownToday();
          }}
        />
        <TrialModal open={trialModalOpen} onOpenChange={setTrialModalOpen} daysRemaining={daysRem} />
        {showUsageBanner && subscription?.limits && (
          <UsageWarningBanner
            conversationsUsed={subscription.limits.conversationsUsed}
            conversationsLimit={subscription.limits.conversationsLimit}
            planName={subscription.limits.planName}
          />
        )}
        <div className="flex-1 min-h-0 overflow-auto">
          <Suspense fallback={<PageLoader />}>
            <Switch>
              {/* One route w/ optional param so UnifiedInbox is not remounted when opening a thread (was causing list flash / state reset). */}
              <Route path="/app/inbox/:contactId?" component={UnifiedInbox} />
              <Route path="/app/chats/:id">
                <Redirect to="/app/inbox" />
              </Route>
              <Route path="/app/chats">
                <Redirect to="/app/inbox" />
              </Route>
              <Route path="/app/followups" component={FollowUps} />
              <Route path="/app/contacts" component={Contacts} />
              <Route path="/app/workflows" component={Workflows} />
              <Route path="/app/chatbot" component={ChatbotBuilder} />
              <Route path="/app/templates/realtor-growth-engine/onboarding" component={RealtorGrowthEngine} />
              <Route path="/app/templates/realtor-growth-engine/status" component={RealtorGrowthEngine} />
              <Route path="/app/templates/realtor-growth-engine" component={RealtorGrowthEngine} />
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
      </TrialModalOpenProvider>

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

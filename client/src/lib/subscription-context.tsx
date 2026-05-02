import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSubscriptionApiUrl, useShopifyShopHint } from "./shopifyBillingHint";

interface SubscriptionLimits {
  plan: string;
  planName: string;
  conversationsLimit: number;
  conversationsUsed: number;
  conversationsRemaining: number;
  isLifetimeLimit: boolean;
  maxUsers: number;
  maxWhatsappNumbers: number;
  canSendMessages: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  teamInbox: boolean;
  usageReports: boolean;
  assignmentEnabled: boolean;
  workflowsEnabled: boolean;
  isAtLimit: boolean;
  isInTrial: boolean;
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  effectivePlan?: string;
  effectiveHasAIBrain?: boolean;
  integrationsEnabled: boolean;
  maxWebhooks: number;
  templatesEnabled: boolean;
}

interface SubscriptionData {
  limits: SubscriptionLimits & {
    effectivePlan?: string;
    effectiveHasAIBrain?: boolean;
  };
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    isShopify?: boolean;
    shopifyBillingTrialDays?: number;
    subscriptionPlan?: string;
    effectivePlan?: string;
    effectiveHasAIBrain?: boolean;
    trialStatus?: string;
    trialStartedAt?: string | null;
    trialEndsAt?: string | null;
    trialDaysRemaining?: number;
    trialIncludesAIBrain?: boolean;
    trialPlan?: string | null;
    upgradeProvider?: "shopify" | "stripe";
    isPaidSubscriber?: boolean;
    showTrialUrgency?: boolean;
  } | null;
}

interface SubscriptionContextType {
  data: SubscriptionData | null;
  isLoading: boolean;
  refetch: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  data: null,
  isLoading: true,
  refetch: () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const shopHint = useShopifyShopHint();
  const { data, isLoading, refetch } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription", shopHint ?? ""],
    queryFn: async () => {
      const res = await fetch(getSubscriptionApiUrl(), { credentials: "include" });
      if (res.status === 401) {
        throw new Error("401");
      }
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    staleTime: 60_000,
  });

  return (
    <SubscriptionContext.Provider value={{ data: data || null, isLoading, refetch }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}

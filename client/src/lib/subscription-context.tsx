import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

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
  integrationsEnabled: boolean;
  maxWebhooks: number;
}

interface SubscriptionData {
  limits: SubscriptionLimits;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
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
  const { data, isLoading, refetch } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
    staleTime: 30000,
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

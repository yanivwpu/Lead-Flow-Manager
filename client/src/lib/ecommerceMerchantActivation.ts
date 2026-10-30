import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { withUserQueryScope } from "./accountQueryScope";

export type EcommerceMerchantActivationStatus = {
  eligible: boolean;
  activated: boolean;
  connected: boolean;
  planEligible: boolean;
  cartExecutionEnabled: false;
  outboundMessagingEnabled: false;
  /** Read-only infrastructure schema check. Not permission to send. */
  recoverySchemaReady?: boolean | null;
};

const endpoint = "/api/shopify/merchant-engine/status";
export function useEcommerceMerchantActivationStatus() {
  const { user, sessionAligned } = useAuth();
  return useQuery<EcommerceMerchantActivationStatus>({
    queryKey: withUserQueryScope([endpoint], user?.id),
    enabled: !!user?.id && sessionAligned,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const r = await fetch(endpoint, { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error("Activation status unavailable");
      return r.json();
    },
  });
}

export function useActivateEcommerceMerchant() {
  const { user, sessionAligned } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user?.id || !sessionAligned) throw new Error("Sign in to activate");
      const r = await fetch("/api/shopify/merchant-engine/activate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw new Error("Activation unavailable. Check Shopify connection and Pro access.");
      return r.json() as Promise<{ activated: true }>;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: withUserQueryScope([endpoint], user?.id) });
    },
  });
}

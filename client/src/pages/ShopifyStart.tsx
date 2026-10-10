import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { clearShopifyPostInstallPricingPath, clearShopifyPlanPickerOpened } from "@/lib/shopifyBootstrap";
import { ShopifyStartView } from "@/components/ShopifyStartView";
import { trackShopifyActivation } from "@/lib/shopifyActivationTelemetry";
import type { ShopifyOnboardingSnapshot } from "@shared/shopifyOnboarding";

export function ShopifyStart() {
  const { i18n } = useTranslation();
  const { user, isLoading, sessionAligned, refreshSession } = useAuth();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const [sessionTimedOut, setSessionTimedOut] = useState(false);
  const key = ["shopify-onboarding", user?.id];
  const waitingForSession = isLoading || (!!user && !sessionAligned);
  useEffect(() => {
    clearShopifyPostInstallPricingPath();
    clearShopifyPlanPickerOpened();
    const timeout = window.setTimeout(() => setSessionTimedOut(true), 12000);
    return () => window.clearTimeout(timeout);
  }, []);
  const query = useQuery<ShopifyOnboardingSnapshot>({
    queryKey: key, enabled: !!user && sessionAligned,
    retry: false, staleTime: 0,
    queryFn: async () => {
      const response = await fetch("/api/shopify/onboarding", {
        credentials: "include", cache: "no-store", signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (response.status === 401) return { state: "reconnect_required" };
      if (!response.ok && !data.state) throw new Error("status_unavailable");
      return data;
    },
  });
  useEffect(() => {
    if (!user || !sessionAligned || waitingForSession) return;
    void trackShopifyActivation(user.id, "first_app_page_reached", "start");
    if (query.isFetched) void trackShopifyActivation(user.id, "first_successful_render", "start");
  }, [user?.id, sessionAligned, waitingForSession, query.isFetched]);

  const refresh = async () => {
    setBusy(true);
    setRetryFailed(false);
    try {
      await refreshSession();
      await query.refetch();
    } finally { setBusy(false); }
  };
  const retry = async () => {
    setBusy(true);
    setRetryFailed(false);
    try {
      const response = await fetch("/api/shopify/onboarding/retry", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: "{}", signal: AbortSignal.timeout(10000),
      });
      const snapshot = await response.json() as ShopifyOnboardingSnapshot;
      if (response.status === 401) cache.setQueryData(key, { state: "reconnect_required" });
      else if (snapshot.state) cache.setQueryData(key, snapshot);
      else throw new Error("recovery_unavailable");
      await cache.invalidateQueries({ predicate: q => q.queryKey.includes("/api/subscription") });
      await refreshSession();
    } catch { setRetryFailed(true); }
    finally { setBusy(false); }
  };

  const loading = (waitingForSession && !sessionTimedOut) ||
    (!!user && sessionAligned && query.isPending);
  const snapshot: ShopifyOnboardingSnapshot | null =
    !loading && (!user || (waitingForSession && sessionTimedOut))
      ? { state: "reconnect_required" } : query.data ?? null;
  return <ShopifyStartView locale={i18n.language} snapshot={snapshot} loading={loading} busy={busy}
    failed={query.isError || retryFailed} onRetry={() => void retry()} onRefresh={() => void refresh()} />;
}

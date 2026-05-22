import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import {
  RGE_TEMPLATE_ONBOARDING_PATH,
  normalizeRgePostPurchaseRedirect,
} from "@shared/rgePaths";

function sanitizeClientRedirect(raw: string | null, fallback: string): string {
  if (!raw || typeof raw !== "string") return fallback;
  try {
    const decoded = decodeURIComponent(raw);
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
    const u = new URL(decoded, "https://placeholder.local");
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

function serializeSubscriptionSnapshot(data: any): string {
  const limits = data?.limits;
  if (!limits) return "";
  return JSON.stringify({
    plan: limits.plan,
    planName: limits.planName,
    hasAIBrainAddon: limits.hasAIBrainAddon,
    growthEngineEligible: limits.growthEngineEligible,
    conversationsLimit: limits.conversationsLimit,
    usersLimit: limits.usersLimit,
    usersCount: limits.usersCount,
  });
}

async function fetchSubscriptionJson(): Promise<any> {
  const res = await fetch("/api/subscription", { credentials: "include" });
  if (res.status === 401) return { unauthorized: true };
  if (!res.ok) throw new Error("subscription_fetch_failed");
  return res.json();
}

async function fetchTemplateSnapshot(): Promise<string> {
  try {
    const res = await fetch("/api/templates/realtor-growth-engine", { credentials: "include" });
    if (!res.ok) return "";
    const data = await res.json();
    return JSON.stringify({
      entStatus: data?.entitlement?.status,
      install: data?.install?.installStatus,
    });
  } catch {
    return "";
  }
}

export function PostCheckout() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const abortRef = useRef<AbortController | null>(null);

  const { targetPath, pollTemplate } = useMemo(() => {
    const params = new URLSearchParams(search);
    const redirectRaw = params.get("redirectTo");
    const stripeSession =
      params.get("session_id") ?? params.get("stripe_session") ?? params.get("checkout_session_id");

    let target = sanitizeClientRedirect(redirectRaw, "/app/inbox");

    if (stripeSession && !target.includes("session_id=")) {
      const join = target.includes("?") ? "&" : "?";
      target = `${target}${join}session_id=${encodeURIComponent(stripeSession)}`;
    }

    const pollTemplate =
      target.includes("/templates/realtor-growth-engine") || target.includes("realtor-growth-engine");

    if (pollTemplate) {
      target = normalizeRgePostPurchaseRedirect(target);
    }

    return { targetPath: target, pollTemplate };
  }, [search]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showManualContinue, setShowManualContinue] = useState(false);

  const manualContinuePath = pollTemplate ? RGE_TEMPLATE_ONBOARDING_PATH : targetPath;

  useEffect(() => {
    const slowTimer = window.setTimeout(() => setShowManualContinue(true), 10000);
    return () => window.clearTimeout(slowTimer);
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    async function verifyRgeStripeSession(sessionId: string): Promise<boolean> {
      try {
        const res = await fetch("/api/templates/realtor-growth-engine/verify-payment", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        return res.ok;
      } catch {
        return false;
      }
    }

    async function waitAndRedirect() {
      try {
        const params = new URLSearchParams(search);
        const stripeSession =
          params.get("session_id") ??
          params.get("stripe_session") ??
          params.get("checkout_session_id");

        const first = await fetchSubscriptionJson();
        if (first?.unauthorized) {
          setLocation(`/auth?redirect=${encodeURIComponent(`/post-checkout${search}`)}`);
          return;
        }

        if (pollTemplate && stripeSession) {
          await verifyRgeStripeSession(stripeSession);
          await queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] });
          await queryClient.invalidateQueries({
            queryKey: ["/api/templates/realtor-growth-engine/onboarding/progress"],
          });
        }

        let sub0 = serializeSubscriptionSnapshot(first);
        let tmpl0 = "";
        if (pollTemplate) {
          tmpl0 = await fetchTemplateSnapshot();
        }

        const deadline = Date.now() + 26000;
        while (!ac.signal.aborted && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 650));
          if (ac.signal.aborted) return;

          await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });

          const next = await fetchSubscriptionJson();
          if (next?.unauthorized) break;
          const snap = serializeSubscriptionSnapshot(next);
          let changed = snap !== sub0;

          if (pollTemplate) {
            const tnow = await fetchTemplateSnapshot();
            changed = changed || (tnow !== tmpl0 && tnow !== "");
          }

          if (changed) break;
        }

        await queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] });
        await queryClient.invalidateQueries({
          queryKey: ["/api/templates/realtor-growth-engine/onboarding/progress"],
        });

        const redirectTarget = pollTemplate ? RGE_TEMPLATE_ONBOARDING_PATH : targetPath;

        if (!ac.signal.aborted) setLocation(redirectTarget);
      } catch {
        setErrorMsg("Something went wrong confirming your checkout. Redirecting…");
        setTimeout(() => {
          if (!ac.signal.aborted) setLocation(pollTemplate ? RGE_TEMPLATE_ONBOARDING_PATH : targetPath);
        }, 1600);
      }
    }

    waitAndRedirect();
    return () => ac.abort();
  }, [pollTemplate, search, setLocation, targetPath]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
      <Loader2 className="h-10 w-10 animate-spin text-brand-green mb-4" />
      <p className="text-sm font-medium text-gray-800 text-center max-w-md">
        Finishing checkout… updating your subscription.
      </p>
      {errorMsg ? <p className="text-xs text-amber-700 mt-3 text-center max-w-md">{errorMsg}</p> : null}
      {(errorMsg || showManualContinue) && (
        <Button
          type="button"
          variant="outline"
          className="mt-6"
          onClick={() => setLocation(manualContinuePath)}
          data-testid="button-post-checkout-continue"
        >
          {pollTemplate ? "Continue to Realtor Growth Engine onboarding" : "Continue to your account"}
        </Button>
      )}
    </div>
  );
}

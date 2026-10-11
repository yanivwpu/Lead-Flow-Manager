import React from "react";
import { shopifyOnboardingCopy } from "@/lib/shopifyOnboardingCopy";
import type { ShopifyOnboardingSnapshot } from "@shared/shopifyOnboarding";
import { settingsChannelsHref } from "@/lib/settingsChannelsNavigation";

export type ShopifyStartViewProps = {
  locale?: string;
  snapshot: ShopifyOnboardingSnapshot | null;
  loading: boolean;
  busy: boolean;
  failed: boolean;
  onRetry: () => void;
  onRefresh: () => void;
};

/** All success copy is conditional on a current, server-verified snapshot. */
export function ShopifyStartView({ locale = "en", snapshot, loading, busy, failed, onRetry, onRefresh }: ShopifyStartViewProps) {
  const copy = shopifyOnboardingCopy(locale);
  const state = snapshot?.state;
  const usable = state === "trial_active" || state === "app_ready";
  return (
    <main dir={locale.startsWith("he") ? "rtl" : "ltr"} className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <section className="w-full max-w-xl rounded-2xl bg-white border p-6 sm:p-10 space-y-5"
        aria-busy={loading || busy} data-testid="shopify-first-use">
        {loading ? <p role="status">{copy.checking}</p> : <>
          <h1 className="text-2xl font-semibold">
            {state === "trial_active" ? copy.trialActive :
              state === "app_ready" ? copy.workspaceReady :
              state === "plan_required" ? copy.choosePlan :
              state === "reconnect_required" ? copy.reconnect :
              state === "support_required" ? copy.eligibility :
              copy.notActive}
          </h1>
          {usable ? <>
            <p>{copy.connectDescription}</p>
            {state === "trial_active" ? <p role="status">{copy.trialDescription}</p> : null}
            <a className="block rounded-lg bg-emerald-700 px-4 py-3 text-white text-center font-medium"
              href={settingsChannelsHref({ provider: "whatsapp" })}>{copy.connect}</a>
            <a className="block text-center underline" href="/app/inbox">{copy.inbox}</a>
            <a className="block text-center text-sm underline" href="/pricing">{copy.plansAnytime}</a>
          </> : state === "plan_required" ? <>
            <p>{copy.noAccess}</p>
            <a className="block rounded-lg bg-emerald-700 px-4 py-3 text-white text-center" href="/pricing">
              {copy.plans}
            </a>
          </> : state === "reconnect_required" ? <>
            <p>{copy.reopenDescription}</p>
            <a className="block underline" href="https://admin.shopify.com/">{copy.admin}</a>
            <button type="button" className="rounded-lg border px-4 py-2" disabled={busy} onClick={onRefresh}>
              {copy.checkAgain}
            </button>
          </> : state === "support_required" ? <>
            <p>{copy.supportDescription}</p>
            <a className="block underline" href="mailto:support@whachatcrm.com">{copy.support}</a>
            <a className="block underline" href="/pricing">{copy.plans}</a>
          </> : <>
            <p>{copy.retryDescription}</p>
            <button type="button" className="rounded-lg bg-emerald-700 px-4 py-3 text-white"
              disabled={busy} onClick={failed ? onRefresh : onRetry}>{busy ? copy.busy : copy.retry}</button>
            <a className="block underline" href="mailto:support@whachatcrm.com">{copy.support}</a>
          </>}
          {failed ? <p role="alert">{copy.verificationError}</p> : null}
        </>}
      </section>
    </main>
  );
}

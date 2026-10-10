import React from "react";
import type { ShopifyOnboardingSnapshot } from "@shared/shopifyOnboarding";
import { settingsChannelsHref } from "@/lib/settingsChannelsNavigation";

export type ShopifyStartViewProps = {
  snapshot: ShopifyOnboardingSnapshot | null;
  loading: boolean;
  busy: boolean;
  failed: boolean;
  onRetry: () => void;
  onRefresh: () => void;
};

/** All success copy is conditional on a current, server-verified snapshot. */
export function ShopifyStartView({ snapshot, loading, busy, failed, onRetry, onRefresh }: ShopifyStartViewProps) {
  const state = snapshot?.state;
  const usable = state === "trial_active" || state === "app_ready";
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <section className="w-full max-w-xl rounded-2xl bg-white border p-6 sm:p-10 space-y-5"
        aria-busy={loading || busy} data-testid="shopify-first-use">
        {loading ? <p role="status">Checking your Shopify connection and trial…</p> : <>
          <h1 className="text-2xl font-semibold">
            {state === "trial_active" ? "Your 14-day Pro + AI trial is active" :
              state === "app_ready" ? "Your WhachatCRM workspace is ready" :
              state === "plan_required" ? "Choose a plan to continue" :
              state === "reconnect_required" ? "Reopen WhachatCRM from Shopify" :
              state === "support_required" ? "We need to check your trial eligibility" :
              "We couldn’t activate your trial yet"}
          </h1>
          {usable ? <>
            <p>Connect WhatsApp or another messaging channel to bring customer conversations into Inbox.
              You can keep using WhatsApp Business App with WhatsApp Coexistence.</p>
            {state === "trial_active" ? <p role="status">No paid plan selection is needed to use your active trial.
              Your original trial end date stays the same.</p> : null}
            <a className="block rounded-lg bg-emerald-700 px-4 py-3 text-white text-center font-medium"
              href={settingsChannelsHref({ provider: "whatsapp" })}>Connect a channel</a>
            <a className="block text-center underline" href="/app/inbox">Enter Inbox</a>
            <a className="block text-center text-sm underline" href="/pricing">View plans anytime</a>
          </> : state === "plan_required" ? <>
            <p>This store has no active trial or paid access. Installing again does not restart a trial.</p>
            <a className="block rounded-lg bg-emerald-700 px-4 py-3 text-white text-center" href="/pricing">
              View Shopify plans
            </a>
          </> : state === "reconnect_required" ? <>
            <p>Open the app from your Shopify admin to reconnect. If you returned from installation,
              allow cookies for this app and try opening it again.</p>
            <a className="block underline" href="https://admin.shopify.com/">Open Shopify admin</a>
            <button type="button" className="rounded-lg border px-4 py-2" disabled={busy} onClick={onRefresh}>
              Check connection again
            </button>
          </> : state === "support_required" ? <>
            <p>Your store’s trial history needs review. We have not started or reset a trial.</p>
            <a className="block underline" href="mailto:support@whachatcrm.com">Contact support</a>
            <a className="block underline" href="/pricing">View Shopify plans</a>
          </> : <>
            <p>Your trial is not confirmed. Try again; retrying will not restart or extend a previously used trial.</p>
            <button type="button" className="rounded-lg bg-emerald-700 px-4 py-3 text-white"
              disabled={busy} onClick={failed ? onRefresh : onRetry}>{busy ? "Checking…" : "Try again"}</button>
            <a className="block underline" href="mailto:support@whachatcrm.com">Contact support</a>
          </>}
          {failed ? <p role="alert">We couldn’t verify your connection. Please try again or reopen the app from Shopify.</p> : null}
        </>}
      </section>
    </main>
  );
}

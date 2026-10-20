import { ArrowRight, CheckCircle2, CircleDot, ShoppingBag, Users, ClipboardCheck, LockKeyhole } from "lucide-react";
import { Helmet } from "react-helmet";
import { useAuth } from "@/lib/auth-context";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * STAGING PREVIEW. Deliberately noindexed and absent from the public navigation
 * and Growth Engines catalog until production Shopify activation is accepted.
 */
export function EcommerceGrowthEnginePreview() {
  const { user } = useAuth();
  const setupPath = "/app/integrations?setup=shopify";
  const setupHref = user ? setupPath : `/auth?redirect=${encodeURIComponent(setupPath)}`;
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-slate-900" data-testid="ecommerce-growth-engine-preview">
      <Helmet>
        <title>E-commerce Growth Engine Preview | WhachatCRM</title>
        <meta name="description" content="Preview Shopify customer and order sync with internal order-support tasks in WhachatCRM. Customer messaging automation is not yet active." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <MarketingHeader isLoggedIn={!!user} startTrialLabel="Get started" startTrialShortLabel="Start" />

      <main>
        <section className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-emerald-50/80 via-white to-white px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_0.85fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800">
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                Shopify first · Staging preview
              </div>
              <h1 className="mt-6 max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                New Shopify order? Your next task is ready.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Connect your store, keep customer orders together, and turn new orders into follow-up tasks.
                No technical setup maze.
              </p>
              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <a href={setupHref} data-testid="ecommerce-preview-primary-cta"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 py-3 font-semibold text-white transition hover:bg-emerald-800 sm:w-auto">
                  Set up Shopify <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <a href="/solutions/ecommerce"
                  className="inline-flex items-center justify-center px-3 py-3 text-sm font-medium text-slate-600 underline-offset-4 hover:underline">
                  About E-commerce CRM
                </a>
              </div>
              <p className="mt-4 text-xs text-slate-500">Order-support tasks are currently a staging preview. No automatic customer messages are sent.</p>
            </div>
            <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-[0_24px_70px_-35px_rgba(4,120,87,0.36)] sm:p-7" aria-label="Illustrative Shopify task workflow">
              <div className="mb-6 flex items-center justify-between">
                <p className="text-sm font-semibold">Order support</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                  <CircleDot className="h-3 w-3" /> Sample
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3.5">
                <div className="rounded-lg bg-emerald-50 p-2"><ShoppingBag className="h-5 w-5 text-emerald-700" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Shopify connected</p>
                  <p className="text-xs text-slate-500">Customers & orders synced</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="mx-7 h-7 border-l border-dashed border-emerald-300" aria-hidden="true" />
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3.5">
                <div className="rounded-lg bg-slate-50 p-2"><Users className="h-5 w-5 text-slate-700" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">New order recorded</p>
                  <p className="text-xs text-slate-500">Customer purchase history stays in Contacts</p>
                </div>
              </div>
              <div className="mx-7 h-7 border-l border-dashed border-emerald-300" aria-hidden="true" />
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                <div className="rounded-lg bg-emerald-100 p-2"><ClipboardCheck className="h-5 w-5 text-emerald-800" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Team task created</p>
                  <p className="text-xs text-slate-600">Track, assign, complete — from Follow-Ups</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="mt-4 text-xs text-slate-400">Illustration only. A task is not an order payment or fulfillment update.</p>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">Everything important. Nothing complicated.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { heading:"One connected store", text:"Bring Shopify customers and recorded orders into WhachatCRM." },
                { heading:"Tasks for the team", text:"Keep new order-support follow-up in a clear task list." },
                { heading:"Customer context", text:"Open the customer’s purchase record directly from a task." }
              ].map(item=><article key={item.heading} className="rounded-2xl border border-slate-200 p-5">
                <CheckCircle2 className="mb-4 h-5 w-5 text-emerald-700" />
                <h3 className="font-semibold">{item.heading}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.text}</p>
              </article>)}
            </div>
          </div>
        </section>

        <section className="border-t border-slate-100 bg-slate-50 px-4 py-12 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <LockKeyhole className="h-4 w-4" /> Private preview
              </div>
              <h2 className="mt-2 text-xl font-bold">Start simple. Expand when it's ready.</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Automated customer messaging, fulfillment and cancellation journeys, and abandoned-cart recovery are not active in this preview.
              </p>
            </div>
            <a href={setupHref} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-800">
              View Shopify setup <ArrowRight className="h-4 w-4"/>
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

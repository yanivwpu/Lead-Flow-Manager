import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GrowthEngineGalleryCard } from "@/pages/Templates";
import { WorkflowWalkthrough } from "@/components/growthEngines/WorkflowWalkthrough";
import { realtorWorkflowWalkthrough, type WorkflowLocale } from "@/components/growthEngines/workflowWalkthroughConfig";
import { GROWTH_ENGINE_CARDS } from "@/lib/growthEnginesCatalog";
import "@/index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const stateFixtures = [
  { label: "Free", entitlement: { status: "locked" as const }, accessOk: false, hasPro: false },
  { label: "Pro / trial", entitlement: { status: "locked" as const }, accessOk: true, hasPro: true },
  { label: "Setup incomplete", entitlement: { status: "purchased" as const, purchasedAt: "2026-01-01", onboardingSubmittedAt: null }, accessOk: true, hasPro: true },
  { label: "Installed", entitlement: { status: "installed" as const, onboardingSubmittedAt: "2026-01-01" }, accessOk: true, hasPro: true },
  { label: "Expired Pro", entitlement: { status: "installed" as const, onboardingSubmittedAt: "2026-01-01" }, accessOk: false, hasPro: false },
];

function Preview() {
  const [locale, setLocale] = useState<WorkflowLocale>("en");
  const [lastAction, setLastAction] = useState("No action selected");
  const realtor = GROWTH_ENGINE_CARDS.find((engine) => engine.slug === "realtor-growth-engine")!;
  const prospect = GROWTH_ENGINE_CARDS.find((engine) => engine.slug === "prospect-ai")!;
  const comingSoon = GROWTH_ENGINE_CARDS.find((engine) => engine.status === "coming_soon")!;

  if (!import.meta.env.DEV) {
    return <main className="p-8 text-center text-sm text-slate-600">This fixture is available in development only.</main>;
  }

  const navigate = (path: string) => setLastAction(path);

  return (
    <main dir={locale === "he" ? "rtl" : "ltr"} className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-10">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Development fixture</p>
              <h1 className="mt-1 text-2xl font-bold">Growth Engines visual preview</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">Real production components with mocked catalog and entitlement inputs. No authentication, API, or database is used.</p>
            </div>
            <div className="flex gap-2" role="group" aria-label="Preview language">
              {(["en", "es", "he"] as const).map((language) => <button key={language} type="button" onClick={() => setLocale(language)} className={`rounded-md border px-3 py-2 text-sm font-semibold uppercase ${locale === language ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600"}`}>{language}</button>)}
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600" aria-live="polite">Mock navigation: {lastAction}</p>
        </header>

        <section aria-labelledby="catalog-preview-title">
          <h2 id="catalog-preview-title" className="text-xl font-bold">Actual gallery cards</h2>
          <p className="mt-1 text-sm text-slate-600">State matrix for the Realtor card, plus Prospect AI and a non-installable coming-soon engine.</p>
          <div className="mt-4 grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stateFixtures.map((fixture) => <div key={fixture.label} className="space-y-1.5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fixture.label}</p><GrowthEngineGalleryCard engine={{ ...realtor, slug: `realtor-growth-engine-preview-${fixture.label}` }} setLocation={navigate} rgeEntitlement={fixture.entitlement} accessOk={fixture.accessOk} hasPro={fixture.hasPro} /></div>)}
            <div className="space-y-1.5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prospect AI · Free allowance preserved in details</p><GrowthEngineGalleryCard engine={prospect} setLocation={navigate} prospectAiActivated={false} /></div>
            <div className="space-y-1.5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coming soon</p><GrowthEngineGalleryCard engine={comingSoon} setLocation={navigate} /></div>
          </div>
        </section>

        <section aria-labelledby="walkthrough-preview-title">
          <h2 id="walkthrough-preview-title" className="mb-4 text-xl font-bold">Actual WorkflowWalkthrough</h2>
          <WorkflowWalkthrough config={realtorWorkflowWalkthrough} locale={locale} />
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={queryClient}><Preview /></QueryClientProvider></StrictMode>);

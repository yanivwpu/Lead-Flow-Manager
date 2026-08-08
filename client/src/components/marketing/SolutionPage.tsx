import { lazy, Suspense, useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  MessageSquare,
  Puzzle,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingBreadcrumbs } from "@/components/marketing/MarketingBreadcrumbs";
import { MarketingLandingCta } from "@/components/marketing/MarketingLandingCta";
import { SolutionWorkflow } from "@/components/marketing/SolutionWorkflow";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { getDirection } from "@/lib/i18n";
import type { SolutionPageContent } from "@shared/solutionPages";

const SiteFooter = lazy(() =>
  import("@/components/SiteFooter").then((m) => ({ default: m.SiteFooter })),
);
const BookDemoModal = lazy(() =>
  import("@/components/BookDemoModal").then((m) => ({ default: m.BookDemoModal })),
);

type Props = { content: SolutionPageContent };

function HeroVisual({ visual }: { visual: SolutionPageContent["heroVisual"] }) {
  return (
    <div
      className="relative mx-auto w-full max-w-md"
      style={{ aspectRatio: "4 / 5" }}
      aria-hidden
    >
      <div className="absolute inset-0 rounded-[1.75rem] bg-gradient-to-br from-emerald-50 via-white to-sky-50 ring-1 ring-gray-200" />
      <div className="absolute left-4 right-4 top-6 rounded-2xl bg-white p-4 shadow-md ring-1 ring-gray-100">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand-green">
          <MessageSquare className="h-3.5 w-3.5" />
          {visual.inquiryLabel}
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {visual.inquiryMessage}
        </div>
      </div>
      <div className="absolute left-8 right-2 top-[38%] rounded-2xl bg-emerald-600 p-4 text-white shadow-lg">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-emerald-100">
          <Sparkles className="h-3.5 w-3.5" />
          {visual.suggestionLabel}
        </div>
        <p className="text-sm leading-snug">{visual.suggestionMessage}</p>
      </div>
      <div className="absolute bottom-6 left-4 right-8 rounded-2xl bg-white p-4 shadow-md ring-1 ring-gray-100">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-500">
          <span>Lead stage</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-brand-green">{visual.stageLabel}</span>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <Calendar className="h-4 w-4 text-brand-green" />
          {visual.nextStep}
        </div>
      </div>
    </div>
  );
}

export function SolutionPage({ content }: Props) {
  const { user } = useAuth();
  const [showDemo, setShowDemo] = useState(false);
  const isRTL = getDirection() === "rtl";
  const canonical = `${MARKETING_URL}${content.path}`;
  const ogTitle = content.ogTitle ?? content.title;

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Solutions", href: "/#built-for" },
    { label: content.breadcrumbLabel, href: content.path },
  ];

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: content.h1,
    url: canonical,
    description: content.metaDescription,
  };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen bg-white ${isRTL ? "text-right" : "text-left"}`}>
      <Helmet>
        <title>{content.title}</title>
        <meta name="description" content={content.metaDescription} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={content.metaDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${MARKETING_URL}/og-image.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={ogTitle} />
        <meta name="twitter:description" content={content.metaDescription} />
        <script type="application/ld+json">{JSON.stringify(webPageSchema)}</script>
      </Helmet>

      {showDemo ? (
        <Suspense fallback={null}>
          <BookDemoModal isOpen={showDemo} onClose={() => setShowDemo(false)} />
        </Suspense>
      ) : null}

      <MarketingHeader
        isLoggedIn={!!user}
        startTrialLabel="Start Free Trial"
        startTrialShortLabel="Start Free"
      />

      <main>
        <section className="border-b border-gray-100 px-4 pb-12 pt-6 md:px-6 md:pb-16 md:pt-8">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] xl:max-w-[1440px]">
            <div>
              <MarketingBreadcrumbs items={breadcrumbs} className="mb-6" />
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
                {content.industryLabel}
              </p>
              <h1 className="font-display text-3xl font-bold tracking-tight text-gray-950 md:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
                {content.h1}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-gray-600 md:text-lg">
                {content.heroIntro}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href={user ? "/app/inbox" : "/auth"}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-green px-6 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={content.secondaryCta.href}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-gray-200 bg-white px-6 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                >
                  {content.secondaryCta.label}
                </Link>
                <button
                  type="button"
                  onClick={() => setShowDemo(true)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-6 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Book a Demo
                </button>
              </div>
            </div>
            <HeroVisual visual={content.heroVisual} />
          </div>
        </section>

        <section className="bg-gray-50 px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
              Industry challenges
            </p>
            <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
              {content.challengesHeading}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {content.challenges.map((item) => (
                <div key={item.title} className="rounded-2xl bg-white p-5 ring-1 ring-gray-100">
                  <h3 className="font-semibold text-gray-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
              How WhachatCRM helps
            </p>
            <h2 className="font-display mb-4 text-2xl font-bold text-gray-950 md:text-3xl">
              Multiple products working together
            </h2>
            <p className="mb-8 max-w-3xl text-gray-600">{content.helpsIntro}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {content.helpsPoints.map((item) => (
                <div key={item.title} className="rounded-2xl border border-gray-100 bg-gray-50/80 p-5">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-brand-green">
                    <CheckCircle2 className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="font-semibold text-gray-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-b from-emerald-50/40 to-white px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <SolutionWorkflow title={content.workflowTitle} steps={content.workflowSteps} />
          </div>
        </section>

        <section className="px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
              Platform capabilities
            </p>
            <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
              Relevant WhachatCRM products
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {content.products.map((product) => {
                const body = (
                  <>
                    <h3 className="font-semibold text-gray-950">{product.label}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{product.description}</p>
                    {product.href ? (
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-green">
                        Learn more <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    ) : null}
                  </>
                );
                return product.href ? (
                  <Link
                    key={product.label}
                    href={product.href}
                    className="rounded-2xl border border-gray-200 bg-white p-5 transition-colors hover:border-brand-green/40 hover:bg-emerald-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={product.label} className="rounded-2xl border border-gray-200 bg-white p-5">
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-gray-50 px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
              Use cases
            </p>
            <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
              Realistic scenarios for {content.industryLabel.toLowerCase()}
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {content.useCases.map((useCase, i) => (
                <article key={i} className="rounded-2xl bg-white p-5 ring-1 ring-gray-100">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Situation
                  </h3>
                  <p className="mt-1 text-gray-900">{useCase.situation}</p>
                  <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    What WhachatCRM does
                  </h3>
                  <p className="mt-1 text-gray-700">{useCase.action}</p>
                  <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Outcome
                  </h3>
                  <p className="mt-1 font-medium text-brand-green">{useCase.outcome}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 xl:max-w-[1440px]">
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <MessageSquare className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="font-display text-2xl font-bold text-gray-950">Messaging channels</h2>
              <p className="mt-2 text-gray-600">Verified channels available in WhachatCRM.</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {content.channels.map((channel) => (
                  <li
                    key={channel}
                    className="rounded-full bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200"
                  >
                    {channel}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <Puzzle className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="font-display text-2xl font-bold text-gray-950">Relevant integrations</h2>
              <p className="mt-2 text-gray-600">Connect the tools that matter for this industry.</p>
              <ul className="mt-5 space-y-2">
                {content.integrations.map((item) => (
                  <li key={item.label}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green hover:text-emerald-700"
                      >
                        {item.label}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-gray-800">{item.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-y border-gray-100 bg-gray-50 px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
              How it works
            </h2>
            <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {content.howItWorks.map((step, index) => (
                <li key={step.title} className="rounded-2xl bg-white p-5 ring-1 ring-gray-100">
                  <span className="text-sm font-bold text-brand-green">Step {index + 1}</span>
                  <h3 className="mt-2 font-semibold text-gray-950">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
              Related products and integrations
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {content.relatedLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-2xl border border-gray-200 p-5 transition-colors hover:border-brand-green/40 hover:bg-emerald-50/30"
                >
                  <span className="font-semibold text-gray-950">{link.label}</span>
                  {link.description ? (
                    <p className="mt-1 text-sm text-gray-600">{link.description}</p>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <MarketingLandingCta
          onBookDemo={() => setShowDemo(true)}
          headline={content.finalCtaHeadline}
        />
        <p className="-mt-10 mb-10 px-4 text-center text-sm text-gray-500 md:px-6">
          {content.finalCtaSubtitle}
        </p>
      </main>

      <Suspense fallback={<footer className="min-h-[200px] bg-gray-50" aria-hidden />}>
        <SiteFooter />
      </Suspense>
    </div>
  );
}

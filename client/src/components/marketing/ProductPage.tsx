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
import { MarketingScreenshot } from "@/components/marketing/MarketingScreenshot";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { getDirection } from "@/lib/i18n";
import { screenshot } from "@shared/marketingScreenshots";
import type { ProductPageContent } from "@shared/productPages";

const SiteFooter = lazy(() =>
  import("@/components/SiteFooter").then((m) => ({ default: m.SiteFooter })),
);
const BookDemoModal = lazy(() =>
  import("@/components/BookDemoModal").then((m) => ({ default: m.BookDemoModal })),
);

type Props = { content: ProductPageContent };

function HeroVisual({ visual }: { visual: ProductPageContent["heroVisual"] }) {
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
          <span>Status</span>
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

const PLATFORM_STORY = [
  { label: "Prospect AI", href: "/prospect-ai", text: "finds opportunities" },
  { label: "AI Brain", href: "/ai-brain", text: "understands and recommends" },
  { label: "Campaigns", href: "/campaigns", text: "start personalized outreach" },
  { label: "Unified Inbox", href: "/unified-inbox", text: "manages replies" },
  { label: "AI Copilot", href: "/ai-copilot", text: "guides the conversation" },
  { label: "Chatbots & Automations", href: "/automations", text: "handle repeatable work" },
  {
    label: "Growth Engines",
    href: "/realtor-growth-engine",
    text: "package industry workflows",
  },
] as const;

export function ProductPage({ content }: Props) {
  const { user } = useAuth();
  const [showDemo, setShowDemo] = useState(false);
  const isRTL = getDirection() === "rtl";
  const canonical = `${MARKETING_URL}${content.path}`;
  const ogTitle = content.ogTitle ?? content.title;
  const heroShot =
    content.screenshotKey && content.screenshotAlt
      ? screenshot(content.screenshotKey, content.screenshotAlt, { size: "hero" })
      : null;

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Product", href: "/#ai-platform" },
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
                {content.productLabel}
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
            {heroShot ? (
              <div className="mx-auto w-full max-w-xl">
                <MarketingScreenshot {...heroShot} priority />
              </div>
            ) : (
              <HeroVisual visual={content.heroVisual} />
            )}
          </div>
        </section>

        <section className="bg-gray-50 px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
              The problem
            </p>
            <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
              {content.problemTitle}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {content.problems.map((item) => (
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
              How it helps
            </p>
            <h2 className="font-display mb-3 text-2xl font-bold text-gray-950 md:text-3xl">
              How {content.productLabel} works
            </h2>
            <p className="mb-8 max-w-3xl text-base text-gray-600 md:text-lg">{content.howIntro}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {content.howPoints.map((item) => (
                <div key={item.title} className="rounded-2xl border border-gray-100 bg-gray-50/80 p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-brand-green">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  </div>
                  <h3 className="font-semibold text-gray-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {content.comparison ? (
          <section className="border-y border-gray-100 bg-white px-4 py-14 md:px-6 md:py-16">
            <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
                Differentiation
              </p>
              <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
                Generic AI vs WhachatCRM AI Brain
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                  <h3 className="mb-4 text-lg font-semibold text-gray-700">{content.comparison.leftTitle}</h3>
                  <ul className="space-y-3">
                    {content.comparison.leftItems.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-gray-600">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6">
                  <h3 className="mb-4 text-lg font-semibold text-emerald-900">{content.comparison.rightTitle}</h3>
                  <ul className="space-y-3">
                    {content.comparison.rightItems.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-emerald-950">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="bg-gray-50 px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <SolutionWorkflow title={content.workflowTitle} steps={content.workflowSteps} />
          </div>
        </section>

        <section className="px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
              Capabilities
            </p>
            <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
              {content.featuresTitle}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {content.features.map((feature) => {
                const body = (
                  <>
                    <h3 className="font-semibold text-gray-950">{feature.label}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{feature.description}</p>
                    {feature.href ? (
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-green">
                        Learn more <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </>
                );
                return feature.href ? (
                  <Link
                    key={feature.label}
                    href={feature.href}
                    className="rounded-2xl border border-gray-100 bg-white p-5 transition hover:border-emerald-200 hover:shadow-sm"
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={feature.label} className="rounded-2xl border border-gray-100 bg-white p-5">
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {content.integrationCategories?.length ? (
          <section className="border-y border-gray-100 bg-gray-50 px-4 py-14 md:px-6 md:py-16">
            <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
                Directory
              </p>
              <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
                Verified integrations
              </h2>
              <div className="space-y-10">
                {content.integrationCategories.map((category) => (
                  <div key={category.title}>
                    <h3 className="mb-4 text-lg font-semibold text-gray-900">{category.title}</h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {category.items.map((item) => {
                        const card = (
                          <div className="h-full rounded-2xl border border-gray-200 bg-white p-5">
                            <div className="mb-2 flex items-center gap-2">
                              <Puzzle className="h-4 w-4 text-brand-green" aria-hidden />
                              <p className="font-semibold text-gray-950">{item.name}</p>
                            </div>
                            <p className="text-sm leading-relaxed text-gray-600">{item.description}</p>
                            {item.href ? (
                              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-green">
                                Open guide <ArrowRight className="h-3.5 w-3.5" />
                              </span>
                            ) : null}
                          </div>
                        );
                        return item.href ? (
                          <Link key={item.name} href={item.href} className="block transition hover:opacity-95">
                            {card}
                          </Link>
                        ) : (
                          <div key={item.name}>{card}</div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="bg-white px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
              Use cases
            </p>
            <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
              Realistic ways teams use {content.productLabel}
            </h2>
            <div className="grid gap-4 lg:grid-cols-3">
              {content.useCases.map((useCase) => (
                <article
                  key={useCase.situation}
                  className="flex flex-col rounded-2xl border border-gray-100 bg-gray-50/70 p-5"
                >
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Situation</h3>
                  <p className="mt-1 text-sm font-medium text-gray-950">{useCase.situation}</p>
                  <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    What WhachatCRM does
                  </h3>
                  <p className="mt-1 text-sm text-gray-700">{useCase.action}</p>
                  <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Outcome</h3>
                  <p className="mt-1 text-sm text-gray-700">{useCase.outcome}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {content.showPlatformStory ? (
          <section className="border-y border-gray-100 bg-emerald-50/40 px-4 py-14 md:px-6 md:py-16">
            <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
                Platform story
              </p>
              <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
                How WhachatCRM works together
              </h2>
              <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {PLATFORM_STORY.map((step, index) => (
                  <li key={step.label} className="rounded-2xl bg-white p-4 ring-1 ring-emerald-100">
                    <p className="text-xs font-semibold text-brand-green">{index + 1}</p>
                    <Link href={step.href} className="mt-1 block font-semibold text-gray-950 hover:text-brand-green">
                      {step.label}
                    </Link>
                    <p className="mt-1 text-sm text-gray-600">{step.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        <section className="px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
              Getting started
            </p>
            <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">How to get started</h2>
            <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {content.howItWorks.map((step, index) => (
                <li key={step.title} className="rounded-2xl bg-white p-5 ring-1 ring-gray-100">
                  <span className="text-sm font-bold text-brand-green">{index + 1}</span>
                  <h3 className="mt-2 font-semibold text-gray-950">{step.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-gray-100 bg-gray-50 px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <h2 className="font-display mb-6 text-2xl font-bold text-gray-950">Related products</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {content.relatedProducts.map((link) => (
                <Link
                  key={link.href + link.label}
                  href={link.href}
                  className="rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-emerald-200"
                >
                  <p className="font-semibold text-gray-950">{link.label}</p>
                  {link.description ? (
                    <p className="mt-1 text-sm text-gray-600">{link.description}</p>
                  ) : null}
                </Link>
              ))}
            </div>
            {content.industryLinks?.length ? (
              <>
                <h2 className="font-display mb-6 mt-12 text-2xl font-bold text-gray-950">
                  See it in industry solutions
                </h2>
                <div className="flex flex-wrap gap-3">
                  {content.industryLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-emerald-200"
                    >
                      {link.label}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
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

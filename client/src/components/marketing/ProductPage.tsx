import { lazy, Suspense, useMemo, useState } from "react";
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
import { ProductFlowSchema } from "@/components/marketing/ProductFlowSchema";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { getDirection } from "@/lib/i18n";
import { useMarketingUrlLocale } from "@/lib/marketingLocaleRouting";
import { cn } from "@/lib/utils";
import { screenshot } from "@shared/marketingScreenshots";
import { PRODUCT_THEMES } from "@shared/productThemes";
import type { ProductPageContent } from "@shared/productPages";
import {
  BRAIN_CONSUMER_TEXT,
  getLocalizedProductPage,
  getMarketingChrome,
  PLATFORM_STORY_STEP_TEXT,
} from "@shared/localizeMarketingContent";
import {
  getCanonicalUrl,
  getHreflangLinks,
  localizePath,
  localizedInternalHref,
} from "@shared/localeRoutes";
import { renderRtlAwareHeadingText, renderHeGenericAiVsBrainHeading } from "@/components/marketing/RtlAwareHeadingText";
import { needsHebrewAiBidiLayout } from "@shared/rtlLeadingLtrIsolate";

const SiteFooter = lazy(() =>
  import("@/components/SiteFooter").then((m) => ({ default: m.SiteFooter })),
);
const BookDemoModal = lazy(() =>
  import("@/components/BookDemoModal").then((m) => ({ default: m.BookDemoModal })),
);

type Props = { content: ProductPageContent };

function HeroVisual({
  visual,
  theme,
  statusLabel,
}: {
  visual: ProductPageContent["heroVisual"];
  theme: (typeof PRODUCT_THEMES)[keyof typeof PRODUCT_THEMES];
  statusLabel: string;
}) {
  return (
    <div
      className="relative mx-auto w-full max-w-md"
      style={{ aspectRatio: "4 / 5" }}
      aria-hidden
    >
      <div className={cn("absolute inset-0 rounded-[1.75rem] ring-1 ring-gray-200", theme.heroBg)} />
      <div className="absolute left-4 right-4 top-6 rounded-2xl bg-white p-4 shadow-md ring-1 ring-gray-100">
        <div className={cn("mb-2 flex items-center gap-2 text-xs font-semibold", theme.accentText)}>
          <MessageSquare className="h-3.5 w-3.5" />
          {visual.inquiryLabel}
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {visual.inquiryMessage}
        </div>
      </div>
      <div className={cn("absolute left-8 right-2 top-[38%] rounded-2xl p-4 text-white shadow-lg", theme.accentBg)}>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-white/85">
          <Sparkles className="h-3.5 w-3.5" />
          {visual.suggestionLabel}
        </div>
        <p className="text-sm leading-snug">{visual.suggestionMessage}</p>
      </div>
      <div className="absolute bottom-6 left-4 right-8 rounded-2xl bg-white p-4 shadow-md ring-1 ring-gray-100">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-500">
          <span>{statusLabel}</span>
          <span className={cn("rounded-full px-2 py-0.5", theme.badgeBg, theme.badgeText)}>
            {visual.stageLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <Calendar className={cn("h-4 w-4", theme.accentText)} />
          {visual.nextStep}
        </div>
      </div>
    </div>
  );
}

const PLATFORM_STORY_LINKS = [
  { label: "Prospect AI", href: "/prospect-ai" },
  { label: "AI Brain", href: "/ai-brain" },
  { label: "Campaigns", href: "/campaigns" },
  { label: "Unified Inbox", href: "/unified-inbox" },
  { label: "AI Copilot", href: "/ai-copilot" },
  { label: "Chatbots & Automations", href: "/automations" },
  { label: "Growth Engines", href: "/realtor-growth-engine" },
] as const;

const BRAIN_CONSUMER_LINKS = [
  { label: "Prospect AI", href: "/prospect-ai" },
  { label: "AI Copilot", href: "/ai-copilot" },
  { label: "Campaigns", href: "/campaigns" },
  { label: "Qualification", href: "/ai-brain" },
] as const;

export function ProductPage({ content: baseContent }: Props) {
  const { user } = useAuth();
  const [showDemo, setShowDemo] = useState(false);
  const locale = useMarketingUrlLocale();
  const chrome = getMarketingChrome(locale);
  const content = getLocalizedProductPage(baseContent, locale);
  const isRTL = getDirection() === "rtl";
  const arrowClass = isRTL ? "h-4 w-4 rotate-180" : "h-4 w-4";
  const platformStoryText = PLATFORM_STORY_STEP_TEXT[locale];
  const brainConsumerText = BRAIN_CONSUMER_TEXT[locale];
  const theme = PRODUCT_THEMES[content.themeId];
  const workflowVariant = content.workflowVariant ?? "both";
  const localePath = localizePath(content.path, locale) || content.path;
  const canonical =
    getCanonicalUrl(content.path, locale, MARKETING_URL) || `${MARKETING_URL}${content.path}`;
  const hreflangLinks = getHreflangLinks(content.path, MARKETING_URL);
  const localeHref = (href: string) => localizedInternalHref(href, locale);
  const ogTitle = content.ogTitle ?? content.title;
  const heroShot =
    content.screenshotKey && content.screenshotAlt
      ? screenshot(content.screenshotKey, content.screenshotAlt, { size: "hero" })
      : null;

  const breadcrumbs = [
    { label: chrome.home, href: localeHref("/") },
    { label: chrome.product, href: localeHref("/#ai-platform") },
    { label: content.breadcrumbLabel, href: localePath },
  ];

  const howProductWorksTitle = useMemo(
    () => chrome.howProductWorks.replace("{{product}}", content.productLabel),
    [chrome.howProductWorks, content.productLabel],
  );
  const realisticTeamsTitle = useMemo(
    () => chrome.realisticTeamsUse.replace("{{product}}", content.productLabel),
    [chrome.realisticTeamsUse, content.productLabel],
  );

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: content.h1,
    url: canonical,
    description: content.metaDescription,
  };

  const showSteps = workflowVariant === "steps" || workflowVariant === "both";
  const showScenarios =
    (workflowVariant === "scenarios" || workflowVariant === "both") &&
    Boolean(content.flowScenarios?.length);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen bg-white ${isRTL ? "text-right" : "text-left"}`}>
      <Helmet>
        <title>{content.title}</title>
        <meta name="description" content={content.metaDescription} />
        <link rel="canonical" href={canonical} />
        {hreflangLinks.map((alt) => (
          <link key={alt.hreflang} rel="alternate" hrefLang={alt.hreflang} href={alt.href} />
        ))}
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
        startTrialLabel={chrome.startFreeTrial}
        startTrialShortLabel={chrome.startFree}
      />

      <main>
        <section className={cn("border-b border-gray-100 px-4 pb-12 pt-6 md:px-6 md:pb-16 md:pt-8", theme.heroBg)}>
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] xl:max-w-[1440px]">
            <div>
              <MarketingBreadcrumbs items={breadcrumbs} className="mb-6" />
              <p className={cn("mb-3 text-sm font-semibold uppercase tracking-[0.16em]", theme.accentText)}>
                {content.productLabel}
              </p>
              <h1 className="font-display text-3xl font-bold tracking-tight text-gray-950 md:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
                {renderRtlAwareHeadingText(content.h1)}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-gray-600 md:text-lg">
                {locale === "he" && needsHebrewAiBidiLayout(content.heroIntro)
                  ? renderRtlAwareHeadingText(content.heroIntro)
                  : content.heroIntro}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href={
                    content.primaryCtaHref
                      ? localeHref(content.primaryCtaHref)
                      : user
                        ? "/app/inbox"
                        : "/auth"
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-green px-6 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {content.primaryCtaLabel ?? chrome.startFreeTrial}
                  <ArrowRight className={arrowClass} />
                </Link>
                <Link
                  href={localeHref(content.secondaryCta.href)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-gray-200 bg-white px-6 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                >
                  {content.secondaryCta.label}
                </Link>
                <button
                  type="button"
                  onClick={() => setShowDemo(true)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-6 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                >
                  {chrome.bookDemo}
                </button>
              </div>
            </div>
            {heroShot ? (
              <div className={cn("mx-auto w-full max-w-xl rounded-2xl p-2 ring-1", theme.accentRing, theme.accentSoft)}>
                <MarketingScreenshot
                  {...heroShot}
                  priority
                  enlargeLabel={chrome.enlargeScreenshot}
                  closeEnlargedLabel={chrome.closeEnlarged}
                />
              </div>
            ) : (
              <HeroVisual visual={content.heroVisual} theme={theme} statusLabel={chrome.status} />
            )}
          </div>
        </section>

        <section className="bg-white px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className={cn("mb-2 text-sm font-semibold uppercase tracking-[0.16em]", theme.accentText)}>
              {chrome.theProblem}
            </p>
            <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
              {locale === "he" && needsHebrewAiBidiLayout(content.problemTitle)
                ? renderRtlAwareHeadingText(content.problemTitle)
                : content.problemTitle}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {content.problems.map((item) => (
                <div
                  key={item.title}
                  className={cn("border-s-4 bg-gray-50/80 py-4 ps-5 pe-4", theme.accentBorder)}
                >
                  <h3 className="font-semibold text-gray-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={cn("px-4 py-14 md:px-6 md:py-16", theme.sectionAltBg)}>
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className={cn("mb-2 text-sm font-semibold uppercase tracking-[0.16em]", theme.accentText)}>
              {chrome.howItHelps}
            </p>
            <h2 className="font-display mb-3 text-2xl font-bold text-gray-950 md:text-3xl">
              {howProductWorksTitle}
            </h2>
            <p className="mb-8 max-w-3xl text-base text-gray-600 md:text-lg">{content.howIntro}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {content.howPoints.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-sm">
                  <div
                    className={cn(
                      "mb-3 flex h-9 w-9 items-center justify-center rounded-full",
                      theme.badgeBg,
                      theme.accentText,
                    )}
                  >
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
              <p className={cn("mb-2 text-sm font-semibold uppercase tracking-[0.16em]", theme.accentText)}>
                {chrome.differentiation}
              </p>
              <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
                {locale === "he" ? renderHeGenericAiVsBrainHeading() : chrome.genericAiVsBrain}
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                  <h3 className="mb-4 text-lg font-semibold text-gray-700">
                    {locale === "he" && needsHebrewAiBidiLayout(content.comparison.leftTitle)
                      ? renderRtlAwareHeadingText(content.comparison.leftTitle)
                      : content.comparison.leftTitle}
                  </h3>
                  <ul className="space-y-3">
                    {content.comparison.leftItems.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-gray-600">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={cn("rounded-2xl border p-6", theme.accentBorder, theme.accentSoft)}>
                  <h3 className={cn("mb-4 text-lg font-semibold", theme.accentText)}>
                    {content.comparison.rightTitle}
                  </h3>
                  <ul className="space-y-3">
                    {content.comparison.rightItems.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-gray-900">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {content.visualSections?.length ? (
          <section className="bg-white px-4 py-14 md:px-6 md:py-16">
            <div className="mx-auto max-w-7xl space-y-16 xl:max-w-[1440px]">
              {content.visualSections.map((section) => {
                const shot =
                  section.screenshotKey && section.screenshotAlt
                    ? screenshot(section.screenshotKey, section.screenshotAlt, { size: "content" })
                    : null;
                return (
                  <div
                    key={section.title}
                    className={cn(
                      "grid items-center gap-8 lg:grid-cols-2",
                      section.reverse && "lg:[&>*:first-child]:order-2",
                    )}
                  >
                    <div>
                      <p className={cn("mb-2 text-sm font-semibold uppercase tracking-[0.16em]", theme.accentText)}>
                        {chrome.productDetail}
                      </p>
                      <h2 className="font-display text-2xl font-bold text-gray-950 md:text-3xl">
                        {section.title}
                      </h2>
                      <p className="mt-4 text-base leading-relaxed text-gray-600">{section.description}</p>
                    </div>
                    {shot ? (
                      <div className={cn("rounded-2xl p-2 ring-1", theme.accentRing, theme.accentSoft)}>
                        <MarketingScreenshot
                          {...shot}
                          enlargeLabel={chrome.enlargeScreenshot}
                          closeEnlargedLabel={chrome.closeEnlarged}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {content.path === "/ai-brain" ? (
          <section className={cn("px-4 py-14 md:px-6 md:py-16", theme.sectionAltBg)}>
            <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
              <p className={cn("mb-2 text-sm font-semibold uppercase tracking-[0.16em]", theme.accentText)}>
                {chrome.platformIntelligence}
              </p>
              <h2 className="font-display mb-3 text-2xl font-bold text-gray-950 md:text-3xl">
                {chrome.oneBrainAcross}
              </h2>
              <p className="mb-8 max-w-3xl text-base text-gray-600 md:text-lg">
                {chrome.oneBrainIntro}
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {BRAIN_CONSUMER_LINKS.map((item, index) => (
                  <Link
                    key={item.label}
                    href={localeHref(item.href)}
                    className="rounded-2xl border border-white bg-white/95 p-5 shadow-sm transition hover:shadow-md"
                  >
                    <p className={cn("text-sm font-semibold", theme.accentText)}>{item.label}</p>
                    <p className="mt-2 text-sm text-gray-600">{brainConsumerText[index]}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {showScenarios && content.flowScenarios ? (
          <ProductFlowSchema
            scenarios={content.flowScenarios}
            theme={theme}
            heading={
              content.path === "/chatbot-builder"
                ? chrome.flowScenariosChatbot
                : chrome.flowScenariosAutomations
            }
            eyebrow={chrome.flowEyebrow}
          />
        ) : null}

        {showSteps ? (
          <section className={cn("px-4 py-14 md:px-6 md:py-16", showScenarios ? "bg-white" : theme.sectionAltBg)}>
            <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
              <SolutionWorkflow
                title={content.workflowTitle}
                steps={content.workflowSteps}
                eyebrowClassName={theme.accentText}
                stepBadgeClassName={cn(theme.accentBg, "text-white")}
                eyebrow={chrome.visualWorkflow}
                isRTL={isRTL}
              />
            </div>
          </section>
        ) : null}

        <section className="bg-white px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className={cn("mb-2 text-sm font-semibold uppercase tracking-[0.16em]", theme.accentText)}>
              {chrome.capabilities}
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
                      <span className={cn("mt-3 inline-flex items-center gap-1 text-sm font-semibold", theme.accentText)}>
                        {chrome.learnMore} <ArrowRight className={cn("h-3.5 w-3.5", isRTL && "rotate-180")} />
                      </span>
                    ) : null}
                  </>
                );
                return feature.href ? (
                  <Link
                    key={feature.label}
                    href={localeHref(feature.href)}
                    className={cn(
                      "rounded-2xl border bg-white p-5 transition hover:shadow-sm",
                      theme.accentBorder,
                    )}
                  >
                    {body}
                  </Link>
                ) : (
                  <div
                    key={feature.label}
                    className={cn("rounded-2xl border bg-white p-5", theme.accentBorder)}
                  >
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {content.integrationCategories?.length ? (
          <section className={cn("border-y border-gray-100 px-4 py-14 md:px-6 md:py-16", theme.sectionAltBg)}>
            <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
              <p className={cn("mb-2 text-sm font-semibold uppercase tracking-[0.16em]", theme.accentText)}>
                {chrome.directory}
              </p>
              <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
                {chrome.verifiedIntegrations}
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
                              <Puzzle className={cn("h-4 w-4", theme.accentText)} aria-hidden />
                              <p className="font-semibold text-gray-950">{item.name}</p>
                            </div>
                            <p className="text-sm leading-relaxed text-gray-600">{item.description}</p>
                            {item.href ? (
                              <span
                                className={cn(
                                  "mt-3 inline-flex items-center gap-1 text-sm font-semibold",
                                  theme.accentText,
                                )}
                              >
                                {chrome.openGuide} <ArrowRight className={cn("h-3.5 w-3.5", isRTL && "rotate-180")} />
                              </span>
                            ) : null}
                          </div>
                        );
                        return item.href ? (
                          <Link key={item.name} href={localeHref(item.href)} className="block transition hover:opacity-95">
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

        <section className={cn("px-4 py-14 md:px-6 md:py-16", theme.sectionAltBg)}>
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className={cn("mb-2 text-sm font-semibold uppercase tracking-[0.16em]", theme.accentText)}>
              {chrome.useCases}
            </p>
            <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
              {realisticTeamsTitle}
            </h2>
            <div className="grid gap-4 lg:grid-cols-3">
              {content.useCases.map((useCase) => (
                <article
                  key={useCase.situation}
                  className="flex flex-col rounded-2xl border border-white bg-white p-5 shadow-sm"
                >
                  <h3 className={cn("text-sm font-semibold uppercase tracking-wide", theme.accentText)}>
                    {chrome.situation}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-gray-950">{useCase.situation}</p>
                  <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    {chrome.whatWhachatDoes}
                  </h3>
                  <p className="mt-1 text-sm text-gray-700">{useCase.action}</p>
                  <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-emerald-700">
                    {chrome.outcome}
                  </h3>
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
                {chrome.platformStory}
              </p>
              <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">
                {chrome.howWhachatWorksTogether}
              </h2>
              <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {PLATFORM_STORY_LINKS.map((step, index) => (
                  <li key={step.label} className="rounded-2xl bg-white p-4 ring-1 ring-emerald-100">
                    <p className="text-xs font-semibold text-brand-green">{index + 1}</p>
                    <Link href={localeHref(step.href)} className="mt-1 block font-semibold text-gray-950 hover:text-brand-green">
                      {step.label}
                    </Link>
                    <p className="mt-1 text-sm text-gray-600">{platformStoryText[index]}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        <section className="px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <p className={cn("mb-2 text-sm font-semibold uppercase tracking-[0.16em]", theme.accentText)}>
              {chrome.gettingStarted}
            </p>
            <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">{chrome.howToGetStarted}</h2>
            <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {content.howItWorks.map((step, index) => (
                <li key={step.title} className={cn("rounded-2xl bg-white p-5 ring-1", theme.accentRing)}>
                  <span className={cn("text-sm font-bold", theme.accentText)}>{index + 1}</span>
                  <h3 className="mt-2 font-semibold text-gray-950">{step.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-gray-100 bg-gray-50 px-4 py-14 md:px-6 md:py-16">
          <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
            <h2 className="font-display mb-6 text-2xl font-bold text-gray-950">{chrome.relatedProducts}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {content.relatedProducts.map((link) => (
                <Link
                  key={link.href + link.label}
                  href={localeHref(link.href)}
                  className={cn(
                    "rounded-2xl border bg-white p-5 transition hover:shadow-sm",
                    theme.accentBorder,
                  )}
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
                  {chrome.seeInIndustry}
                </h2>
                <div className="flex flex-wrap gap-3">
                  {content.industryLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={localeHref(link.href)}
                      className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-emerald-200"
                    >
                      {link.label}
                      <ArrowRight className={cn("h-3.5 w-3.5", isRTL && "rotate-180")} />
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
          startTrialLabel={chrome.startFreeTrial}
          bookDemoLabel={chrome.bookDemo}
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

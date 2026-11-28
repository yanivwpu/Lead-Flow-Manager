import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Zap,
  MessageSquare,
  Brain,
  Calendar,
  Users,
  Target,
  Shield,
  ChevronDown,
  BarChart3,
  Sparkles,
  Clock,
  Home,
  Search,
  FileText,
  Globe,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useHideGrowthEngineForShopify, SHOPIFY_RGE_BLOCK_REDIRECT } from "@/lib/shopifyMerchantExperience";
import { Helmet } from "react-helmet";
import { useEffect, useState } from "react";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { useMarketingUrlLocale } from "@/lib/marketingLocaleRouting";
import { SiteFooter } from "@/components/SiteFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingScreenshot } from "@/components/marketing/MarketingScreenshot";
import { RGE_LANDING, RGE_LANDING_SEO } from "@/content/realtorGrowthEngineLandingContent";
import {
  getLocalizedRgeLanding,
  getMarketingChrome,
} from "@shared/localizeMarketingContent";
import { cn } from "@/lib/utils";
import { RGE_GROWTH_COPY } from "@shared/realtorGrowthEngineLandingLocales";
import {
  REALTOR_GROWTH_ENGINE_PATH,
} from "@shared/pricingEntitlements";
import { getCanonicalUrl, getHreflangLinks, localizedInternalHref } from "@shared/localeRoutes";

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <button
        className="flex w-full items-center justify-between p-5 text-start transition-colors hover:bg-gray-50"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-testid={`faq-toggle-${question.slice(0, 20).replace(/\s/g, "-")}`}
      >
        <span className="text-sm font-semibold text-gray-900 md:text-base">{question}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm leading-relaxed text-gray-600 md:text-base">{answer}</div>
      )}
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
  testId,
  light,
}: {
  title: string;
  subtitle?: string;
  testId?: string;
  light?: boolean;
}) {
  return (
    <div className="mx-auto mb-10 max-w-3xl text-center md:mb-14">
      <h2
        className={`font-display text-2xl font-bold leading-tight md:text-4xl xl:text-5xl ${light ? "text-white" : "text-gray-900"}`}
        data-testid={testId}
      >
        {title}
      </h2>
      {subtitle ? (
        <p className={`mt-4 text-base md:text-lg xl:text-xl ${light ? "text-gray-300" : "text-gray-600"}`}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function CheckList({ items, tone = "green" }: { items: readonly string[]; tone?: "green" | "muted" }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm text-gray-700 md:text-base">
          <CheckCircle2
            className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "green" ? "text-brand-green" : "text-gray-400"}`}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}


export function RealtorLanding() {
  const { user } = useAuth();
  const hideGrowthEngine = useHideGrowthEngineForShopify();
  const [, setLocation] = useLocation();
  const locale = useMarketingUrlLocale();
  const chrome = getMarketingChrome(locale);
  const content = getLocalizedRgeLanding(RGE_LANDING, RGE_LANDING_SEO, locale);
  const isRTL = locale === "he";
  const growth = RGE_GROWTH_COPY[locale];
  const screenshotLabels = { enlargeLabel: growth.enlarge, closeEnlargedLabel: growth.closeEnlarged };
  const canonicalUrl = getCanonicalUrl(REALTOR_GROWTH_ENGINE_PATH, locale, MARKETING_URL)!;
  const hreflangs = getHreflangLinks(REALTOR_GROWTH_ENGINE_PATH, MARKETING_URL);

  useEffect(() => {
    if (user && hideGrowthEngine) {
      setLocation(SHOPIFY_RGE_BLOCK_REDIRECT);
    }
  }, [user, hideGrowthEngine, setLocation]);

  const ctaHref = user
    ? hideGrowthEngine
      ? SHOPIFY_RGE_BLOCK_REDIRECT
      : "/app/templates/realtor-growth-engine"
    : "/signup?redirect=/app/templates/realtor-growth-engine";

  const handleCta = () => setLocation(ctaHref);

  const scrollToJourney = () => {
    document.getElementById("journey-section")?.scrollIntoView({ behavior: "smooth" });
  };

  const arrowClass = isRTL ? "h-5 w-5 rotate-180" : "h-5 w-5";
  const arrowClassSm = isRTL ? "h-4 w-4 rotate-180" : "h-4 w-4";

  const journeyIcons = [MessageSquare, Zap, Brain, Search, FileText, Clock, Calendar];

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="min-h-screen overflow-x-hidden bg-white">
      <Helmet>
        <title>{content.seo.title}</title>
        <meta name="description" content={content.seo.description} />
        <meta name="keywords" content={content.seo.keywords} />
        <link rel="canonical" href={canonicalUrl} />
        {hreflangs.map(({ hreflang, href }) => (
          <link key={hreflang} rel="alternate" hrefLang={hreflang} href={href} />
        ))}
        <meta property="og:title" content={content.seo.ogTitle} />
        <meta property="og:description" content={content.seo.ogDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={`${MARKETING_URL}/og/og-realtor-growth-engine.png`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={content.seo.ogTitle} />
        <meta name="twitter:description" content={content.seo.ogDescription} />
        <meta name="twitter:image" content={`${MARKETING_URL}/og/og-realtor-growth-engine.png`} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Realtor Growth Engine",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: canonicalUrl,
            description: content.seo.description,
            provider: {
              "@type": "Organization",
              name: "WhachatCRM",
              url: MARKETING_URL,
            },
          })}
        </script>
      </Helmet>

      {/* NAV */}
      <MarketingHeader
        isLoggedIn={!!user}
        startTrialLabel={chrome.startFreeTrial}
        startTrialShortLabel={chrome.startFree}
      />

      {/* 1. HERO */}
      <section className="relative overflow-hidden bg-emerald-950 px-4 pb-16 pt-10 text-white md:px-6 md:pb-24 md:pt-20">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.12),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(20,184,166,0.08),_transparent_45%)]"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-2 md:gap-14 xl:max-w-[1440px] xl:gap-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              {content.hero.eyebrow}
            </p>
            <h1
              className="mb-5 font-display text-3xl font-bold leading-[1.08] text-white md:text-5xl lg:text-[3.25rem] xl:text-6xl"
              data-testid="text-hero-headline"
            >
              {content.hero.h1}
            </h1>
            <p className="mb-8 text-lg leading-relaxed text-emerald-50/90 md:text-xl">{content.hero.support}</p>
            <div className="mb-8 grid gap-3 sm:grid-cols-3">
              {growth.pillars.map((label, index) => {
                const Icon = [Search, Zap, Calendar][index] ?? Sparkles;
                return <div key={label} className="rounded-2xl border border-white/15 bg-white/5 p-4">
                  <Icon className="mb-2 h-5 w-5 text-emerald-300" aria-hidden />
                  <p className="font-bold text-white">{label}</p>
                  <p className="mt-1 text-sm text-emerald-100">{growth.pillarDetails[index]}</p>
                </div>;
              })}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleCta}
                className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-8 font-semibold text-emerald-950 shadow-lg transition-all hover:bg-emerald-50 hover:shadow-xl sm:w-auto"
                data-testid="button-hero-install"
              >
                {user ? content.hero.cta : chrome.startFreeTrial}
                <ArrowRight className={arrowClass} />
              </button>
              <button
                onClick={scrollToJourney}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-white/30 bg-white/5 px-8 font-medium text-white transition-colors hover:bg-white/10 sm:w-auto"
                data-testid="button-hero-how-it-works"
              >
                {content.hero.secondaryCta}
              </button>
            </div>
            <p className="mt-5 text-sm text-emerald-100"><bdi dir="ltr">{content.pricing.layers[0].price}</bdi> · {growth.pricingNote}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.65, delay: 0.15 }}
            className="relative"
          >
            <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-xl sm:rounded-3xl">
              <MarketingScreenshot {...screenshotLabels} {...content.screenshots.agentPage} size="hero" className="w-full" priority />
            </div>
          </motion.div>
        </div>
      </section>

      <section id="automation-package" className="bg-white px-4 py-16 md:px-6 md:py-24" data-testid="section-automation-package">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={growth.automationTitle} subtitle={growth.automationBody} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {growth.automationItems.map((label, i) => {
              const Icon = [MessageSquare, Brain, Calendar, Clock, Users, Target, Shield, Globe][i] ?? Sparkles;
              return <article key={label} className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
                <div className="mb-4 flex items-center justify-between"><Icon className="h-6 w-6 text-emerald-700" aria-hidden /><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800" dir="ltr">W{i+1}</span></div>
                <h3 className="font-semibold text-gray-900">{label}</h3>
              </article>;
            })}
          </div>
          <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-gray-600">{growth.automationNote}</p>
          <div className="mx-auto mt-10 max-w-4xl"><MarketingScreenshot {...screenshotLabels} {...content.screenshots.workflows} size="hero" /></div>
        </div>
      </section>

      <section className="bg-emerald-50/60 px-4 py-16 md:px-6 md:py-24" data-testid="section-neighborhood-pages">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2 xl:max-w-[1440px]">
          <div>
            <Globe className="mb-4 h-9 w-9 text-emerald-700" aria-hidden />
            <h2 className="font-display text-3xl font-bold text-gray-950 md:text-5xl">{growth.neighborhoodTitle}</h2>
            <p className="my-6 text-lg leading-relaxed text-gray-700">{growth.neighborhoodBody}</p>
            <CheckList items={growth.neighborhoodItems} />
            <p className="mt-6 text-sm text-gray-600">{growth.neighborhoodNote}</p>
          </div>
          <figure className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-lg sm:p-8">
            <div className="relative overflow-hidden rounded-2xl bg-emerald-100">
              <svg viewBox="0 0 420 220" className="w-full" aria-hidden="true">
                <rect width="420" height="220" fill="#e1f1e9"/>
                <path d="M0 50 H420 M0 110 H420 M0 175 H420 M75 0 V220 M155 0 V220 M250 0 V220 M350 0 V220" stroke="#fff" strokeWidth="12"/>
                <path d="M0 200 Q130 110 235 160 T420 30" stroke="#a5d8dc" strokeWidth="28" fill="none"/>
                <path d="M99 32 L284 28 L329 122 L207 186 L105 143 Z" fill="#34d399" fillOpacity=".23" stroke="#047857" strokeWidth="3" strokeDasharray="7 5"/>
                <circle cx="207" cy="97" r="10" fill="#047857" stroke="white" strokeWidth="3"/>
              </svg>
            </div>
            <div className="mt-5 flex items-center gap-3"><Home className="h-7 w-7 text-emerald-700" aria-hidden /><div className="text-xl font-bold text-gray-950">{growth.neighborhoodVisual[0]}</div></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">{growth.neighborhoodVisual.slice(1,3).map(label=><div key={label} className="rounded-lg bg-gray-50 p-3 text-sm font-medium text-gray-700">{label}</div>)}</div>
            <div className="mt-4 rounded-xl bg-emerald-800 p-3 text-center font-semibold text-white">{growth.neighborhoodVisual[3]}</div>
            <figcaption className="mt-3 text-center text-xs text-gray-500">{growth.illustration}</figcaption>
          </figure>
        </div>
      </section>

      {/* 10–11. AGENT PAGE + SEO */}
      <section className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-agent-page">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={content.agentPage.title} testId="text-agent-page-title" />
          <div className="mx-auto mb-10 max-w-3xl space-y-4 text-center text-base text-gray-600 md:text-lg">
            {content.agentPage.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="mb-12 grid items-start gap-8 md:grid-cols-2">
            <div>
              <MarketingScreenshot {...screenshotLabels} {...content.screenshots.agentPage} />
            </div>
            <div>
              <MarketingScreenshot {...screenshotLabels} {...content.screenshots.agentSettings} />
              <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{content.ui.agentPageCapabilitiesTitle}</h3>
                <CheckList items={content.agentPage.capabilities} />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-white p-6 md:p-10">
            <div className="mb-2 flex items-center gap-2 text-emerald-700">
              <Globe className="h-5 w-5" />
              <p className="text-xs font-bold uppercase tracking-[0.16em]">{content.ui.seoFriendlyEyebrow}</p>
            </div>
            <h3 className="font-display text-xl font-bold text-gray-900 md:text-3xl">{content.agentPageSeo.title}</h3>
            <div className="mt-4 max-w-3xl space-y-3 text-sm text-gray-600 md:text-base">
              {content.agentPageSeo.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {content.agentPageSeo.benefits.map((b) => (
                <div key={b} className="flex items-start gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                  {b}
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-gray-500">{content.agentPageSeo.disclaimer}</p>
          </div>
        </div>
      </section>


      {/* 4. AI QUALIFICATION */}
      <section className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-qualification">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2 xl:max-w-[1440px]">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{content.ui.buyerIntelligenceEyebrow}</p>
            <h2 className="font-display text-2xl font-bold text-gray-900 md:text-4xl" data-testid="text-qualify-title">
              {content.qualification.title}
            </h2>
            <blockquote className="mt-6 rounded-2xl border border-emerald-100 bg-white p-5 text-base italic text-gray-800 shadow-sm md:text-lg">
              “{content.qualification.exampleQuote}”
              <footer className="mt-2 text-xs font-medium not-italic text-gray-500">
                {content.qualification.exampleNote}
              </footer>
            </blockquote>
            <p className="mt-6 text-sm font-semibold text-gray-900">{content.qualification.criteriaIntro}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {content.qualification.criteria.map((c) => (
                <span key={c} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                  {c}
                </span>
              ))}
            </div>
            <p className="mt-6 text-sm font-semibold text-gray-900">{content.qualification.powersIntro}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {content.qualification.powers.map((p) => (
                <span key={p} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div>
            <MarketingScreenshot {...screenshotLabels} {...content.screenshots.leadScore} />
          </div>
        </div>
      </section>


      {/* 5. INVENTORY MATCHING */}
      <section className="px-4 py-16 md:px-6 md:py-24" data-testid="section-inventory">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={content.inventory.title} subtitle={content.inventory.subtitle} testId="text-inventory-title" />
          <div className="mx-auto mb-10 max-w-3xl space-y-4 text-center text-base text-gray-600 md:text-lg">
            {content.inventory.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="mb-10 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">
            <MarketingScreenshot {...screenshotLabels} {...content.screenshots.inventory} size="hero" className="w-full" />
          </div>

          <p className="mb-3 text-center text-sm font-semibold text-gray-900">{content.inventory.criteriaIntro}</p>
          <div className="mb-10 flex flex-wrap justify-center gap-2">
            {content.inventory.criteria.map((c) => (
              <span key={c} className="rounded-full bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                {c}
              </span>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
              <h3 className="mb-4 text-base font-bold text-gray-900">{content.inventory.beforeTitle}</h3>
              <ol className="space-y-2">
                {content.inventory.before.map((item, i) => (
                  <li key={item} className="flex gap-3 text-sm text-gray-700">
                    <span className="font-bold text-gray-400">{i + 1}.</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6">
              <h3 className="mb-4 text-base font-bold text-gray-900">{content.inventory.afterTitle}</h3>
              <ol className="space-y-2">
                {content.inventory.after.map((item, i) => (
                  <li key={item} className="flex gap-3 text-sm text-gray-700">
                    <span className="font-bold text-emerald-600">{i + 1}.</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-gray-500">{content.inventory.accuracyNote}</p>
          <div className="mt-10 grid items-start gap-8 md:grid-cols-2">
            <MarketingScreenshot {...screenshotLabels} {...content.screenshots.inventoryDetail} />
            <MarketingScreenshot {...screenshotLabels} {...content.screenshots.inventorySource} />
          </div>
        </div>
      </section>


      {/* 6. PROPERTY FLYERS */}
      <section className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-flyers">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={content.flyer.title} subtitle={content.flyer.subtitle} testId="text-flyer-title" />
          <div className="mx-auto mb-10 max-w-3xl space-y-4 text-center text-base text-gray-600 md:text-lg">
            {content.flyer.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm md:p-8">
              <h3 className="mb-4 text-base font-bold text-gray-900">{content.ui.propertyPresentationTitle}</h3>
              <CheckList items={content.flyer.canInclude} />
            </div>
            <div className="grid gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{content.flyer.beforeTitle}</h3>
                <ul className="space-y-2">
                  {content.flyer.before.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-gray-600">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{content.flyer.afterTitle}</h3>
                <CheckList items={content.flyer.after} />
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* 12. CONVERSATION → SHOWING */}
      <section className="px-4 py-16 md:px-6 md:py-24" data-testid="section-showing">
        <div className="mx-auto max-w-5xl xl:max-w-6xl">
          <SectionHeading title={growth.showingTitle} subtitle={growth.showingBody} testId="text-showing-title" />
          <div className="mb-10 grid items-center gap-8 md:grid-cols-2">
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6">
              <Calendar className="mb-5 h-10 w-10 text-emerald-800" aria-hidden />
              {growth.showingVisual.map((label,i)=><div key={label} className={cn("mb-3 rounded-xl p-4 text-center font-semibold",i===1?"bg-emerald-800 text-white":"bg-white text-gray-800")}>{label}</div>)}
              <p className="text-center text-xs text-gray-500">{growth.illustration}</p>
            </div>
            <CheckList items={growth.showingItems} />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
            {content.showing.flow.map((step, idx) => (
              <div key={step} className="flex items-center gap-2 md:gap-3">
                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 md:px-4 md:text-sm">
                  {step}
                </span>
                {idx < content.showing.flow.length - 1 ? (
                  <ArrowRight className={cn("hidden h-4 w-4 text-emerald-400 sm:block", isRTL && "rotate-180")} />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* 2. JOURNEY */}
      <section id="journey-section" className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-journey">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={content.journey.title} subtitle={content.journey.subtitle} testId="text-journey-title" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7 lg:gap-2">
            {content.journey.steps.map((step, idx) => {
              const Icon = journeyIcons[idx] ?? Sparkles;
              return (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.05 }}
                  className="relative rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-green text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    {chrome.step} {idx + 1}
                  </p>
                  <h3 className="mt-1 text-sm font-bold text-gray-900">{step.label}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{step.detail}</p>
                  {idx < content.journey.steps.length - 1 ? (
                    <div className="absolute -bottom-2 start-1/2 hidden h-4 w-px bg-emerald-200 lg:start-auto lg:end-[-6px] lg:top-1/2 lg:h-px lg:w-3 lg:-translate-y-1/2" />
                  ) : null}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>


      {/* 7. NURTURE */}
      <section className="px-4 py-16 md:px-6 md:py-24" data-testid="section-nurture">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2 xl:max-w-[1440px]">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{content.ui.channelAwareNurtureEyebrow}</p>
            <h2 className="font-display text-2xl font-bold text-gray-900 md:text-4xl" data-testid="text-nurture-title">
              {content.nurture.title}
            </h2>
            <div className="mt-5 space-y-4 text-base text-gray-600 md:text-lg">
              {content.nurture.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <div className="mt-6">
              <CheckList items={content.nurture.includes} />
            </div>
            <p className="mt-6 rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-950">
              {content.nurture.channelNote}
            </p>
          </div>
          <div>
            <MarketingScreenshot {...screenshotLabels} {...content.screenshots.workflows} />
          </div>
        </div>
      </section>


      {/* 8. INBOX + COPILOT */}
      <section className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-inbox">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={content.inbox.title} testId="text-inbox-title" />
          <div className="mx-auto mb-10 max-w-3xl space-y-4 text-center text-base text-gray-600 md:text-lg">
            {content.inbox.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="grid items-start gap-8 md:grid-cols-[1.4fr_0.8fr]">
            <div>
              <MarketingScreenshot {...screenshotLabels} {...content.screenshots.inbox} size="content" className="w-full" />
            </div>
            <div>
              <MarketingScreenshot {...screenshotLabels} {...content.screenshots.copilot} />
              <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{content.ui.copilotHelpsTitle}</h3>
                <CheckList items={content.inbox.copilotHelps} />
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* 9. LEAD SCORING */}
      <section className="px-4 py-16 md:px-6 md:py-20" data-testid="section-scoring">
        <div className="mx-auto max-w-4xl text-center xl:max-w-5xl">
          <SectionHeading title={content.scoring.title} subtitle={content.scoring.body} testId="text-scoring-title" />
          <div className="flex flex-wrap justify-center gap-3">
            {content.scoring.buckets.map((b) => (
              <span
                key={b}
                className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 shadow-sm"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </section>


      <section className="bg-emerald-950 px-4 py-16 text-white md:px-6 md:py-24" data-testid="section-agent-network">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-emerald-200">{growth.networkEyebrow}</p>
            <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-950">{growth.comingSoon}</span>
            <h2 className="mt-5 font-display text-3xl font-bold md:text-5xl">{growth.networkTitle}</h2>
            <p className="mt-5 text-lg leading-relaxed text-emerald-100">{growth.networkBody}</p>
            <p className="mt-6 text-sm text-emerald-100">{growth.networkNote}</p>
          </div>
          <div className="grid gap-3">
            {growth.networkSteps.map((label,i)=>{const Icon=[Search,MessageSquare,Users][i] ?? Users;return <div key={label} className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/5 p-5"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-800"><Icon className="h-6 w-6" aria-hidden /></div><p className="text-lg font-semibold">{label}</p></div>;})}
          </div>
        </div>
      </section>
      <section className="bg-emerald-50 px-4 py-14 md:px-6 md:py-20" data-testid="section-global-availability">
        <div className="mx-auto max-w-4xl text-center">
          <Globe className="mx-auto mb-4 h-10 w-10 text-emerald-700" aria-hidden />
          <h2 className="font-display text-3xl font-bold text-gray-950 md:text-4xl">{growth.globalTitle}</h2>
          <p className="mt-5 text-lg leading-relaxed text-gray-700">{growth.globalBody}</p>
        </div>
      </section>

      {/* 17. PRICING */}
      <section className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-pricing">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 text-center sm:rounded-3xl sm:p-8 md:p-12">
            <h2
              className="mb-4 font-display text-2xl font-bold text-gray-900 md:text-4xl xl:text-5xl"
              data-testid="text-pricing-title"
            >
              {growth.pricingTitle}
            </h2>
            <p className="mx-auto mb-4 max-w-2xl text-base text-gray-600 md:text-lg">{growth.pricingNote}</p>


            <div className="mx-auto mb-8 max-w-xl rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm md:p-8">
              <p className="font-semibold text-gray-700">{content.pricing.layers[0].name}</p>
              <p className="my-4 text-5xl font-bold tracking-tight text-emerald-800" dir="ltr">{content.pricing.layers[0].price}</p>
              <div className="mt-6 text-start"><CheckList items={growth.pricingItems} /></div>
            </div>

            <p className="mb-8 text-sm text-gray-500" data-testid="text-meta-note">
              {content.pricing.metaNote}
            </p>

            <div className="flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
              <button
                onClick={handleCta}
                className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-green px-10 text-base font-semibold text-white shadow-lg transition-all hover:bg-emerald-700 hover:shadow-xl sm:w-auto sm:text-lg"
                data-testid="button-pricing-install"
              >
                {content.pricing.cta}
                <ArrowRight className={arrowClass} />
              </button>
              <Link href={localizedInternalHref("/pricing", locale)} className="w-full sm:w-auto">
                <button
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-10 text-base font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto sm:text-lg"
                  data-testid="button-pricing-plans"
                >
                  <BarChart3 className="h-5 w-5" />
                  {content.pricing.viewPlans}
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>


      {/* 18. WHITE-GLOVE */}
      <section className="px-4 py-16 md:px-6 md:py-24" data-testid="section-white-glove">
        <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2 xl:max-w-6xl">
          <div>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-green/10">
              <Shield className="h-7 w-7 text-brand-green" />
            </div>
            <h2 className="font-display text-2xl font-bold text-gray-900 md:text-4xl" data-testid="text-setup-title">
              {content.whiteGlove.title}
            </h2>
            <p className="mt-4 text-base text-gray-600 md:text-lg">{content.whiteGlove.subtitle}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-900 p-6 text-white sm:p-8">
            <ul className="space-y-3">
              {content.whiteGlove.items.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>


      {/* 13. BEFORE VS WITH */}
      <section className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-comparison">
        <div className="mx-auto max-w-5xl xl:max-w-6xl">
          <SectionHeading title={content.comparison.title} testId="text-comparison-title" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8">
              <h3 className="mb-5 text-lg font-bold text-gray-900">{content.comparison.beforeTitle}</h3>
              <ul className="space-y-2.5">
                {content.comparison.before.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-gray-700">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 md:p-8">
              <h3 className="mb-5 text-lg font-bold text-gray-900">{content.comparison.afterTitle}</h3>
              <CheckList items={content.comparison.after} />
            </div>
          </div>
        </div>
      </section>


      {/* 15. WHAT'S INCLUDED */}
      <section className="bg-emerald-950 px-4 py-16 text-white md:px-6 md:py-24" data-testid="section-included">
        <div className="mx-auto max-w-5xl xl:max-w-6xl">
          <SectionHeading title={content.included.title} subtitle={content.included.subtitle} testId="text-included-title" light />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {content.included.items.map((item) => (
              <div key={item} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="text-emerald-50">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Related products */}
      <section className="border-t border-gray-100 bg-white px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 text-center font-display text-2xl font-bold text-gray-950 md:text-3xl">
            {content.ui.relatedProductsTitle}
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {content.ui.relatedLinks.map((link) => (
              <Link
                key={link.href}
                href={localizedInternalHref(link.href, locale)}
                className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-800 hover:border-emerald-200 hover:bg-emerald-50"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </section>


      {/* FAQ */}
      <section className="bg-gray-50 px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-3xl xl:max-w-4xl">
          <h2
            className="mb-10 text-center font-display text-2xl font-bold text-gray-900 md:mb-14 md:text-4xl xl:text-5xl"
            data-testid="text-faq-title"
          >
            {content.ui.faqTitle}
          </h2>
          <div className="space-y-3">
            {[...content.faq, ...growth.faqQuestions.map(([q, a]) => ({ q, a }))].map((faq) => (
              <FaqItem key={faq.q} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </section>


      {/* 19. FINAL CTA */}
      <section className="bg-gray-900 px-4 py-12 text-white md:px-6 md:py-16" data-testid="section-final-cta">
        <div className="mx-auto max-w-3xl text-center xl:max-w-4xl">
          <h2 className="mb-4 font-display text-xl font-bold md:text-3xl xl:text-4xl">{content.finalCta.title}</h2>
          <p className="mb-8 text-gray-400 xl:text-lg">{content.finalCta.subtitle}</p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
            <button
              onClick={handleCta}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-green px-8 font-semibold text-white transition-all hover:bg-emerald-700 sm:w-auto"
              data-testid="button-footer-cta"
            >
              {content.finalCta.cta}
              <ArrowRight className={arrowClassSm} />
            </button>
            <Link href={localizedInternalHref("/pricing", locale)} className="w-full sm:w-auto">
              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-gray-700 bg-gray-800 px-8 font-medium text-gray-300 transition-colors hover:bg-gray-700 sm:w-auto"
                data-testid="button-footer-plans"
              >
                <BarChart3 className={arrowClassSm} />
                {content.finalCta.viewPlans}
              </button>
            </Link>
          </div>
          <p className="mt-5 text-sm text-gray-500">{content.finalCta.note}</p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

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
  Globe,
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
    <div className="mx-auto mb-6 max-w-3xl text-center md:mb-8">
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
    document.getElementById("automation-package")?.scrollIntoView({ behavior: "smooth" });
  };

  const arrowClass = isRTL ? "h-5 w-5 rotate-180" : "h-5 w-5";


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
      <section className="relative overflow-hidden bg-gradient-to-br from-white via-sky-50 to-sky-100 px-4 pb-16 pt-10 text-slate-950 md:px-6 md:pb-24 md:pt-20">
        <div
          className="pointer-events-none absolute inset-0 bg-white/10"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-2 md:gap-14 xl:max-w-[1440px] xl:gap-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              {content.hero.eyebrow}
            </p>
            <h1
              className="mb-5 font-display text-3xl font-bold leading-[1.08] text-slate-950 md:text-5xl lg:text-[3.25rem] xl:text-6xl"
              data-testid="text-hero-headline"
            >
              {content.hero.h1}
            </h1>
            <p className="mb-8 text-lg leading-relaxed text-slate-700 md:text-xl">{growth.support}</p>
            <div className="mb-8 grid gap-3 sm:grid-cols-3">
              {growth.pillars.map((label, index) => {
                const Icon = [Search, Zap, Calendar][index] ?? Sparkles;
                return <div key={label} className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                  <Icon className="mb-2 h-5 w-5 text-emerald-700" aria-hidden />
                  <p className="font-bold text-slate-950">{label}</p>
                  <p className="mt-1 text-sm text-slate-600">{growth.pillarDetails[index]}</p>
                </div>;
              })}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleCta}
                className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-green px-8 font-semibold text-white shadow-lg transition-all hover:bg-emerald-700 hover:shadow-xl sm:w-auto"
                data-testid="button-hero-install"
              >
                {user ? content.hero.cta : chrome.startFreeTrial}
                <ArrowRight className={arrowClass} />
              </button>
              <button
                onClick={scrollToJourney}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-8 font-medium text-slate-800 transition-colors hover:bg-sky-50 sm:w-auto"
                data-testid="button-hero-how-it-works"
              >
                {content.hero.secondaryCta}
              </button>
            </div>
            <p className="mt-5 text-sm text-slate-600"><bdi dir="ltr">{content.pricing.layers[0].price}</bdi></p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.65, delay: 0.15 }}
            className="relative"
          >
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl">
              <img src="https://images.pexels.com/photos/8470805/pexels-photo-8470805.jpeg?auto=compress&cs=tinysrgb&w=1200" alt={growth.heroPhotoAlt} width={1200} height={800} fetchPriority="high" decoding="async" className="aspect-[3/2] w-full object-cover" referrerPolicy="no-referrer" />
            </div>
          </motion.div>
        </div>
      </section>

      <section id="automation-package" className="bg-white px-4 py-12 md:px-6 md:py-16" data-testid="section-automation-package">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={growth.automationTitle} subtitle={growth.automationBody} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {growth.automationItems.map((label, i) => {
              const Icon = [MessageSquare, Brain, Calendar, Clock, Users, Target, Shield, Globe][i] ?? Sparkles;
              return <article key={label} className="rounded-2xl border border-slate-200 bg-sky-50 p-5">
                <div className="mb-4 flex items-center justify-between"><Icon className="h-6 w-6 text-emerald-700" aria-hidden /><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800" dir="ltr">W{i+1}</span></div>
                <h3 className="font-semibold text-gray-900">{label}</h3>
              </article>;
            })}
          </div>
          <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-gray-600">{growth.automationNote}</p>
          <div className="mx-auto mt-10 max-w-4xl"><MarketingScreenshot {...screenshotLabels} {...content.screenshots.workflows} size="hero" /></div>
        </div>
      </section>

      <section className="bg-sky-50 px-4 py-12 md:px-6 md:py-16" data-testid="section-neighborhood-pages">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2 xl:max-w-[1440px]">
          <div>
            <Globe className="mb-4 h-9 w-9 text-emerald-700" aria-hidden />
            <h2 className="font-display text-3xl font-bold text-gray-950 md:text-5xl">{growth.neighborhoodTitle}</h2>
            <p className="my-6 text-lg leading-relaxed text-gray-700">{growth.neighborhoodBody}</p>
            <CheckList items={growth.neighborhoodItems} />
            <p className="mt-6 text-sm text-gray-600">{growth.neighborhoodNote}</p>
          </div>
          <figure className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg sm:p-8">
            <div className="relative overflow-hidden rounded-2xl bg-sky-100">
              <img src="https://images.pexels.com/photos/9305070/pexels-photo-9305070.jpeg?auto=compress&cs=tinysrgb&w=1200" alt={growth.neighborhoodPhotoAlt} width={1200} height={675} loading="lazy" decoding="async" className="aspect-video w-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div className="mt-5 flex items-center gap-3"><Home className="h-7 w-7 text-emerald-700" aria-hidden /><div className="text-xl font-bold text-gray-950">{growth.neighborhoodVisual[0]}</div></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">{growth.neighborhoodVisual.slice(1,3).map(label=><div key={label} className="rounded-lg bg-gray-50 p-3 text-sm font-medium text-gray-700">{label}</div>)}</div>
            <div className="mt-4 rounded-xl bg-emerald-800 p-3 text-center font-semibold text-white">{growth.neighborhoodVisual[3]}</div>
            <figcaption className="mt-3 text-center text-xs text-gray-500">{growth.illustration}</figcaption>
          </figure>
        </div>
      </section>

      {/* 10–11. AGENT PAGE + SEO */}
      <section className="bg-white px-4 py-12 md:px-6 md:py-16" data-testid="section-agent-page">
        <div className="mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-2">
          <MarketingScreenshot {...screenshotLabels} {...content.screenshots.agentPage} />
          <div>
            <h2 className="font-display text-3xl font-bold text-slate-950 md:text-4xl" data-testid="text-agent-page-title">{growth.agentTitle}</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-700">{growth.agentBody}</p>
            <p className="mt-4 text-sm text-slate-600">{content.agentPageSeo.disclaimer}</p>
          </div>
        </div>
      </section>

      {/* 5. INVENTORY MATCHING */}
      <section className="bg-sky-50 px-4 py-12 md:px-6 md:py-16" data-testid="section-inventory">
        <div className="mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-bold text-slate-950 md:text-4xl" data-testid="text-inventory-title">{growth.matchingTitle}</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-700">{growth.matchingBody}</p>
            <p className="mt-4 text-sm text-slate-600">{content.inventory.accuracyNote}</p>
          </div>
          <MarketingScreenshot {...screenshotLabels} {...content.screenshots.inventory} />
        </div>
      </section>

      {/* 12. CONVERSATION → SHOWING */}
      <section className="px-4 py-12 md:px-6 md:py-16" data-testid="section-showing">
        <div className="mx-auto max-w-5xl xl:max-w-6xl">
          <SectionHeading title={growth.showingTitle} subtitle={growth.showingBody} testId="text-showing-title" />
          <div className="mb-10 grid items-center gap-8 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-sky-50 p-6">
              <img src="https://images.pexels.com/photos/7641869/pexels-photo-7641869.jpeg?auto=compress&cs=tinysrgb&w=1200" alt={growth.showingPhotoAlt} width={1200} height={800} loading="lazy" decoding="async" className="mb-5 aspect-[3/2] w-full rounded-2xl object-cover" referrerPolicy="no-referrer" />
              {growth.showingVisual.map((label,i)=><div key={label} className={cn("mb-3 rounded-xl p-4 text-center font-semibold",i===1?"bg-emerald-800 text-white":"bg-white text-gray-800")}>{label}</div>)}
              <p className="text-center text-xs text-gray-500">{growth.illustration}</p>
            </div>
            <CheckList items={growth.showingItems} />
          </div>
        </div>
      </section>

      {/* 8. INBOX + COPILOT */}
      <section className="bg-white px-4 py-12 md:px-6 md:py-16" data-testid="section-inbox">
        <div className="mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-2">
          <MarketingScreenshot {...screenshotLabels} {...content.screenshots.inbox} />
          <div>
            <h2 className="font-display text-3xl font-bold text-slate-950 md:text-4xl" data-testid="text-inbox-title">{growth.inboxTitle}</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-700">{growth.inboxBody}</p>
          </div>
        </div>
      </section>

      <section className="bg-sky-50 px-4 py-12 md:px-6 md:py-16" data-testid="section-agent-network">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
          <div>
            <span className="inline-block rounded-full border border-sky-200 bg-white px-3 py-1 text-sm font-semibold text-sky-900">{growth.comingSoon}</span>
            <h2 className="mt-5 font-display text-3xl font-bold text-slate-950 md:text-5xl">{growth.networkTitle}</h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-700">{growth.networkBody}</p>
            <div className="mt-7 space-y-3"><CheckList items={growth.networkSteps} /></div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
            <img src="https://images.pexels.com/photos/7964479/pexels-photo-7964479.jpeg?auto=compress&cs=tinysrgb&w=1200" alt={growth.networkPhotoAlt} width={1200} height={800} loading="lazy" decoding="async" className="aspect-[3/2] w-full object-cover" referrerPolicy="no-referrer" />
          </div>
        </div>
      </section>
      <section className="bg-white px-4 py-14 md:px-6 md:py-20" data-testid="section-global-availability">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={growth.globalTitle} subtitle={growth.globalBody} />
          <div className="grid gap-5 md:grid-cols-2">
            {growth.globalLabels.map((label,i)=>(
              <article key={label} className="rounded-2xl border border-slate-200 bg-sky-50 p-6 md:p-8">
                <h3 className="mb-5 flex items-center gap-3 text-xl font-bold text-slate-950"><Globe className="h-6 w-6 text-emerald-700" aria-hidden />{label}</h3>
                <CheckList items={growth.globalLists[i]} />
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 17. PRICING */}
      <section className="bg-sky-50 px-4 py-12 md:px-6 md:py-16" data-testid="section-pricing">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 text-center sm:rounded-3xl sm:p-8 md:p-12">
            <h2
              className="mb-4 font-display text-2xl font-bold text-gray-900 md:text-4xl xl:text-5xl"
              data-testid="text-pricing-title"
            >
              {growth.pricingTitle}
            </h2>
            <p className="mx-auto mb-4 max-w-2xl text-base text-gray-600 md:text-lg">{growth.pricingNote}</p>


            <div className="mx-auto mb-8 max-w-xl rounded-2xl border border-slate-200 bg-sky-50 p-6 shadow-sm md:p-8">
              <p className="font-semibold text-gray-700">{content.pricing.layers[0].name}</p>
              <p className="my-4 text-5xl font-bold tracking-tight text-emerald-800" dir="ltr">{content.pricing.layers[0].price}</p>
              <div className="mt-4 text-start"><CheckList items={growth.pricingItems} /></div>
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
                {user ? content.pricing.cta : chrome.startFreeTrial}
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
                className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-800 hover:border-slate-200 hover:bg-sky-50"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </section>


      {/* FAQ */}
      <section className="bg-gray-50 px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto max-w-3xl xl:max-w-4xl">
          <h2
            className="mb-10 text-center font-display text-2xl font-bold text-gray-900 md:mb-14 md:text-4xl xl:text-5xl"
            data-testid="text-faq-title"
          >
            {content.ui.faqTitle}
          </h2>
          <div className="space-y-3">
            {[...content.faq.filter((_, i) => [2,4,5].includes(i)), ...growth.faqQuestions.map(([q, a]) => ({ q, a }))].map((faq) => (
              <FaqItem key={faq.q} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

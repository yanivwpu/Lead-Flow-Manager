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
  Layers,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useHideGrowthEngineForShopify, SHOPIFY_RGE_BLOCK_REDIRECT } from "@/lib/shopifyMerchantExperience";
import { Helmet } from "react-helmet";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getDirection } from "@/lib/i18n";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { SiteFooter } from "@/components/SiteFooter";
import { MarketingScreenshot } from "@/components/marketing/MarketingScreenshot";
import { RGE_LANDING, RGE_LANDING_SEO } from "@/content/realtorGrowthEngineLandingContent";

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <button
        className="flex w-full items-center justify-between p-5 text-start transition-colors hover:bg-gray-50"
        onClick={() => setOpen(!open)}
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

const C = RGE_LANDING;

export function RealtorLanding() {
  const { user } = useAuth();
  const hideGrowthEngine = useHideGrowthEngineForShopify();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const isRTL = getDirection() === "rtl";

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
        <title>{RGE_LANDING_SEO.title}</title>
        <meta name="description" content={RGE_LANDING_SEO.description} />
        <meta name="keywords" content={RGE_LANDING_SEO.keywords} />
        <link rel="canonical" href={`${MARKETING_URL}/realtor-growth-engine`} />
        <meta property="og:title" content={RGE_LANDING_SEO.ogTitle} />
        <meta property="og:description" content={RGE_LANDING_SEO.ogDescription} />
        <meta property="og:url" content={`${MARKETING_URL}/realtor-growth-engine`} />
        <meta property="og:image" content={`${MARKETING_URL}/og/og-realtor-growth-engine.png`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={RGE_LANDING_SEO.ogTitle} />
        <meta name="twitter:description" content={RGE_LANDING_SEO.ogDescription} />
        <meta name="twitter:image" content={`${MARKETING_URL}/og/og-realtor-growth-engine.png`} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Realtor Growth Engine",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: `${MARKETING_URL}/realtor-growth-engine`,
            description: RGE_LANDING_SEO.description,
            offers: {
              "@type": "Offer",
              price: "199",
              priceCurrency: "USD",
              description: "One-time Realtor Growth Engine license. Requires WhachatCRM Pro and AI Brain.",
            },
            provider: {
              "@type": "Organization",
              name: "WhachatCRM",
              url: MARKETING_URL,
            },
          })}
        </script>
      </Helmet>

      {/* NAV */}
      <nav className="mx-auto flex max-w-7xl items-center justify-between p-4 md:p-6 xl:max-w-[1440px] 2xl:max-w-[1536px]">
        <Link href="/">
          <div className="flex cursor-pointer items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-green">
              <span className="text-lg font-bold text-white">W</span>
            </div>
            <span className="font-display text-xl font-bold text-gray-900">WhachatCRM</span>
          </div>
        </Link>
        <div className="flex items-center gap-2 md:gap-4">
          <Link href="/pricing">
            <button className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 sm:block">
              {t("rge.nav.pricing")}
            </button>
          </Link>
          <Link href="/blog">
            <button className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 sm:block">
              {t("rge.nav.blog")}
            </button>
          </Link>
          <Link href={user ? "/app/inbox" : "/auth"}>
            <button className="rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              {user ? t("rge.nav.dashboard") : t("rge.nav.startFree")}
            </button>
          </Link>
        </div>
      </nav>

      {/* 1. HERO */}
      <section className="relative overflow-hidden px-4 pb-16 pt-6 md:px-6 md:pb-24 md:pt-10">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.12),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(20,184,166,0.08),_transparent_45%)]"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-2 md:gap-14 xl:max-w-[1440px] xl:gap-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              {C.hero.eyebrow}
            </p>
            <h1
              className="mb-5 font-display text-3xl font-bold leading-[1.08] text-gray-900 md:text-5xl lg:text-[3.25rem] xl:text-6xl"
              data-testid="text-hero-headline"
            >
              {C.hero.h1}
            </h1>
            <p className="mb-8 text-lg leading-relaxed text-gray-600 md:text-xl">{C.hero.support}</p>
            <div className="mb-8 flex flex-wrap gap-2">
              {C.hero.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-800 shadow-sm"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-green" />
                  {cap}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleCta}
                className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-green px-8 font-semibold text-white shadow-lg transition-all hover:bg-emerald-700 hover:shadow-xl sm:w-auto"
                data-testid="button-hero-install"
              >
                {C.hero.cta}
                <ArrowRight className={arrowClass} />
              </button>
              <button
                onClick={scrollToJourney}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-8 font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto"
                data-testid="button-hero-how-it-works"
              >
                {C.hero.secondaryCta}
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.65, delay: 0.15 }}
            className="relative"
          >
            <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-xl sm:rounded-3xl">
              <MarketingScreenshot {...C.screenshots.inbox} size="hero" className="w-full" priority />
            </div>
          </motion.div>
        </div>
      </section>

      {/* 2. JOURNEY */}
      <section id="journey-section" className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-journey">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={C.journey.title} subtitle={C.journey.subtitle} testId="text-journey-title" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7 lg:gap-2">
            {C.journey.steps.map((step, idx) => {
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
                    Step {idx + 1}
                  </p>
                  <h3 className="mt-1 text-sm font-bold text-gray-900">{step.label}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{step.detail}</p>
                  {idx < C.journey.steps.length - 1 ? (
                    <div className="absolute -bottom-2 left-1/2 hidden h-4 w-px -translate-x-1/2 bg-emerald-200 lg:left-auto lg:right-[-6px] lg:top-1/2 lg:h-px lg:w-3 lg:translate-x-0 lg:-translate-y-1/2" />
                  ) : null}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. TIME / PROBLEM */}
      <section className="px-4 py-16 md:px-6 md:py-24" data-testid="section-time-problem">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={C.timeProblem.title} subtitle={C.timeProblem.intro} testId="text-time-title" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 md:p-8">
              <h3 className="mb-4 text-lg font-bold text-gray-900">What agents still do manually</h3>
              <ul className="space-y-2.5">
                {C.timeProblem.manual.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 md:p-8">
              <h3 className="mb-4 text-lg font-bold text-gray-900">With the Realtor Growth Engine</h3>
              <CheckList items={C.timeProblem.withRge} />
              <p className="mt-6 border-t border-emerald-100 pt-5 text-sm font-medium text-emerald-900 md:text-base">
                {C.timeProblem.closer}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. AI QUALIFICATION */}
      <section className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-qualification">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2 xl:max-w-[1440px]">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Buyer intelligence</p>
            <h2 className="font-display text-2xl font-bold text-gray-900 md:text-4xl" data-testid="text-qualify-title">
              {C.qualification.title}
            </h2>
            <blockquote className="mt-6 rounded-2xl border border-emerald-100 bg-white p-5 text-base italic text-gray-800 shadow-sm md:text-lg">
              “{C.qualification.exampleQuote}”
              <footer className="mt-2 text-xs font-medium not-italic text-gray-500">
                {C.qualification.exampleNote}
              </footer>
            </blockquote>
            <p className="mt-6 text-sm font-semibold text-gray-900">{C.qualification.criteriaIntro}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {C.qualification.criteria.map((c) => (
                <span key={c} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                  {c}
                </span>
              ))}
            </div>
            <p className="mt-6 text-sm font-semibold text-gray-900">{C.qualification.powersIntro}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {C.qualification.powers.map((p) => (
                <span key={p} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div>
            <MarketingScreenshot {...C.screenshots.leadScore} />
          </div>
        </div>
      </section>

      {/* 5. INVENTORY MATCHING */}
      <section className="px-4 py-16 md:px-6 md:py-24" data-testid="section-inventory">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={C.inventory.title} subtitle={C.inventory.subtitle} testId="text-inventory-title" />
          <div className="mx-auto mb-10 max-w-3xl space-y-4 text-center text-base text-gray-600 md:text-lg">
            {C.inventory.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="mb-10 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">
            <MarketingScreenshot {...C.screenshots.inventory} size="hero" className="w-full" />
          </div>

          <p className="mb-3 text-center text-sm font-semibold text-gray-900">{C.inventory.criteriaIntro}</p>
          <div className="mb-10 flex flex-wrap justify-center gap-2">
            {C.inventory.criteria.map((c) => (
              <span key={c} className="rounded-full bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                {c}
              </span>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
              <h3 className="mb-4 text-base font-bold text-gray-900">{C.inventory.beforeTitle}</h3>
              <ol className="space-y-2">
                {C.inventory.before.map((item, i) => (
                  <li key={item} className="flex gap-3 text-sm text-gray-700">
                    <span className="font-bold text-gray-400">{i + 1}.</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6">
              <h3 className="mb-4 text-base font-bold text-gray-900">{C.inventory.afterTitle}</h3>
              <ol className="space-y-2">
                {C.inventory.after.map((item, i) => (
                  <li key={item} className="flex gap-3 text-sm text-gray-700">
                    <span className="font-bold text-emerald-600">{i + 1}.</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-gray-500">{C.inventory.accuracyNote}</p>
          <div className="mt-10 grid items-start gap-8 md:grid-cols-2">
            <MarketingScreenshot {...C.screenshots.inventoryDetail} />
            <MarketingScreenshot {...C.screenshots.inventorySource} />
          </div>
        </div>
      </section>

      {/* 6. PROPERTY FLYERS */}
      <section className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-flyers">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={C.flyer.title} subtitle={C.flyer.subtitle} testId="text-flyer-title" />
          <div className="mx-auto mb-10 max-w-3xl space-y-4 text-center text-base text-gray-600 md:text-lg">
            {C.flyer.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm md:p-8">
              <h3 className="mb-4 text-base font-bold text-gray-900">What a property presentation can include</h3>
              <CheckList items={C.flyer.canInclude} />
            </div>
            <div className="grid gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{C.flyer.beforeTitle}</h3>
                <ul className="space-y-2">
                  {C.flyer.before.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-gray-600">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{C.flyer.afterTitle}</h3>
                <CheckList items={C.flyer.after} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. NURTURE */}
      <section className="px-4 py-16 md:px-6 md:py-24" data-testid="section-nurture">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2 xl:max-w-[1440px]">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Channel-aware nurture</p>
            <h2 className="font-display text-2xl font-bold text-gray-900 md:text-4xl" data-testid="text-nurture-title">
              {C.nurture.title}
            </h2>
            <div className="mt-5 space-y-4 text-base text-gray-600 md:text-lg">
              {C.nurture.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <div className="mt-6">
              <CheckList items={C.nurture.includes} />
            </div>
            <p className="mt-6 rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-950">
              {C.nurture.channelNote}
            </p>
          </div>
          <div>
            <MarketingScreenshot {...C.screenshots.workflows} />
          </div>
        </div>
      </section>

      {/* 8. INBOX + COPILOT */}
      <section className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-inbox">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={C.inbox.title} testId="text-inbox-title" />
          <div className="mx-auto mb-10 max-w-3xl space-y-4 text-center text-base text-gray-600 md:text-lg">
            {C.inbox.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="grid items-start gap-8 md:grid-cols-[1.4fr_0.8fr]">
            <div>
              <MarketingScreenshot {...C.screenshots.inbox} size="content" className="w-full" />
            </div>
            <div>
              <MarketingScreenshot {...C.screenshots.copilot} />
              <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5">
                <h3 className="mb-3 text-sm font-bold text-gray-900">AI Copilot can help surface</h3>
                <CheckList items={C.inbox.copilotHelps} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. LEAD SCORING */}
      <section className="px-4 py-16 md:px-6 md:py-20" data-testid="section-scoring">
        <div className="mx-auto max-w-4xl text-center xl:max-w-5xl">
          <SectionHeading title={C.scoring.title} subtitle={C.scoring.body} testId="text-scoring-title" />
          <div className="flex flex-wrap justify-center gap-3">
            {C.scoring.buckets.map((b) => (
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

      {/* 10–11. AGENT PAGE + SEO */}
      <section className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-agent-page">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={C.agentPage.title} testId="text-agent-page-title" />
          <div className="mx-auto mb-10 max-w-3xl space-y-4 text-center text-base text-gray-600 md:text-lg">
            {C.agentPage.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="mb-12 grid items-start gap-8 md:grid-cols-2">
            <div>
              <MarketingScreenshot {...C.screenshots.agentPage} />
            </div>
            <div>
              <MarketingScreenshot {...C.screenshots.agentSettings} />
              <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Agent Page capabilities</h3>
                <CheckList items={C.agentPage.capabilities} />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-white p-6 md:p-10">
            <div className="mb-2 flex items-center gap-2 text-emerald-700">
              <Globe className="h-5 w-5" />
              <p className="text-xs font-bold uppercase tracking-[0.16em]">SEO-friendly presence</p>
            </div>
            <h3 className="font-display text-xl font-bold text-gray-900 md:text-3xl">{C.agentPageSeo.title}</h3>
            <div className="mt-4 max-w-3xl space-y-3 text-sm text-gray-600 md:text-base">
              {C.agentPageSeo.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {C.agentPageSeo.benefits.map((b) => (
                <div key={b} className="flex items-start gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                  {b}
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-gray-500">{C.agentPageSeo.disclaimer}</p>
          </div>
        </div>
      </section>

      {/* 12. CONVERSATION → SHOWING */}
      <section className="px-4 py-16 md:px-6 md:py-24" data-testid="section-showing">
        <div className="mx-auto max-w-5xl xl:max-w-6xl">
          <SectionHeading title={C.showing.title} subtitle={C.showing.subtitle} testId="text-showing-title" />
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
            {C.showing.flow.map((step, idx) => (
              <div key={step} className="flex items-center gap-2 md:gap-3">
                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 md:px-4 md:text-sm">
                  {step}
                </span>
                {idx < C.showing.flow.length - 1 ? (
                  <ArrowRight className="hidden h-4 w-4 text-emerald-400 sm:block" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 13. BEFORE VS WITH */}
      <section className="bg-gray-50 px-4 py-16 md:px-6 md:py-24" data-testid="section-comparison">
        <div className="mx-auto max-w-5xl xl:max-w-6xl">
          <SectionHeading title={C.comparison.title} testId="text-comparison-title" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8">
              <h3 className="mb-5 text-lg font-bold text-gray-900">{C.comparison.beforeTitle}</h3>
              <ul className="space-y-2.5">
                {C.comparison.before.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-gray-700">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 md:p-8">
              <h3 className="mb-5 text-lg font-bold text-gray-900">{C.comparison.afterTitle}</h3>
              <CheckList items={C.comparison.after} />
            </div>
          </div>
        </div>
      </section>

      {/* 14. TECH STACK */}
      <section className="px-4 py-16 md:px-6 md:py-24" data-testid="section-stack">
        <div className="mx-auto max-w-5xl xl:max-w-6xl">
          <SectionHeading title={C.stack.title} testId="text-stack-title" />
          <div className="mx-auto mb-8 max-w-3xl space-y-4 text-center text-base text-gray-600 md:text-lg">
            {C.stack.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {C.stack.tools.map((tool) => (
              <span key={tool} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">
                {tool}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 15. WHAT'S INCLUDED */}
      <section className="bg-emerald-950 px-4 py-16 text-white md:px-6 md:py-24" data-testid="section-included">
        <div className="mx-auto max-w-5xl xl:max-w-6xl">
          <SectionHeading title={C.included.title} subtitle={C.included.subtitle} testId="text-included-title" light />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {C.included.items.map((item) => (
              <div key={item} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="text-emerald-50">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 16. WHO IT'S FOR */}
      <section className="px-4 py-16 md:px-6 md:py-24" data-testid="section-who-for">
        <div className="mx-auto max-w-6xl xl:max-w-[1440px]">
          <SectionHeading title={C.whoFor.title} subtitle={C.whoFor.subtitle} testId="text-who-for-title" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {C.whoFor.audiences.map((a, idx) => {
              const icons = [Home, Target, FileText, Users, Layers];
              const Icon = icons[idx] ?? Users;
              return (
                <motion.div
                  key={a.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.05 }}
                  className="rounded-2xl border border-gray-100 bg-gray-50 p-6"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-green/10">
                    <Icon className="h-6 w-6 text-brand-green" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{a.desc}</p>
                </motion.div>
              );
            })}
          </div>
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
              {C.pricing.title}
            </h2>
            <p className="mx-auto mb-4 max-w-2xl text-base text-gray-600 md:text-lg">{C.pricing.subtitle}</p>
            <p className="mx-auto mb-10 max-w-2xl text-sm text-gray-500">{C.pricing.explain}</p>

            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {C.pricing.layers.map((layer, idx) => (
                <div
                  key={layer.name}
                  className={`rounded-xl border bg-white p-5 text-left shadow-sm ${
                    idx === 2 ? "border-emerald-200 ring-2 ring-emerald-100" : "border-gray-100"
                  }`}
                >
                  <p
                    className={`mb-2 text-xs font-semibold uppercase tracking-wider ${
                      idx === 2 ? "text-emerald-600" : "text-gray-500"
                    }`}
                  >
                    {layer.label}
                  </p>
                  <p className="text-lg font-bold text-gray-900">{layer.name}</p>
                  <p className={`mt-1 text-base ${idx === 2 ? "font-semibold text-emerald-600" : "text-gray-600"}`}>
                    {layer.price}
                    {layer.priceNote ? <span className="ml-1 text-sm font-normal text-gray-500">{layer.priceNote}</span> : null}
                  </p>
                  <p className="mt-3 text-xs leading-relaxed text-gray-500">{layer.desc}</p>
                </div>
              ))}
            </div>

            <p className="mb-8 text-sm text-gray-500" data-testid="text-meta-note">
              {C.pricing.metaNote}
            </p>

            <div className="flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
              <button
                onClick={handleCta}
                className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-green px-10 text-base font-semibold text-white shadow-lg transition-all hover:bg-emerald-700 hover:shadow-xl sm:w-auto sm:text-lg"
                data-testid="button-pricing-install"
              >
                {C.pricing.cta}
                <ArrowRight className={arrowClass} />
              </button>
              <Link href="/pricing" className="w-full sm:w-auto">
                <button
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-10 text-base font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto sm:text-lg"
                  data-testid="button-pricing-plans"
                >
                  <BarChart3 className="h-5 w-5" />
                  {C.pricing.viewPlans}
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
              {C.whiteGlove.title}
            </h2>
            <p className="mt-4 text-base text-gray-600 md:text-lg">{C.whiteGlove.subtitle}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-900 p-6 text-white sm:p-8">
            <ul className="space-y-3">
              {C.whiteGlove.items.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                  {item}
                </li>
              ))}
            </ul>
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
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            {C.faq.map((faq) => (
              <FaqItem key={faq.q} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* 19. FINAL CTA */}
      <section className="bg-gray-900 px-4 py-12 text-white md:px-6 md:py-16" data-testid="section-final-cta">
        <div className="mx-auto max-w-3xl text-center xl:max-w-4xl">
          <h2 className="mb-4 font-display text-xl font-bold md:text-3xl xl:text-4xl">{C.finalCta.title}</h2>
          <p className="mb-8 text-gray-400 xl:text-lg">{C.finalCta.subtitle}</p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
            <button
              onClick={handleCta}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-green px-8 font-semibold text-white transition-all hover:bg-emerald-700 sm:w-auto"
              data-testid="button-footer-cta"
            >
              {C.finalCta.cta}
              <ArrowRight className={arrowClassSm} />
            </button>
            <Link href="/pricing" className="w-full sm:w-auto">
              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-gray-700 bg-gray-800 px-8 font-medium text-gray-300 transition-colors hover:bg-gray-700 sm:w-auto"
                data-testid="button-footer-plans"
              >
                <BarChart3 className={arrowClassSm} />
                {C.finalCta.viewPlans}
              </button>
            </Link>
          </div>
          <p className="mt-5 text-sm text-gray-500">{C.finalCta.note}</p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

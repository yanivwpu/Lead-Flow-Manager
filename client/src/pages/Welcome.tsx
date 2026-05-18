import { useState, lazy, Suspense, useLayoutEffect } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { ArrowRight, Calendar, CheckCircle2, ChevronRight, Clock3, Shield, Sparkles, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
const SiteFooter = lazy(() =>
  import("@/components/SiteFooter").then((m) => ({ default: m.SiteFooter })),
);
const BookDemoModal = lazy(() =>
  import("@/components/BookDemoModal").then((m) => ({ default: m.BookDemoModal })),
);
const LanguageSelector = lazy(() =>
  import("@/components/LanguageSelector").then((m) => ({ default: m.LanguageSelector })),
);
const WelcomeProblemSolution = lazy(() => import("@/pages/welcome/WelcomeProblemSolution"));
const WelcomeBenefitsSection = lazy(() => import("@/pages/welcome/WelcomeBenefitsSection"));
const WelcomeIntegrationsSection = lazy(() => import("@/pages/welcome/WelcomeIntegrationsSection"));
const WelcomeHowPricingBuilt = lazy(() => import("@/pages/welcome/WelcomeHowPricingBuilt"));
const WelcomeFinalCta = lazy(() => import("@/pages/welcome/WelcomeFinalCta"));
import { getDirection } from "@/lib/i18n";
import { MARKETING_URL } from "@/lib/marketingUrl";

/** Fixed min-heights reduce layout shift when lazy sections hydrate (approximate final block size). */
function BelowFoldFallback({ className }: { className?: string }) {
  return <div className={className ?? "min-h-[240px] bg-gray-50"} aria-hidden />;
}

function HeroConversationMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-2xl shadow-gray-900/10">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
              W
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-950">Miami buyer lead</p>
              <p className="text-xs text-gray-500">WhatsApp conversation synced to CRM</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-100">
            <Sparkles className="h-3.5 w-3.5" />
            AI Copilot active
          </div>
        </div>

        <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-3 bg-gray-50/70 px-5 py-5">
            <div className="max-w-[86%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-gray-800 shadow-sm ring-1 ring-gray-100">
              Hi, I’m interested in a 3-bedroom home in Miami.
            </div>
            <div className="ml-auto max-w-[86%] rounded-2xl rounded-tr-sm bg-emerald-600 px-4 py-3 text-sm text-white shadow-sm">
              Great. What’s your budget range?
            </div>
            <div className="max-w-[78%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-gray-800 shadow-sm ring-1 ring-gray-100">
              Around $600k–$800k.
            </div>
            <div className="ml-auto flex max-w-[90%] items-center gap-2 rounded-2xl rounded-tr-sm bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-100">
              <Sparkles className="h-4 w-4 shrink-0 text-emerald-700" />
              Budget qualified. I can send available times for a showing.
            </div>
          </div>

          <div className="border-t border-gray-100 bg-white px-5 py-5 md:border-l md:border-t-0">
            <div className="rounded-2xl bg-gray-950 p-4 text-white">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-300">Lead score</span>
                <TrendingUp className="h-4 w-4 text-emerald-300" />
              </div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold tracking-tight">87</span>
                <span className="pb-1 text-sm text-gray-400">/100</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-white/10">
                <div className="h-2 w-[87%] rounded-full bg-emerald-400" />
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              {["Budget qualified", "Follow-up scheduled", "Booking link ready"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-gray-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <Clock3 className="h-3.5 w-3.5" />
                Pipeline updated
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                <span className="rounded-full bg-white px-3 py-1.5 text-gray-600 ring-1 ring-gray-200">New lead</span>
                <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-800 ring-1 ring-emerald-200">Qualified</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-gray-500">
                Every conversation becomes organized, scored, and followed up.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Welcome() {
  const { user, isLoading: authLoading } = useAuth();
  const [location] = useLocation();
  const { t } = useTranslation();
  const [showDemoModal, setShowDemoModal] = useState(false);
  const isRTL = getDirection() === "rtl";
  const heroTitle = t("landing.heroTitle");
  const zeroPhrase = "Zero Complexity";
  const zeroIndex = heroTitle.indexOf(zeroPhrase);

  const hasStaticShell =
    typeof document !== "undefined" && !!document.getElementById("whachat-static-shell");
  /** index.html paints nav+hero for "/" guests — skip React duplicate until login or non-home route */
  const deferHeroToStaticHtml =
    hasStaticShell && location === "/" && (authLoading || !user);

  useLayoutEffect(() => {
    const shell = document.getElementById("whachat-static-shell");
    if (!shell) return;
    if (location !== "/" || user) {
      document.documentElement.classList.add("wcs-hide-static-marketing");
    } else {
      document.documentElement.classList.remove("wcs-hide-static-marketing");
    }
  }, [location, user]);

  // When Shopify App `application_url` is the app root, installs land as `/?shop=…myshopify.com` — forward to OAuth.
  useLayoutEffect(() => {
    if (typeof window === "undefined" || location !== "/") return;
    const params = new URLSearchParams(window.location.search);
    const shop = params.get("shop");
    if (shop && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
      window.location.replace(`/api/shopify/install?shop=${encodeURIComponent(shop)}`);
    }
  }, [location]);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen bg-white overflow-x-hidden ${isRTL ? "text-right" : "text-left"}`}>
      <Helmet>
        <title>WhatsApp & Unified Mailbox | WhachatCRM</title>
        <meta
          name="description"
          content="Manage WhatsApp, Instagram, and SMS in one unified mailbox. The simple CRM for SMBs and Shopify sellers."
        />
        <link rel="canonical" href={`${MARKETING_URL}/`} />
        <meta property="og:title" content="WhatsApp & Unified Mailbox | WhachatCRM" />
        <meta
          property="og:description"
          content="Manage WhatsApp, Instagram, and SMS in one unified mailbox. The simple CRM for SMBs and Shopify sellers."
        />
        <meta property="og:url" content={`${MARKETING_URL}/`} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${MARKETING_URL}/og-image.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={`${MARKETING_URL}/og-image.png`} />
        <meta name="twitter:title" content="WhatsApp & Unified Mailbox | WhachatCRM" />
        <meta
          name="twitter:description"
          content="Manage WhatsApp, Instagram, and SMS in one unified mailbox. The simple CRM for SMBs and Shopify sellers."
        />
      </Helmet>
      {showDemoModal ? (
        <Suspense fallback={null}>
          <BookDemoModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />
        </Suspense>
      ) : null}
      {!deferHeroToStaticHtml ? (
      <>
      {/* Navigation */}
      <nav className="min-h-[56px] py-2 px-4 md:py-3 md:px-6 grid grid-cols-[auto_1fr_auto] items-center gap-3 max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto box-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-brand-green rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">W</span>
          </div>
          <span className="font-display font-bold text-xl text-gray-900">WhachatCRM</span>
        </div>
        <div className="hidden lg:flex justify-self-center">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-100">
            <Shield className="h-3.5 w-3.5" />
            {t("landing.heroEyebrow")}
          </span>
        </div>
        <div className="flex items-center gap-2 md:gap-3 justify-self-end">
          <Link href="/pricing">
            <button className="h-9 px-2 text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">{t("landing.pricing")}</button>
          </Link>
          <Link href="/blog">
            <button className="h-9 px-2 text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">{t("landing.blog")}</button>
          </Link>
          <Suspense
            fallback={<div className="h-9 w-9 shrink-0 rounded-md bg-gray-100/90 border border-transparent" aria-hidden />}
          >
            <LanguageSelector variant="compact" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100" />
          </Suspense>
          {user ? (
            <Link href="/app/inbox">
              <button className="text-sm font-medium px-4 py-2 bg-brand-green text-white rounded-full hover:bg-emerald-700">{t("landing.dashboard")}</button>
            </Link>
          ) : (
            <>
              <Link href="/auth?mode=login">
                <button className="h-9 px-2 text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">{t("landing.login")}</button>
              </Link>
              <Link href="/auth">
                <button className="h-9 px-4 text-sm font-medium bg-brand-green text-white rounded-full hover:bg-emerald-700">{t("landing.startFree")}</button>
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-4 md:px-6 pt-5 md:pt-8 pb-12 md:pb-14 max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="flex flex-col gap-8 md:grid md:grid-cols-[1fr_1.04fr] md:gap-10 xl:gap-14 items-start">
          <div className="relative order-1 w-full md:order-2 md:mt-16 lg:mt-16 animate-hero-image">
            <HeroConversationMockup />
          </div>

          <div className="animate-hero-text order-2 md:order-1 max-w-[640px]">
            <h1 className="text-4xl md:text-5xl lg:text-[3.9rem] xl:text-[4.2rem] font-display font-bold text-gray-950 tracking-tight leading-[1.03] mb-4">
              {zeroIndex >= 0 ? (
                <>
                  <span className="block">{heroTitle.slice(0, zeroIndex).trim()}</span>
                  <span className="block whitespace-nowrap">{zeroPhrase}</span>
                </>
              ) : (
                heroTitle
              )}
            </h1>
            <p className="text-base md:text-[1.05rem] text-gray-600 mb-5 leading-7 max-w-xl">{t("landing.heroSubtitle")}</p>

            <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
              <div className="w-full sm:w-auto">
                <Link href={user ? "/app/inbox" : "/auth"}>
                  <button
                    className="w-full sm:w-auto h-11 px-5 bg-brand-green hover:bg-emerald-700 text-white text-sm font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
                    data-testid="button-hero-cta"
                  >
                    {t("landing.startTrial")}
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </Link>
              </div>
              <div className="w-full sm:w-auto">
                <Link href="/pricing">
                  <button
                    className="w-full sm:w-auto h-11 px-5 bg-white border border-gray-200 text-gray-800 text-sm font-semibold rounded-full flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors"
                    data-testid="button-hero-pricing"
                  >
                    {t("landing.pricing")}
                  </button>
                </Link>
              </div>
              <div className="flex flex-col items-center sm:items-start">
                <button
                  type="button"
                  onClick={() => setShowDemoModal(true)}
                  className="w-full sm:w-auto h-11 px-5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-full flex items-center justify-center gap-2 hover:from-amber-600 hover:to-orange-600 transition-colors shadow-md"
                  data-testid="button-book-demo"
                >
                  <Calendar className="h-4 w-4" />
                  {t("landing.bookDemo")}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{t("landing.noCreditCard")}</span>
            </div>
          </div>
        </div>
      </section>
      </>
      ) : null}

      <Suspense fallback={<BelowFoldFallback className="min-h-[360px] bg-white [contain-intrinsic-size:auto_360px]" />}>
        <WelcomeProblemSolution />
      </Suspense>

      <Suspense fallback={<BelowFoldFallback className="min-h-[520px] bg-gray-50 [contain-intrinsic-size:auto_520px]" />}>
        <WelcomeBenefitsSection />
      </Suspense>

      <Suspense fallback={<BelowFoldFallback className="min-h-[400px] bg-gradient-to-b from-gray-50 to-white [contain-intrinsic-size:auto_400px]" />}>
        <WelcomeIntegrationsSection />
      </Suspense>

      <Suspense fallback={<BelowFoldFallback className="min-h-[560px] bg-gray-50 [contain-intrinsic-size:auto_560px]" />}>
        <WelcomeHowPricingBuilt />
      </Suspense>

      <Suspense fallback={<BelowFoldFallback className="min-h-[320px] bg-gradient-to-br from-brand-green/5 to-brand-teal/5 [contain-intrinsic-size:auto_320px]" />}>
        <WelcomeFinalCta isLoggedIn={!!user} />
      </Suspense>

      <Suspense fallback={<footer className="min-h-[240px] bg-gray-50 border-t border-gray-100 [contain-intrinsic-size:auto_240px]" aria-hidden />}>
        <SiteFooter />
      </Suspense>
    </div>
  );
}

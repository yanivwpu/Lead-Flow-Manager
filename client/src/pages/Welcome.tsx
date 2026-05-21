import { useState, lazy, Suspense, useLayoutEffect } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { ArrowRight, Calendar, Shield } from "lucide-react";
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
    <img
      src="/hero/whachat-hero-mockup.png"
      alt="WhachatCRM WhatsApp conversation mockup with AI copilot and lead score"
      className="mx-auto block w-full max-w-[350px] lg:max-w-[380px]"
      width={560}
      height={871}
      loading="eager"
      decoding="async"
    />
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
        <div className="flex items-center gap-2 md:gap-5 lg:gap-6 justify-self-end">
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
      <section className="px-4 md:px-6 pt-5 md:pt-8 pb-6 md:pb-8 max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="flex flex-col gap-8 md:grid md:grid-cols-[1fr_1.04fr] md:gap-10 xl:gap-14 items-start">
          <div className="relative order-2 w-full md:order-2 md:mt-10 lg:mt-10 animate-hero-image">
            <HeroConversationMockup />
          </div>

          <div className="animate-hero-text order-1 md:order-1 max-w-[780px] md:mt-12 lg:mt-14">
            <h1 className="text-[3rem] md:text-[4.5rem] lg:text-[6.4rem] xl:text-[6.9rem] font-display font-bold text-gray-950 tracking-tight leading-[0.95] mb-7">
              {zeroIndex >= 0 ? (
                <>
                  <span className="block">{heroTitle.slice(0, zeroIndex).trim()}</span>
                  <span className="block whitespace-nowrap">{zeroPhrase}</span>
                </>
              ) : (
                heroTitle
              )}
            </h1>
            <p className="text-base md:text-[1.05rem] text-gray-600 mb-10 leading-7 max-w-xl">{t("landing.heroSubtitle")}</p>

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

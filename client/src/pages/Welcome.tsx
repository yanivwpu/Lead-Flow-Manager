import { useState, lazy, Suspense, useLayoutEffect, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { ArrowRight, Calendar } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
const SiteFooter = lazy(() =>
  import("@/components/SiteFooter").then((m) => ({ default: m.SiteFooter })),
);
const BookDemoModal = lazy(() =>
  import("@/components/BookDemoModal").then((m) => ({ default: m.BookDemoModal })),
);
const WelcomeBenefitsSection = lazy(() => import("@/pages/welcome/WelcomeBenefitsSection"));
const WelcomeAiPlatformSection = lazy(() => import("@/pages/welcome/WelcomeAiPlatformSection"));
const WelcomeIntegrationsSection = lazy(() => import("@/pages/welcome/WelcomeIntegrationsSection"));
const WelcomeHowPricingBuilt = lazy(() => import("@/pages/welcome/WelcomeHowPricingBuilt"));
const WelcomeFinalCta = lazy(() => import("@/pages/welcome/WelcomeFinalCta"));
const WelcomeDiscoveryPaths = lazy(() => import("@/pages/welcome/WelcomeDiscoveryPaths"));
import { getDirection } from "@/lib/i18n";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { getLocalizedHomepage } from "@shared/localizeMarketingContent";
import { getCanonicalUrl, getHreflangLinks } from "@shared/localeRoutes";
import { useLocalizedHref, useMarketingUrlLocale } from "@/lib/marketingLocaleRouting";

/** Fixed min-heights reduce layout shift when lazy sections hydrate (approximate final block size). */
function BelowFoldFallback({ className }: { className?: string }) {
  return <div className={className ?? "min-h-[240px] bg-gray-50"} aria-hidden />;
}

function HeroConversationMockup({ alt }: { alt: string }) {
  return (
    <div className="wcs-hero-image-column w-full md:order-2">
      <div className="wcs-hero-image-slot">
        <img
          className="wcs-hero-image"
          src="/hero/whachat-hero-mockup.png"
          alt={alt}
          width={560}
          height={871}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      </div>
    </div>
  );
}

function scrollToHashTarget(hash: string) {
  const id = hash.replace(/^#/, "");
  if (!id) return;
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function Welcome() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { t } = useTranslation();
  const [showDemoModal, setShowDemoModal] = useState(false);
  const isRTL = getDirection() === "rtl";
  const locale = useMarketingUrlLocale();
  const home = getLocalizedHomepage(locale);
  const pricingHref = useLocalizedHref("/pricing");
  const canonical = getCanonicalUrl("/", locale, MARKETING_URL) || `${MARKETING_URL}/`;
  const hreflang = getHreflangLinks("/", MARKETING_URL);

  useLayoutEffect(() => {
    document.documentElement.classList.remove("wcs-marketing-navigating");
    document.body.style.minHeight = "";
    document.body.style.paddingRight = "";
    document.documentElement.style.overflow = "";

    if (!document.getElementById("whachat-static-shell")) return;
    document.documentElement.classList.add("wcs-hide-static-marketing");
  }, [location, user]);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    // Wait a tick for lazy sections; retry briefly for #ai-brain etc.
    const tryScroll = () => scrollToHashTarget(hash);
    tryScroll();
    const t1 = window.setTimeout(tryScroll, 200);
    const t2 = window.setTimeout(tryScroll, 800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [location]);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen bg-white overflow-x-hidden ${isRTL ? "text-right" : "text-left"}`}>
      <Helmet>
        <html lang={locale} dir={isRTL ? "rtl" : "ltr"} />
        <title>{home.seo.title}</title>
        <meta name="description" content={home.seo.description} />
        <link rel="canonical" href={canonical} />
        {hreflang.map((l) => (
          <link key={l.hreflang} rel="alternate" hrefLang={l.hreflang} href={l.href} />
        ))}
        <meta property="og:title" content={home.seo.ogTitle} />
        <meta property="og:description" content={home.seo.ogDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${MARKETING_URL}/og-image.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={`${MARKETING_URL}/og-image.png`} />
        <meta name="twitter:title" content={home.seo.twitterTitle} />
        <meta name="twitter:description" content={home.seo.twitterDescription} />
      </Helmet>
      {showDemoModal ? (
        <Suspense fallback={null}>
          <BookDemoModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />
        </Suspense>
      ) : null}

      <MarketingHeader
        isLoggedIn={!!user}
        loginLabel={t("landing.login")}
        startTrialLabel={t("landing.startTrial")}
        startTrialShortLabel={t("landing.startFree")}
        dashboardLabel={t("landing.dashboard")}
        pricingLabel={t("landing.pricing")}
      />

      <section className="px-4 md:px-6 pt-5 md:pt-8 pb-6 md:pb-8 max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="flex flex-col gap-8 md:grid md:grid-cols-[1fr_1.04fr] md:gap-10 xl:gap-14 items-start">
          <HeroConversationMockup alt={home.heroImageAlt} />

          <div className="order-1 md:order-1 max-w-[780px] md:mt-12 lg:mt-14">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-brand-green">
              {t("landing.heroEyebrow")}
            </p>
            <h1 className="text-[2.75rem] md:text-[3.75rem] lg:text-[4.5rem] xl:text-[5rem] font-display font-bold text-gray-950 tracking-tight leading-[0.98] mb-6">
              {t("landing.heroTitle")}
            </h1>
            <p className="text-base md:text-[1.05rem] text-gray-600 mb-4 leading-7 max-w-xl">
              {t("landing.heroSubtitle")}
            </p>
            <p className="text-sm text-gray-500 mb-8 max-w-xl leading-6">
              {t("landing.heroChannels")}
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
              <div className="w-full sm:w-auto">
                <Link
                  href={user ? "/app/inbox" : "/auth"}
                  className="w-full sm:w-auto h-11 px-5 bg-brand-green hover:bg-emerald-700 text-white text-sm font-semibold rounded-full inline-flex items-center justify-center gap-2 transition-colors shadow-md hover:shadow-lg"
                  data-testid="button-hero-cta"
                >
                  {t("landing.startTrial")}
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
              <div className="w-full sm:w-auto">
                <Link
                  href={pricingHref}
                  className="w-full sm:w-auto h-11 px-5 bg-white border border-gray-200 text-gray-800 text-sm font-semibold rounded-full inline-flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors"
                  data-testid="button-hero-pricing"
                >
                  {t("landing.pricing")}
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

      <Suspense fallback={<BelowFoldFallback className="min-h-[180px] bg-white [contain-intrinsic-size:auto_180px]" />}>
        <WelcomeDiscoveryPaths />
      </Suspense>

      <Suspense fallback={<BelowFoldFallback className="min-h-[420px] bg-white [contain-intrinsic-size:auto_420px]" />}>
        <WelcomeAiPlatformSection />
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

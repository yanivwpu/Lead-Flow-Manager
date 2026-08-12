import { useState, lazy, Suspense, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
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
import { MARKETING_URL } from "@/lib/marketingUrl";
import { getLocalizedHomepage } from "@shared/localizeMarketingContent";
import { getCanonicalUrl, getHreflangLinks } from "@shared/localeRoutes";
import { useMarketingUrlLocale } from "@/lib/marketingLocaleRouting";

/** Fixed min-heights reduce layout shift when lazy sections hydrate (approximate final block size). */
function BelowFoldFallback({ className }: { className?: string }) {
  return <div className={className ?? "min-h-[240px] bg-gray-50"} aria-hidden />;
}

function scrollToHashTarget(hash: string) {
  const id = hash.replace(/^#/, "");
  if (!id) return;
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function isHomepagePath(location: string): boolean {
  return location === "/" || location === "/es/" || location === "/he/";
}

/**
 * Keep #whachat-static-shell hero painted as the LCP surface.
 * Remounting the same copy in React was causing 5–7s text LCP (render delay).
 * Header portals into #wcs-react-header-host in-place (not above the shell).
 */
function getReactHeaderHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("wcs-react-header-host");
}

export function Welcome() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { t } = useTranslation();
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null);
  const [shellLive, setShellLive] = useState(false);
  const locale = useMarketingUrlLocale();
  const home = getLocalizedHomepage(locale);
  const shell = home.staticShell;
  // URL locale is authoritative for dir — do not wait on async i18n (avoids LTR→RTL CLS).
  const isRTL = locale === "he";
  const canonical = getCanonicalUrl("/", locale, MARKETING_URL) || `${MARKETING_URL}/`;
  const hreflang = getHreflangLinks("/", MARKETING_URL);

  useLayoutEffect(() => {
    document.documentElement.classList.remove("wcs-marketing-navigating");
    document.body.style.minHeight = "";
    document.body.style.paddingRight = "";
    document.documentElement.style.overflow = "";

    const shellEl = document.getElementById("whachat-static-shell");
    if (!shellEl || !isHomepagePath(location)) {
      setShellLive(false);
      setHeaderHost(null);
      return;
    }

    // Keep shell hero for LCP; enhance header via portal; React owns below-fold.
    document.documentElement.classList.add("wcs-homepage-shell-live");
    document.documentElement.classList.remove("wcs-hide-static-marketing");
    const host = getReactHeaderHost();
    const shellNav = host?.querySelector<HTMLElement>(":scope > .wcs-nav");
    if (shellNav) {
      shellNav.setAttribute("aria-hidden", "true");
      shellNav.setAttribute("inert", "");
    }
    setHeaderHost(host);
    setShellLive(true);

    return () => {
      document.documentElement.classList.remove("wcs-homepage-shell-live");
      if (shellNav) {
        shellNav.removeAttribute("aria-hidden");
        shellNav.removeAttribute("inert");
      }
    };
  }, [location]);

  // Shell Book a Demo → React modal (shell href is /contact fallback without JS).
  useEffect(() => {
    if (!shellLive) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const demo = t?.closest?.("#whachat-static-shell [data-testid='button-book-demo']");
      if (!demo) return;
      e.preventDefault();
      setShowDemoModal(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [shellLive]);

  // Logged-in: point shell trial CTA at inbox.
  useEffect(() => {
    if (!shellLive) return;
    const cta = document.querySelector<HTMLAnchorElement>(
      "#whachat-static-shell [data-testid='button-hero-cta']",
    );
    const headerCta = document.querySelector<HTMLAnchorElement>(
      "#whachat-static-shell a.wcs-btn-green",
    );
    if (user) {
      if (cta) cta.setAttribute("href", "/app/inbox");
      if (headerCta) {
        headerCta.setAttribute("href", "/app/inbox");
        headerCta.textContent = t("landing.dashboard");
      }
    }
  }, [shellLive, user, t]);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const tryScroll = () => scrollToHashTarget(hash);
    tryScroll();
    const t1 = window.setTimeout(tryScroll, 200);
    const t2 = window.setTimeout(tryScroll, 800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [location]);

  const header = (
    <div className="wcs-react-header-portal">
      <MarketingHeader
        isLoggedIn={!!user}
        loginLabel={shell.navLogin}
        startTrialLabel={shell.navStartTrial}
        startTrialShortLabel={shell.navStartTrial}
        dashboardLabel={t("landing.dashboard")}
        pricingLabel={shell.navPricing}
      />
    </div>
  );

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className={`bg-white overflow-x-hidden ${shellLive ? "" : "min-h-screen"} ${isRTL ? "text-right" : "text-left"}`}
    >
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

      {shellLive && headerHost ? createPortal(header, headerHost) : header}

      {/* When the static shell is live, its hero is the LCP/SEO surface — do not remount. */}
      {!shellLive ? (
        <section className="wcs-hero-section" aria-label={shell.h1}>
          <div className="wcs-hero-grid-react">
            <div className="wcs-hero-image-column w-full md:order-2">
              <div className="wcs-hero-image-slot">
                <img
                  className="wcs-hero-image"
                  src="/hero/whachat-hero-mockup.png"
                  alt={shell.heroImageAlt || home.heroImageAlt}
                  width={560}
                  height={871}
                  loading="eager"
                  decoding="async"
                />
              </div>
            </div>
            <div className="wcs-hero-copy order-1 md:order-1">
              <p className="wcs-hero-eyebrow">{shell.trustPill}</p>
              <h1 className="wcs-hero-h1">{shell.h1}</h1>
              <p className="wcs-hero-sub">{shell.subtitle}</p>
            </div>
          </div>
        </section>
      ) : null}

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

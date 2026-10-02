/** Homepage paths that keep the instant marketing shell visible. */
export function isMarketingHomepagePath(location: string): boolean {
  return location === "/" || location === "/es/" || location === "/he/";
}

/**
 * Hide `#whachat-static-shell` before dropping `wcs-homepage-shell-live`.
 * Removing the live class first un-hides `header.wcs-nav` while React
 * `MarketingHeader` may still be mounted — two top nav rows.
 */
export function hideStaticMarketingShell(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add("wcs-hide-static-marketing");
  document.documentElement.classList.remove("wcs-homepage-shell-live");
}
import { getLocalizedHomepage } from "../../../shared/localizeMarketingContent";
import { localizedInternalHref } from "../../../shared/localeRoutes";
import type { MarketingLocale } from "../../../shared/marketingLocale";

/** Update the retained first-paint hero in place, without replacing its LCP image. */
export function syncStaticHomepageHero(
  doc: Document,
  locale: MarketingLocale,
  isLoggedIn: boolean,
): void {
  const root = doc.getElementById("whachat-static-shell");
  if (!root) return;
  const copy = getLocalizedHomepage(locale).staticShell;
  root.lang = locale;
  root.dir = locale === "he" ? "rtl" : "ltr";
  const text: Record<string, string> = {
    ".wcs-hero-eyebrow": copy.trustPill,
    ".wcs-hero-h1": copy.h1,
    ".wcs-hero-sub": copy.subtitle,
    ".wcs-hero-channels": copy.channels,
    ".wcs-hero-note": copy.noCreditCard,
    "[data-testid='button-hero-cta']": copy.ctaTrial,
    "[data-testid='button-hero-pricing']": copy.ctaPricing,
    "[data-testid='button-book-demo']": copy.ctaDemo,
  };
  for (const [selector, value] of Object.entries(text)) {
    const el = root.querySelector(selector);
    if (el && el.textContent !== value) el.textContent = value;
  }
  root.querySelector(".wcs-hero-image")?.setAttribute("alt", copy.heroImageAlt);
  root.querySelector("[data-testid='button-hero-cta']")?.setAttribute(
    "href", isLoggedIn ? "/app/inbox" : "/auth",
  );
  root.querySelector("[data-testid='button-hero-pricing']")?.setAttribute(
    "href", localizedInternalHref("/pricing", locale),
  );
}

import { Link, useLocation } from "wouter";
import { ShieldCheck } from "lucide-react";
import { getDirection, getCurrentLanguage, type SupportedLanguage } from "@/lib/i18n";
import { useCookieConsent } from "@/components/CookieConsentRoot";
import { useMarketingUrlLocale } from "@/lib/marketingLocaleRouting";
import {
  getLocalizedSiteFooter,
  type ResolvedSiteFooterColumn,
  type ResolvedSiteFooterLink,
  type SiteFooterColumnId,
} from "@shared/siteFooterContent";
import {
  WHACHAT_SOCIAL_LINK_REL,
  type WhachatSocialPlatformId,
} from "@shared/whachatSocialProfiles";
import type { MarketingLocale } from "@shared/marketingLocale";
import { hasLocalizedVersion, localizePath, parseLocalizedPath } from "@shared/localeRoutes";

function SocialIcon({ id }: { id: WhachatSocialPlatformId }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true as const,
    focusable: false as const,
  };
  switch (id) {
    case "facebook":
      return (
        <svg {...common}>
          <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.84c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.48h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...common}>
          <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.55V9h3.57v11.45zM22 2H2C.9 2 0 2.9 0 4v16c0 1.1.9 2 2 2h20c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M18.24 2H21.5l-7.54 8.62L22.7 22h-6.59l-5.16-6.74L5.05 22H1.77l8.07-9.22L1.3 2h6.76l4.66 6.17L18.24 2zm-1.16 18.1h1.81L7.05 3.8H5.11l11.97 16.3z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common}>
          <path d="M12 7.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2zm0 7.92a3.12 3.12 0 1 1 0-6.24 3.12 3.12 0 0 1 0 6.24z" />
          <path d="M17.52 6.48a1.12 1.12 0 1 1-2.24 0 1.12 1.12 0 0 1 2.24 0z" />
          <path d="M12 2.16c2.7 0 3.02.01 4.09.06 1.05.05 1.77.22 2.39.47a4.8 4.8 0 0 1 1.74 1.13 4.8 4.8 0 0 1 1.13 1.74c.25.62.42 1.34.47 2.39.05 1.07.06 1.39.06 4.09s-.01 3.02-.06 4.09c-.05 1.05-.22 1.77-.47 2.39a4.8 4.8 0 0 1-1.13 1.74 4.8 4.8 0 0 1-1.74 1.13c-.62.25-1.34.42-2.39.47-1.07.05-1.39.06-4.09.06s-3.02-.01-4.09-.06c-1.05-.05-1.77-.22-2.39-.47a4.8 4.8 0 0 1-1.74-1.13 4.8 4.8 0 0 1-1.13-1.74c-.25-.62-.42-1.34-.47-2.39C2.17 15.02 2.16 14.7 2.16 12s.01-3.02.06-4.09c.05-1.05.22-1.77.47-2.39a4.8 4.8 0 0 1 1.13-1.74A4.8 4.8 0 0 1 5.56 2.69c.62-.25 1.34-.42 2.39-.47C8.98 2.17 9.3 2.16 12 2.16zm0-1.66C9.25.5 8.9.51 7.81.56 6.71.61 5.96.8 5.3 1.06a6.46 6.46 0 0 0-2.33 1.52A6.46 6.46 0 0 0 1.45 4.91C1.19 5.57 1 6.32.95 7.42.9 8.51.89 8.86.89 12s.01 3.49.06 4.58c.05 1.1.24 1.85.5 2.51a6.46 6.46 0 0 0 1.52 2.33 6.46 6.46 0 0 0 2.33 1.52c.66.26 1.41.45 2.51.5 1.09.05 1.44.06 4.19.06s3.1-.01 4.19-.06c1.1-.05 1.85-.24 2.51-.5a6.46 6.46 0 0 0 2.33-1.52 6.46 6.46 0 0 0 1.52-2.33c.26-.66.45-1.41.5-2.51.05-1.09.06-1.44.06-4.19s-.01-3.1-.06-4.19c-.05-1.1-.24-1.85-.5-2.51a6.46 6.46 0 0 0-1.52-2.33A6.46 6.46 0 0 0 18.7 1.06c-.66-.26-1.41-.45-2.51-.5C15.1.51 14.75.5 12 .5z" />
        </svg>
      );
    default:
      return null;
  }
}

/** Compact on desktop; comfortable touch targets on mobile. */
const linkClass =
  "inline-flex min-h-10 items-center text-sm leading-5 text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green rounded-sm lg:min-h-0 lg:py-0.5";

function FooterNavLink({ link }: { link: ResolvedSiteFooterLink }) {
  const { openPreferences } = useCookieConsent();

  if (link.action === "cookiePreferences") {
    return (
      <button type="button" onClick={() => openPreferences()} className={`${linkClass} text-start`}>
        {link.label}
      </button>
    );
  }

  if (!link.href) return null;

  return (
    <Link href={link.href} className={linkClass}>
      {link.label}
    </Link>
  );
}

function FooterLinkList({ links }: { links: ResolvedSiteFooterLink[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {links.map((link) => (
        <li key={link.id} className="leading-5">
          <FooterNavLink link={link} />
        </li>
      ))}
    </ul>
  );
}

function FooterColumn({ column }: { column: ResolvedSiteFooterColumn }) {
  if (column.id === "product") {
    // One list (crawlable once). On large screens, flow into two columns:
    // col A = first five products, col B = remaining five.
    return (
      <div className="min-w-0 lg:col-span-2">
        <h3 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-gray-900">
          {column.heading}
        </h3>
        <ul className="flex flex-col gap-2 lg:grid lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-5 lg:gap-x-6 lg:gap-y-2">
          {column.links.map((link) => (
            <li key={link.id} className="leading-5">
              <FooterNavLink link={link} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <h3 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-gray-900">
        {column.heading}
      </h3>
      <FooterLinkList links={column.links} />
    </div>
  );
}

function resolveFooterLocale(
  urlLocale: MarketingLocale,
  pathname: string,
  i18nLang: SupportedLanguage,
): MarketingLocale {
  const parsed = parseLocalizedPath(pathname);
  if (parsed.isLocalePrefixed && parsed.isSupported) return urlLocale;
  if (!parsed.isLocalePrefixed && hasLocalizedVersion(parsed.englishPath)) return "en";
  if (i18nLang === "es" || i18nLang === "he") return i18nLang;
  return "en";
}

const COLUMN_ORDER: SiteFooterColumnId[] = [
  "product",
  "solutions",
  "resources",
  "compare",
  "legal",
];

export function SiteFooter() {
  const dir = getDirection();
  const [location] = useLocation();
  const urlLocale = useMarketingUrlLocale();
  const locale = resolveFooterLocale(urlLocale, location, getCurrentLanguage());
  // Same calendar-year source as SSR (`getLocalizedSiteFooter` default).
  const footer = getLocalizedSiteFooter(locale);
  const resolvedHome = localizePath("/", locale) || "/";
  const ordered = COLUMN_ORDER.map((id) => footer.columns.find((c) => c.id === id)!);

  return (
    <footer
      className="border-t border-gray-200 bg-gray-50 px-4 pt-12 pb-7 md:px-6"
      dir={dir}
      data-testid="site-footer"
      data-footer-locale={locale}
    >
      <div className="mx-auto max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px]">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-8 xl:gap-10">
          <div className="w-full shrink-0 lg:w-[260px] xl:w-[280px]">
            <Link
              href={resolvedHome}
              className="mb-3 inline-flex items-center gap-2 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-green">
                <span className="text-sm font-bold text-white">W</span>
              </div>
              <span className="font-display text-lg font-bold text-gray-900">WhachatCRM</span>
            </Link>
            <p className="text-sm leading-[1.4] text-gray-500">{footer.tagline}</p>
            <p className="mt-3 flex items-start gap-2 text-xs leading-snug text-gray-600">
              <ShieldCheck
                className="mt-0.5 h-4 w-4 shrink-0 text-brand-green [transform:none]"
                aria-hidden
              />
              <span dir="auto">{footer.metaTechProvider}</span>
            </p>
            <div className="mt-4">
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-900">
                {footer.followUs}
              </h3>
              <ul className="flex flex-wrap gap-2" style={{ direction: "ltr" }}>
                {footer.social.map((profile) => (
                  <li key={profile.id}>
                    <a
                      href={profile.url}
                      target="_blank"
                      rel={WHACHAT_SOCIAL_LINK_REL}
                      aria-label={profile.ariaLabel}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green lg:h-9 lg:w-9"
                    >
                      <SocialIcon id={profile.id} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <nav
            aria-label={footer.footerNavAria}
            className="grid min-w-0 flex-1 grid-cols-2 gap-x-7 gap-y-8 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-8 lg:gap-y-0"
          >
            {ordered.map((column) => (
              <FooterColumn key={column.id} column={column} />
            ))}
          </nav>
        </div>

        <div className="mt-8 border-t border-gray-200 pt-5">
          <p className="text-sm text-gray-400">{footer.copyright}</p>
        </div>
      </div>
    </footer>
  );
}

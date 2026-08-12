import { Suspense, lazy, useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronDown, Menu, X } from "lucide-react";
import { type MarketingNavDropdown } from "@shared/marketingNav";
import {
  getLocalizedMarketingNav,
  getMarketingChrome,
  getLocalizedHomepage,
} from "@shared/localizeMarketingContent";
import { localizedInternalHref } from "@shared/localeRoutes";
import { useMarketingUrlLocale } from "@/lib/marketingLocaleRouting";
import { cn } from "@/lib/utils";

const LanguageSelector = lazy(() =>
  import("@/components/LanguageSelector").then((m) => ({ default: m.LanguageSelector })),
);

type MarketingHeaderProps = {
  isLoggedIn: boolean;
  loginLabel?: string;
  /** Full primary CTA (desktop / larger phones). */
  startTrialLabel?: string;
  /** Compact primary CTA for narrow mobile headers. */
  startTrialShortLabel?: string;
  dashboardLabel?: string;
  pricingLabel?: string;
};

function DropdownPanel({
  dropdown,
  onNavigate,
  localeHref,
}: {
  dropdown: MarketingNavDropdown;
  onNavigate: () => void;
  localeHref: (href: string) => string;
}) {
  return (
    <div
      className="absolute left-1/2 top-full z-50 mt-2 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg shadow-gray-900/10"
      role="menu"
      aria-label={dropdown.label}
    >
      <div
        className={cn(
          "grid gap-5",
          dropdown.groups.length > 1 ? "sm:grid-cols-2" : "grid-cols-1",
        )}
      >
        {dropdown.groups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={`${group.title}-${item.label}`}>
                  <Link
                    href={localeHref(item.href)}
                    role="menuitem"
                    onClick={onNavigate}
                    className="block rounded-xl px-2 py-2 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
                  >
                    <span className="block text-sm font-semibold text-gray-900">{item.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-gray-500">
                      {item.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function DesktopNav({
  navDropdowns,
  openId,
  setOpenId,
  onNavigate,
  localeHref,
}: {
  navDropdowns: MarketingNavDropdown[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onNavigate: () => void;
  localeHref: (href: string) => string;
}) {
  return (
    <div className="hidden lg:flex items-center gap-1">
      {navDropdowns.map((dropdown) => {
        const isOpen = openId === dropdown.id;
        const buttonId = `marketing-nav-${dropdown.id}`;
        const panelId = `${buttonId}-panel`;
        return (
          <div key={dropdown.id} className="relative">
            <button
              type="button"
              id={buttonId}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              aria-controls={panelId}
              className={cn(
                "inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium text-gray-600 transition-colors",
                "hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40",
                isOpen && "bg-gray-100 text-gray-900",
              )}
              onClick={() => setOpenId(isOpen ? null : dropdown.id)}
            >
              {dropdown.label}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")}
                aria-hidden
              />
            </button>
            {isOpen ? (
              <div id={panelId}>
                <DropdownPanel dropdown={dropdown} onNavigate={onNavigate} localeHref={localeHref} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MobileAccordion({
  navDropdowns,
  pricingLabel,
  onNavigate,
  localeHref,
}: {
  navDropdowns: MarketingNavDropdown[];
  pricingLabel: string;
  onNavigate: () => void;
  localeHref: (href: string) => string;
}) {
  const [openSection, setOpenSection] = useState<string | null>(null);

  return (
    <div className="space-y-1 border-t border-gray-100 pt-3">
      {navDropdowns.map((dropdown) => {
        const isOpen = openSection === dropdown.id;
        const panelId = `mobile-nav-${dropdown.id}`;
        return (
          <div key={dropdown.id} className="rounded-xl">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
              onClick={() => setOpenSection(isOpen ? null : dropdown.id)}
            >
              {dropdown.label}
              <ChevronDown
                className={cn("h-4 w-4 text-gray-500 transition-transform", isOpen && "rotate-180")}
                aria-hidden
              />
            </button>
            {isOpen ? (
              <div id={panelId} className="space-y-4 px-2 pb-3 pt-1">
                {dropdown.groups.map((group) => (
                  <div key={group.title}>
                    <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                      {group.title}
                    </p>
                    <ul className="space-y-0.5">
                      {group.items.map((item) => (
                        <li key={`${group.title}-${item.label}`}>
                          <Link
                            href={localeHref(item.href)}
                            onClick={onNavigate}
                            className="block rounded-lg px-2 py-2 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
                          >
                            <span className="block text-sm font-medium text-gray-900">{item.label}</span>
                            <span className="mt-0.5 block text-xs text-gray-500">{item.description}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="px-3 pt-2">
        <Link
          href={localeHref("/pricing")}
          onClick={onNavigate}
          className="block rounded-lg px-2 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
        >
          {pricingLabel}
        </Link>
      </div>
    </div>
  );
}

export function MarketingHeader({
  isLoggedIn,
  loginLabel: loginLabelProp,
  startTrialLabel: startTrialLabelProp,
  startTrialShortLabel: startTrialShortLabelProp,
  dashboardLabel: dashboardLabelProp,
  pricingLabel: pricingLabelProp,
}: MarketingHeaderProps) {
  // Public URL locale is authoritative for all chrome links (logo, menus, Pricing).
  // Never derive hrefs from i18n/localStorage — that caused Spanish↔English flips.
  const locale = useMarketingUrlLocale();
  const chrome = getMarketingChrome(locale);
  const a11y = getLocalizedHomepage(locale).chromeA11y;
  const navDropdowns = getLocalizedMarketingNav(locale);
  const localeHref = useCallback(
    (href: string) => localizedInternalHref(href, locale),
    [locale],
  );
  const homeHref = localeHref("/");

  const loginLabel = loginLabelProp ?? chrome.logIn;
  const startTrialLabel = startTrialLabelProp ?? chrome.startFreeTrial;
  const startTrialShortLabel = startTrialShortLabelProp ?? chrome.startFree;
  const dashboardLabel = dashboardLabelProp ?? "Dashboard";
  const pricingLabel = pricingLabelProp ?? chrome.pricing;

  const [openId, setOpenId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const mobilePanelId = useId();

  const closeAll = useCallback(() => {
    setOpenId(null);
    setMobileOpen(false);
  }, []);

  useEffect(() => {
    if (!openId && !mobileOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (target && headerRef.current && !headerRef.current.contains(target)) {
        closeAll();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [openId, mobileOpen, closeAll]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <header
      ref={headerRef}
      className="relative z-40 bg-white"
    >
      <div className="mx-auto grid h-14 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4 box-border md:h-[60px] md:px-6">
        <Link
          href={homeHref}
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
          aria-label={a11y.homeAria}
          onClick={closeAll}
          data-testid="marketing-logo-home"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-green">
            <span className="text-lg font-bold text-white">W</span>
          </div>
          <span className="font-display text-xl font-bold text-gray-900">WhachatCRM</span>
        </Link>

        <nav className="hidden justify-self-center lg:block" aria-label={a11y.primaryNav}>
          <DesktopNav
            navDropdowns={navDropdowns}
            openId={openId}
            setOpenId={setOpenId}
            onNavigate={closeAll}
            localeHref={localeHref}
          />
        </nav>

        <div className="flex items-center gap-1.5 justify-self-end sm:gap-2 md:gap-3">
          <Link
            href={localeHref("/pricing")}
            className="hidden h-9 items-center px-2 text-sm font-medium text-gray-600 hover:text-gray-900 sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 rounded-md"
            onClick={closeAll}
          >
            {pricingLabel}
          </Link>

          <div className="hidden sm:block">
            <Suspense fallback={<div className="h-9 w-9 shrink-0 rounded-md bg-gray-100/90" aria-hidden />}>
              <LanguageSelector
                variant="compact"
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                navigateOnChange
              />
            </Suspense>
          </div>

          {isLoggedIn ? (
            <Link
              href="/app/inbox"
              className="inline-flex h-9 shrink-0 items-center rounded-full bg-brand-green px-3 text-sm font-medium text-white hover:bg-emerald-700 sm:px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
              onClick={closeAll}
            >
              {dashboardLabel}
            </Link>
          ) : (
            <>
              <Link
                href="/auth?mode=login"
                className="hidden h-9 items-center px-2 text-sm font-medium text-gray-600 hover:text-gray-900 sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 rounded-md"
                onClick={closeAll}
              >
                {loginLabel}
              </Link>
              <Link
                href="/auth"
                className="inline-flex h-9 max-w-[9.5rem] shrink-0 items-center justify-center truncate rounded-full bg-brand-green px-3 text-sm font-semibold text-white hover:bg-emerald-700 sm:max-w-none sm:px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
                onClick={closeAll}
                data-testid="button-header-start-trial"
              >
                <span className="sm:hidden">{startTrialShortLabel}</span>
                <span className="hidden sm:inline">{startTrialLabel}</span>
              </Link>
            </>
          )}

          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
            aria-expanded={mobileOpen}
            aria-controls={mobilePanelId}
            aria-label={mobileOpen ? a11y.closeMenu : a11y.openMenu}
            onClick={() => {
              setOpenId(null);
              setMobileOpen((v) => !v);
            }}
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div
          id={mobilePanelId}
          className="absolute inset-x-0 top-full z-50 max-h-[min(70vh,32rem)] overflow-y-auto border-b border-gray-200 bg-white px-4 pb-4 shadow-lg lg:hidden"
        >
          <MobileAccordion
            navDropdowns={navDropdowns}
            pricingLabel={pricingLabel}
            onNavigate={closeAll}
            localeHref={localeHref}
          />
          {!isLoggedIn ? (
            <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 sm:hidden">
              <Link
                href="/auth?mode=login"
                onClick={closeAll}
                className="inline-flex h-10 items-center justify-center rounded-full border border-gray-200 text-sm font-medium text-gray-800"
              >
                {loginLabel}
              </Link>
              <Link
                href="/auth"
                onClick={closeAll}
                className="inline-flex h-10 items-center justify-center rounded-full bg-brand-green text-sm font-semibold text-white"
              >
                {startTrialLabel}
              </Link>
            </div>
          ) : null}
          <div className="mt-3 border-t border-gray-100 pt-3 sm:hidden">
            <Suspense fallback={null}>
              <LanguageSelector variant="compact" className="text-gray-600" navigateOnChange />
            </Suspense>
          </div>
        </div>
      ) : null}

      <nav className="sr-only" aria-label={a11y.siteNav}>
        <ul>
          {navDropdowns.flatMap((d) =>
            d.groups.flatMap((g) =>
              g.items.map((item) => (
                <li key={`crawl-${d.id}-${item.label}`}>
                  <a href={localeHref(item.href)}>{item.label}</a>
                </li>
              )),
            ),
          )}
          <li>
            <a href={localeHref("/pricing")}>{pricingLabel}</a>
          </li>
          <li>
            <a href="/auth">{startTrialLabel}</a>
          </li>
        </ul>
      </nav>
    </header>
  );
}

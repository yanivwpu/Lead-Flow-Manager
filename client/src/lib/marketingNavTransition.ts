import type { MouseEvent as ReactMouseEvent } from "react";

/** Shared homepage → destination transition (prevents hero/layout jump on any nav). */

const NAV_CLASS = "wcs-marketing-navigating";
const SCROLL_LOCK_DATA = "wcsScrollLockPad";
const HERO_FREEZE_FLAG = "data-wcs-hero-frozen";
const HERO_SLOT_SELECTOR =
  "#whachat-static-shell .wcs-hero-image-slot, #root .wcs-hero-image-slot";

type HeroFreezeSnapshot = {
  slot: HTMLElement;
  width: number;
  height: number;
  column: HTMLElement | null;
  columnWidth: number;
  columnHeight: number;
};

function collectHeroFreezeSnapshots(): HeroFreezeSnapshot[] {
  const snapshots: HeroFreezeSnapshot[] = [];
  document.querySelectorAll<HTMLElement>(HERO_SLOT_SELECTOR).forEach((slot) => {
    const rect = slot.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const column = slot.closest<HTMLElement>(".wcs-hero-image-column, .wcs-order-img");
    const colRect = column?.getBoundingClientRect();
    snapshots.push({
      slot,
      width: rect.width,
      height: rect.height,
      column,
      columnWidth: colRect?.width ?? rect.width,
      columnHeight: colRect?.height ?? rect.height,
    });
  });
  return snapshots;
}

function applyHeroFreezeSnapshot({
  slot,
  width,
  height,
  column,
  columnWidth,
  columnHeight,
}: HeroFreezeSnapshot): void {
  const w = `${width}px`;
  const h = `${height}px`;

  slot.setAttribute(HERO_FREEZE_FLAG, "1");
  slot.classList.add("wcs-hero-image-frozen");
  slot.style.boxSizing = "border-box";
  slot.style.width = w;
  slot.style.height = h;
  slot.style.minWidth = w;
  slot.style.minHeight = h;
  slot.style.maxWidth = w;
  slot.style.maxHeight = h;
  slot.style.aspectRatio = "auto";
  slot.style.flexShrink = "0";
  slot.style.marginLeft = "auto";
  slot.style.marginRight = "auto";

  const img = slot.querySelector("img");
  if (img instanceof HTMLImageElement) {
    img.style.display = "block";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.maxWidth = "100%";
    img.style.objectFit = "contain";
    img.style.objectPosition = "center";
    img.style.transform = "none";
    img.style.transition = "none";
    img.style.animation = "none";
  }

  if (column) {
    column.classList.add("wcs-hero-image-frozen");
    column.style.width = `${columnWidth}px`;
    column.style.minWidth = `${columnWidth}px`;
    column.style.minHeight = `${columnHeight}px`;
    column.style.maxWidth = `${columnWidth}px`;
    column.style.flexShrink = "0";
  }
}

function freezeHeroMockDimensions(): void {
  const snapshots = collectHeroFreezeSnapshots();
  snapshots.forEach(applyHeroFreezeSnapshot);
}

function unfreezeHeroMockDimensions(): void {
  document.querySelectorAll<HTMLElement>(`[${HERO_FREEZE_FLAG}]`).forEach((slot) => {
    slot.classList.remove("wcs-hero-image-frozen");
    slot.removeAttribute(HERO_FREEZE_FLAG);
    slot.style.width = "";
    slot.style.height = "";
    slot.style.minWidth = "";
    slot.style.minHeight = "";
    slot.style.maxWidth = "";
    slot.style.maxHeight = "";
    slot.style.aspectRatio = "";
    slot.style.flexShrink = "";
    slot.style.marginLeft = "";
    slot.style.marginRight = "";
    const img = slot.querySelector("img");
    if (img instanceof HTMLImageElement) {
      img.style.width = "";
      img.style.height = "";
      img.style.maxWidth = "";
      img.style.objectFit = "";
      img.style.objectPosition = "";
      img.style.transform = "";
      img.style.transition = "";
      img.style.animation = "";
    }
  });

  document.querySelectorAll<HTMLElement>(".wcs-hero-image-column.wcs-hero-image-frozen, .wcs-order-img.wcs-hero-image-frozen").forEach((column) => {
    column.classList.remove("wcs-hero-image-frozen");
    column.style.width = "";
    column.style.minWidth = "";
    column.style.minHeight = "";
    column.style.maxWidth = "";
    column.style.flexShrink = "";
  });
}

export function isMarketingHomeNavPending(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains(NAV_CLASS);
}

function lockDocumentScroll(): void {
  const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  if (scrollbarWidth > 0) {
    document.body.dataset[SCROLL_LOCK_DATA] = document.body.style.paddingRight || "";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
  document.documentElement.style.overflow = "hidden";
}

function unlockDocumentScroll(): void {
  const prev = document.body.dataset[SCROLL_LOCK_DATA];
  document.body.style.paddingRight = prev ?? "";
  delete document.body.dataset[SCROLL_LOCK_DATA];
  document.documentElement.style.overflow = "";
}

/** Begin leaving "/" — freeze static hero, hide #root until destination paints. */
export function beginMarketingHomeNav(): void {
  if (typeof document === "undefined") return;
  if (isMarketingHomeNavPending()) return;

  const heroSnapshots = collectHeroFreezeSnapshots();

  document.documentElement.classList.add(NAV_CLASS);

  const shell = document.getElementById("whachat-static-shell");
  const lockHeight = shell
    ? Math.max(shell.offsetHeight, window.innerHeight)
    : window.innerHeight;
  document.body.style.minHeight = `${lockHeight}px`;

  lockDocumentScroll();
  heroSnapshots.forEach(applyHeroFreezeSnapshot);
}

/** @deprecated Use beginMarketingHomeNav */
export const beginMarketingNavTransition = beginMarketingHomeNav;

function applyStaticShellVisibilityForPath(): void {
  const path = (window.location.pathname || "/").replace(/\/$/, "") || "/";
  if (path === "/") {
    document.documentElement.classList.remove("wcs-hide-static-marketing");
  } else {
    document.documentElement.classList.add("wcs-hide-static-marketing");
  }
}

/** Call when destination route has real content (not only a spinner). */
export function endMarketingHomeNav(): void {
  if (typeof document === "undefined") return;
  if (!isMarketingHomeNavPending()) return;

  unfreezeHeroMockDimensions();
  document.documentElement.classList.remove(NAV_CLASS);
  document.body.style.minHeight = "";
  unlockDocumentScroll();
  applyStaticShellVisibilityForPath();
}

/** @deprecated Use endMarketingHomeNav */
export const endMarketingNavTransition = endMarketingHomeNav;

export function shouldDeferHidingStaticMarketing(): boolean {
  return isMarketingHomeNavPending();
}

function isInternalMarketingHref(href: string): boolean {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  if (href.startsWith("http://") || href.startsWith("https://")) {
    try {
      return new URL(href).origin === window.location.origin;
    } catch {
      return false;
    }
  }
  return href.startsWith("/");
}

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/$/, "") || "/";
}

/** True when leaving homepage to another in-app route (not same-page hash). */
export function isHomepageOutboundHref(href: string): boolean {
  if (!isInternalMarketingHref(href)) return false;
  const url = new URL(href, window.location.origin);
  const target = normalizePathname(url.pathname);
  const current = normalizePathname(window.location.pathname);
  return current === "/" && target !== "/";
}

/** Document capture: any internal link on "/" starts the transition before wouter navigates. */
export function handleMarketingHomeNavClick(event: MouseEvent): void {
  if (normalizePathname(window.location.pathname) !== "/") return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
    return;
  }

  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!anchor) return;

  const href = anchor.getAttribute("href");
  if (!href || !isHomepageOutboundHref(href)) return;

  beginMarketingHomeNav();
}

export function installMarketingHomeNavCapture(): () => void {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("click", handleMarketingHomeNavClick, true);
  return () => document.removeEventListener("click", handleMarketingHomeNavClick, true);
}

export function createMarketingHomeNavHandler(
  href: string,
  setLocation: (to: string) => void,
): (e: ReactMouseEvent) => void {
  return (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (isHomepageOutboundHref(href)) beginMarketingHomeNav();
    requestAnimationFrame(() => setLocation(href));
  };
}

function isRootReadyForReveal(): boolean {
  const root = document.getElementById("root");
  if (!root || root.childElementCount === 0) return false;
  return !root.querySelector(".animate-spin");
}

/**
 * Ends the frozen homepage overlay once #root has non-loader content.
 * Used from Router so all destinations are covered without per-page hooks.
 */
export function watchMarketingHomeNavRelease(
  location: string,
  authLoading = false,
): () => void {
  if (typeof document === "undefined") return () => {};
  if (normalizePathname(location) === "/" || !isMarketingHomeNavPending()) return () => {};
  if (location.startsWith("/app") && authLoading) return () => {};

  let done = false;
  const finish = () => {
    if (done) return;
    if (!isMarketingHomeNavPending()) return;
    if (!isRootReadyForReveal()) return;
    done = true;
    endMarketingHomeNav();
  };

  finish();
  const root = document.getElementById("root");
  if (!root) return () => {};

  const observer = new MutationObserver(() => finish());
  observer.observe(root, { childList: true, subtree: true });

  const fallback = window.setTimeout(() => {
    if (!done && isMarketingHomeNavPending()) {
      done = true;
      endMarketingHomeNav();
    }
  }, 4000);

  const raf = requestAnimationFrame(() => requestAnimationFrame(finish));

  return () => {
    observer.disconnect();
    window.clearTimeout(fallback);
    cancelAnimationFrame(raf);
  };
}

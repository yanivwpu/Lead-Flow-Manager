import type { MouseEvent as ReactMouseEvent } from "react";

/** Shared homepage → destination transition (prevents hero/layout jump on any nav). */



const NAV_CLASS = "wcs-marketing-navigating";

const SCROLL_LOCK_DATA = "wcsScrollLockPad";



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



  document.documentElement.classList.add(NAV_CLASS);



  const shell = document.getElementById("whachat-static-shell");

  const lockHeight = shell

    ? Math.max(shell.offsetHeight, window.innerHeight)

    : window.innerHeight;

  document.body.style.minHeight = `${lockHeight}px`;

  lockDocumentScroll();

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

  const p = pathname.replace(/\/$/, "") || "/";

  return p;

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



/** Inline script in index.html — keep in sync with beginMarketingHomeNav (no static hide on begin). */

export function syncMarketingHomeNavInlineScript(): void {

  if (typeof window === "undefined") return;

  (window as Window & { wcsBeginMarketingNav?: () => void }).wcsBeginMarketingNav =

    beginMarketingHomeNav;

}



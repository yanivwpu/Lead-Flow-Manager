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

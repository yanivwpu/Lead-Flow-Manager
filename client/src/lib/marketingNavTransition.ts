/** Locks landing layout during SPA hops to /auth (prevents static/React hero swap flash). */

const NAV_CLASS = "wcs-marketing-navigating";

export function beginMarketingNavTransition(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add(NAV_CLASS, "wcs-hide-static-marketing");

  const shell = document.getElementById("whachat-static-shell");
  const lockHeight = shell
    ? Math.max(shell.offsetHeight, window.innerHeight)
    : window.innerHeight;
  document.body.style.minHeight = `${lockHeight}px`;
  document.documentElement.style.overflow = "hidden";
}

export function endMarketingNavTransition(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove(NAV_CLASS);
  document.body.style.minHeight = "";
  document.documentElement.style.overflow = "";
}

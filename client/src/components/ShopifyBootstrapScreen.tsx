import { useLayoutEffect } from "react";

/**
 * Minimal loader for Shopify install/OAuth — no marketing chrome.
 * Matches #wcs-shopify-bootstrap-shell in index.html for seamless handoff from pre-React loader.
 */
export function ShopifyBootstrapScreen() {
  useLayoutEffect(() => {
    const shell = document.getElementById("wcs-shopify-bootstrap-shell");
    if (shell) shell.style.display = "none";
  }, []);
  return (
    <div
      id="wcs-shopify-bootstrap-react"
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6 font-sans"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="shopify-bootstrap-loading"
    >
      <div className="wcs-bootstrap-logo flex h-12 w-12 items-center justify-center rounded-xl bg-[#059669] text-xl font-bold text-white font-display">
        W
      </div>
      <p className="wcs-bootstrap-text mt-5 text-sm font-medium tracking-tight text-gray-500">
        Loading workspace…
      </p>
    </div>
  );
}

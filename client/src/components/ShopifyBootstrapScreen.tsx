/**
 * Minimal loader for Shopify install/OAuth — no marketing chrome.
 */
export function ShopifyBootstrapScreen() {
  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="shopify-bootstrap-loading"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-green shadow-sm">
          <span className="font-display text-xl font-bold text-white">W</span>
        </div>
        <p className="text-sm font-medium tracking-tight text-gray-500">Loading workspace…</p>
      </div>
    </div>
  );
}

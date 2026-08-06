/**
 * Cost-controlled headless render fallback for Prospect email enrichment.
 *
 * Disabled by default. Enable with PROSPECT_ENRICHMENT_HEADLESS=1 and optional
 * playwright install (`npx playwright install chromium`).
 *
 * Without playwright, returns null — callers still use static HTML + embedded JSON.
 */

export const PROSPECT_ENRICH_MAX_RENDER_PAGES = 2;
export const PROSPECT_ENRICH_RENDER_TIMEOUT_MS = 12_000;

export function isProspectEnrichmentHeadlessEnabled(): boolean {
  const raw = String(process.env.PROSPECT_ENRICHMENT_HEADLESS || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

type PlaywrightChromium = {
  launch: (opts: { headless: boolean }) => Promise<{
    newPage: () => Promise<{
      setDefaultTimeout: (ms: number) => void;
      goto: (url: string, opts: { waitUntil: string; timeout: number }) => Promise<unknown>;
      content: () => Promise<string>;
      close: () => Promise<void>;
    }>;
    close: () => Promise<void>;
  }>;
};

/**
 * Load playwright only when headless is enabled. Avoid static `import("playwright")`
 * so `tsc` does not require the optional dependency.
 */
async function loadPlaywrightChromium(): Promise<PlaywrightChromium | null> {
  try {
    const req = (await import("node:module")).createRequire(import.meta.url);
    // Optional peer — may be absent in production images.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const playwright = req("playwright") as { chromium?: PlaywrightChromium };
    return playwright.chromium || null;
  } catch {
    return null;
  }
}

/**
 * Render a page and return outer HTML when headless is enabled and playwright is available.
 * Never throws to callers — returns null on any failure.
 */
export async function renderPageHtmlForEnrichment(url: string): Promise<string | null> {
  if (!isProspectEnrichmentHeadlessEnabled()) return null;
  try {
    const chromium = await loadPlaywrightChromium();
    if (!chromium) return null;

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(PROSPECT_ENRICH_RENDER_TIMEOUT_MS);
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: PROSPECT_ENRICH_RENDER_TIMEOUT_MS,
      });
      // Brief settle for client-rendered contact blocks.
      await new Promise((r) => setTimeout(r, 750));
      const html = await page.content();
      await page.close();
      return html && html.length > 50 ? html : null;
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

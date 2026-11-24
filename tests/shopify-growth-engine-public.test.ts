/** Public Shopify Growth Engine route, nav, metadata and chatbot regression. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PRODUCT_NAV } from "../shared/marketingNav";
import { MARKETING_CHAT_PRODUCT_PAGES } from "../shared/marketingChatPageCoverage";
import { getCanonicalUrl, getHreflangLinks } from "../shared/localeRoutes";
import { getLocalizedPageMeta } from "../shared/marketingPageMetaLocales";
import { PAGE_META } from "../server/seo";
const read = (path: string) => readFileSync(path, "utf8");
const path = "/shopify-growth-engine";

test("new Shopify product page is crawlable, localized, and distinct from private preview", () => {
  const source = read("client/src/App.tsx");
  assert.ok(source.includes('localeRoutes("/shopify-growth-engine", ShopifyGrowthEngineLanding)'));
  assert.ok(read("client/src/pages/EcommerceGrowthEnginePreview.tsx").includes("PRIVATE PILOT PREVIEW"));
  assert.ok(PRODUCT_NAV.groups.some(group => group.items.some(item => item.href === path)));
  assert.ok(PAGE_META[path]);
  for (const locale of ["en", "es", "he"] as const) {
    // English SEO is canonical in PAGE_META. LocalizedPageMeta only supplies es/he overlays.
    const seo = locale === "en" ? PAGE_META[path] : getLocalizedPageMeta(path, locale);
    assert.ok(seo?.title.includes("Shopify"));
    const description = seo && ("description" in seo ? seo.description : undefined);
    assert.ok(description && description.length > 50);
    assert.ok(getCanonicalUrl(path, locale));
  }
  assert.deepEqual(getHreflangLinks(path).map(a=>a.hreflang), ["en","es","he","x-default"]);
  const sitemap = read("client/public/sitemap.xml");
  for (const locale of ["", "/es", "/he"]) assert.ok(sitemap.includes("https://www.whachatcrm.com" + locale + path));
});
test("Shopify chatbot uses exact page-aware content without enabling merchant sends", () => {
  assert.ok(MARKETING_CHAT_PRODUCT_PAGES.some(([name,,local]) => name === path && local));
  const rules = read("shared/marketingChatPageCoverage.ts");
  assert.match(rules, /path === '\/shopify-growth-engine'/);
  assert.match(rules, /Cart Recovery delivery/);
  const landing = read("client/src/pages/ShopifyGrowthEngineLanding.tsx");
  assert.match(landing, /https:\/\/apps.shopify.com\/whachatcrm/);
  assert.match(landing, /AI Checkout Assistance/);
  assert.match(landing, /useMarketingUrlLocale/);
  assert.match(landing, /getHreflangLinks/);
  assert.ok(!landing.includes("CHECKOUT_ROLLOUT_APPROVED = true"));
});

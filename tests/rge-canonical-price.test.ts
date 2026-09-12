/**
 * Every RGE display and amount consumer must resolve from canonical $199.
 * Run: npx tsx --test tests/rge-canonical-price.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REALTOR_GROWTH_ENGINE_ONETIME_CENTS,
  REALTOR_GROWTH_ENGINE_ONETIME_USD,
  REALTOR_GROWTH_ENGINE_REQUIRES_PRO,
  buildCanonicalOfferJsonLd,
  buildCanonicalPricingCrawlableLines,
  formatUsdDisplay,
  getCanonicalCommercialCatalog,
} from "../shared/pricingEntitlements";
import { GROWTH_ENGINE_CARDS } from "../client/src/lib/growthEnginesCatalog";
import { SHOPIFY_RGE_ONETIME_USD } from "../server/shopify";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const RGE_AMOUNT_CONSUMERS = [
  "server/templateRoutes.ts",
  "server/shopify.ts",
  "client/src/lib/growthEnginesCatalog.ts",
  "server/seo.ts",
  "client/src/pages/RealtorLanding.tsx",
  "client/src/pages/Templates.tsx",
  "server/rgePurchase.ts",
] as const;

test("canonical RGE amount is $199 / 19900 cents", () => {
  assert.equal(REALTOR_GROWTH_ENGINE_ONETIME_USD, 199);
  assert.equal(REALTOR_GROWTH_ENGINE_ONETIME_CENTS, 19900);
  assert.equal(REALTOR_GROWTH_ENGINE_ONETIME_CENTS, REALTOR_GROWTH_ENGINE_ONETIME_USD * 100);
  assert.equal(formatUsdDisplay(REALTOR_GROWTH_ENGINE_ONETIME_USD), "$199");
});

test("gallery, Shopify, catalog, SSR, and JSON-LD resolve from the canonical USD amount", () => {
  const rgeCard = GROWTH_ENGINE_CARDS.find((card) => card.slug === "realtor-growth-engine");
  assert.ok(rgeCard);
  assert.equal(rgeCard!.oneTimePrice, formatUsdDisplay(REALTOR_GROWTH_ENGINE_ONETIME_USD));
  assert.equal(rgeCard!.subscriptionRequirementShort, REALTOR_GROWTH_ENGINE_REQUIRES_PRO);
  assert.equal(rgeCard!.monthlyRequirementLabel, REALTOR_GROWTH_ENGINE_REQUIRES_PRO);

  assert.equal(SHOPIFY_RGE_ONETIME_USD, REALTOR_GROWTH_ENGINE_ONETIME_USD);

  const catalog = getCanonicalCommercialCatalog().find((item) => item.id === "realtor-growth-engine");
  assert.equal(catalog?.offers[0]?.amount, REALTOR_GROWTH_ENGINE_ONETIME_USD);
  assert.equal(catalog?.offers[0]?.billingPeriod, "once");

  const crawlable = buildCanonicalPricingCrawlableLines().join("\n");
  assert.ok(
    crawlable.includes(
      `Realtor Growth Engine: ${formatUsdDisplay(REALTOR_GROWTH_ENGINE_ONETIME_USD)} one-time`,
    ),
  );

  const jsonLd = buildCanonicalOfferJsonLd("/realtor-growth-engine", "https://www.whachatcrm.com/realtor-growth-engine", "https://www.whachatcrm.com");
  const payload = JSON.stringify(jsonLd);
  assert.match(payload, new RegExp(`"price":${REALTOR_GROWTH_ENGINE_ONETIME_USD}`));
  assert.doesNotMatch(payload, /"price":19900/);
});

test("checkout, templates, galleries, and entitlement files do not keep independent RGE price literals", () => {
  const entitlements = read("shared/pricingEntitlements.ts");
  assert.match(
    entitlements,
    /export const REALTOR_GROWTH_ENGINE_ONETIME_USD = 199;/,
  );
  assert.match(
    entitlements,
    /export const REALTOR_GROWTH_ENGINE_ONETIME_CENTS = REALTOR_GROWTH_ENGINE_ONETIME_USD \* 100;/,
  );

  const templates = read("server/templateRoutes.ts");
  assert.match(templates, /TEMPLATE_PRICE_CENTS = REALTOR_GROWTH_ENGINE_ONETIME_CENTS/);
  assert.ok(!templates.includes("REALTOR_GROWTH_ENGINE_ONETIME_USD * 100"));
  assert.doesNotMatch(templates, /\b19900\b/);
  assert.doesNotMatch(templates, /\b199\b/);
  assert.match(templates, /process\.env\.STRIPE_RGE_ONE_TIME_PRICE_ID/);
  assert.match(templates, /line_items: \[{ price: priceId, quantity: 1 }\]/);

  const shopify = read("server/shopify.ts");
  assert.match(shopify, /SHOPIFY_RGE_ONETIME_USD = REALTOR_GROWTH_ENGINE_ONETIME_USD/);
  assert.match(shopify, /amount: SHOPIFY_RGE_ONETIME_USD/);
  assert.doesNotMatch(shopify, /SHOPIFY_RGE_ONETIME_USD = 199/);
  assert.doesNotMatch(shopify, /\b19900\b/);

  const gallery = read("client/src/lib/growthEnginesCatalog.ts");
  assert.match(gallery, /formatUsdDisplay\(REALTOR_GROWTH_ENGINE_ONETIME_USD\)/);
  assert.doesNotMatch(gallery, /oneTimePrice:\s*["']\$199["']/);

  const landing = read("client/src/pages/RealtorLanding.tsx");
  assert.match(landing, /price: String\(REALTOR_GROWTH_ENGINE_ONETIME_USD\)/);
  assert.doesNotMatch(landing, /price:\s*["']199["']/);

  const galleryUi = read("client/src/pages/Templates.tsx");
  assert.match(galleryUi, /engine\.oneTimePrice/);
  assert.doesNotMatch(galleryUi, /\$199/);

  for (const rel of RGE_AMOUNT_CONSUMERS) {
    const src = read(rel);
    assert.doesNotMatch(src, /\b19900\b/, `${rel} must not hardcode 19900`);
  }
});

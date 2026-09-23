/** Regression guard: Growth Engines have no standalone price or checkout. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const files = [
  "shared/pricingEntitlements.ts",
  "shared/publicProductFacts.ts",
  "client/src/lib/growthEnginesCatalog.ts",
  "client/src/content/realtorGrowthEngineLandingContent.ts",
  "shared/realtorGrowthEngineLandingLocales.ts",
  "server/templateRoutes.ts",
  "server/shopify.ts",
];

test("RGE has no $199, one-time price, Stripe price, or separate-purchase claim", () => {
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /\$199|19900|STRIPE_RGE|RGE_ONETIME|RGE_ONE_TIME_PRICE/i, file);
    assert.doesNotMatch(source, /Growth Engine.{0,80}(?:one-time|separate purchase)/i, file);
  }
});

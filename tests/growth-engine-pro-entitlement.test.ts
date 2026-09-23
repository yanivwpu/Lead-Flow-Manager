/** Growth Engines are included with Pro and never create a second checkout. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GROWTH_ENGINE_CARDS } from "../client/src/lib/growthEnginesCatalog";
import { getCanonicalCommercialCatalog } from "../shared/pricingEntitlements";
import { PUBLIC_PRODUCT_FACTS } from "../shared/publicProductFacts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("every catalog Growth Engine is labeled Included with Pro", () => {
  const engines = GROWTH_ENGINE_CARDS.filter((card) => card.slug !== "prospect-ai");
  assert.ok(engines.length > 0);
  for (const engine of engines) {
    assert.ok(engine.badges.includes("Included with Pro"), engine.slug);
    assert.equal(engine.oneTimePrice, null, engine.slug);
  }
});

test("commercial facts expose RGE as an included capability without an offer", () => {
  const catalog = getCanonicalCommercialCatalog().find((item) => item.id === "realtor-growth-engine");
  assert.equal(catalog?.kind, "included_capability");
  assert.deepEqual(catalog?.offers, []);
  assert.match(catalog?.description || "", /Included with Pro/i);
  assert.equal(PUBLIC_PRODUCT_FACTS.realtorGrowthEngine.currentPurchasableOffer, false);
  assert.deepEqual(PUBLIC_PRODUCT_FACTS.realtorGrowthEngine.prices, []);
  assert.deepEqual(PUBLIC_PRODUCT_FACTS.realtorGrowthEngine.includedWith, ["pro"]);
});

test("RGE install route provisions only after the shared Pro entitlement check", () => {
  const routes = read("server/templateRoutes.ts");
  assert.match(routes, /realtor-growth-engine\/install/);
  assert.match(routes, /evaluateGrowthEngineAccess\(userId\)/);
  assert.match(routes, /provisionGrowthEngine\(userId, \{ source: "pro_included" \}\)/);
  assert.doesNotMatch(routes, /STRIPE_RGE|checkout\.sessions|verify-payment|realtor-growth-engine\/purchase/);
});

test("the existing full Pro trial permits installation through effective Pro limits", () => {
  const subscription = read("server/subscriptionService.ts");
  assert.match(subscription, /isInTrial/);
  assert.match(subscription, /getEffectivePlanForUser/);
  assert.match(subscription, /planName: isInTrial \? "Pro trial"/);
  assert.match(subscription, /growthEngineEligibleForPlan\(effectivePlan\)/);
});

test("runtime checks pause workflows without deleting installation state", () => {
  const runtime = read("server/workflowEngine.ts");
  const entitlement = read("server/growthEngineEntitlements.ts");
  const provisioning = read("server/growthEngineProvisioning.ts");
  assert.match(runtime, /evaluateGrowthEngineAccess/);
  assert.match(entitlement, /active Pro plan/);
  assert.match(provisioning, /getTemplateInstall/);
  assert.doesNotMatch(provisioning, /deleteTemplateInstall|deleteWorkflow/);
});

test("Growth Engine billing references are absent from production sources", () => {
  const files = [
    "server/templateRoutes.ts",
    "server/shopify.ts",
    "server/webhookHandlers.ts",
    "client/src/pages/RealtorGrowthEngine.tsx",
    "client/src/pages/RealtorLanding.tsx",
    "client/src/lib/growthEnginesCatalog.ts",
    "shared/pricingEntitlements.ts",
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /STRIPE_RGE_ONE_TIME_PRICE_ID|\$199|19900|rge-onetime/i, file);
  }
});

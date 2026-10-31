import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const gallery = readFileSync("client/src/pages/Templates.tsx", "utf8");
const app = readFileSync("client/src/pages/AppLayout.tsx", "utf8");
const dashboard = readFileSync("client/src/pages/EcommerceGrowthEngineDashboard.tsx", "utf8");
const onboarding = readFileSync("client/src/pages/EcommerceGrowthEngineOnboarding.tsx", "utf8");
const marketing = readFileSync("client/src/components/marketing/SolutionPage.tsx", "utf8");
const activation = readFileSync("client/src/lib/ecommerceMerchantActivation.ts", "utf8");
const shopifyStart = readFileSync("client/src/components/ShopifyStartView.tsx", "utf8");

test("catalog actions stay in the authenticated application", () => {
  assert.ok(gallery.includes('"/app/ecommerce-growth-engine?view=setup"'));
  assert.ok(gallery.includes('"/app/ecommerce-growth-engine?view=about"'));
  assert.ok(!gallery.includes("isEcommerce && engine.marketingHref ? engine.marketingHref"));
  assert.ok(app.includes('<Redirect to="/app/ecommerce-growth-engine?view=about" />'));
  assert.ok(marketing.includes('"/app/ecommerce-growth-engine?view=setup"'));
  assert.ok(shopifyStart.includes('href="/app/ecommerce-growth-engine?view=setup"'));
});

test("pre-install steps and details are available while operational pages remain restricted", () => {
  assert.match(dashboard, /requestedView === "setup" \|\| requestedView === "about"/);
  assert.match(dashboard, /return <EcommerceGrowthEngineOnboarding mode=\{requestedView\}\/>/);
  assert.match(dashboard, /return <EcommerceWorkspaceBoundary><EcommerceGrowthEngineDashboardContent\/><\/EcommerceWorkspaceBoundary>/);
});

test("Shopify connects before merchant activation, preserving explicit user intent and sending gates", () => {
  assert.ok(onboarding.includes('href="/app/integrations?setup=shopify"'));
  assert.ok(onboarding.includes('disabled={!eligible || activate.isPending}'));
  assert.ok(onboarding.includes('!planEligible ?'));
  assert.ok(onboarding.includes('onClick={() => activate.mutate(undefined, {onSuccess:'));
  assert.ok(activation.includes('"/api/shopify/merchant-engine/activate"'));
  assert.ok(!onboarding.includes("ECOMMERCE_POST_PURCHASE_DELIVERY_ENABLED"));
  assert.ok(!onboarding.includes("sendRecoveryViaMeta"));
  assert.ok(onboarding.includes("Installing this engine does not enable automatic WhatsApp messages"));
  for (const lang of ["en:", "es:", "he:"]) assert.ok(onboarding.includes(lang));
});

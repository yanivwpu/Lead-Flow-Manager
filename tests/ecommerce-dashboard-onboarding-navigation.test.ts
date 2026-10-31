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
const engineDetails = readFileSync("client/src/pages/EcommerceGrowthEngineDetails.tsx", "utf8");

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


test("View details is a complete sales presentation inside the dashboard, not a second landing-page hop", () => {
  assert.ok(onboarding.includes('<EcommerceGrowthEngineDetails locale={locale} activated={activated}/>'));
  assert.ok(engineDetails.includes('data-testid="ecommerce-engine-in-app-details"'));
  assert.ok(engineDetails.includes('data-testid="ecommerce-engine-sales-hero"'));
  assert.ok(engineDetails.includes('data-testid="ecommerce-engine-capabilities"'));
  assert.ok(engineDetails.includes('data-testid="ecommerce-sales-customer-journey"'));
  assert.ok(engineDetails.includes('data-testid="ecommerce-sales-scenarios"'));
  assert.ok(engineDetails.includes('data-testid="ecommerce-sales-activation-guide"'));
  assert.ok(engineDetails.includes('data-testid="ecommerce-sales-final-cta"'));
  assert.ok(engineDetails.includes('ecommerce-details-install'));
  assert.ok(engineDetails.includes('ecommerce-details-install-bottom'));
  assert.match(engineDetails, /const installHref = "\/app\/ecommerce-growth-engine\?view=setup"/);
  assert.ok(!engineDetails.includes('href="/solutions/ecommerce"'));
});

test("the sales pitch leads with abandoned cart recovery and accurately represents all other engine capabilities", () => {
  for (const essential of [
    "Abandoned Cart Recovery",
    "AI Shopping Assistant",
    "Unified Customer Inbox",
    "Shopify Orders & Support",
    "Post-Purchase Journeys",
    "Customizable Automations",
  ]) assert.ok(engineDetails.includes(essential), essential);
  assert.ok(engineDetails.includes('data-testid={index === 0 ? "ecommerce-abandoned-cart-feature" : undefined}'));
  assert.ok(engineDetails.includes("Consent & template check"));
  assert.ok(engineDetails.includes("Illustrative sequence"));
  assert.ok(engineDetails.includes("separate delivery enablement"));
  for (const localized of ["en:", "es:", "he:", "Recuperación de carritos abandonados", "שחזור עגלות נטושות"])
    assert.ok(engineDetails.includes(localized), localized);
  assert.ok(!engineDetails.includes("sendRecoveryViaMeta"));
  assert.ok(!engineDetails.includes("activate.mutate"));
});

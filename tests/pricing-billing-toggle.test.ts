/**
 * Pricing Monthly/Yearly toggle: display, checkout wiring, localization.
 * Run: npx tsx --test tests/pricing-billing-toggle.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN_LIMITS } from "../shared/schema";
import {
  AI_BRAIN_ADDON_PRICE_USD,
  formatUsdDisplay,
  getPaidPlanDisplayAmountUsd,
  getPaidPlanYearlyPriceUsd,
} from "../shared/pricingEntitlements";
import { getLocalizedPricingPage } from "../shared/localizeMarketingContent";
import { formatPricingTemplate } from "../shared/pricingPageContent";
import {
  entitlementPlanFromStripePriceIds,
  resolveStripePlanPriceId,
  stripePriceEnvForPlan,
  STRIPE_AI_BRAIN_MONTHLY_PRICE_ENV,
  STRIPE_PLAN_PRICE_ENV,
} from "../server/stripePlanPriceIds";

const root = process.cwd();

test("Displayed yearly prices are derived monthly equivalents with annual disclosure copy", () => {
  assert.equal(formatUsdDisplay(getPaidPlanDisplayAmountUsd("starter", "yearly")), "$15.83");
  assert.equal(formatUsdDisplay(getPaidPlanDisplayAmountUsd("pro", "yearly")), "$40.83");
  const en = getLocalizedPricingPage("en");
  assert.equal(
    formatPricingTemplate(en.billing.billedYearly, {
      price: formatUsdDisplay(getPaidPlanYearlyPriceUsd("starter")),
    }),
    "Billed $190/year",
  );
  assert.equal(
    formatPricingTemplate(en.billing.billedYearly, {
      price: formatUsdDisplay(getPaidPlanYearlyPriceUsd("pro")),
    }),
    "Billed $490/year",
  );
  assert.equal(en.billing.saveTwoMonths, "Save 2 months");
  assert.equal(en.billing.monthly, "Monthly");
  assert.equal(en.billing.yearly, "Yearly");
});

test("Free stays $0 and AI Brain stays monthly-only $29", () => {
  assert.equal(PLAN_LIMITS.free.price, 0);
  assert.equal(AI_BRAIN_ADDON_PRICE_USD, 29);
  const envExample = readFileSync(join(root, ".env.example"), "utf8");
  assert.ok(envExample.includes("STRIPE_AI_BRAIN_MONTHLY_PRICE_ID"));
  assert.ok(!envExample.includes("STRIPE_AI_BRAIN_YEARLY"));
  const stripeHelper = readFileSync(join(root, "server/stripePlanPriceIds.ts"), "utf8");
  assert.ok(stripeHelper.includes(STRIPE_AI_BRAIN_MONTHLY_PRICE_ENV));
  assert.ok(!stripeHelper.includes("AI_BRAIN_YEARLY"));
});

test("Pricing page defaults to Monthly, wires yearly checkout, and keeps pills removed", () => {
  const pricing = readFileSync(join(root, "client/src/pages/Pricing.tsx"), "utf8");
  assert.ok(pricing.includes('useState<BillingInterval>("monthly")'));
  assert.ok(pricing.includes("billing-interval-toggle"));
  assert.ok(pricing.includes("billing-toggle-monthly"));
  assert.ok(pricing.includes("billing-toggle-yearly"));
  assert.ok(pricing.includes("billing-save-badge"));
  assert.ok(pricing.includes("text-${plan}-price"));
  assert.ok(pricing.includes("text-free-price"));
  assert.ok(pricing.includes("text-${plan}-billed-yearly"));
  assert.ok(pricing.includes("PaidPlanPriceBlock"));
  assert.ok(pricing.includes("billingInterval: interval"));
  assert.ok(pricing.includes("/api/subscription/checkout"));
  assert.ok(!pricing.includes("PricingHeroChips"));
  assert.ok(!pricing.includes("SupportedChannelsSection"));
  assert.ok(pricing.includes("TransparentPricingStrip"));
  assert.ok(pricing.includes("max-w-[72rem]"));
  assert.ok(pricing.includes("text-balance"));
  assert.ok(pricing.includes("text-pretty"));
  assert.ok(!pricing.includes("max-w-3xl font-display text-3xl"));
  assert.ok(pricing.includes('dir="ltr"'));
  assert.ok(pricing.includes("overflow-x-hidden"));
  assert.ok(!pricing.includes("STRIPE_STARTER_YEARLY_PRICE_ID"));
  assert.ok(!pricing.includes("price_"));
});

test("Checkout route and Stripe mapping keep yearly on the same entitlement plan", () => {
  const routes = readFileSync(join(root, "server/routes.ts"), "utf8");
  assert.ok(routes.includes('billingInterval?: "monthly" | "yearly"'));
  assert.ok(routes.includes("billingInterval || \"monthly\""));
  assert.ok(routes.includes("createCheckoutSession"));

  const service = readFileSync(join(root, "server/subscriptionService.ts"), "utf8");
  assert.ok(service.includes("resolveStripePlanPriceId(plan, billingInterval)"));
  assert.ok(service.includes("plan,"));
  assert.ok(service.includes("billingInterval,"));

  const webhook = readFileSync(join(root, "server/webhookHandlers.ts"), "utf8");
  assert.ok(webhook.includes("entitlementPlanFromStripePriceIds"));

  assert.equal(stripePriceEnvForPlan("starter", "monthly"), STRIPE_PLAN_PRICE_ENV.starter.monthly);
  assert.equal(stripePriceEnvForPlan("starter", "yearly"), STRIPE_PLAN_PRICE_ENV.starter.yearly);
  assert.equal(stripePriceEnvForPlan("pro", "monthly"), STRIPE_PLAN_PRICE_ENV.pro.monthly);
  assert.equal(stripePriceEnvForPlan("pro", "yearly"), STRIPE_PLAN_PRICE_ENV.pro.yearly);

  const env = {
    STRIPE_STARTER_MONTHLY_PRICE_ID: "price_starter_month",
    STRIPE_STARTER_YEARLY_PRICE_ID: "price_starter_year",
    STRIPE_PRO_MONTHLY_PRICE_ID: "price_pro_month",
    STRIPE_PRO_YEARLY_PRICE_ID: "price_pro_year",
  };
  assert.equal(resolveStripePlanPriceId("starter", "monthly", env), "price_starter_month");
  assert.equal(resolveStripePlanPriceId("starter", "yearly", env), "price_starter_year");
  assert.equal(resolveStripePlanPriceId("pro", "monthly", env), "price_pro_month");
  assert.equal(resolveStripePlanPriceId("pro", "yearly", env), "price_pro_year");
  assert.equal(entitlementPlanFromStripePriceIds(["price_starter_year"], env), "starter");
  assert.equal(entitlementPlanFromStripePriceIds(["price_starter_month"], env), "starter");
  assert.equal(entitlementPlanFromStripePriceIds(["price_pro_year"], env), "pro");
  assert.equal(entitlementPlanFromStripePriceIds(["price_pro_month"], env), "pro");
  assert.equal(
    entitlementPlanFromStripePriceIds(["price_starter_year", "price_pro_year"], env),
    "pro",
  );
});

test("EN/ES/HE billing toggle strings and RTL-safe billed copy", () => {
  const en = getLocalizedPricingPage("en");
  const es = getLocalizedPricingPage("es");
  const he = getLocalizedPricingPage("he");
  assert.equal(en.billing.monthly, "Monthly");
  assert.equal(en.billing.yearly, "Yearly");
  assert.equal(en.billing.saveTwoMonths, "Save 2 months");
  assert.equal(es.billing.monthly, "Mensual");
  assert.equal(es.billing.yearly, "Anual");
  assert.equal(es.billing.saveTwoMonths, "Ahorra 2 meses");
  assert.match(es.billing.billedYearly, /Facturado \{\{price\}\}\/año/);
  assert.equal(he.billing.monthly, "חודשי");
  assert.equal(he.billing.yearly, "שנתי");
  assert.equal(he.billing.saveTwoMonths, "חסכו חודשיים");
  assert.match(he.billing.billedYearly, /[\u0590-\u05FF]/);
  assert.notEqual(es.billing.monthly, en.billing.monthly);
  assert.notEqual(he.billing.yearly, en.billing.yearly);

  const pricing = readFileSync(join(root, "client/src/pages/Pricing.tsx"), "utf8");
  assert.ok(pricing.includes("BilledYearlyLine"));
  assert.ok(pricing.includes('dir={isRTL ? "rtl" : "ltr"}'));
  assert.ok(pricing.includes("<span dir=\"ltr\">{price}</span>"));
});

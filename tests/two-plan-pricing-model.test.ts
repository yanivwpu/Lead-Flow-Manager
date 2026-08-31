/**
 * Public two-plan model: Free + Pro, Brain included, no Starter SKU, no Brain add-on.
 * Run: npx tsx --test tests/two-plan-pricing-model.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPricingCompareRows, getPlanPricingHighlights } from "../shared/pricingEntitlements";
import { getLocalizedPricingPage } from "../shared/localizeMarketingContent";
import { GROWTH_ENGINE_CARDS } from "../client/src/lib/growthEnginesCatalog";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("1. Public pricing renders only Free and Pro", () => {
  const pricing = read("client/src/pages/Pricing.tsx");
  assert.ok(pricing.includes('data-testid="plan-card-free"'));
  assert.ok(pricing.includes('data-testid="plan-card-pro"'));
  assert.ok(!pricing.includes('data-testid="plan-card-starter"'));
  assert.ok(!pricing.includes('data-testid="plan-card-ai-brain"'));
  assert.ok(pricing.includes("md:grid-cols-2"));
  assert.ok(pricing.includes("section-agency-enterprise"));
  assert.ok(pricing.includes("Start Your 14-Day Free Trial") || pricing.includes("plans.pro.cta"));
});

test("2–5. Starter checkout is rejected; Brain add-on retired; Pro+AI becomes Pro-only", () => {
  const service = read("server/subscriptionService.ts");
  assert.ok(service.includes("STARTER_CHECKOUT_RETIRED_CODE"));
  assert.ok(service.includes('if (plan === "starter")'));
  assert.ok(service.includes("createAddonCheckoutSession"));
  assert.ok(service.includes("AI_BRAIN_ADDON_RETIRED_CODE"));
  assert.match(
    service,
    /createProPlusAICheckoutSession[\s\S]*createCheckoutSession\(userId, "pro"/,
  );
  assert.match(
    service,
    /createPlanAIBundleCheckoutSession[\s\S]*bundlePlan === "starter"[\s\S]*STARTER_CHECKOUT_RETIRED/,
  );
  assert.ok(!service.includes("line_items: [{ price: priceId, quantity: 1 }, { price: brain"));
  const pricing = read("client/src/pages/Pricing.tsx");
  assert.ok(pricing.includes("intent.plan === \"starter\""));
  assert.ok(!pricing.includes("/api/subscription/addon/ai-brain"));
});

test("11. Pricing comparison contains only Free and Pro", () => {
  const rows = buildPricingCompareRows();
  for (const row of rows) {
    assert.ok("free" in row && "pro" in row);
    assert.equal("starter" in row, false, row.featureKey);
  }
  assert.equal(rows.find((r) => r.featureKey === "aiBrain")?.pro, "Included");
  assert.equal(rows.find((r) => r.featureKey === "prospectDiscoveries")?.free, "50/month");
  assert.equal(rows.find((r) => r.featureKey === "prospectDiscoveries")?.pro, "500/month");
});

test("12. EN/ES/HE public pages have no Starter or Brain add-on offer", () => {
  for (const locale of ["en", "es", "he"] as const) {
    const page = getLocalizedPricingPage(locale);
    const blob = JSON.stringify(page);
    assert.doesNotMatch(blob, /\$19/);
    assert.doesNotMatch(blob, /\$29/);
    assert.doesNotMatch(blob, /\$78/);
    assert.doesNotMatch(blob, /previously an add-on/i);
    assert.doesNotMatch(blob, /Starter \+/);
    assert.match(page.hero.h1, /Simple pricing|Precios simples|תמחור פשוט/);
    assert.equal(page.agency.cta.length > 0, true);
  }
  const help = read("client/src/lib/helpCenterTranslations.ts");
  assert.doesNotMatch(help, /\$19/);
  assert.doesNotMatch(help, /AI Brain Add-on/);
  for (const name of [
    "watiAlternativeContent.ts",
    "pabblyAlternativeContent.ts",
    "respondIoAlternativeContent.ts",
    "manychatAlternativeContent.ts",
    "bestWhatsappCrm2026Content.ts",
    "crmForWhatsappBusinessContent.ts",
  ]) {
    const content = read(`client/src/content/seo/${name}`);
    assert.doesNotMatch(content, /Starter \$19/);
    assert.doesNotMatch(content, /optional AI Brain/);
    assert.doesNotMatch(content, /\$29\/mo/);
  }
});

test("13. SSR and SEO no longer advertise plans starting at $19", () => {
  const content = read("shared/pricingPageContent.ts");
  assert.ok(content.includes("Simple pricing. Everything you need to grow."));
  assert.doesNotMatch(content, /\$19/);
  const seo = read("server/seo.ts");
  assert.doesNotMatch(seo, /Starts at \$19/);
  assert.doesNotMatch(seo, /\$19\/mo vs/);
  const ssr = getLocalizedPricingPage("en").ssr;
  assert.ok(ssr.bullets.some((b) => /AI Brain included with Pro/.test(b)));
  assert.ok(!ssr.bullets.some((b) => /\$19/.test(b)));
});

test("14. Trial emails describe AI Brain as included with Pro", () => {
  const email = read("server/email.ts");
  assert.ok(email.includes("AI Brain is included with Pro"));
  assert.ok(!email.includes("optional add-on for paid plans"));
});

test("18. RGE remains a separate one-time purchase requiring active Pro", () => {
  const rge = GROWTH_ENGINE_CARDS.find((c) => c.slug === "realtor-growth-engine");
  assert.ok(rge);
  assert.equal(rge!.oneTimePrice, "$199");
  assert.match(rge!.subscriptionRequirementShort || "", /active Pro plan/i);
  assert.ok(!/AI Brain required/.test(rge!.requirements?.join(" ") || ""));
  assert.ok(!/\$78/.test(rge!.monthlyRequirementLabel || ""));
  const highlights = getPlanPricingHighlights("pro").join(" ");
  assert.match(highlights, /AI Brain included/);
});

test("Prospect AI quota chips and UpgradeModal have no Starter / English-only leftover", () => {
  const chips = read("client/src/components/pricing/PricingMarketingSections.tsx");
  assert.match(chips, /quotaFree/);
  assert.match(chips, /quotaPro/);
  assert.doesNotMatch(chips, /Free: \{PROSPECT_AI_MONTHLY_QUOTAS/);
  assert.doesNotMatch(chips, /whitespace-nowrap sm:whitespace-normal/);
  const modal = read("client/src/components/UpgradeModal.tsx");
  assert.doesNotMatch(modal, /Starter includes up to 3 users/);
  const es = getLocalizedPricingPage("es");
  const he = getLocalizedPricingPage("he");
  assert.match(es.prospectAi.quotaFree, /Gratis/);
  assert.match(he.prospectAi.quotaFree, /חינם/);
});

test("Pro checkout source contains a single plan line item", () => {
  const service = read("server/subscriptionService.ts");
  const fn = service.slice(service.indexOf("async createCheckoutSession"));
  const body = fn.slice(0, fn.indexOf("async createProPlusAICheckoutSession"));
  assert.ok(body.includes("line_items: [{ price: priceId, quantity: 1 }]"));
  assert.ok(!body.includes("STRIPE_AI_BRAIN_MONTHLY_PRICE_ID"));
});

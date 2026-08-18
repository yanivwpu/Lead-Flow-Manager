/**
 * Pricing entitlements presentation — shared source of truth.
 * Run: npx tsx --test tests/pricing-entitlements.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN_LIMITS } from "../shared/schema";
import { PROSPECT_AI_MONTHLY_QUOTAS } from "../shared/prospectAI";
import {
  AI_ASSIST_MONTHLY_CREDITS,
  AI_ASSIST_FAIR_USE_MONTHLY_THRESHOLD,
  AI_BRAIN_ADDON_PRICE_USD,
  AI_BRAIN_PRO_CREDIT_BONUS,
  INBOX_AI_REPLY_GENERATIONS_MONTHLY,
  PAID_PLAN_YEARLY_PRICE_USD,
  buildPricingCompareRows,
  formatUsdDisplay,
  getPaidPlanDisplayAmountUsd,
  getPaidPlanMonthlyPriceUsd,
  getPaidPlanYearlyPriceUsd,
  getPlanPricingHighlights,
  getYearlyEquivalentMonthlyUsd,
  planAllowsBasicTemplateMessaging,
  planAllowsIntegrations,
  planAllowsTemplateCampaigns,
} from "../shared/pricingEntitlements";
import {
  getLocalizedPlanPricingHighlights,
  getLocalizedPricingPage,
} from "../shared/localizeMarketingContent";

test("Prospect AI quotas Free 50 / Starter 100 / Pro 500", () => {
  assert.equal(PROSPECT_AI_MONTHLY_QUOTAS.free, 50);
  assert.equal(PROSPECT_AI_MONTHLY_QUOTAS.starter, 100);
  assert.equal(PROSPECT_AI_MONTHLY_QUOTAS.pro, 500);
});

test("Chatbot availability by plan", () => {
  assert.equal(PLAN_LIMITS.free.chatbotEnabled, false);
  assert.equal(PLAN_LIMITS.starter.chatbotEnabled, true);
  assert.equal(PLAN_LIMITS.pro.chatbotEnabled, true);
});

test("Free can connect integrations and send basic templates; campaigns stay paid", () => {
  assert.equal(PLAN_LIMITS.free.integrationsEnabled, true);
  assert.equal(PLAN_LIMITS.starter.integrationsEnabled, true);
  assert.equal(PLAN_LIMITS.pro.integrationsEnabled, true);
  assert.equal(PLAN_LIMITS.free.templatesEnabled, true);
  assert.equal(PLAN_LIMITS.starter.templatesEnabled, true);
  assert.equal(PLAN_LIMITS.pro.templatesEnabled, true);
  assert.equal(PLAN_LIMITS.free.workflowsEnabled, false);
  assert.equal(PLAN_LIMITS.starter.workflowsEnabled, true);
  assert.equal(PLAN_LIMITS.pro.workflowsEnabled, true);
  assert.equal(planAllowsIntegrations("free"), true);
  assert.equal(planAllowsBasicTemplateMessaging("free"), true);
  assert.equal(planAllowsTemplateCampaigns("free"), false);
  assert.equal(planAllowsTemplateCampaigns("starter"), true);
  assert.equal(planAllowsTemplateCampaigns("pro"), true);
  assert.equal(PLAN_LIMITS.free.conversationsPerMonth, 50);
  assert.equal(PLAN_LIMITS.free.maxUsers, 1);
  assert.equal(PLAN_LIMITS.free.maxWhatsappNumbers, 1);
});

test("inbox AI reply generations exist internally but are not public pricing copy", () => {
  // INTERNAL abuse backstops only — never on public cards/tables/meters.
  assert.equal(INBOX_AI_REPLY_GENERATIONS_MONTHLY.starter, 2_000);
  assert.equal(INBOX_AI_REPLY_GENERATIONS_MONTHLY.pro, 10_000);
  assert.equal(AI_ASSIST_MONTHLY_CREDITS.starter, 2_000, "legacy alias remains aligned");
  assert.equal(AI_BRAIN_PRO_CREDIT_BONUS, 0, "AI Brain has no separate generation quota");
  assert.ok(AI_ASSIST_FAIR_USE_MONTHLY_THRESHOLD > AI_ASSIST_MONTHLY_CREDITS.pro);
  const marketing = readFileSync(
    join(process.cwd(), "client/src/components/pricing/PricingMarketingSections.tsx"),
    "utf8",
  );
  const entitlements = readFileSync(
    join(process.cwd(), "shared/pricingEntitlements.ts"),
    "utf8",
  );
  const composer = readFileSync(
    join(process.cwd(), "client/src/components/AIComposer.tsx"),
    "utf8",
  );
  assert.ok(!marketing.includes("credits/month"));
  assert.ok(!marketing.includes("AI_ASSIST_MONTHLY_CREDITS"));
  assert.ok(!marketing.includes("INBOX_AI_REPLY_GENERATIONS"));
  assert.ok(!marketing.includes("2,000"));
  assert.ok(!marketing.includes("10,000"));
  assert.ok(!/Basic · \d+ credits/.test(entitlements));
  assert.ok(!composer.includes("AICreditBadge"));
  assert.ok(!composer.includes("more AI Assist capacity"));
  assert.ok(!/Product expected Starter=50 \/ Pro=200 replies/.test(entitlements));
});

test("AI Brain is $29 add-on", () => {
  assert.equal(AI_BRAIN_ADDON_PRICE_USD, 29);
});

test("Paid plan monthly/yearly amounts stay 19/190 and 49/490", () => {
  assert.equal(PLAN_LIMITS.starter.price, 19);
  assert.equal(PLAN_LIMITS.pro.price, 49);
  assert.equal(getPaidPlanMonthlyPriceUsd("starter"), 19);
  assert.equal(getPaidPlanMonthlyPriceUsd("pro"), 49);
  assert.equal(getPaidPlanYearlyPriceUsd("starter"), 190);
  assert.equal(getPaidPlanYearlyPriceUsd("pro"), 490);
  assert.equal(PAID_PLAN_YEARLY_PRICE_USD.starter, 190);
  assert.equal(PAID_PLAN_YEARLY_PRICE_USD.pro, 490);
  assert.equal(getYearlyEquivalentMonthlyUsd("starter"), 15.83);
  assert.equal(getYearlyEquivalentMonthlyUsd("pro"), 40.83);
  assert.equal(getPaidPlanDisplayAmountUsd("starter", "monthly"), 19);
  assert.equal(getPaidPlanDisplayAmountUsd("pro", "monthly"), 49);
  assert.equal(getPaidPlanDisplayAmountUsd("starter", "yearly"), 15.83);
  assert.equal(getPaidPlanDisplayAmountUsd("pro", "yearly"), 40.83);
  assert.equal(formatUsdDisplay(19), "$19");
  assert.equal(formatUsdDisplay(15.83), "$15.83");
  assert.equal(formatUsdDisplay(40.83), "$40.83");
  assert.equal(formatUsdDisplay(190), "$190");
  assert.equal(formatUsdDisplay(490), "$490");
});

test("compare rows include Prospect AI + chatbot", () => {
  const rows = buildPricingCompareRows();
  const discoveries = rows.find((r) => r.featureKey === "prospectDiscoveries");
  assert.ok(discoveries);
  assert.equal(discoveries!.free, "50/month");
  assert.equal(discoveries!.starter, "100/month");
  assert.equal(discoveries!.pro, "500/month");
  const chatbot = rows.find((r) => r.featureKey === "chatbotWidget");
  assert.equal(chatbot!.free, false);
  assert.equal(chatbot!.starter, true);
  assert.equal(chatbot!.pro, true);
  const brain = rows.find((r) => r.featureKey === "aiBrainAddon");
  assert.equal(brain!.free, "Not included");
  assert.equal(brain!.starter, "Add-on");
  assert.equal(brain!.pro, "Add-on");
  const integrations = rows.find((r) => r.featureKey === "integrations");
  assert.equal(integrations!.free, true);
  assert.equal(integrations!.starter, true);
  assert.equal(integrations!.pro, true);
  const templates = rows.find((r) => r.featureKey === "templateMessaging");
  assert.equal(templates!.free, "Approved 1:1 template sends");
  assert.equal(templates!.starter, "Templates with workflow automation");
  assert.equal(templates!.pro, "Templates with workflow automation");
  assert.equal(
    rows.find((r) => r.featureKey === "aiAssist"),
    undefined,
    "AI Assist quota rows must not appear on public comparison",
  );
  const growth = rows.find((r) => r.featureKey === "growthEngines");
  assert.ok(growth);
  assert.equal(growth!.free, false);
  assert.equal(growth!.starter, false);
  assert.equal(growth!.pro, "Growth Engine Ready");
});

test("plan highlights include Prospect AI + chatbot on paid (no Assist quotas)", () => {
  const free = getPlanPricingHighlights("free").join(" | ");
  assert.match(free, /50 Prospect AI/);
  assert.match(free, /Multi-channel Inbox/);
  assert.match(free, /Connect integrations/);
  assert.match(free, /Basic WhatsApp templates/);
  assert.ok(!/Chatbot/i.test(free));
  assert.ok(!/credits/i.test(free));
  const starter = getPlanPricingHighlights("starter").join(" | ");
  assert.match(starter, /100 Prospect AI/);
  assert.match(starter, /WhatsApp templates \+ automation/);
  assert.ok(!/Basic WhatsApp templates/i.test(starter));
  assert.match(starter, /AI Chatbot & Website Widget/);
  assert.match(starter, /Workflow Automation/);
  assert.ok(!/credits/i.test(starter));
  const pro = getPlanPricingHighlights("pro").join(" | ");
  assert.match(pro, /500 Prospect AI/);
  assert.match(pro, /WhatsApp templates \+ automation/);
  assert.ok(!/Basic WhatsApp templates/i.test(pro));
  assert.match(pro, /AI Chatbot & Website Widget/);
  assert.match(pro, /Industry Growth Engines/);
  assert.ok(!/credits/i.test(pro));
});

test("EN/ES/HE template card labels differ by plan", () => {
  const en = getLocalizedPricingPage("en");
  const es = getLocalizedPricingPage("es");
  const he = getLocalizedPricingPage("he");
  assert.equal(en.highlights.basicWhatsappTemplates, "Basic WhatsApp templates");
  assert.equal(en.highlights.whatsappTemplatesAutomation, "WhatsApp templates + automation");
  assert.equal(es.highlights.basicWhatsappTemplates, "Plantillas básicas de WhatsApp");
  assert.equal(es.highlights.whatsappTemplatesAutomation, "Plantillas de WhatsApp + automatización");
  assert.equal(he.highlights.basicWhatsappTemplates, "תבניות WhatsApp בסיסיות");
  assert.equal(he.highlights.whatsappTemplatesAutomation, "תבניות WhatsApp + אוטומציה");

  for (const locale of ["en", "es", "he"] as const) {
    const page = getLocalizedPricingPage(locale);
    const free = getLocalizedPlanPricingHighlights("free", locale);
    const starter = getLocalizedPlanPricingHighlights("starter", locale);
    const pro = getLocalizedPlanPricingHighlights("pro", locale);
    assert.ok(free.includes(page.highlights.basicWhatsappTemplates), locale);
    assert.ok(!starter.includes(page.highlights.basicWhatsappTemplates), locale);
    assert.ok(!pro.includes(page.highlights.basicWhatsappTemplates), locale);
    assert.ok(starter.includes(page.highlights.whatsappTemplatesAutomation), locale);
    assert.ok(pro.includes(page.highlights.whatsappTemplatesAutomation), locale);
  }
});

test("Pricing hero copy is localized and pills stay removed", () => {
  const en = getLocalizedPricingPage("en");
  const es = getLocalizedPricingPage("es");
  const he = getLocalizedPricingPage("he");
  assert.equal(
    en.hero.h1,
    "Powerful tools to grow your business — pricing that grows with you.",
  );
  assert.match(en.hero.subtitle, /Start free with Prospect AI, Unified Inbox, integrations, and WhatsApp messaging/);
  assert.match(en.hero.subtitle, /Upgrade only when you need/);
  assert.equal(
    en.hero.trustLine,
    "14-day Pro + AI Brain trial · 0% WhachatCRM markup on Meta fees · No setup fees",
  );
  assert.equal(
    es.hero.h1,
    "Herramientas potentes para hacer crecer tu negocio — precios que crecen contigo.",
  );
  assert.match(es.hero.subtitle, /Empieza gratis con Prospect AI/);
  assert.match(es.hero.subtitle, /solo cuando necesites/);
  assert.match(es.hero.trustLine, /Prueba de 14 días de Pro \+ AI Brain/);
  assert.equal(he.hero.h1, "כלים חזקים לצמיחת העסק — תמחור שגדל יחד איתכם.");
  assert.match(he.hero.subtitle, /התחילו בחינם עם Prospect AI/);
  assert.match(he.hero.subtitle, /שדרגו רק כשאתם צריכים/);
  assert.match(he.hero.trustLine, /ניסיון 14 יום ל-Pro \+ AI Brain/);
});

test("Pricing page uses shared entitlements and avoids competitor names", () => {
  const pricing = readFileSync(
    join(process.cwd(), "client/src/pages/Pricing.tsx"),
    "utf8",
  );
  assert.ok(pricing.includes("buildLocalizedPricingCompareRows"));
  assert.ok(pricing.includes("getLocalizedPlanPricingHighlights"));
  assert.ok(pricing.includes("ProspectAiCallout"));
  assert.ok(pricing.includes("getLocalizedPricingPage"));
  assert.ok(!pricing.includes("PricingHeroChips"));
  assert.ok(!pricing.includes("SupportedChannelsSection"));
  assert.ok(pricing.includes("section-pricing-hero"));
  assert.ok(pricing.includes("text-pricing-hero-title"));
  assert.ok(pricing.includes("text-pricing-hero-subtitle"));
  assert.ok(!pricing.includes("text-pricing-hero-trust"));
  assert.ok(!pricing.includes("pricingContent.hero.trustLine"));
  assert.ok(pricing.includes("TransparentPricingStrip"));
  assert.ok(pricing.includes("section-pricing-cards"));
  assert.ok(pricing.includes("PricingBottomCta"));
  assert.ok(pricing.includes("section-optional-addon"));
  assert.ok(pricing.includes('md:grid-cols-3'));
  assert.ok(!pricing.includes("xl:grid-cols-4"));
  assert.ok(!pricing.includes("AiBrainSpotlight"));
  assert.ok(pricing.includes("billing-interval-toggle"));
  assert.ok(pricing.includes("billingIntervalFromSearch"));
  assert.ok(pricing.includes('?? "monthly"'));
  assert.ok(pricing.includes("billingInterval: interval"));
  assert.ok(pricing.includes("max-w-[72rem]"));
  assert.ok(pricing.includes("text-balance"));
  assert.ok(!pricing.includes("max-w-3xl font-display text-3xl"));
  assert.ok(!/ManyChat|Wati|Gorgias/i.test(pricing));

  const content = readFileSync(
    join(process.cwd(), "shared/pricingPageContent.ts"),
    "utf8",
  );
  assert.ok(content.includes("0% WhachatCRM markup"));
  assert.ok(content.includes("Powerful tools to grow your business — pricing that grows with you."));
  assert.ok(content.includes("Start free with Prospect AI, Unified Inbox, integrations, and WhatsApp messaging."));
  assert.ok(content.includes("Upgrade only when you need more conversations"));
  assert.ok(content.includes("14-day Pro + AI Brain trial · 0% WhachatCRM markup on Meta fees · No setup fees"));
  assert.ok(!content.includes("Everything you need to find, engage, and convert more customers"));
  assert.ok(!content.includes("Works with your customer channels"));
  assert.ok(content.includes("Transparent Pricing"));
  assert.ok(content.includes("Basic WhatsApp templates"));
  assert.ok(content.includes("WhatsApp templates + automation"));
  assert.ok(content.includes("Approved 1:1 template sends"));
  assert.ok(content.includes("Templates with workflow automation"));
  assert.match(content, /Prospect AI Included/);
  assert.ok(content.includes("Are integrations included on Free?"));
  assert.ok(content.includes("Are WhatsApp templates included on Free?"));
  assert.ok(content.includes("Monthly Prospect AI Discoveries"));
  assert.ok(content.includes("Multi-channel Inbox"));
  assert.ok(content.includes("Can I try Pro and AI Brain before upgrading?"));
  assert.ok(content.includes("What counts as an active conversation?"));
  assert.ok(content.includes("What are Meta conversation fees?"));
  assert.ok(content.includes("FULL_PRO_AI_TRIAL_COPY"));
  assert.ok(content.includes("Growth Engine Ready"));
  assert.ok(content.includes("Growth Engines may require a separate purchase"));

  const marketing = readFileSync(
    join(process.cwd(), "client/src/components/pricing/PricingMarketingSections.tsx"),
    "utf8",
  );
  assert.ok(!/ManyChat|Wati|Gorgias/i.test(marketing));
  assert.ok(marketing.includes("FULL_PRO_AI_TRIAL_COPY"));
  assert.ok(marketing.includes("getLocalizedPricingPage"));
  assert.ok(!marketing.includes("brightness-0"));
  assert.ok(!marketing.includes("data-mono-logo"));
  assert.ok(!marketing.includes("bg-emerald-500"));
  assert.ok(!marketing.includes("bg-pink-600"));
  assert.ok(!marketing.includes("No user fees"));
  assert.ok(!marketing.includes("No channel fees"));
  assert.ok(!marketing.includes("No extra seat fees"));
  assert.ok(pricing.includes("pro-growth-engines-callout"));
  assert.ok(!pricing.includes("text-hero-trial"));
});

test("server imports inbox AI reply generation constants", () => {
  const routes = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
  assert.ok(routes.includes("INBOX_AI_REPLY_GENERATIONS_MONTHLY"));
  assert.ok(routes.includes("countInboxAiReplyGenerations"));
  assert.ok(routes.includes("@shared/pricingEntitlements"));
});

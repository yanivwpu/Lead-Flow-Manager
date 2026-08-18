/**
 * Free plan activation: Prospect AI copy, Integrations, basic templates, paid campaigns.
 * Run: npx tsx --test tests/free-plan-activation-entitlements.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN_LIMITS } from "../shared/schema";
import {
  BASIC_TEMPLATE_MESSAGING_UNAVAILABLE_MESSAGE,
  INTEGRATIONS_UNAVAILABLE_MESSAGE,
  TEMPLATE_CAMPAIGNS_REQUIRE_PAID_MESSAGE,
  buildPricingCompareRows,
  getPlanPricingHighlights,
  limitsAllowBasicTemplateMessaging,
  limitsAllowIntegrations,
  limitsAllowTemplateCampaigns,
  planAllowsBasicTemplateMessaging,
  planAllowsIntegrations,
  planAllowsTemplateCampaigns,
} from "../shared/pricingEntitlements";
import { getLocalizedPlanPricingHighlights, getLocalizedPricingPage } from "../shared/localizeMarketingContent";
import { PROSPECT_AI_BRAIN_ONBOARDING } from "../client/src/content/prospectAiBrainEducation";

const root = process.cwd();

test("Free entitlements: integrations + basic templates open; campaigns/AI Brain remain paid", () => {
  assert.equal(planAllowsIntegrations("free"), true);
  assert.equal(planAllowsBasicTemplateMessaging("free"), true);
  assert.equal(planAllowsTemplateCampaigns("free"), false);
  assert.equal(PLAN_LIMITS.free.chatbotEnabled, false);
  assert.equal(PLAN_LIMITS.free.workflowsEnabled, false);
  assert.equal(PLAN_LIMITS.free.conversationsPerMonth, 50);
  assert.equal(PLAN_LIMITS.free.maxUsers, 1);
  assert.equal(PLAN_LIMITS.free.maxWhatsappNumbers, 1);

  assert.equal(planAllowsIntegrations("starter"), true);
  assert.equal(planAllowsBasicTemplateMessaging("starter"), true);
  assert.equal(planAllowsTemplateCampaigns("starter"), true);
  assert.equal(planAllowsTemplateCampaigns("pro"), true);

  assert.equal(limitsAllowIntegrations({ integrationsEnabled: true }), true);
  assert.equal(limitsAllowBasicTemplateMessaging({ templatesEnabled: true }), true);
  assert.equal(limitsAllowTemplateCampaigns({ workflowsEnabled: false }), false);
  assert.equal(limitsAllowTemplateCampaigns({ workflowsEnabled: true }), true);
});

test("Prospect AI onboarding has no false AI Brain Activated default and no upgrade CTA", () => {
  const ui = readFileSync(join(root, "client/src/components/prospectAi/ProspectAiOnboarding.tsx"), "utf8");
  const page = readFileSync(join(root, "client/src/pages/ProspectAI.tsx"), "utf8");
  const edu = readFileSync(join(root, "client/src/content/prospectAiBrainEducation.ts"), "utf8");

  assert.equal(PROSPECT_AI_BRAIN_ONBOARDING.heading, "Make Prospect AI even smarter with AI Brain");
  assert.match(PROSPECT_AI_BRAIN_ONBOARDING.body.join(" "), /personalized outreach/i);
  assert.ok(ui.includes("prospect-ai-guide-ai-brain"));
  assert.ok(ui.indexOf("You're Ready") > ui.indexOf("prospect-ai-guide-ai-brain"));
  assert.ok(!ui.includes("AI Brain Activated"));
  assert.ok(!ui.includes("aiBrainActive"));
  assert.ok(!ui.includes("prospect-ai-guide-learn-ai-brain"));
  assert.ok(!edu.includes("Upgrade Now"));
  assert.ok(!edu.includes("AI Brain is active"));
  assert.ok(!page.includes("Upgrade to AI Brain"));
  assert.ok(!page.includes("Unlock AI Brain"));
  assert.ok(page.includes("prospect-ai-brain-education"));
  assert.ok(ui.includes("Meet Your AI Sales Team"));
});

test("Integrations page is not a Free paywall; API uses shared helper", () => {
  const page = readFileSync(join(root, "client/src/pages/Integrations.tsx"), "utf8");
  const routes = readFileSync(join(root, "server/routes.ts"), "utf8");
  assert.ok(!page.includes("Integrations are a Paid Feature"));
  assert.ok(!page.includes("button-upgrade-integrations"));
  assert.ok(page.includes("NATIVE_INTEGRATIONS"));
  assert.ok(routes.includes("limitsAllowIntegrations"));
  assert.ok(routes.includes("INTEGRATIONS_UNAVAILABLE_MESSAGE"));
  assert.equal(INTEGRATIONS_UNAVAILABLE_MESSAGE, "Integrations are not available on your plan");
});

test("Templates page opens for Free; campaigns remain a paid action gate", () => {
  const page = readFileSync(join(root, "client/src/pages/Templates.tsx"), "utf8");
  const templateRoutes = readFileSync(join(root, "server/routes/templates.ts"), "utf8");
  const enrollRoutes = readFileSync(join(root, "server/routes/campaignEnrollments.ts"), "utf8");
  const inbox = readFileSync(join(root, "client/src/components/InboxLeadDetailsPanel.tsx"), "utf8");

  assert.ok(!page.includes("Template Messaging is a Pro Feature"));
  assert.ok(!page.includes("button-upgrade-templates"));
  assert.ok(page.includes("presets-paid-gate"));
  assert.ok(page.includes("button-upgrade-template-campaigns"));
  assert.ok(page.includes("workflowsEnabled"));
  assert.ok(templateRoutes.includes("limitsAllowBasicTemplateMessaging"));
  assert.ok(templateRoutes.includes("limitsAllowTemplateCampaigns"));
  assert.ok(templateRoutes.includes("TEMPLATE_CAMPAIGNS_REQUIRE_PAID_MESSAGE"));
  assert.ok(templateRoutes.includes("POST /api/templates/send"));
  assert.ok(!templateRoutes.includes("Template messaging is a Pro feature"));
  assert.ok(enrollRoutes.includes("limitsAllowTemplateCampaigns"));
  assert.ok(inbox.includes("button-upgrade-campaign-enroll"));
  assert.ok(inbox.includes("templateCampaignsEnabled"));
  assert.equal(
    TEMPLATE_CAMPAIGNS_REQUIRE_PAID_MESSAGE,
    "Campaign and bulk template automation requires Starter or Pro",
  );
  assert.equal(
    BASIC_TEMPLATE_MESSAGING_UNAVAILABLE_MESSAGE,
    "Template messaging is not available on your plan",
  );
});

test("Pricing Free includes Integrations and basic templates; AI Brain stays separate", () => {
  const free = getPlanPricingHighlights("free");
  assert.ok(free.some((l) => /Connect integrations/i.test(l)));
  assert.ok(free.some((l) => /Basic WhatsApp templates/i.test(l)));
  assert.ok(!free.some((l) => /AI Brain/i.test(l) && !/not included/i.test(l)));

  const rows = buildPricingCompareRows();
  assert.equal(rows.find((r) => r.featureKey === "integrations")?.free, true);
  assert.equal(rows.find((r) => r.featureKey === "templateMessaging")?.free, "Approved 1:1 template sends");
  assert.equal(rows.find((r) => r.featureKey === "templateMessaging")?.starter, "Templates with workflow automation");
  assert.equal(rows.find((r) => r.featureKey === "aiBrainAddon")?.free, "Not included");
  assert.equal(rows.find((r) => r.featureKey === "workflowAutomation")?.free, false);

  const en = getLocalizedPricingPage("en");
  assert.ok(en.faq.items.some((i) => /integrations included on Free/i.test(i.q)));
  assert.ok(en.faq.items.some((i) => /WhatsApp templates included on Free/i.test(i.q)));
  assert.equal(en.compareLabels.templateMessaging, "WhatsApp template messaging");

  for (const locale of ["es", "he"] as const) {
    const localized = getLocalizedPlanPricingHighlights("free", locale);
    assert.ok(localized.length >= 6, locale);
    assert.notEqual(localized.join(" | "), free.join(" | "));
    const page = getLocalizedPricingPage(locale);
    assert.equal(page.faq.items.length, en.faq.items.length);
    assert.notEqual(page.compareLabels.templateMessaging, en.compareLabels.templateMessaging);
    assert.notEqual(page.highlights.connectIntegrations, en.highlights.connectIntegrations);
    assert.notEqual(page.highlights.basicWhatsappTemplates, en.highlights.basicWhatsappTemplates);
    assert.notEqual(page.highlights.whatsappTemplatesAutomation, en.highlights.whatsappTemplatesAutomation);
    const starterLoc = getLocalizedPlanPricingHighlights("starter", locale);
    assert.ok(!starterLoc.some((l) => l === page.highlights.basicWhatsappTemplates), locale);
    assert.ok(starterLoc.some((l) => l === page.highlights.whatsappTemplatesAutomation), locale);
  }
});

test("Paid regression: Starter/Pro keep scale, automations, and AI Brain add-on", () => {
  assert.equal(PLAN_LIMITS.starter.conversationsPerMonth, 500);
  assert.equal(PLAN_LIMITS.pro.conversationsPerMonth, 2000);
  assert.equal(PLAN_LIMITS.starter.maxUsers, 3);
  assert.equal(PLAN_LIMITS.pro.maxUsers, -1);
  assert.equal(PLAN_LIMITS.starter.chatbotEnabled, true);
  assert.equal(PLAN_LIMITS.pro.chatbotEnabled, true);
  assert.equal(PLAN_LIMITS.starter.workflowsEnabled, true);
  assert.equal(PLAN_LIMITS.pro.assignmentEnabled, true);
  const starter = getPlanPricingHighlights("starter").join(" | ");
  const pro = getPlanPricingHighlights("pro").join(" | ");
  assert.match(starter, /AI Chatbot/);
  assert.match(starter, /Workflow Automation/);
  assert.match(starter, /WhatsApp templates \+ automation/);
  assert.ok(!/Basic WhatsApp templates/i.test(starter));
  assert.match(pro, /Industry Growth Engines/);
  assert.match(pro, /WhatsApp templates \+ automation/);
});

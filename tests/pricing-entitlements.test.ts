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
  buildPricingCompareRows,
  getPlanPricingHighlights,
} from "../shared/pricingEntitlements";

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
  assert.equal(brain!.starter, "Add-on");
  assert.equal(brain!.pro, "Add-on");
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
  assert.ok(!/Chatbot/i.test(free));
  assert.ok(!/credits/i.test(free));
  const starter = getPlanPricingHighlights("starter").join(" | ");
  assert.match(starter, /100 Prospect AI/);
  assert.match(starter, /AI Chatbot & Website Widget/);
  assert.match(starter, /Workflow Automation/);
  assert.ok(!/credits/i.test(starter));
  const pro = getPlanPricingHighlights("pro").join(" | ");
  assert.match(pro, /500 Prospect AI/);
  assert.match(pro, /AI Chatbot & Website Widget/);
  assert.match(pro, /Industry Growth Engines/);
  assert.ok(!/credits/i.test(pro));
});

test("Pricing page uses shared entitlements and avoids competitor names", () => {
  const pricing = readFileSync(
    join(process.cwd(), "client/src/pages/Pricing.tsx"),
    "utf8",
  );
  assert.ok(pricing.includes("buildPricingCompareRows"));
  assert.ok(pricing.includes("getPlanPricingHighlights"));
  assert.ok(pricing.includes("ProspectAiCallout"));
  assert.ok(pricing.includes("Everything you need to find, engage, and convert more customers"));
  assert.ok(pricing.includes("SupportedChannelsSection"));
  assert.ok(pricing.includes("PricingBottomCta"));
  assert.ok(pricing.includes("FULL_PRO_AI_TRIAL_COPY"));
  assert.ok(pricing.includes("section-optional-addon"));
  assert.ok(pricing.includes('md:grid-cols-3'));
  assert.ok(!pricing.includes("xl:grid-cols-4"));
  assert.ok(!pricing.includes("AiBrainSpotlight"));
  assert.ok(!/ManyChat|Wati|Gorgias/i.test(pricing));
  // No monthly/yearly billing toggle in product — do not invent one on pricing.
  assert.ok(!/monthly\/yearly|billingPeriod|annual/i.test(pricing));

  const marketing = readFileSync(
    join(process.cwd(), "client/src/components/pricing/PricingMarketingSections.tsx"),
    "utf8",
  );
  assert.ok(!/ManyChat|Wati|Gorgias/i.test(marketing));
  assert.ok(marketing.includes("0% WhachatCRM markup"));
  assert.ok(marketing.includes("Works with your customer channels"));
  assert.ok(marketing.includes("Transparent Pricing"));
  assert.ok(marketing.includes("Prospect AI Included — Free with Every Plan"));
  assert.ok(marketing.includes("Monthly Prospect AI Discoveries"));
  assert.ok(marketing.includes("Multi-channel Inbox"));
  assert.ok(marketing.includes("Can I try Pro and AI Brain before upgrading?"));
  assert.ok(marketing.includes("What counts as an active conversation?"));
  assert.ok(marketing.includes("What are Meta conversation fees?"));
  assert.ok(marketing.includes("FULL_PRO_AI_TRIAL_COPY"));
  assert.ok(marketing.includes("brightness-0"));
  assert.ok(marketing.includes("data-mono-logo"));
  assert.ok(!marketing.includes("bg-emerald-500"));
  assert.ok(!marketing.includes("bg-pink-600"));
  assert.ok(!marketing.includes("No user fees"));
  assert.ok(!marketing.includes("No channel fees"));
  assert.ok(!marketing.includes("No extra seat fees"));
  assert.ok(pricing.includes("Growth Engine Ready"));
  assert.ok(pricing.includes("pro-growth-engines-callout"));
  assert.ok(pricing.includes("Growth Engines may require a separate purchase"));
  assert.ok(!pricing.includes("text-hero-trial"));
});

test("server imports inbox AI reply generation constants", () => {
  const routes = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
  assert.ok(routes.includes("INBOX_AI_REPLY_GENERATIONS_MONTHLY"));
  assert.ok(routes.includes("countInboxAiReplyGenerations"));
  assert.ok(routes.includes("@shared/pricingEntitlements"));
});

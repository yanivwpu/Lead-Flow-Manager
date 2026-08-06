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
});

test("plan highlights include Prospect AI + chatbot on paid (no Assist quotas)", () => {
  const free = getPlanPricingHighlights("free").join(" | ");
  assert.match(free, /50 Prospect AI/);
  assert.match(free, /Unified Inbox/);
  assert.ok(!/Chatbot/i.test(free));
  assert.ok(!/credits/i.test(free));
  const starter = getPlanPricingHighlights("starter").join(" | ");
  assert.match(starter, /100 Prospect AI/);
  assert.match(starter, /Chatbot/);
  assert.match(starter, /Workflow automations/);
  assert.ok(!/credits/i.test(starter));
  const pro = getPlanPricingHighlights("pro").join(" | ");
  assert.match(pro, /500 Prospect AI/);
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
  assert.ok(pricing.includes("Simple pricing for your AI sales team"));
  assert.ok(!/ManyChat|Wati|Gorgias/i.test(pricing));

  const marketing = readFileSync(
    join(process.cwd(), "client/src/components/pricing/PricingMarketingSections.tsx"),
    "utf8",
  );
  assert.ok(!/ManyChat|Wati|Gorgias/i.test(marketing));
  assert.ok(marketing.includes("0% WhachatCRM markup"));
});

test("server imports inbox AI reply generation constants", () => {
  const routes = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
  assert.ok(routes.includes("INBOX_AI_REPLY_GENERATIONS_MONTHLY"));
  assert.ok(routes.includes("countInboxAiReplyGenerations"));
  assert.ok(routes.includes("@shared/pricingEntitlements"));
});

/**
 * Prospect AI monthly discovery quota gates.
 * Run: npx tsx --test tests/prospect-ai-monthly-quota-gates.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getProspectAiMonthlyQuota,
  isProspectAiPlanEligible,
  nextProspectAiQuotaUpgradePlan,
  PROSPECT_AI_MONTHLY_QUOTAS,
  prospectAiQuotaExceededUserMessage,
} from "../shared/prospectAI";
import { countsTowardDiscoveryTarget } from "../shared/prospectAiDiscoveryQuality";
import {
  resolveDiscoveryQuotaPeriodStartFromDates,
  startOfUtcMonth,
} from "../server/prospectAI/prospectAIService";

test("plan quotas — Free 50 / Starter 100 / Pro 500", () => {
  assert.equal(PROSPECT_AI_MONTHLY_QUOTAS.free, 50);
  assert.equal(PROSPECT_AI_MONTHLY_QUOTAS.starter, 100);
  assert.equal(PROSPECT_AI_MONTHLY_QUOTAS.pro, 500);
  assert.equal(getProspectAiMonthlyQuota("free"), 50);
  assert.equal(getProspectAiMonthlyQuota("starter"), 100);
  assert.equal(getProspectAiMonthlyQuota("pro"), 500);
});

test("Free / Starter / Pro are eligible via quota map (no hardcoded plan gate)", () => {
  assert.equal(isProspectAiPlanEligible("free"), true);
  assert.equal(isProspectAiPlanEligible("starter"), true);
  assert.equal(isProspectAiPlanEligible("pro"), true);
  assert.equal(isProspectAiPlanEligible("free"), getProspectAiMonthlyQuota("free") > 0);
});

test("upgrade path follows higher quota", () => {
  assert.equal(nextProspectAiQuotaUpgradePlan("free"), "pro");
  assert.equal(nextProspectAiQuotaUpgradePlan("starter"), "pro");
  assert.equal(nextProspectAiQuotaUpgradePlan("pro"), null);
});

test("exhausted copy is user-facing", () => {
  const freeMsg = prospectAiQuotaExceededUserMessage("free");
  assert.match(freeMsg, /monthly Prospect AI discovery limit/i);
  assert.match(freeMsg, /Pro/i);
  assert.match(freeMsg, /500/);
  assert.ok(!/quota_exceeded|plan_limit|token/i.test(freeMsg));

  const starterMsg = prospectAiQuotaExceededUserMessage("starter");
  assert.match(starterMsg, /Pro/i);
  assert.match(starterMsg, /500/);

  const proMsg = prospectAiQuotaExceededUserMessage("pro");
  assert.match(proMsg, /billing period|resets/i);
});

test("duplicate / archived exclusions do not count toward discovery target (quota)", () => {
  assert.equal(countsTowardDiscoveryTarget({ disposition: "ready" }), true);
  assert.equal(
    countsTowardDiscoveryTarget({
      disposition: "needs_attention",
      attentionReason: "social_profile_as_website",
    }),
    true,
  );
  assert.equal(countsTowardDiscoveryTarget({ disposition: "already_exists" }), false);
  assert.equal(countsTowardDiscoveryTarget({ disposition: "already_archived" }), false);
  assert.equal(countsTowardDiscoveryTarget({ disposition: "possible_duplicate" }), false);
  assert.equal(countsTowardDiscoveryTarget({ disposition: "rejected" }), false);
});

test("monthly reset prefers active billing period, else UTC month", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");
  const periodStart = new Date("2026-08-01T00:00:00.000Z");
  const periodEnd = new Date("2026-09-01T00:00:00.000Z");
  const billed = resolveDiscoveryQuotaPeriodStartFromDates(periodStart, periodEnd, now);
  assert.equal(billed.source, "billing_period");
  assert.equal(billed.periodStart.toISOString(), periodStart.toISOString());

  const calendar = resolveDiscoveryQuotaPeriodStartFromDates(null, null, now);
  assert.equal(calendar.source, "utc_month");
  assert.equal(calendar.periodStart.toISOString(), startOfUtcMonth(now).toISOString());

  const expired = resolveDiscoveryQuotaPeriodStartFromDates(
    new Date("2026-06-01T00:00:00.000Z"),
    new Date("2026-07-01T00:00:00.000Z"),
    now,
  );
  assert.equal(expired.source, "utc_month");
});

test("server enforcement + tenant isolation wiring", () => {
  const service = readFileSync(
    join(process.cwd(), "server/prospectAI/prospectAIService.ts"),
    "utf8",
  );
  assert.ok(service.includes("assertActivatedAndEligible"));
  assert.ok(service.includes("quota_exceeded"));
  assert.ok(service.includes("remaining_quota"));
  assert.ok(service.includes("plan_limit"));
  assert.ok(service.includes("prospectAiQuotaExceededUserMessage"));
  assert.ok(service.includes("recordDiscoveryUsageEventsForResults"));
  assert.ok(service.includes("eq(prospectAiDiscoveryUsageEvents.workspaceUserId, workspaceUserId)"));
  assert.ok(service.includes("Only net-new usable rows are persisted"));
  // Review / restore must not write usage ledger.
  assert.ok(
    !/async function sendDiscoverResultsToReview[\s\S]{0,4000}?recordDiscoveryUsageEventsForResults/.test(
      service,
    ),
  );

  const routes = readFileSync(join(process.cwd(), "server/routes/prospectAI.ts"), "utf8");
  assert.ok(routes.includes("remaining_quota"));
  assert.ok(routes.includes("plan_limit"));
  assert.ok(routes.includes('err.code === "quota_exceeded"'));
});

test("UI shows remaining quota and disables Start Discovery when exhausted", () => {
  const ui = readFileSync(join(process.cwd(), "client/src/pages/ProspectAI.tsx"), "utf8");
  assert.ok(ui.includes("Prospect Discoveries"));
  assert.ok(ui.includes("used this month"));
  assert.ok(ui.includes("Start Discovery"));
  assert.ok(ui.includes("quotaExhausted"));
  assert.ok(ui.includes("prospect-ai-quota-exhausted") || ui.includes("prospectAiQuotaExceededUserMessage"));
  assert.ok(ui.includes('reason="prospect_ai_discoveries"'));
  assert.ok(ui.includes("UpgradeModal"));
});

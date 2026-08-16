/**
 * Copilot entitlement gating — loading/unknown must not flash the upgrade card.
 * Run: npx tsx tests/copilot-entitlement-flash.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { withUserQueryScope } from "../client/src/lib/accountQueryScope";
import {
  resolveCopilotEntitlementStatus,
  shouldShowCopilotIntelligence,
  shouldShowCopilotUpgradeCard,
} from "../client/src/lib/copilotEntitlement";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const ACCOUNT_A = "51f64011-eb3a-48a4-bb10-031abd3c0cdc";
const ACCOUNT_B = "2e311869-a443-454c-8da9-fa8ef4dd191e";

run("undefined entitlement → loading, no upgrade card", () => {
  assert.equal(resolveCopilotEntitlementStatus(undefined), "loading");
  assert.equal(resolveCopilotEntitlementStatus(null), "loading");
  assert.equal(shouldShowCopilotUpgradeCard(undefined), false);
  assert.equal(shouldShowCopilotIntelligence(undefined), false);
});

run("loading capabilities with canUse=false is NOT locked", () => {
  const loading = { canUseCopilotIntelligence: false, isLoading: true };
  assert.equal(resolveCopilotEntitlementStatus(loading), "loading");
  assert.equal(shouldShowCopilotUpgradeCard(loading), false);
  assert.equal(shouldShowCopilotIntelligence(loading), false);
});

run("entitled user during refresh: loading → Copilot, never upgrade", () => {
  const frames = [
    { canUseCopilotIntelligence: false, isLoading: true },
    { canUseCopilotIntelligence: true, isLoading: false },
  ];
  const statuses = frames.map((f) => resolveCopilotEntitlementStatus(f));
  assert.deepEqual(statuses, ["loading", "entitled"]);
  assert.ok(statuses.every((s) => s !== "locked"));
  assert.equal(shouldShowCopilotUpgradeCard(frames[0]), false);
  assert.equal(shouldShowCopilotUpgradeCard(frames[1]), false);
  assert.equal(shouldShowCopilotIntelligence(frames[1]), true);
});

run("confirmed ineligible user → upgrade card", () => {
  const locked = { canUseCopilotIntelligence: false, isLoading: false };
  assert.equal(resolveCopilotEntitlementStatus(locked), "locked");
  assert.equal(shouldShowCopilotUpgradeCard(locked), true);
  assert.equal(shouldShowCopilotIntelligence(locked), false);
});

run("unknown canUse without loading flag stays loading, not locked", () => {
  assert.equal(resolveCopilotEntitlementStatus({ isLoading: false }), "loading");
  assert.equal(shouldShowCopilotUpgradeCard({ isLoading: false }), false);
});

run("account switch does not reuse previous user's entitlement cache", () => {
  const qc = new QueryClient();
  const usageA = withUserQueryScope(["/api/ai/usage"], ACCOUNT_A);
  const usageB = withUserQueryScope(["/api/ai/usage"], ACCOUNT_B);
  const subA = withUserQueryScope(["/api/subscription", ""], ACCOUNT_A);
  const subB = withUserQueryScope(["/api/subscription", ""], ACCOUNT_B);

  qc.setQueryData(usageA, { canUseCopilotIntelligence: true, plan: "pro" });
  qc.setQueryData(subA, { limits: { plan: "pro" } });

  assert.notDeepEqual(usageA, usageB);
  assert.notDeepEqual(subA, subB);
  assert.equal(qc.getQueryData(usageB), undefined);
  assert.equal(qc.getQueryData(subB), undefined);
  assert.equal((qc.getQueryData(usageA) as { plan: string }).plan, "pro");
});

run("Inbox panel does not treat loading as locked", () => {
  const panel = readFileSync(
    join(import.meta.dirname, "..", "client/src/components/InboxLeadDetailsPanel.tsx"),
    "utf8",
  );
  assert.ok(panel.includes("resolveCopilotEntitlementStatus"));
  assert.ok(panel.includes("shouldShowCopilotUpgradeCard"));
  assert.ok(panel.includes("copilot-entitlement-loading"));
  assert.equal(
    panel.includes("capabilities ? capabilities.canUseCopilotIntelligence"),
    false,
    "must not use falsy capabilities as locked/entitled",
  );
  assert.ok(panel.includes("copilotEntitlementLoading"));
});

run("useAICapabilities keeps isLoading true until usage arrives", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "client/src/lib/useAICapabilities.ts"),
    "utf8",
  );
  assert.ok(src.includes("isLoading: true"));
  assert.equal(
    src.includes("isLoading: subLoading || usageLoading }"),
    false,
    "must not drop isLoading when usageData is still missing",
  );
  assert.ok(src.includes("withUserQueryScope([\"/api/ai/usage\"]"));
});

run("subscription query is account-scoped", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "client/src/lib/subscription-context.tsx"),
    "utf8",
  );
  assert.ok(src.includes("withUserQueryScope([\"/api/subscription\""));
});

console.log("copilot-entitlement-flash.test.ts: all assertions passed");

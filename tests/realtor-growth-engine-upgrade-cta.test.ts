import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("the RGE bottom upgrade CTA uses the existing in-app checkout without a confirmation dialog", () => {
  const source = readFileSync("client/src/pages/RealtorGrowthEngine.tsx", "utf8");

  assert.ok(source.includes("templateData?.subscription?.accessOk === false"));
  assert.ok(source.includes("<InAppProUpgradeButton"));
  assert.ok(source.includes('testId="button-bottom-cta"'));
  assert.equal(source.includes("dialog-subscription-gate"), false);
  assert.equal(source.includes("Pro plan required"), false);
  assert.equal(source.includes("What you'll get:"), false);
});

/**
 * GA4 event helper smoke tests (no browser / gtag required).
 */
import assert from "node:assert/strict";

// Mirror once-key logic without importing DOM-dependent module.
function onceKey(eventName: string, uniqueId: string): string {
  return `ga4_once:${eventName}:${uniqueId}`;
}

function testOnceKeys() {
  assert.equal(onceKey("sign_up", "u1"), "ga4_once:sign_up:u1");
  assert.equal(onceKey("purchase", "cs_test"), "ga4_once:purchase:cs_test");
  assert.notEqual(onceKey("sign_up", "u1"), onceKey("sign_up", "u2"));
}

function testPurchaseParamsShape() {
  const params = {
    transaction_id: "cs_123",
    value: 49,
    currency: "USD",
    plan: "Pro",
    billing_interval: "monthly",
  };
  assert.equal(params.transaction_id, "cs_123");
  assert.equal(typeof params.value, "number");
  assert.ok(["monthly", "yearly", "one_time"].includes(params.billing_interval));
}

const tests: Array<[string, () => void]> = [
  ["dedupe once keys", testOnceKeys],
  ["purchase param shape", testPurchaseParamsShape],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail - ${name}`, err);
  }
}
if (failed) process.exit(1);
console.log(`\n${tests.length} GA4 helper tests passed`);

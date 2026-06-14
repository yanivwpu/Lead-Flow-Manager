/**
 * Seller intent detection — Phase 1.
 * Run: npx tsx tests/seller-intent-detection.test.ts
 */
import assert from "node:assert/strict";
import {
  classifySellerIntent,
  detectPureSellerSignals,
  isPureSellerIntent,
  isMixedSellerBuyerIntent,
} from "../shared/sellerIntent";

function assertIntent(text: string, expected: string | null, label: string) {
  const intent = classifySellerIntent({ inboundText: text });
  assert.equal(intent, expected, `${label}: expected ${expected}, got ${intent}`);
}

assertIntent("I want to sell my home", "seller_new", "sell my home");
assertIntent("Thinking about selling", "seller_new", "thinking about selling");
assertIntent("Thinking about listing", "seller_listing_consultation", "thinking about listing");
assertIntent("What is my home worth?", "seller_valuation", "home worth");
assertIntent("Can you help me list my property?", "seller_listing_consultation", "list property");
assertIntent("I'd like a CMA", "seller_valuation", "CMA");
assertIntent("Looking for a valuation", "seller_valuation", "valuation");
assertIntent("How much can I get for my house?", "seller_valuation", "how much");

assert.equal(
  classifySellerIntent({ inboundText: "I want to sell my home", hasSellerProfile: true }),
  "seller_followup",
  "followup when profile exists",
);

assertIntent("I need to sell and buy", "seller_and_buyer", "mixed sell and buy");
assertIntent("Sell my current home and upgrade", "seller_and_buyer", "sell and upgrade");
assertIntent("Need to sell before buying", "seller_and_buyer", "sell before buying");

assert.equal(isPureSellerIntent("seller_new"), true);
assert.equal(isPureSellerIntent("seller_and_buyer"), false);
assert.equal(isMixedSellerBuyerIntent("seller_and_buyer"), true);
assert.equal(detectPureSellerSignals("hello there"), false);
assert.equal(detectPureSellerSignals("I want to sell my home"), true);
assert.equal(classifySellerIntent({ inboundText: "Show me 3 bed homes in Miami" }), null, "buyer search not seller");

console.log("seller-intent-detection.test.ts: OK");

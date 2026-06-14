/**
 * Mixed seller + buyer intent — both profiles can coexist.
 * Run: npx tsx tests/seller-buyer-mixed-intent.test.ts
 */
import assert from "node:assert/strict";
import {
  classifySellerIntent,
  isMixedSellerBuyerIntent,
  isPureSellerIntent,
  shouldSkipBuyerPipelineForSellerLead,
} from "../shared/sellerIntent";
import {
  emptySellerPreferenceProfile,
  normalizeSellerPreferenceProfile,
} from "../shared/sellerPreferenceSchema";
import { normalizeForDisplay } from "../shared/buyerPreferenceDisplay";
import {
  heuristicSellerPatchFromText,
  mergeSellerPreferenceProfile,
} from "../shared/sellerPreferenceExtractionNormalize";

const mixed = "Need to sell and buy a waterfront home";
const intent = classifySellerIntent({ inboundText: mixed });
assert.equal(intent, "seller_and_buyer");
assert.equal(isMixedSellerBuyerIntent(intent), true);
assert.equal(isPureSellerIntent(intent), false);
assert.equal(shouldSkipBuyerPipelineForSellerLead(intent), false, "mixed intent keeps buyer pipeline");

const pureSell = classifySellerIntent({ inboundText: "I want to sell my home" });
assert.equal(shouldSkipBuyerPipelineForSellerLead(pureSell), true, "pure seller skips buyer pipeline");

const sellerPatch = heuristicSellerPatchFromText(
  "Need to sell and buy — our place at 123 Ocean Dr in Pompano, hoping to move in 60 days",
  emptySellerPreferenceProfile(),
);
const sellerProfile = mergeSellerPreferenceProfile(emptySellerPreferenceProfile(), sellerPatch);
assert.ok(sellerProfile.propertyAddress?.value || sellerProfile.city?.value, "seller address/city captured");
assert.equal(sellerProfile.lastSellerIntent, "seller_and_buyer");

const buyerProfile = normalizeForDisplay({
  schemaVersion: 1,
  profileStatus: "partial",
  targetAreas: {
    value: ["Pompano Beach"],
    source: "explicit",
    confidence: 0.9,
    updatedAt: new Date().toISOString(),
  },
  transactionIntent: {
    value: "buy",
    source: "explicit",
    confidence: 0.9,
    updatedAt: new Date().toISOString(),
  },
});

assert.equal(buyerProfile.profileStatus, "partial");
assert.equal(normalizeSellerPreferenceProfile(sellerProfile).profileStatus !== "empty", true);
assert.notEqual(buyerProfile.targetAreas?.value?.[0], undefined, "buyer prefs preserved independently");

console.log("seller-buyer-mixed-intent.test.ts: OK");

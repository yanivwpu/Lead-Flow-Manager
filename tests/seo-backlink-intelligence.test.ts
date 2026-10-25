/** Run: npx tsx tests/seo-backlink-intelligence.test.ts */
import assert from "node:assert/strict";
import { assessBacklinkCandidate, dedupeBacklinkCandidates, type BacklinkCandidate } from "../server/seo/backlinkIntelligence";
const sample: BacklinkCandidate = {
 sourceUrl: "https://example.org/guides/shopify-whatsapp",
 targetUrl: "https://www.whachatcrm.com/zoko-alternative",
 topic: "shopify",
 evidence: "The guide covers choosing WhatsApp software for Shopify teams.",
 contactPermission: "explicit",
 placement: "editorial",
 verifiedAt: "2026-10-25T00:00:00Z"
};
assert.deepEqual(assessBacklinkCandidate(sample).reasons, []);
assert.equal(assessBacklinkCandidate(sample).status, "review");
assert.ok(assessBacklinkCandidate({...sample,sourceUrl:"https://www.whachatcrm.com/blog"}).reasons.includes("self_link"));
assert.ok(assessBacklinkCandidate({...sample,contactPermission:"opted_out"}).reasons.includes("contact_opted_out"));
assert.ok(assessBacklinkCandidate({...sample,placement:"paid"}).reasons.includes("paid_link_requires_sponsored_tag"));
assert.ok(assessBacklinkCandidate({...sample,targetUrl:"https://app.whachatcrm.com/app"}).reasons.includes("noncanonical_target"));
assert.equal(dedupeBacklinkCandidates([sample,{...sample,sourceUrl:sample.sourceUrl+"?utm_source=x"}]).length,1);
console.log("Backlink Intelligence candidate checks passed");

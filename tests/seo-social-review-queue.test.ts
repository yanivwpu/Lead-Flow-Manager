/** Run: npx tsx tests/seo-social-review-queue.test.ts */
import assert from "node:assert/strict";
import { SEO_SOCIAL_STARTERS, validateSeoSocialStarter } from "../server/seo/socialDraftStarters";
import { findForbiddenPublicClaims } from "../shared/seoPolicy";
import { SEO_SOCIAL_DRAFT_SCHEMA } from "../server/seo/socialDraftSchema";

assert.equal(SEO_SOCIAL_STARTERS.length, 13);
assert.equal(SEO_SOCIAL_STARTERS.filter(item => item.channel === "linkedin").length, 7);
assert.equal(SEO_SOCIAL_STARTERS.filter(item => item.channel === "facebook").length, 3);
assert.equal(SEO_SOCIAL_STARTERS.filter(item => item.channel === "instagram").length, 3);
assert.equal(new Set(SEO_SOCIAL_STARTERS.map(item => item.key)).size, SEO_SOCIAL_STARTERS.length);
assert.equal(new Set(SEO_SOCIAL_STARTERS.filter(item => item.channel === "linkedin").map(item => item.day)).size, 7);
for (const item of SEO_SOCIAL_STARTERS) {
  assert.ok(validateSeoSocialStarter(item), item.key);
  assert.deepEqual(findForbiddenPublicClaims(item.body), [], item.key);
}
assert.match(SEO_SOCIAL_DRAFT_SCHEMA, /UNIQUE \(campaign_key, seed_key\)/);
assert.match(SEO_SOCIAL_DRAFT_SCHEMA, /approved_version integer/);
assert.doesNotMatch(SEO_SOCIAL_DRAFT_SCHEMA, /published|social_oauth|send_attempt/i);
console.log("SEO social draft review policy checks passed");

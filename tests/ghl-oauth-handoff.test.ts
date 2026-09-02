/**
 * GHL OAuth pending handoff + secret sanitization.
 * Run: npx tsx tests/ghl-oauth-handoff.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ghlPayloadContainsOAuthSecrets,
  mergeGhlLifecycleRawPayload,
  stripGhlOAuthSecretsFromPayload,
} from "../shared/ghlConnectionState";
import {
  assertHandoffIdentityMatch,
  evaluateGhlOAuthHandoffClaim,
  GHL_OAUTH_HANDOFF_COOKIE,
  GHL_OAUTH_HANDOFF_TTL_MS,
  isCrmMarketplaceHandoffRedirect,
} from "../shared/ghlOAuthHandoff";
import { DEFAULT_GHL_OAUTH_SCOPES } from "../shared/ghlMarketplaceOAuth";
import { sanitizeGhlLifecyclePayloadForStorage } from "../shared/ghlMarketplaceLifecycle";

import crypto from "node:crypto";

function hashGhlOAuthHandoffToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

const now = new Date("2026-09-01T12:00:00.000Z");

const tokenPayload = {
  access_token: "secret-access",
  refresh_token: "secret-refresh",
  userType: "Location",
  locationId: "loc_1",
  companyId: "co_1",
  scope: "contacts.readonly",
};

assert.equal(ghlPayloadContainsOAuthSecrets(tokenPayload), true);
const stripped = stripGhlOAuthSecretsFromPayload(tokenPayload);
assert.equal(stripped.access_token, undefined);
assert.equal(stripped.refresh_token, undefined);
assert.equal(stripped.locationId, "loc_1");
assert.equal(ghlPayloadContainsOAuthSecrets(stripped), false);

const merged = mergeGhlLifecycleRawPayload(tokenPayload, {
  type: "PLAN_CHANGE",
  companyId: "co_1",
  locationId: "loc_1",
  newPlanId: "plan_pro",
});
assert.equal("access_token" in merged, false);
assert.equal(merged.type, "PLAN_CHANGE");
assert.equal(merged.newPlanId, "plan_pro");

const sanitizedLifecycle = sanitizeGhlLifecyclePayloadForStorage({
  type: "UPDATE",
  companyId: "co_1",
  locationId: "loc_1",
  access_token: "should-not-copy",
  versionId: "ver_1",
});
assert.equal(sanitizedLifecycle.access_token, undefined);
assert.equal(sanitizedLifecycle.versionId, "ver_1");

assert.equal(isCrmMarketplaceHandoffRedirect("/app/integrations"), true);
assert.equal(isCrmMarketplaceHandoffRedirect("https://evil.example"), false);
assert.equal(isCrmMarketplaceHandoffRedirect("/app/inbox"), false);

const hash = hashGhlOAuthHandoffToken("claim-token-abc");
assert.equal(hash, hashGhlOAuthHandoffToken("claim-token-abc"));
assert.notEqual(hash, hashGhlOAuthHandoffToken("other-token"));

const row = {
  claimTokenHash: hash,
  expiresAt: new Date(now.getTime() + GHL_OAUTH_HANDOFF_TTL_MS),
  consumedAt: null as Date | null,
  companyId: "co_1",
  locationId: "loc_1",
  appId: "app_1",
  versionId: "ver_1",
  ghlUserId: "ghl_user_1",
};

assert.equal(evaluateGhlOAuthHandoffClaim(row, hash, now).ok, true);
assert.equal(evaluateGhlOAuthHandoffClaim(null, hash, now).ok, false);
assert.equal(
  (evaluateGhlOAuthHandoffClaim(null, hash, now) as { reason: string }).reason,
  "not_found",
);
assert.equal(
  (evaluateGhlOAuthHandoffClaim(row, "", now) as { reason: string }).reason,
  "missing_token",
);
assert.equal(
  (evaluateGhlOAuthHandoffClaim({ ...row, consumedAt: now }, hash, now) as { reason: string }).reason,
  "already_consumed",
);
assert.equal(
  (
    evaluateGhlOAuthHandoffClaim(
      { ...row, expiresAt: new Date(now.getTime() - 1) },
      hash,
      now,
    ) as { reason: string }
  ).reason,
  "expired",
);
assert.equal(
  (evaluateGhlOAuthHandoffClaim(row, "wrong-hash", now) as { reason: string }).reason,
  "hash_mismatch",
);

assert.equal(assertHandoffIdentityMatch(row, {}).ok, true);
assert.equal(assertHandoffIdentityMatch(row, { companyId: "co_1", locationId: "loc_1" }).ok, true);
assert.equal(
  (assertHandoffIdentityMatch(row, { companyId: "other-co" }) as { reason: string }).reason,
  "identity_mismatch",
);
assert.equal(
  (assertHandoffIdentityMatch(row, { locationId: "other-loc" }) as { reason: string }).reason,
  "identity_mismatch",
);

assert.equal(GHL_OAUTH_HANDOFF_COOKIE, "ghl_oauth_handoff");
assert.equal(GHL_OAUTH_HANDOFF_TTL_MS, 30 * 60 * 1000);

const requiredScopes = [
  "conversations.readonly",
  "conversations.write",
  "conversations/message.readonly",
  "conversations/message.write",
  "conversations/livechat.write",
  "locations.readonly",
  "contacts.write",
  "contacts.readonly",
];
for (const scope of requiredScopes) {
  assert.ok(DEFAULT_GHL_OAUTH_SCOPES.includes(scope), scope);
}
assert.ok(!DEFAULT_GHL_OAUTH_SCOPES.includes("oauth.readonly"));

const root = process.cwd();
const callbackSrc = readFileSync(join(root, "server/ghlRoutes.ts"), "utf8");
assert.match(callbackSrc, /createGhlOAuthPendingHandoff/);
assert.match(callbackSrc, /claimGhlOAuthHandoffIfPresent/);
assert.match(callbackSrc, /\/auth\?redirect=/);
assert.doesNotMatch(callbackSrc, /rawPayload:\s*tokenData/);
assert.match(callbackSrc, /stripGhlOAuthSecretsFromPayload/);
assert.match(callbackSrc, /customerFacing:\s*true/);
assert.match(callbackSrc, /router\.post\('\/claim-oauth'/);

const handoffSrc = readFileSync(join(root, "server/ghlOAuthHandoff.ts"), "utf8");
  assert.match(handoffSrc, /encryptCredential/);
  assert.match(handoffSrc, /accessTokenEncrypted/);
  assert.match(handoffSrc, /createHash\("sha256"\)/);
  assert.doesNotMatch(handoffSrc, /console\.log\([^)]*access_token/);
  assert.doesNotMatch(handoffSrc, /console\.log\([^)]*refresh_token/);

const lifecycleSrc = readFileSync(join(root, "server/ghlMarketplaceLifecycleService.ts"), "utf8");
assert.match(lifecycleSrc, /mergeGhlLifecycleRawPayload/);
assert.match(lifecycleSrc, /revokeGhlOAuthHandoffsForInstall/);

console.log("ghl-oauth-handoff.test.ts: OK");

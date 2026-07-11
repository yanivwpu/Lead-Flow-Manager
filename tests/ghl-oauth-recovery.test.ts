/**
 * GHL OAuth recovery helpers.
 * Run: npx tsx tests/ghl-oauth-recovery.test.ts
 */
import assert from "node:assert/strict";
import {
  extractOAuthTokensFromRawPayload,
  hasRecoverableOAuthTokens,
} from "../server/ghlMarketplaceService";
import { categorizeGhlOAuthRecoveryReason } from "../server/ghlOAuthRecovery";

const tokenPayload = {
  access_token: "access-123",
  refresh_token: "refresh-456",
  expires_in: 86400,
  userType: "Company",
  companyId: "GNb7aIv4rQFVb9iwNl5K",
  scope: "contacts.readonly",
};

assert.deepEqual(extractOAuthTokensFromRawPayload(tokenPayload), {
  access_token: "access-123",
  refresh_token: "refresh-456",
  expires_in: 86400,
  userType: "Company",
  companyId: "GNb7aIv4rQFVb9iwNl5K",
  locationId: undefined,
  scope: "contacts.readonly",
});

assert.equal(extractOAuthTokensFromRawPayload({}), null);
assert.equal(extractOAuthTokensFromRawPayload({ refresh_token: "only" }), null);
assert.equal(hasRecoverableOAuthTokens(tokenPayload), true);
assert.equal(hasRecoverableOAuthTokens({ agency: "Test" }), false);

assert.equal(categorizeGhlOAuthRecoveryReason("no_recoverable_install"), "no_recoverable_install");
assert.equal(categorizeGhlOAuthRecoveryReason("refresh_failed"), "refresh_failed");
assert.equal(categorizeGhlOAuthRecoveryReason("access_token_invalid_no_refresh"), "invalid_access_token");
assert.equal(categorizeGhlOAuthRecoveryReason("install_not_owned_or_missing_tokens"), "ownership_mismatch");
assert.equal(categorizeGhlOAuthRecoveryReason("recovery_failed"), "other");

console.log("ghl-oauth-recovery.test.ts: OK");

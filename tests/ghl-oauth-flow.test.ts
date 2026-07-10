/**
 * GHL OAuth flow helpers.
 * Run: npx tsx tests/ghl-oauth-flow.test.ts
 */
import assert from "node:assert/strict";
import {
  appendStateToInstallUrl,
  createGhlOAuthState,
  verifyGhlOAuthState,
} from "../server/ghlOAuthFlow";
import { buildGhlMarketplaceInstallUrl } from "../shared/ghlMarketplaceOAuth";

const installUrl = buildGhlMarketplaceInstallUrl({
  clientId: "app-id-suffix",
  redirectUri: "https://whachatcrm.com/api/ext/callback",
  versionId: "version-1",
});

const state = createGhlOAuthState("user-123");
assert.equal(verifyGhlOAuthState(state), "user-123");
assert.equal(verifyGhlOAuthState("invalid"), null);

const withState = appendStateToInstallUrl(installUrl, state);
assert.ok(withState.includes("state="));
assert.ok(withState.includes("chooselocation"));

console.log("ghl-oauth-flow.test.ts: OK");

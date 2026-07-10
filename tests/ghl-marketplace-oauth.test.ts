/**
 * GHL Marketplace OAuth URL builders.
 * Run: npx tsx tests/ghl-marketplace-oauth.test.ts
 */
import assert from "node:assert/strict";
import {
  buildGhlMarketplaceInstallUrl,
  buildGhlOAuthAuthorizeUrl,
  ghlOAuthUrlIncludesVersionId,
  readGhlMarketplaceAppIdPrefix,
} from "../shared/ghlMarketplaceOAuth";
import { getGhlMarketplaceOAuthConfig } from "../server/ghlOAuthConfig";

const authorizeUrl = buildGhlOAuthAuthorizeUrl({
  clientId: "current-app-id-abc-suffix",
  redirectUri: "https://app.whachatcrm.com/api/ext/callback",
});

assert.ok(authorizeUrl.includes("marketplace.leadconnectorhq.com/oauth/chooselocation"));
assert.ok(authorizeUrl.includes("client_id=current-app-id-abc-suffix"));
assert.ok(authorizeUrl.includes(encodeURIComponent("https://app.whachatcrm.com/api/ext/callback")));
assert.ok(!authorizeUrl.includes("version_id="), "OAuth authorize URL must not include version_id");
assert.equal(ghlOAuthUrlIncludesVersionId(authorizeUrl), false);

const installUrl = buildGhlMarketplaceInstallUrl({
  clientId: "current-app-id-abc-suffix",
  redirectUri: "https://app.whachatcrm.com/api/ext/callback",
  versionId: "version-123",
});

assert.ok(installUrl.includes("version_id=version-123"));
assert.equal(ghlOAuthUrlIncludesVersionId(installUrl), true);
assert.ok(!installUrl.includes("698aac74b0b22c778055e2cc"), "must not embed stale hardcoded app id");

assert.equal(readGhlMarketplaceAppIdPrefix("698aac74b0b22c778055e2cc-mlie99cf"), "698aac74b0b22c778055e2cc");

const prev = {
  GHL_CLIENT_ID: process.env.GHL_CLIENT_ID,
  GHL_CLIENT_SECRET: process.env.GHL_CLIENT_SECRET,
  GHL_APP_VERSION_ID: process.env.GHL_APP_VERSION_ID,
  GHL_MARKETPLACE_INSTALL_URL: process.env.GHL_MARKETPLACE_INSTALL_URL,
  APP_URL: process.env.APP_URL,
};

try {
  delete process.env.GHL_MARKETPLACE_INSTALL_URL;
  delete process.env.GHL_CLIENT_ID;
  delete process.env.GHL_CLIENT_SECRET;
  delete process.env.GHL_APP_VERSION_ID;
  process.env.APP_URL = "https://app.whachatcrm.com";

  const missing = getGhlMarketplaceOAuthConfig();
  assert.equal(missing.configured, false);
  assert.match(missing.error ?? "", /GHL_CLIENT_ID/i);

  process.env.GHL_CLIENT_ID = "live-client-id-xyz";
  process.env.GHL_CLIENT_SECRET = "secret";
  const oauthReady = getGhlMarketplaceOAuthConfig();
  assert.equal(oauthReady.configured, true);
  assert.ok(oauthReady.oauthAuthorizeUrl?.includes("client_id=live-client-id-xyz"));
  assert.ok(!oauthReady.oauthAuthorizeUrl?.includes("version_id="));
  assert.equal(oauthReady.marketplaceInstallUrl, null);

  process.env.GHL_APP_VERSION_ID = "live-version-id";
  const ready = getGhlMarketplaceOAuthConfig();
  assert.equal(ready.configured, true);
  assert.ok(ready.oauthAuthorizeUrl?.includes("client_id=live-client-id-xyz"));
  assert.ok(!ready.oauthAuthorizeUrl?.includes("version_id="));
  assert.ok(ready.marketplaceInstallUrl?.includes("version_id=live-version-id"));
} finally {
  for (const [key, value] of Object.entries(prev)) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else process.env[key] = value;
  }
}

console.log("ghl-marketplace-oauth.test.ts: OK");

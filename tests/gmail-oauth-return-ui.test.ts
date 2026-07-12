/**
 * Gmail OAuth Settings return — modal/URL regression tests.
 * Run: npx tsx tests/gmail-oauth-return-ui.test.ts
 */
import assert from "node:assert/strict";
import {
  GMAIL_OAUTH_CALLBACK_PARAMS,
  hasGmailOAuthCallbackParams,
  parseGmailOAuthReturn,
  shouldOpenEmailModalFromOAuthReturn,
  shouldOpenEmailModalFromProviderDeepLink,
  stripGmailOAuthCallbackParams,
} from "../client/src/lib/gmailOAuthReturn";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const oauthErrorUrl =
  "?section=channels&provider=email&emailError=profile_api_403&emailErrorMsg=Failed%20to%20load%20Gmail%20profile";

run("OAuth error return parses once", () => {
  const result = parseGmailOAuthReturn(oauthErrorUrl);
  assert.equal(result.kind, "error");
  if (result.kind !== "error") return;
  assert.equal(result.errorCategory, "profile_api_403");
  assert.match(result.errorDetail, /Failed to load Gmail profile/);
});

run("OAuth error strip removes callback params and provider=email", () => {
  const stripped = stripGmailOAuthCallbackParams(oauthErrorUrl);
  assert.equal(stripped, "?section=channels");
  assert.equal(hasGmailOAuthCallbackParams(stripped), false);
});

run("Refresh after strip does not look like OAuth return", () => {
  const after = stripGmailOAuthCallbackParams(oauthErrorUrl);
  const refresh = parseGmailOAuthReturn(after);
  assert.equal(refresh.kind, "none");
  assert.equal(shouldOpenEmailModalFromOAuthReturn(refresh), false);
});

run("provider=email deep link alone must not force modal open", () => {
  assert.equal(shouldOpenEmailModalFromProviderDeepLink("email"), false);
  const refresh = parseGmailOAuthReturn("?section=channels&provider=email");
  assert.equal(refresh.kind, "none");
  assert.equal(shouldOpenEmailModalFromOAuthReturn(refresh), false);
});

run("OAuth success parses and strips while keeping section=channels", () => {
  const url = "?section=channels&provider=email&emailConnected=1&mailbox=user%40gmail.com";
  const result = parseGmailOAuthReturn(url);
  assert.equal(result.kind, "success");
  if (result.kind === "success") assert.equal(result.mailbox, "user@gmail.com");
  assert.equal(stripGmailOAuthCallbackParams(url), "?section=channels");
});

run("strip preserves unrelated Settings query params", () => {
  const url = "?section=channels&provider=email&emailError=oauth_failed&tab=channels&foo=bar";
  const stripped = stripGmailOAuthCallbackParams(url);
  const params = new URLSearchParams(stripped.slice(1));
  assert.equal(params.get("section"), "channels");
  assert.equal(params.get("tab"), "channels");
  assert.equal(params.get("foo"), "bar");
  assert.equal(params.get("provider"), null);
  for (const key of GMAIL_OAUTH_CALLBACK_PARAMS) {
    assert.equal(params.has(key), false);
  }
});

run("Connect Gmail remains explicit user action (helpers never auto-open)", () => {
  assert.equal(shouldOpenEmailModalFromProviderDeepLink("email"), false);
  assert.equal(shouldOpenEmailModalFromOAuthReturn({ kind: "success", mailbox: "a@b.com" }), false);
  assert.equal(shouldOpenEmailModalFromOAuthReturn({ kind: "error", errorCategory: "x", errorDetail: "y" }), false);
});

console.log("\nAll Gmail OAuth return UI tests passed.");

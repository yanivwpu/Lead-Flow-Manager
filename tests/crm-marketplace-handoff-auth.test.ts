/**
 * Logged-out Marketplace handoff authentication copy.
 * Run: npx tsx --test tests/crm-marketplace-handoff-auth.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isCrmMarketplaceHandoffRedirect } from "../shared/ghlOAuthHandoff";
import { sanitizeClientRedirectPath } from "../client/src/lib/postAuthRedirect";

const root = process.cwd();
const en = JSON.parse(readFileSync(join(root, "client/src/locales/en.json"), "utf8"));
const es = JSON.parse(readFileSync(join(root, "client/src/locales/es.json"), "utf8"));
const he = JSON.parse(readFileSync(join(root, "client/src/locales/he.json"), "utf8"));
const authSrc = readFileSync(join(root, "client/src/pages/Auth.tsx"), "utf8");
const routesSrc = readFileSync(join(root, "server/ghlRoutes.ts"), "utf8");

const CRM_HANDOFF_KEYS = [
  "crmHandoffHeading",
  "crmHandoffSubtitle",
  "crmHandoffHaveAccount",
] as const;

test("1. /auth?redirect=/app/integrations uses neutral CRM connection copy", () => {
  assert.equal(isCrmMarketplaceHandoffRedirect("/app/integrations"), true);
  assert.equal(
    isCrmMarketplaceHandoffRedirect(sanitizeClientRedirectPath("/app/integrations")),
    true,
  );
  assert.match(authSrc, /isCrmMarketplaceHandoffRedirect/);
  assert.match(authSrc, /auth\.crmHandoffHeading/);
  assert.match(authSrc, /auth\.crmHandoffSubtitle/);
  assert.equal(en.auth.crmHandoffHeading, "Finish connecting your CRM");
  assert.equal(
    en.auth.crmHandoffSubtitle,
    "Log in or create a WhachatCRM account to complete your CRM connection.",
  );
  assert.equal(en.auth.crmHandoffHaveAccount, "Already have an account? Log in");
  assert.doesNotMatch(en.auth.crmHandoffSubtitle, /14-day/);
  assert.doesNotMatch(en.auth.crmHandoffHeading, /14-day/);
});

test("2. Direct signup preserves ordinary signup/trial copy", () => {
  assert.equal(isCrmMarketplaceHandoffRedirect(null), false);
  assert.equal(isCrmMarketplaceHandoffRedirect(sanitizeClientRedirectPath(null)), false);
  assert.match(en.auth.signupSubtitle, /14-day free trial/);
  assert.match(authSrc, /auth\.signupSubtitle/);
  assert.match(authSrc, /isCrmHandoffAuth/);
});

test("3. Invalid redirect cannot trigger trusted connection context", () => {
  assert.equal(isCrmMarketplaceHandoffRedirect("https://evil.example/app/integrations"), false);
  assert.equal(isCrmMarketplaceHandoffRedirect("//evil.example"), false);
  assert.equal(isCrmMarketplaceHandoffRedirect("/app/inbox"), false);
  assert.equal(isCrmMarketplaceHandoffRedirect("/app/integrations/../inbox"), false);
  const sanitizedOpen = sanitizeClientRedirectPath("https://evil.example/phish");
  assert.equal(isCrmMarketplaceHandoffRedirect(sanitizedOpen), false);
  assert.match(authSrc, /sanitizeClientRedirectPath\(redirectTo\)/);
});

test("4. Login/signup still claims the handoff and returns to Integrations", () => {
  assert.match(authSrc, /navigateAfterAuth\(postAuthRedirect\)/);
  assert.match(authSrc, /const postAuthRedirect = redirectTo \|\| "\/app\/inbox"/);
  assert.match(routesSrc, /claimGhlOAuthHandoffIfPresent/);
  assert.match(routesSrc, /\/auth\?redirect=/);
  assert.doesNotMatch(authSrc, /ghl_oauth_handoff/);
});

test("5. English, Spanish, and Hebrew copy are complete", () => {
  for (const key of CRM_HANDOFF_KEYS) {
    assert.equal(typeof en.auth[key], "string");
    assert.equal(typeof es.auth[key], "string");
    assert.equal(typeof he.auth[key], "string");
    assert.ok(String(en.auth[key]).trim().length > 0);
    assert.ok(String(es.auth[key]).trim().length > 0);
    assert.ok(String(he.auth[key]).trim().length > 0);
  }
  assert.doesNotMatch(es.auth.crmHandoffSubtitle, /14/);
  assert.doesNotMatch(he.auth.crmHandoffSubtitle, /14/);
  assert.match(es.auth.crmHandoffHeading, /CRM/);
  assert.match(he.auth.crmHandoffHeading, /CRM/);
  for (const loc of [en, es, he]) {
    assert.equal(typeof loc.integrations.crm.notConnectedStatus, "string");
    assert.equal(typeof loc.integrations.crm.connectCta, "string");
    assert.equal(typeof loc.integrations.crm.finishCta, "string");
    assert.equal(typeof loc.integrations.crm.reconnectCta, "string");
  }
});

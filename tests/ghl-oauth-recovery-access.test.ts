/**
 * GHL OAuth recovery access helpers.
 * Run: npx tsx tests/ghl-oauth-recovery-access.test.ts
 */
import assert from "node:assert/strict";
import {
  canAccessGhlOAuthRecoveryTools,
  isGhlOAuthRecoveryAllowlisted,
  parseGhlOAuthRecoveryAllowedEmails,
} from "../shared/ghlOAuthRecoveryAccess";

const prevProspect = process.env.PROSPECT_IMPORT_ALLOWED_EMAILS;
const prevRecovery = process.env.GHL_OAUTH_RECOVERY_ALLOWED_EMAILS;
process.env.PROSPECT_IMPORT_ALLOWED_EMAILS = "yahabegood@gmail.com";
delete process.env.GHL_OAUTH_RECOVERY_ALLOWED_EMAILS;

assert.ok(isGhlOAuthRecoveryAllowlisted("yahabegood@gmail.com"));
assert.equal(isGhlOAuthRecoveryAllowlisted("other@test.local"), false);
assert.equal(
  canAccessGhlOAuthRecoveryTools(
    { id: "user-1", email: "yahabegood@gmail.com" },
    { isAdmin: false },
  ),
  true,
);
assert.equal(
  canAccessGhlOAuthRecoveryTools(
    { id: "user-1", email: "yahabegood@gmail.com" },
    { isAdmin: true },
  ),
  true,
);
assert.equal(
  canAccessGhlOAuthRecoveryTools(
    { id: "user-2", email: "agency@client.com" },
    { isAdmin: false },
  ),
  false,
);

process.env.GHL_OAUTH_RECOVERY_ALLOWED_EMAILS = "agency@client.com";
assert.ok(parseGhlOAuthRecoveryAllowedEmails().includes("agency@client.com"));
assert.ok(parseGhlOAuthRecoveryAllowedEmails().includes("yahabegood@gmail.com"));

if (prevProspect === undefined) delete process.env.PROSPECT_IMPORT_ALLOWED_EMAILS;
else process.env.PROSPECT_IMPORT_ALLOWED_EMAILS = prevProspect;
if (prevRecovery === undefined) delete process.env.GHL_OAUTH_RECOVERY_ALLOWED_EMAILS;
else process.env.GHL_OAUTH_RECOVERY_ALLOWED_EMAILS = prevRecovery;

console.log("ghl-oauth-recovery-access.test.ts: OK");

/**
 * CRM OAuth recovery user-facing messages.
 * Run: npx tsx tests/ghl-oauth-recovery-messages.test.ts
 */
import assert from "node:assert/strict";
import { humanReadableCrmOAuthRecoveryMessage, CRM_TRY_FULL_OAUTH_CTA } from "../shared/ghlOAuthRecoveryMessages";
import { CRM_RECONNECT_CTA } from "../shared/leadConnectorWhiteLabel";

assert.equal(
  humanReadableCrmOAuthRecoveryMessage({ recovered: true }),
  "Your CRM connection was recovered successfully.",
);
assert.equal(
  humanReadableCrmOAuthRecoveryMessage({ recovered: true, refreshed: true }),
  "Your CRM connection was recovered and renewed.",
);
assert.equal(
  humanReadableCrmOAuthRecoveryMessage({
    recovered: false,
    reasonCategory: "no_recoverable_install",
  }),
  "No recoverable CRM connection was found.",
);
assert.equal(
  humanReadableCrmOAuthRecoveryMessage({
    recovered: false,
    reasonCategory: "invalid_access_token",
  }),
  "Your CRM connection needs to be renewed.",
);
assert.equal(
  humanReadableCrmOAuthRecoveryMessage({
    recovered: false,
    reasonCategory: "refresh_failed",
  }),
  "Your CRM connection needs to be renewed.",
);
assert.equal(
  humanReadableCrmOAuthRecoveryMessage({
    recovered: false,
    reasonCategory: "ownership_mismatch",
  }),
  "This CRM connection could not be verified for your account.",
);
assert.equal(CRM_TRY_FULL_OAUTH_CTA, "Reconnect CRM");
assert.equal(CRM_RECONNECT_CTA, "Reconnect CRM");

console.log("ghl-oauth-recovery-messages.test.ts: OK");

/**
 * CRM OAuth recovery user-facing messages.
 * Run: npx tsx tests/ghl-oauth-recovery-messages.test.ts
 */
import assert from "node:assert/strict";
import { humanReadableCrmOAuthRecoveryMessage } from "../shared/ghlOAuthRecoveryMessages";

assert.equal(
  humanReadableCrmOAuthRecoveryMessage({ recovered: true }),
  "Existing OAuth tokens were recovered successfully.",
);
assert.equal(
  humanReadableCrmOAuthRecoveryMessage({ recovered: true, refreshed: true }),
  "Existing OAuth tokens were recovered successfully and the access token was refreshed.",
);
assert.equal(
  humanReadableCrmOAuthRecoveryMessage({
    recovered: false,
    reasonCategory: "no_recoverable_install",
  }),
  "No recoverable OAuth installation was found.",
);
assert.equal(
  humanReadableCrmOAuthRecoveryMessage({
    recovered: false,
    reasonCategory: "invalid_access_token",
  }),
  "Stored access token is invalid.",
);
assert.equal(
  humanReadableCrmOAuthRecoveryMessage({
    recovered: false,
    reasonCategory: "refresh_failed",
  }),
  "Refresh token failed.",
);
assert.equal(
  humanReadableCrmOAuthRecoveryMessage({
    recovered: false,
    reasonCategory: "ownership_mismatch",
  }),
  "Ownership could not be verified.",
);

console.log("ghl-oauth-recovery-messages.test.ts: OK");

/**
 * Gmail OAuth diagnostic helpers — unit tests.
 * Run: npx tsx tests/gmail-oauth-diagnostic.test.ts
 */
import assert from "node:assert/strict";
import {
  categorizeProfileFetchFailure,
  categoryFromUnknownError,
  gmailOAuthErrorUiMessage,
  parseGoogleApiErrorBody,
  sanitizeDiagPayload,
  GmailOAuthDiagnosticError,
} from "../server/emailChannel/gmailOAuthDiagnostic";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("sanitizeDiagPayload redacts token-like fields", () => {
  const out = sanitizeDiagPayload({
    access_token: "secret",
    refresh_token: "secret",
    httpStatus: 403,
    grantedScopes: "gmail.readonly",
  });
  assert.equal("access_token" in out, false);
  assert.equal("refresh_token" in out, false);
  assert.equal(out.httpStatus, 403);
  assert.equal(out.grantedScopes, "gmail.readonly");
});

run("parseGoogleApiErrorBody extracts Gmail API disabled message", () => {
  const parsed = parseGoogleApiErrorBody(403, {
    error: {
      code: 403,
      message: "Gmail API has not been used in project 123 before or it is disabled.",
      status: "PERMISSION_DENIED",
      errors: [{ reason: "accessNotConfigured", message: "Access Not Configured" }],
    },
  });
  assert.equal(parsed.httpStatus, 403);
  assert.equal(parsed.googleErrorCode, 403);
  assert.match(String(parsed.googleErrorMessage), /Gmail API has not been used/i);
  assert.equal(parsed.googleErrorReason, "accessNotConfigured");
  assert.equal(categorizeProfileFetchFailure(parsed), "gmail_api_disabled");
});

run("categorizeProfileFetchFailure maps 401/403", () => {
  assert.equal(
    categorizeProfileFetchFailure({
      httpStatus: 401,
      googleErrorCode: 401,
      googleErrorMessage: "Request had invalid authentication credentials",
      googleErrorStatus: "UNAUTHENTICATED",
      googleErrorReason: null,
    }),
    "profile_api_401",
  );
  assert.equal(
    categorizeProfileFetchFailure({
      httpStatus: 403,
      googleErrorCode: 403,
      googleErrorMessage: "Insufficient Permission",
      googleErrorStatus: "PERMISSION_DENIED",
      googleErrorReason: null,
    }),
    "profile_api_403",
  );
});

run("UI message preserves Failed to load Gmail profile + category", () => {
  assert.match(gmailOAuthErrorUiMessage("profile_api_403"), /Failed to load Gmail profile/);
  assert.match(gmailOAuthErrorUiMessage("profile_api_403"), /profile_api_403/);
  assert.match(gmailOAuthErrorUiMessage("gmail_api_disabled"), /gmail_api_disabled/);
});

run("categoryFromUnknownError reads GmailOAuthDiagnosticError", () => {
  const err = new GmailOAuthDiagnosticError("gmail_api_disabled", "Failed to load Gmail profile");
  assert.equal(categoryFromUnknownError(err), "gmail_api_disabled");
  assert.equal(categoryFromUnknownError(new Error("Failed to load Gmail profile")), "profile_api_403");
});

console.log("\nAll Gmail OAuth diagnostic tests passed.");

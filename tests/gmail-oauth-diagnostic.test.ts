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
  resolveGmailOAuthDiagGitSha,
  GmailOAuthDiagnosticError,
  gmailOAuthErrorUiMessageFromDiagnostic,
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

run("resolveGmailOAuthDiagGitSha reads Railway env", () => {
  const prev = process.env.RAILWAY_GIT_COMMIT_SHA;
  process.env.RAILWAY_GIT_COMMIT_SHA = "b5016d1dd87ba8950ba109154d47c7dba80e1923";
  try {
    assert.equal(resolveGmailOAuthDiagGitSha(), "b5016d1dd87ba8950ba109154d47c7dba80e1923");
  } finally {
    if (prev === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA;
    else process.env.RAILWAY_GIT_COMMIT_SHA = prev;
  }
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

run("UI profile error includes safe Google reason and message", () => {
  const err = new GmailOAuthDiagnosticError("profile_api_403", "Failed to load Gmail profile", {
    httpStatus: 403,
    googleErrorCode: 403,
    googleErrorMessage: "Gmail API has not been used in project 123 before or it is disabled.",
    googleErrorStatus: "PERMISSION_DENIED",
    googleErrorReason: "accessNotConfigured",
  });
  const ui = gmailOAuthErrorUiMessageFromDiagnostic(err);
  assert.match(ui, /profile_api_403/);
  assert.match(ui, /Google: accessNotConfigured/);
  assert.match(ui, /Gmail API has not been used/i);
});

run("failedPrecondition maps to gmail_no_mailbox with user-facing message", () => {
  const parsed = parseGoogleApiErrorBody(403, {
    error: {
      code: 403,
      message: "Mail service not enabled",
      status: "FAILED_PRECONDITION",
      errors: [{ reason: "failedPrecondition", message: "Mail service not enabled" }],
    },
  });
  assert.equal(categorizeProfileFetchFailure(parsed), "gmail_no_mailbox");
  const err = new GmailOAuthDiagnosticError("gmail_no_mailbox", "Failed to load Gmail profile", {
    httpStatus: 403,
    googleErrorReason: "failedPrecondition",
    googleErrorMessage: "Mail service not enabled",
  });
  const ui = gmailOAuthErrorUiMessageFromDiagnostic(err);
  assert.match(ui, /does not have an active Gmail mailbox/i);
  assert.match(ui, /Google Workspace account with Gmail enabled/i);
});

run("categoryFromUnknownError reads GmailOAuthDiagnosticError", () => {
  const err = new GmailOAuthDiagnosticError("gmail_api_disabled", "Failed to load Gmail profile");
  assert.equal(categoryFromUnknownError(err), "gmail_api_disabled");
  assert.equal(categoryFromUnknownError(new Error("Failed to load Gmail profile")), "profile_api_403");
});

console.log("\nAll Gmail OAuth diagnostic tests passed.");

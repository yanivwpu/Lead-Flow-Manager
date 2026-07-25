/**
 * Prospect AI sender probe diagnostics — classification + lastError persistence.
 * Run: npx tsx tests/prospect-sender-probe-diagnostics.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatProspectQueueItemError, nextQueueItemAfterInfraPause } from "../shared/prospectBulkOutreach";
import {
  classifyEmailSenderProbeError,
  classifyMailboxSyncStatusNotSendable,
  formatSenderNotConnectedDiagnostic,
  isSenderNotConnectedReason,
  parseSenderNotConnectedDiagnostic,
  prospectSenderProbeDiagLog,
  safeProbeErrorMessage,
} from "../shared/prospectSenderProbeDiagnostics";

function testClassifyDecrypt() {
  const err = Object.assign(new Error("Mailbox credentials could not be decrypted"), {
    name: "EmailCredentialDecryptError",
  });
  assert.equal(classifyEmailSenderProbeError(err), "decrypt");
}

function testClassifyTokenRefresh() {
  assert.equal(
    classifyEmailSenderProbeError(new Error("Token refresh failed: invalid_grant")),
    "token_refresh",
  );
  assert.equal(
    classifyEmailSenderProbeError(new Error("Mailbox needs reconnect")),
    "token_refresh",
  );
}

function testClassifyApiAuth() {
  assert.equal(classifyEmailSenderProbeError(new Error("Gmail API 401 unauthorized")), "api_auth");
}

function testClassifyOther() {
  assert.equal(classifyEmailSenderProbeError(new Error("network timeout")), "other_probe_failure");
}

function testMailboxSyncStatus() {
  assert.equal(classifyMailboxSyncStatusNotSendable("disconnected"), "mailbox_disconnected");
  assert.equal(classifyMailboxSyncStatusNotSendable(null), "mailbox_disconnected");
  assert.equal(classifyMailboxSyncStatusNotSendable("needs_reconnect"), "other_probe_failure");
}

function testPersistAndParse() {
  const persisted = formatSenderNotConnectedDiagnostic("decrypt");
  assert.equal(persisted, "sender_not_connected:decrypt:access_token");
  assert.equal(isSenderNotConnectedReason(persisted), true);
  assert.equal(isSenderNotConnectedReason("sender_not_connected"), true);
  assert.equal(isSenderNotConnectedReason("missing_identity"), false);
  assert.deepEqual(parseSenderNotConnectedDiagnostic(persisted), {
    baseReason: "sender_not_connected",
    failureClass: "decrypt",
    decryptField: "access_token",
  });
}

function testUiStripsSuffix() {
  assert.equal(
    formatProspectQueueItemError("sender_not_connected:decrypt"),
    "Connect an email account before starting the campaign",
  );
  assert.equal(
    formatProspectQueueItemError("sender_not_connected:decrypt:access_token"),
    "Connect an email account before starting the campaign",
  );
  assert.equal(
    formatProspectQueueItemError("sender_not_connected:token_refresh"),
    "Connect an email account before starting the campaign",
  );
}

function testSafeMessageRedactsBearer() {
  const safe = safeProbeErrorMessage("Authorization: Bearer ya29.secret-token-value boom");
  assert.ok(!safe.includes("ya29."));
  assert.ok(safe.includes("[REDACTED]"));
}

function testDiagLogHasNoSecretFields() {
  const payload = prospectSenderProbeDiagLog({
    stage: "eligibility",
    failureClass: "decrypt",
    workspaceIdPrefix: "abcd1234",
    errMsgSafe: "could not be decrypted",
  });
  const keys = Object.keys(payload);
  assert.ok(!keys.includes("accessToken"));
  assert.ok(!keys.includes("refreshToken"));
  assert.ok(!keys.includes("authorization"));
  assert.equal(payload.event, "sender_probe_failed");
  assert.equal(payload.stage, "eligibility");
  assert.equal(payload.failureClass, "decrypt");
}

function testLocalhostIngestRemovedFromSenderPaths() {
  const root = process.cwd();
  const files = [
    "server/prospectImport/prospectOutreachEligibilityService.ts",
    "server/prospectImport/prospectOutreachQueueService.ts",
    "server/prospectImport/prospectOutreachSenders.ts",
  ];
  for (const rel of files) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.ok(
      !src.includes("127.0.0.1:7693"),
      `${rel} still contains Cursor debug ingest URL`,
    );
    assert.ok(!src.includes("#region agent log"), `${rel} still contains agent log region`);
  }
}

function testInfraPausePersistsClassifierSuffix() {
  const release = nextQueueItemAfterInfraPause({
    currentAttempts: 0,
    reason: formatSenderNotConnectedDiagnostic("token_refresh"),
  });
  assert.equal(release.lastError, "sender_not_connected:token_refresh");
  assert.equal(release.attempts, 0);
  assert.equal(release.queueStatus, "queued");

  const decryptRelease = nextQueueItemAfterInfraPause({
    currentAttempts: 0,
    reason: formatSenderNotConnectedDiagnostic("decrypt", "access_token"),
  });
  assert.equal(decryptRelease.lastError, "sender_not_connected:decrypt:access_token");
}

const tests: Array<[string, () => void]> = [
  ["classify decrypt", testClassifyDecrypt],
  ["classify token_refresh", testClassifyTokenRefresh],
  ["classify api_auth", testClassifyApiAuth],
  ["classify other_probe_failure", testClassifyOther],
  ["mailbox sync status classes", testMailboxSyncStatus],
  ["persist/parse sender_not_connected:class", testPersistAndParse],
  ["UI strips classifier suffix", testUiStripsSuffix],
  ["safe message redacts bearer", testSafeMessageRedactsBearer],
  ["diag log has no secret fields", testDiagLogHasNoSecretFields],
  ["localhost ingest removed from sender paths", testLocalhostIngestRemovedFromSenderPaths],
  ["infra pause persists classifier suffix", testInfraPausePersistsClassifierSuffix],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(err);
  }
}
if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\n${tests.length} passed`);

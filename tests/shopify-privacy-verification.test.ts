import assert from "node:assert/strict";
import test from "node:test";
import { receiptSignature, validateReceipt, verifyReceipt, privacyRetryDelay, type PrivacyReceipt, type PrivacyTask } from "../server/shopifyPrivacyVerification";
import { configuredPrivacyAdapter, eraseS3Archive } from "../server/shopifyPrivacyAdapters";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
const key = "fixture-verification-key".repeat(3);
const now = new Date("2026-10-11T12:00:00Z");
const task: PrivacyTask = { id: "fixture-task", request_kind: "store_erasure", scope_from: new Date("2026-09-01"), scope_to: new Date("2026-10-01"), required_checks: [], checks: {} };
function receipt(patch: Partial<PrivacyReceipt> = {}): PrivacyReceipt {
  const unsigned = { version: 1 as const, taskId: task.id, check: "railway_logs" as const, method: "retention" as const,
    evidenceDigest: "a".repeat(64), policyUrl: "https://docs.railway.com/observability/logs", reviewedAt: "2026-10-01", expiresAt: "2027-01-01",
    coverageThrough: "2026-10-01", allHistoricalCopies: true as const, restorationProtected: true as const,
    irreversible: true as const, retentionDays: 30, retentionEnforcedSince: "2026-01-01", ...patch };
  delete (unsigned as any).signature;
  return { ...unsigned, signature: receiptSignature(unsigned, key) };
}
test("retention requires signed exhaustive irreversible evidence, source coverage and enforcement history", () => {
  const r = receipt(); assert.ok(validateReceipt(r, task, "railway_logs", key, now));
  assert.equal(verifyReceipt(r, now).verified, false);
  assert.equal(verifyReceipt(r, new Date("2026-11-01")).verified, true);
  assert.equal(validateReceipt({ ...r, signature: "b".repeat(64) }, task, "railway_logs", key, now), null);
  for (const patch of [{ taskId: "other" }, { expiresAt: "2026-10-01" },
    { coverageThrough: "2026-09-30" }, { irreversible: false }, { restorationProtected: false },
    { allHistoricalCopies: false }, { retentionEnforcedSince: "2026-09-02" }, { retentionDays: 0 }]) {
    assert.equal(validateReceipt(receipt(patch as any), task, "railway_logs", key, now), null);
  }
  assert.equal(validateReceipt(r, { ...task, scope_from: null }, "railway_logs", key, now), null, "unknown history needs evidence enforced since epoch or confirmed purge");
  assert.equal(validateReceipt(r, task, "railway_logs", "", now), null);
  assert.equal(privacyRetryDelay(1), 60000); assert.equal(privacyRetryDelay(50), 86400000);
});
test("missing configuration and invalid evidence fail closed without provider actions", async () => {
  assert.deepEqual(await configuredPrivacyAdapter({})(task, "railway_logs", new AbortController().signal), { verified: false, code: "missing_configuration" });
  assert.deepEqual(await configuredPrivacyAdapter({ SHOPIFY_PRIVACY_EVIDENCE_JSON: "invalid" })(task, "railway_logs", new AbortController().signal), { verified: false, code: "invalid_evidence" });
});
test("S3 adapter requires scoped opt-in and verifies deletion of versions, not just delete markers", async () => {
  const r = receipt({ check: "archives", method: "s3_delete", s3: { bucket: "fixture-archive", prefix: "privacy-streams/fixture/", region: "us-east-1", scopedCredentialsVerified: true, writesStopped: true } });
  let copies = [{ Key: r.s3!.prefix + "old", VersionId: "v1" }, { Key: r.s3!.prefix + "old", VersionId: "v2" }];
  let calls = 0;
  const send = async (cmd: any) => {
    calls++;
    if (cmd instanceof DeleteObjectCommand) { copies = copies.filter(c => c.VersionId !== cmd.input.VersionId); return {}; }
    return { Versions: copies, DeleteMarkers: [] };
  };
  assert.equal((await eraseS3Archive(r, new AbortController().signal, send, false)).verified, false); assert.equal(calls, 0);
  assert.equal((await eraseS3Archive(r, new AbortController().signal, send, true)).verified, true); assert.equal(copies.length, 0);
  const denied = await eraseS3Archive(r, new AbortController().signal, async () => { throw { $metadata: { httpStatusCode: 403 }, secret: "never persist" }; }, true);
  assert.deepEqual(denied, { verified: false, code: "provider_permanent" });
  assert.equal((await eraseS3Archive(r, new AbortController().signal, async () => ({ Versions: [{ Key: "foreign", VersionId: "v1" }] }), true)).verified, false);
  assert.equal((await eraseS3Archive(r, new AbortController().signal, async () => ({ Versions: [{ Key: r.s3!.prefix + "new", VersionId: "v1" }] }), true)).verified, false);
});

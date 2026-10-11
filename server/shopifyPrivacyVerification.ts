import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const REQUIRED_PRIVACY_CHECKS = ["railway_logs", "mail_processor", "archives", "backups", "exports", "local_review"] as const;
export type PrivacyCheck = typeof REQUIRED_PRIVACY_CHECKS[number];
export type PrivacyTask = {
  id: string; scope_from: Date | null; scope_to: Date; request_kind: string;
  required_checks: string[]; checks: Record<string, Verification>;
};
export type Verification = { method: "deletion" | "retention" | "not_applicable"; evidenceDigest: string; verifiedAt: string };
export type CheckResult = { verified: true; evidence: Verification } |
  { verified: false; code: "missing_configuration" | "invalid_evidence" | "retention_wait" | "provider_retry" | "provider_permanent" | "unsupported_provider"; retryAt?: Date };
export type PrivacyAdapter = (task: PrivacyTask, check: string, signal: AbortSignal) => Promise<CheckResult>;

/** Signed, task-bound operator evidence; never recover erased selectors from backups. */
export type PrivacyReceipt = {
  version: 1; taskId: string; check: PrivacyCheck; method: Verification["method"] | "s3_delete";
  evidenceDigest: string; policyUrl: string; reviewedAt: string; expiresAt: string;
  // Evidence explicitly covers source copies through this time, all earlier history, and restoration controls.
  coverageThrough: string; allHistoricalCopies: true; restorationProtected: true;
  irreversible?: true; retentionDays?: number; retentionEnforcedSince?: string;
  s3?: { bucket: string; prefix: string; region: string; scopedCredentialsVerified: true; writesStopped: true };
  signature: string;
};
export function receiptSignature(receipt: Omit<PrivacyReceipt, "signature">, key: string): string {
  // Stable recursively sorted keys so signature is independent of JSON presentation order.
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ?
    Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHmac("sha256", key).update(JSON.stringify(canonical(receipt))).digest("hex");
}
export function validateReceipt(raw: unknown, task: PrivacyTask, check: string, key: string, now = new Date()): PrivacyReceipt | null {
  try {
    const r = raw as PrivacyReceipt;
    if (!r || key.length < 32 || r.version !== 1 || r.taskId !== task.id || r.check !== check ||
        !REQUIRED_PRIVACY_CHECKS.includes(r.check) || !/^[a-f0-9]{64}$/.test(r.evidenceDigest) ||
        !/^[a-f0-9]{64}$/.test(r.signature) || !["deletion", "retention", "not_applicable", "s3_delete"].includes(r.method)) return null;
    const { signature, ...unsigned } = r;
    if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(receiptSignature(unsigned, key), "hex"))) return null;
    const reviewed = Date.parse(r.reviewedAt), expires = Date.parse(r.expiresAt), through = Date.parse(r.coverageThrough);
    if (!Number.isFinite(reviewed) || reviewed > now.getTime() || !Number.isFinite(expires) || expires <= now.getTime() ||
        !Number.isFinite(through) || through < task.scope_to.getTime() || r.allHistoricalCopies !== true || r.restorationProtected !== true) return null;
    const url = new URL(r.policyUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || r.policyUrl.length > 300) return null;
    if (r.method === "retention") {
      const since = Date.parse(r.retentionEnforcedSince || "");
      // No approval can turn UI log visibility into irreversible retention.
      if (r.irreversible !== true || !Number.isInteger(r.retentionDays) || r.retentionDays! < 1 || r.retentionDays! > 3650 ||
          !Number.isFinite(since) || since > (task.scope_from?.getTime() ?? 0)) return null;
    }
    if (r.method === "deletion" && r.irreversible !== true) return null;
    return r;
  } catch { return null; }
}
export function verifyReceipt(receipt: PrivacyReceipt, now = new Date()): CheckResult {
  if (receipt.method === "s3_delete") return { verified: false, code: "unsupported_provider" };
  if (receipt.method === "retention") {
    const end = new Date(Date.parse(receipt.coverageThrough) + receipt.retentionDays! * 86400000);
    if (now < end) return { verified: false, code: "retention_wait", retryAt: end };
  }
  return { verified: true, evidence: { method: receipt.method, evidenceDigest: receipt.evidenceDigest, verifiedAt: now.toISOString() } };
}
export function verificationDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function privacyRetryDelay(attempt: number): number {
  return Math.min(86400000, 60000 * 2 ** Math.min(11, Math.max(0, attempt - 1)));
}
export const PRIVACY_ACTIONS: Record<string, string> = {
  missing_configuration: "Configure a verified adapter or supply reviewed, signed retention evidence.",
  invalid_evidence: "Review expired or incomplete processor evidence and restore valid configuration.",
  unsupported_provider: "Obtain provider confirmation for deletion or irreversible retention, including all copies.",
  provider_permanent: "Resolve provider permissions or failed deletion; review and explicitly resume processing.",
  provider_retry: "Check provider availability and retry configuration; review and explicitly resume if retries are exhausted.",
  approaching_deadline: "Resolve outstanding checks before the request deadline.",
  overdue: "Escalate the overdue request and verify all outstanding deletions or retention checks.",
  access_request: "Fulfil the access request through the verified support procedure; do not delete customer data.",
};

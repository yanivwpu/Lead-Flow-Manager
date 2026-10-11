import { S3Client, ListObjectVersionsCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { validateReceipt, verifyReceipt, type PrivacyAdapter, type PrivacyReceipt, type CheckResult } from "./shopifyPrivacyVerification";

/** Exact scoped archive stream; version enumeration + repeated reads, never a delete-marker-only acknowledgment. */
export async function eraseS3Archive(receipt: PrivacyReceipt, signal: AbortSignal,
  send: (command: any, options: { abortSignal: AbortSignal }) => Promise<any>, enabled: boolean): Promise<CheckResult> {
  const scope = receipt.s3;
  if (!enabled || receipt.check !== "archives" || !scope || scope.scopedCredentialsVerified !== true || scope.writesStopped !== true ||
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(scope.bucket) ||
      !/^privacy-streams\/[a-zA-Z0-9_-]{1,80}\/$/.test(scope.prefix) || !/^[a-z]{2}(?:-gov)?-[a-z]+-[0-9]$/.test(scope.region)) return { verified: false, code: "missing_configuration" };
  const list = async () => {
    const entries: Array<{ Key: string; VersionId: string }> = [];
    let KeyMarker: string | undefined, VersionIdMarker: string | undefined;
    for (let page = 0; page < 100; page++) {
      const result = await send(new ListObjectVersionsCommand({ Bucket: scope.bucket, Prefix: scope.prefix, KeyMarker, VersionIdMarker }), { abortSignal: signal });
      for (const item of [...(result.Versions || []), ...(result.DeleteMarkers || [])]) {
        if (typeof item.Key !== "string" || !item.Key.startsWith(scope.prefix) || typeof item.VersionId !== "string") throw new Error("invalid_scope");
        entries.push({ Key: item.Key, VersionId: item.VersionId });
      }
      if (!result.IsTruncated) return entries;
      if (!result.NextKeyMarker || result.NextKeyMarker === KeyMarker && result.NextVersionIdMarker === VersionIdMarker) throw new Error("invalid_pagination");
      KeyMarker = result.NextKeyMarker; VersionIdMarker = result.NextVersionIdMarker;
    }
    throw new Error("inventory_limit");
  };
  try {
    // The signed manifest attests this dedicated prefix is frozen, exhaustive, and belongs to this task.
    // Delete ALL versions in that prefix, including copies predating the request window.
    const entries = await list();
    for (const entry of entries) {
      if (signal.aborted) throw new Error("aborted");
      await send(new DeleteObjectCommand({ Bucket: scope.bucket, ...entry }), { abortSignal: signal });
    }
    if ((await list()).length || (await list()).length) return { verified: false, code: "provider_retry" };
    return { verified: true, evidence: { method: "deletion", evidenceDigest: receipt.evidenceDigest, verifiedAt: new Date().toISOString() } };
  } catch (e: any) {
    const status = e?.$metadata?.httpStatusCode;
    return { verified: false, code: status === 401 || status === 403 || status === 400 ? "provider_permanent" : "provider_retry" };
  }
}
export function configuredPrivacyAdapter(env: NodeJS.ProcessEnv = process.env): PrivacyAdapter {
  return async (task, check, signal) => {
    let receipts: unknown;
    try { receipts = JSON.parse(env.SHOPIFY_PRIVACY_EVIDENCE_JSON || "[]"); } catch { return { verified: false, code: "invalid_evidence" }; }
    if (!Array.isArray(receipts) || receipts.length > 1000) return { verified: false, code: "invalid_evidence" };
    const raw = receipts.find(r => r?.taskId === task.id && r?.check === check);
    if (!raw) return { verified: false, code: "missing_configuration" };
    const receipt = validateReceipt(raw, task, check, env.SHOPIFY_PRIVACY_EVIDENCE_KEY || "");
    if (!receipt) return { verified: false, code: "invalid_evidence" };
    if (receipt.method !== "s3_delete") return verifyReceipt(receipt);
    if (!receipt.s3 || env.SHOPIFY_PRIVACY_S3_DELETE_ENABLED !== "1" ||
        !env.SHOPIFY_PRIVACY_S3_ACCESS_KEY_ID || !env.SHOPIFY_PRIVACY_S3_SECRET_ACCESS_KEY) return { verified: false, code: "missing_configuration" };
    const client = new S3Client({ region: receipt.s3.region, maxAttempts: 1, credentials: {
      accessKeyId: env.SHOPIFY_PRIVACY_S3_ACCESS_KEY_ID, secretAccessKey: env.SHOPIFY_PRIVACY_S3_SECRET_ACCESS_KEY,
      ...(env.SHOPIFY_PRIVACY_S3_SESSION_TOKEN ? { sessionToken: env.SHOPIFY_PRIVACY_S3_SESSION_TOKEN } : {}),
    } });
    try { return await eraseS3Archive(receipt, signal, (cmd, options) => client.send(cmd, options), true); }
    finally { client.destroy(); }
  };
}

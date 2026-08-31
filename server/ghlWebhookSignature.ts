/**
 * GHL webhook signature verification.
 * Primary: X-GHL-Signature (Ed25519) over the exact raw request bytes.
 * Legacy fallback: X-WH-Signature (RSA-SHA256) only when X-GHL-Signature is absent.
 */

import crypto from "node:crypto";

/** Official GHL platform Ed25519 public key (Webhook Integration Guide). */
export const GHL_PLATFORM_ED25519_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

/** Official GHL legacy RSA public key for X-WH-Signature (being deprecated). */
export const GHL_PLATFORM_RSA_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSCFrm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfBcsedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpvuxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKUJ062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXpIocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzNh/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhCHULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJPQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAykT1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

export type GhlWebhookSignatureKeys = {
  ed25519PublicKeyPem: string;
  rsaPublicKeyPem: string;
};

export type GhlWebhookSignatureResult =
  | { ok: true; method: "ed25519" | "rsa-legacy" }
  | { ok: false; reason: "missing_raw_body" | "missing_signature" | "invalid_signature" };

function headerValue(headers: Record<string, unknown>, name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lower) continue;
    if (Array.isArray(value)) {
      const first = value.find((v) => typeof v === "string" && v.trim());
      return first ? String(first).trim() : null;
    }
    if (typeof value === "string" && value.trim() && value.trim() !== "N/A") {
      return value.trim();
    }
  }
  return null;
}

export function ghlWebhookSignatureKeysFromEnv(
  env: Record<string, string | undefined> = process.env,
): GhlWebhookSignatureKeys {
  return {
    ed25519PublicKeyPem:
      String(env.GHL_WEBHOOK_ED25519_PUBLIC_KEY || "").trim() || GHL_PLATFORM_ED25519_PUBLIC_KEY_PEM,
    rsaPublicKeyPem:
      String(env.GHL_WEBHOOK_RSA_PUBLIC_KEY || env.WEBHOOK_PUBLIC_KEY || "").trim() ||
      GHL_PLATFORM_RSA_PUBLIC_KEY_PEM,
  };
}

/** Sanitized readiness — never expose key material. */
export function ghlWebhookSignatureReadiness(keys: GhlWebhookSignatureKeys = ghlWebhookSignatureKeysFromEnv()): {
  ed25519PublicKeyConfigured: boolean;
  rsaPublicKeyConfigured: boolean;
} {
  return {
    ed25519PublicKeyConfigured: Boolean(keys.ed25519PublicKeyPem.includes("BEGIN PUBLIC KEY")),
    rsaPublicKeyConfigured: Boolean(keys.rsaPublicKeyPem.includes("BEGIN PUBLIC KEY")),
  };
}

function verifyEd25519(rawBody: Buffer, signatureB64: string, publicKeyPem: string): boolean {
  try {
    const signature = Buffer.from(signatureB64, "base64");
    if (!signature.length) return false;
    return crypto.verify(null, rawBody, publicKeyPem, signature);
  } catch {
    return false;
  }
}

function verifyRsaSha256(rawBody: Buffer, signatureB64: string, publicKeyPem: string): boolean {
  try {
    const verifier = crypto.createVerify("SHA256");
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(publicKeyPem, signatureB64, "base64");
  } catch {
    return false;
  }
}

export function verifyGhlWebhookSignature(input: {
  rawBody: Buffer | undefined;
  headers: Record<string, unknown>;
  keys?: GhlWebhookSignatureKeys;
}): GhlWebhookSignatureResult {
  const rawBody = input.rawBody;
  if (!rawBody || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    return { ok: false, reason: "missing_raw_body" };
  }

  const keys = input.keys ?? ghlWebhookSignatureKeysFromEnv();
  const ghlSig = headerValue(input.headers, "x-ghl-signature");
  const legacySig = headerValue(input.headers, "x-wh-signature");

  if (ghlSig) {
    const ok = verifyEd25519(rawBody, ghlSig, keys.ed25519PublicKeyPem);
    return ok ? { ok: true, method: "ed25519" } : { ok: false, reason: "invalid_signature" };
  }

  if (legacySig) {
    const ok = verifyRsaSha256(rawBody, legacySig, keys.rsaPublicKeyPem);
    return ok ? { ok: true, method: "rsa-legacy" } : { ok: false, reason: "invalid_signature" };
  }

  return { ok: false, reason: "missing_signature" };
}

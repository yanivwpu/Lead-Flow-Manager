/**
 * Meta WhatsApp credential encryption readiness + envelope versioning (shared, pure — no node:crypto).
 *
 * Primary key for NEW writes / v4 readiness: META_ENCRYPTION_KEY only.
 * Does NOT use EMAIL_ENCRYPTION_KEY or SESSION_SECRET for readiness or new writes.
 *
 * Envelope:
 *   - Legacy (unversioned): `ivHex:authTagHex:ciphertext` (3 segments, iv = 32 hex chars)
 *   - Current: `v1:ivHex:authTagHex:ciphertext` (version prefix + same AES-GCM payload)
 *
 * Historical unversioned decrypt order (server, temporary): META_ENCRYPTION_KEY →
 * SESSION_SECRET → hardcoded legacy default. Those fallbacks never satisfy v4 readiness.
 *
 * META_ENCRYPTION_KEY requirements:
 *   - UTF-8 string, trimmed length ≥ 32
 *   - Must NOT equal the known legacy default passphrase
 *   - Recommended: Base64 of 32 cryptographically random bytes (44 characters)
 *
 * Safe local PowerShell generator (operator-run only — never commit the output):
 *   $b = New-Object byte[] 32
 *   [System.Security.Cryptography.RandomNumberGenerator]::Fill($b)
 *   [Convert]::ToBase64String($b)
 *
 * Rollback: older builds that only parse unversioned envelopes cannot decrypt `v1:…`.
 * Keep a v1-capable build and the same META_ENCRYPTION_KEY; never remove/rotate the key
 * after v1 writes. Redeploying a pre-v1 build alone after migration is not safe.
 */

/** Current write version — always prefixed on newly encrypted Meta credentials. */
export const META_CREDENTIAL_ENCRYPTION_VERSION = "v1" as const;

/** Minimum UTF-8 length for META_ENCRYPTION_KEY after trim. */
export const META_ENCRYPTION_KEY_MIN_LENGTH = 32;

/** Recommended random material size before Base64 encoding (PowerShell generator). */
export const META_ENCRYPTION_KEY_RECOMMENDED_BYTES = 32;

/**
 * Hardcoded passphrase historically used when META_ENCRYPTION_KEY and SESSION_SECRET
 * were both unset. Public in source — not a secret. Rejected as META_ENCRYPTION_KEY.
 */
export const META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE =
  "default-encryption-key-change-in-production";

export type MetaCredentialEncryptionSource = "META_ENCRYPTION_KEY" | null;

export type MetaEncryptionKeyValidation =
  | { ok: true; key: string }
  | { ok: false; reason: "missing" | "too_short" | "legacy_default_forbidden" };

/** Strict validation for META_ENCRYPTION_KEY (encoding: UTF-8 string; min length 32). */
export function validateMetaEncryptionKey(
  raw: unknown,
): MetaEncryptionKeyValidation {
  const key = String(raw ?? "").trim();
  if (!key) return { ok: false, reason: "missing" };
  if (key === META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE) {
    return { ok: false, reason: "legacy_default_forbidden" };
  }
  if (key.length < META_ENCRYPTION_KEY_MIN_LENGTH) {
    return { ok: false, reason: "too_short" };
  }
  return { ok: true, key };
}

export function resolveMetaCredentialEncryptionSource(
  env: NodeJS.ProcessEnv = process.env,
): MetaCredentialEncryptionSource {
  const v = validateMetaEncryptionKey(env.META_ENCRYPTION_KEY);
  return v.ok ? "META_ENCRYPTION_KEY" : null;
}

/**
 * True when a valid META_ENCRYPTION_KEY is configured.
 * SESSION_SECRET and the legacy fallback never satisfy public v4 readiness.
 */
export function isMetaCredentialEncryptionConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveMetaCredentialEncryptionSource(env) != null;
}

/** Sanitized operator-facing configuration error (no key material). */
export function metaEncryptionConfigErrorMessage(
  reason: MetaEncryptionKeyValidation extends { ok: false; reason: infer R } ? R : never,
): string {
  switch (reason) {
    case "legacy_default_forbidden":
      return "META_ENCRYPTION_KEY must not use the legacy default value. Generate a new cryptographically random key.";
    case "too_short":
      return `META_ENCRYPTION_KEY must be at least ${META_ENCRYPTION_KEY_MIN_LENGTH} characters. Prefer Base64 of ${META_ENCRYPTION_KEY_RECOMMENDED_BYTES} random bytes.`;
    case "missing":
    default:
      return "Meta credential encryption is not configured. Set a valid META_ENCRYPTION_KEY before storing Meta tokens.";
  }
}

export function isVersionedMetaCiphertext(text: string): boolean {
  const s = String(text || "");
  if (!s.startsWith(`${META_CREDENTIAL_ENCRYPTION_VERSION}:`)) return false;
  const parts = s.slice(META_CREDENTIAL_ENCRYPTION_VERSION.length + 1).split(":");
  return parts.length === 3 && parts[0].length === 32 && !!parts[1] && !!parts[2];
}

/** Legacy unversioned AES-GCM envelope (iv:tag:ciphertext). */
export function isLegacyMetaCiphertext(text: string): boolean {
  const parts = String(text || "").split(":");
  return parts.length === 3 && parts[0].length === 32 && !!parts[1] && !!parts[2];
}

export function isMetaEncryptedCredential(text: string): boolean {
  return isVersionedMetaCiphertext(text) || isLegacyMetaCiphertext(text);
}

/** Safe stored-credential classification for diagnostics (no ciphertext returned). */
export type MetaStoredCredentialEncryptionStatus =
  | "missing"
  | "v1"
  | "legacy_unversioned"
  | "plaintext_or_unknown";

export function classifyStoredMetaCredentialEncryption(
  raw: string | null | undefined,
): MetaStoredCredentialEncryptionStatus {
  if (raw == null || !String(raw).trim()) return "missing";
  const s = String(raw);
  if (isVersionedMetaCiphertext(s)) return "v1";
  if (isLegacyMetaCiphertext(s)) return "legacy_unversioned";
  return "plaintext_or_unknown";
}

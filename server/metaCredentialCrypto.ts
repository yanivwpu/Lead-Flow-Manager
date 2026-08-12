/**
 * Meta credential AES-256-GCM encrypt/decrypt + Sales Admin re-encryption migration.
 *
 * Writes: valid META_ENCRYPTION_KEY only (versioned `v1:` envelope).
 * Unversioned reads (temporary compatibility): try only this bounded, deduplicated list —
 *   1) META_ENCRYPTION_KEY (raw trimmed, if set)
 *   2) SESSION_SECRET (raw trimmed, if set) — decrypt-only
 *   3) hardcoded legacy default — decrypt-only
 * Versioned (`v1:`) reads: META_ENCRYPTION_KEY only (validated).
 *
 * Never logs tokens, ciphertext, key material, or which passphrase succeeded.
 *
 * Rollback: previous builds that only understand unversioned envelopes cannot decrypt
 * `v1:…` ciphertext. Safe rollback is this compatibility-capable build + the same
 * META_ENCRYPTION_KEY. Do not remove/rotate META_ENCRYPTION_KEY after any v1 writes.
 * Redeploying an older build alone after migration is not safe.
 */
import crypto from "crypto";
import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { users, whatsappOauthStates } from "@shared/schema";
import {
  META_CREDENTIAL_ENCRYPTION_VERSION,
  META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE,
  isLegacyMetaCiphertext,
  isMetaEncryptedCredential,
  isVersionedMetaCiphertext,
  metaEncryptionConfigErrorMessage,
  validateMetaEncryptionKey,
} from "@shared/metaCredentialEncryption";

const ALGORITHM = "aes-256-gcm";
/** Historical scrypt salt — must stay identical for legacy + v1 payload compatibility. */
const SCRYPT_SALT = "salt";

export class MetaCredentialEncryptionConfigError extends Error {
  readonly code = "meta_encryption_not_configured" as const;
  constructor(message: string) {
    super(message);
    this.name = "MetaCredentialEncryptionConfigError";
  }
}

/**
 * Bounded decrypt-only passphrase list for unversioned ciphertext.
 * Order matches historical write preference; duplicates removed.
 * Does not include EMAIL_ENCRYPTION_KEY.
 */
export function listUnversionedMetaDecryptPassphrases(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: unknown) => {
    const s = String(raw ?? "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  add(env.META_ENCRYPTION_KEY);
  add(env.SESSION_SECRET);
  add(META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE);
  return out;
}

function requirePrimaryPassphrase(env: NodeJS.ProcessEnv = process.env): string {
  const v = validateMetaEncryptionKey(env.META_ENCRYPTION_KEY);
  if (!v.ok) {
    throw new MetaCredentialEncryptionConfigError(metaEncryptionConfigErrorMessage(v.reason));
  }
  return v.key;
}

function deriveKey(passphrase: string): Buffer {
  return crypto.scryptSync(passphrase, SCRYPT_SALT, 32);
}

function encryptWithPassphrase(plaintext: string, passphrase: string, versioned: boolean): string {
  const iv = crypto.randomBytes(16);
  const key = deriveKey(passphrase);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  const body = `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  return versioned ? `${META_CREDENTIAL_ENCRYPTION_VERSION}:${body}` : body;
}

function tryDecryptBody(body: string, passphrase: string): string | null {
  try {
    const [ivHex, authTagHex, encrypted] = body.split(":");
    if (!ivHex || !authTagHex || !encrypted || ivHex.length !== 32) return null;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    if (iv.length !== 16 || authTag.length !== 16) return null;
    const key = deriveKey(passphrase);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return null;
  }
}

function tryDecryptUnversioned(raw: string, env: NodeJS.ProcessEnv): string | null {
  for (const passphrase of listUnversionedMetaDecryptPassphrases(env)) {
    const plain = tryDecryptBody(raw, passphrase);
    if (plain != null) return plain;
  }
  return null;
}

/** Test helper — unversioned ciphertext under an explicit historical passphrase. */
export function encryptMetaCredentialUnversionedForTests(
  plaintext: string,
  passphrase: string,
): string {
  return encryptWithPassphrase(plaintext, passphrase, false);
}

/** Test helper — unversioned ciphertext under the hardcoded legacy default. */
export function encryptMetaCredentialWithLegacyFallbackForTests(plaintext: string): string {
  return encryptMetaCredentialUnversionedForTests(
    plaintext,
    META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE,
  );
}

/**
 * Encrypt Meta credentials for persistence.
 * Requires a valid META_ENCRYPTION_KEY. Never uses SESSION_SECRET, EMAIL_ENCRYPTION_KEY,
 * or the legacy hardcoded default.
 */
export function encryptCredential(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const passphrase = requirePrimaryPassphrase(env);
  return encryptWithPassphrase(text, passphrase, true);
}

/**
 * Decrypt Meta credentials.
 * - Versioned (`v1:…`): validated META_ENCRYPTION_KEY only.
 * - Unversioned: bounded historical list (META → SESSION_SECRET → legacy default).
 * On total failure, returns the input unchanged (historical caller contract).
 */
export function decryptCredential(
  encryptedText: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = String(encryptedText || "");
  if (!raw) return raw;

  if (isVersionedMetaCiphertext(raw)) {
    const body = raw.slice(META_CREDENTIAL_ENCRYPTION_VERSION.length + 1);
    const primary = validateMetaEncryptionKey(env.META_ENCRYPTION_KEY);
    if (!primary.ok) return raw;
    return tryDecryptBody(body, primary.key) ?? raw;
  }

  if (isLegacyMetaCiphertext(raw)) {
    return tryDecryptUnversioned(raw, env) ?? raw;
  }

  return raw;
}

export function isEncrypted(text: string): boolean {
  return isMetaEncryptedCredential(text);
}

/** Strict decrypt for migration — null if ciphertext cannot be authenticated. */
export function decryptMetaCredentialOrNull(
  encryptedText: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = String(encryptedText || "");
  if (!isMetaEncryptedCredential(raw)) return null;

  if (isVersionedMetaCiphertext(raw)) {
    const body = raw.slice(META_CREDENTIAL_ENCRYPTION_VERSION.length + 1);
    const primary = validateMetaEncryptionKey(env.META_ENCRYPTION_KEY);
    if (!primary.ok) return null;
    return tryDecryptBody(body, primary.key);
  }

  return tryDecryptUnversioned(raw, env);
}

/** Sanitized boot diagnostic — never logs key material or lengths of secrets. */
export function logMetaCredentialEncryptionBootDiag(
  env: NodeJS.ProcessEnv = process.env,
  processLabel = "app",
): void {
  const configured = validateMetaEncryptionKey(env.META_ENCRYPTION_KEY).ok;
  console.info(
    JSON.stringify({
      tag: "[MetaCredentialEncryptionBoot]",
      process: processLabel,
      metaEncryptionKeyConfigured: configured,
      v1DecryptReady: configured,
      unversionedLegacyReadEnabled: true,
      note: configured
        ? "META_ENCRYPTION_KEY present — v1 writes/decrypt ready"
        : "META_ENCRYPTION_KEY missing/invalid — new Meta token writes and v1 decrypt will fail; unversioned legacy read may still work",
    }),
  );
}

export type MetaCredentialFieldMigrationCounts = {
  scanned: number;
  alreadyVersioned: number;
  migrated: number;
  failed: number;
  empty: number;
};

export type MetaCredentialEncryptionMigrationReport = {
  dryRun: boolean;
  primaryKeyConfigured: boolean;
  users: MetaCredentialFieldMigrationCounts;
  oauthPending: MetaCredentialFieldMigrationCounts;
  /** Sum of row updates persisted (0 when dryRun). */
  rowsUpdated: number;
  /**
   * Fields that remain unversioned after this pass (failed + dry-run would-migrate).
   * When both are 0 after a non-dry-run, legacy unversioned reading can later be removed.
   */
  remainingUnversionedFields: {
    users: number;
    oauthPending: number;
    total: number;
  };
  legacyReadStillRequired: boolean;
};

function emptyCounts(): MetaCredentialFieldMigrationCounts {
  return { scanned: 0, alreadyVersioned: 0, migrated: 0, failed: 0, empty: 0 };
}

function remainingUnversionedFromCounts(
  counts: MetaCredentialFieldMigrationCounts,
  dryRun: boolean,
): number {
  // Failed stay unversioned. Dry-run "migrated" are still unversioned until a real write.
  return counts.failed + (dryRun ? counts.migrated : 0);
}

type FieldReencryptResult =
  | { ok: true; next: string | null; changed: boolean; bucket: "empty" | "alreadyVersioned" | "migrated" }
  | { ok: false; bucket: "failed" };

function reencryptField(
  ciphertext: string | null | undefined,
  env: NodeJS.ProcessEnv,
): FieldReencryptResult {
  if (ciphertext == null || String(ciphertext).trim() === "") {
    return { ok: true, next: ciphertext ?? null, changed: false, bucket: "empty" };
  }
  const raw = String(ciphertext);
  if (!isMetaEncryptedCredential(raw)) {
    return { ok: false, bucket: "failed" };
  }
  if (isVersionedMetaCiphertext(raw)) {
    return { ok: true, next: raw, changed: false, bucket: "alreadyVersioned" };
  }
  const plaintext = decryptMetaCredentialOrNull(raw, env);
  if (plaintext == null) {
    return { ok: false, bucket: "failed" };
  }
  let next: string;
  try {
    next = encryptCredential(plaintext, env);
  } catch {
    return { ok: false, bucket: "failed" };
  }
  const verify = decryptMetaCredentialOrNull(next, env);
  if (verify == null || verify !== plaintext) {
    return { ok: false, bucket: "failed" };
  }
  return { ok: true, next, changed: true, bucket: "migrated" };
}

function applyFieldResult(
  counts: MetaCredentialFieldMigrationCounts,
  result: FieldReencryptResult,
): void {
  counts.scanned += 1;
  counts[result.bucket] += 1;
}

/**
 * Idempotent Sales Admin migration: unversioned → v1 under META_ENCRYPTION_KEY.
 * Preserves original ciphertext on any failure. Aggregate counts only (no IDs/PII/keys).
 */
export async function migrateMetaCredentialEncryption(options?: {
  dryRun?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<MetaCredentialEncryptionMigrationReport> {
  const env = options?.env ?? process.env;
  const dryRun = options?.dryRun === true;
  const primary = validateMetaEncryptionKey(env.META_ENCRYPTION_KEY);
  if (!primary.ok) {
    throw new MetaCredentialEncryptionConfigError(metaEncryptionConfigErrorMessage(primary.reason));
  }

  const userCounts = emptyCounts();
  const oauthCounts = emptyCounts();
  let rowsUpdated = 0;

  const userRows = await db
    .select({
      id: users.id,
      metaAccessToken: users.metaAccessToken,
      metaAppSecret: users.metaAppSecret,
    })
    .from(users)
    .where(
      or(
        and(isNotNull(users.metaAccessToken), ne(users.metaAccessToken, "")),
        and(isNotNull(users.metaAppSecret), ne(users.metaAppSecret, "")),
      ),
    );

  for (const row of userRows) {
    const access = reencryptField(row.metaAccessToken, env);
    const secret = reencryptField(row.metaAppSecret, env);

    // Atomic per user: any field failure → write nothing; count present fields as failed.
    if (!access.ok || !secret.ok) {
      const markFailed = (value: string | null | undefined) => {
        if (value == null || String(value).trim() === "") {
          applyFieldResult(userCounts, { ok: true, next: null, changed: false, bucket: "empty" });
          return;
        }
        userCounts.scanned += 1;
        userCounts.failed += 1;
      };
      markFailed(row.metaAccessToken);
      markFailed(row.metaAppSecret);
      continue;
    }

    applyFieldResult(userCounts, access);
    applyFieldResult(userCounts, secret);
    if (!access.changed && !secret.changed) continue;
    if (dryRun) continue;

    const updates: { metaAccessToken?: string | null; metaAppSecret?: string | null } = {};
    if (access.changed) updates.metaAccessToken = access.next;
    if (secret.changed) updates.metaAppSecret = secret.next;

    await db.transaction(async (tx) => {
      await tx.update(users).set(updates).where(eq(users.id, row.id));
    });
    rowsUpdated += 1;
  }

  const oauthRows = await db
    .select({
      id: whatsappOauthStates.id,
      userId: whatsappOauthStates.userId,
      pendingAccessToken: whatsappOauthStates.pendingAccessToken,
    })
    .from(whatsappOauthStates)
    .where(
      and(
        isNotNull(whatsappOauthStates.pendingAccessToken),
        sql`trim(${whatsappOauthStates.pendingAccessToken}) <> ''`,
      ),
    );

  for (const row of oauthRows) {
    const pending = reencryptField(row.pendingAccessToken, env);
    applyFieldResult(oauthCounts, pending);
    if (!pending.ok || !pending.changed) continue;
    if (dryRun) continue;

    // Ownership-safe: pin both row id and owning userId in the update predicate.
    await db.transaction(async (tx) => {
      await tx
        .update(whatsappOauthStates)
        .set({ pendingAccessToken: pending.next })
        .where(
          and(
            eq(whatsappOauthStates.id, row.id),
            eq(whatsappOauthStates.userId, row.userId),
          ),
        );
    });
    rowsUpdated += 1;
  }

  const remainingUsers = remainingUnversionedFromCounts(userCounts, dryRun);
  const remainingOauth = remainingUnversionedFromCounts(oauthCounts, dryRun);
  const remainingTotal = remainingUsers + remainingOauth;

  return {
    dryRun,
    primaryKeyConfigured: true,
    users: userCounts,
    oauthPending: oauthCounts,
    rowsUpdated,
    remainingUnversionedFields: {
      users: remainingUsers,
      oauthPending: remainingOauth,
      total: remainingTotal,
    },
    legacyReadStillRequired: remainingTotal > 0,
  };
}

/**
 * Pure in-memory field migration for unit tests (no DB).
 */
export function migrateMetaCiphertextFieldForTests(
  ciphertext: string,
  env: NodeJS.ProcessEnv,
): { status: "already_versioned" | "migrated" | "failed"; next: string | null } {
  const r = reencryptField(ciphertext, env);
  if (!r.ok) return { status: "failed", next: null };
  if (!r.changed) return { status: "already_versioned", next: r.next };
  return { status: "migrated", next: r.next };
}

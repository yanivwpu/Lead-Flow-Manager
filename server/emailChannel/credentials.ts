/**
 * Email OAuth token encryption — fail closed if no production key.
 * Production requires EMAIL_ENCRYPTION_KEY (no SESSION_SECRET / Meta / Twilio fallback).
 */
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

export type EmailCredentialField = "access_token" | "refresh_token";

export const EMAIL_CREDENTIAL_DECRYPT_USER_MESSAGE =
  "Mailbox credentials could not be decrypted. Ensure EMAIL_ENCRYPTION_KEY is identical on every app instance and has not changed since Gmail was connected.";

export class EmailCredentialDecryptError extends Error {
  readonly field: EmailCredentialField;
  readonly causeName: string;
  readonly causeMessage: string;

  constructor(field: EmailCredentialField, cause: unknown) {
    super(EMAIL_CREDENTIAL_DECRYPT_USER_MESSAGE);
    this.name = "EmailCredentialDecryptError";
    this.field = field;
    this.causeName = cause instanceof Error ? cause.name : "Error";
    this.causeMessage = safeErrorMessage(cause);
  }
}

export function safeErrorMessage(err: unknown, maxLen = 160): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export function isNodeCryptoAuthFailure(err: unknown): boolean {
  const msg = safeErrorMessage(err, 300);
  return /unable to authenticate data|Unsupported state/i.test(msg);
}

export function isEmailCredentialDecryptFailure(err: unknown): boolean {
  if (err instanceof EmailCredentialDecryptError) return true;
  return isNodeCryptoAuthFailure(err);
}

export function syncErrorFromUnknown(err: unknown): string {
  if (err instanceof EmailCredentialDecryptError) return err.message;
  if (isNodeCryptoAuthFailure(err)) return EMAIL_CREDENTIAL_DECRYPT_USER_MESSAGE;
  return err instanceof Error ? err.message : String(err);
}

export type EmailChannelHealthDiagInput = {
  mailboxId?: string | null;
  workspaceId?: string | null;
  stage: string;
  encryptedField?: EmailCredentialField | null;
  error?: unknown;
  syncStatus?: string | null;
  lastSyncAt?: Date | string | null;
  hasRefreshToken?: boolean;
};

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Resolve email crypto key material.
 * Production: EMAIL_ENCRYPTION_KEY only (fail closed).
 * Development/test: EMAIL_ENCRYPTION_KEY, then explicit Meta/Twilio/SESSION fallbacks for local tests.
 */
export function resolveEncryptionKeyMaterial(): string {
  const emailKey = String(process.env.EMAIL_ENCRYPTION_KEY || "").trim();
  if (emailKey) return emailKey;
  if (isProductionRuntime()) return "";
  return (
    String(process.env.META_ENCRYPTION_KEY || "").trim() ||
    String(process.env.TWILIO_ENCRYPTION_KEY || "").trim() ||
    String(process.env.SESSION_SECRET || "").trim()
  );
}

/** Non-secret: which env var supplies email crypto material + sha256 prefix. */
export function emailEncryptionKeySourceDiag(): {
  source: string | null;
  sha256Prefix8: string | null;
  present: boolean;
  productionFailClosed: boolean;
} {
  const productionFailClosed = isProductionRuntime();
  const emailKey = String(process.env.EMAIL_ENCRYPTION_KEY || "").trim();
  if (emailKey) {
    return {
      source: "EMAIL_ENCRYPTION_KEY",
      present: true,
      sha256Prefix8: crypto.createHash("sha256").update(emailKey, "utf8").digest("hex").slice(0, 8),
      productionFailClosed,
    };
  }
  if (productionFailClosed) {
    return { source: null, present: false, sha256Prefix8: null, productionFailClosed: true };
  }
  for (const name of ["META_ENCRYPTION_KEY", "TWILIO_ENCRYPTION_KEY", "SESSION_SECRET"] as const) {
    const raw = String(process.env[name] || "").trim();
    if (!raw) continue;
    return {
      source: name,
      present: true,
      sha256Prefix8: crypto.createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 8),
      productionFailClosed: false,
    };
  }
  return { source: null, present: false, sha256Prefix8: null, productionFailClosed: false };
}

/** Temporary safe diagnostic — never log tokens, ciphertext, or keys. */
export function logEmailChannelHealthDiag(input: EmailChannelHealthDiagInput): void {
  const err = input.error;
  const keyDiag = emailEncryptionKeySourceDiag();
  console.warn(
    JSON.stringify({
      tag: "[EmailChannelHealthDiag]",
      mailboxId: input.mailboxId ?? null,
      workspaceId: input.workspaceId ?? null,
      stage: input.stage,
      encryptedField: input.encryptedField ?? null,
      errorName: err
        ? err instanceof EmailCredentialDecryptError
          ? err.name
          : err instanceof Error
            ? err.name
            : "Error"
        : null,
      errorMessage: err ? safeErrorMessage(err) : null,
      causeName: err instanceof EmailCredentialDecryptError ? err.causeName : null,
      causeMessage: err instanceof EmailCredentialDecryptError ? err.causeMessage : null,
      syncStatusActive: input.syncStatus === "connected" || input.syncStatus === "syncing",
      lastSyncSucceeded: Boolean(input.lastSyncAt),
      hasRefreshToken: Boolean(input.hasRefreshToken),
      keySource: keyDiag.source,
      keyFp8: keyDiag.sha256Prefix8,
    }),
  );
}

/** Boot-time non-secret crypto readiness line. */
export function logEmailCryptoBootDiag(): void {
  const keyDiag = emailEncryptionKeySourceDiag();
  console.info(
    JSON.stringify({
      tag: "[EmailCryptoBoot]",
      event: "email_crypto_ready",
      keySource: keyDiag.source,
      keyFp8: keyDiag.sha256Prefix8,
      present: keyDiag.present,
      productionFailClosed: keyDiag.productionFailClosed,
      nodeEnv: process.env.NODE_ENV || null,
    }),
  );
}

export function assertEmailEncryptionConfigured(): void {
  const key = resolveEncryptionKeyMaterial();
  if (!key || key === "default-encryption-key-change-in-production") {
    throw new Error(
      isProductionRuntime()
        ? "Email encryption is not configured. Set EMAIL_ENCRYPTION_KEY before connecting Gmail (production does not fall back to SESSION_SECRET)."
        : "Email encryption is not configured. Set EMAIL_ENCRYPTION_KEY (or META_ENCRYPTION_KEY / SESSION_SECRET in development) before connecting Gmail.",
    );
  }
  if (isProductionRuntime() && key.length < 16) {
    throw new Error("EMAIL_ENCRYPTION_KEY is too short for production.");
  }
  if (isProductionRuntime()) {
    const emailKey = String(process.env.EMAIL_ENCRYPTION_KEY || "").trim();
    if (!emailKey) {
      throw new Error(
        "EMAIL_ENCRYPTION_KEY is required in production for Gmail mailbox credentials.",
      );
    }
  }
}

function getEncryptionKey(): Buffer {
  assertEmailEncryptionConfigured();
  return crypto.scryptSync(resolveEncryptionKeyMaterial(), "email-channel-salt", 32);
}

export function encryptEmailCredential(text: string): string {
  assertEmailEncryptionConfigured();
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptEmailCredential(encryptedText: string): string {
  const parts = String(encryptedText || "").split(":");
  if (parts.length !== 3 || parts[0].length !== 32) {
    throw new Error("Email credential is not in encrypted format — refusing plaintext fallback.");
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Decrypt a named mailbox credential field. Wraps Node AES-GCM auth failures
 * ("Unsupported state or unable to authenticate data") with a field-aware error.
 */
export function decryptEmailCredentialField(
  encryptedText: string,
  field: EmailCredentialField,
  diag?: Omit<EmailChannelHealthDiagInput, "stage" | "encryptedField" | "error"> & {
    stage?: string;
  },
): string {
  try {
    return decryptEmailCredential(encryptedText);
  } catch (cause) {
    const wrapped = new EmailCredentialDecryptError(field, cause);
    logEmailChannelHealthDiag({
      mailboxId: diag?.mailboxId,
      workspaceId: diag?.workspaceId,
      stage: diag?.stage ?? `decrypt_${field}`,
      encryptedField: field,
      error: wrapped,
      syncStatus: diag?.syncStatus,
      lastSyncAt: diag?.lastSyncAt,
      hasRefreshToken: diag?.hasRefreshToken,
    });
    throw wrapped;
  }
}

export function isEmailCredentialEncrypted(text: string): boolean {
  const parts = String(text || "").split(":");
  return parts.length === 3 && parts[0].length === 32;
}

/** Per-mailbox single-flight for concurrent token probes/refreshes. */
const mailboxTokenFlights = new Map<string, Promise<unknown>>();

export function runMailboxTokenSingleFlight<T>(
  mailboxId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = mailboxTokenFlights.get(mailboxId);
  if (existing) return existing as Promise<T>;
  const p = Promise.resolve()
    .then(fn)
    .finally(() => {
      if (mailboxTokenFlights.get(mailboxId) === p) {
        mailboxTokenFlights.delete(mailboxId);
      }
    });
  mailboxTokenFlights.set(mailboxId, p);
  return p;
}

/** Test helper — clear in-flight map between unit tests. */
export function clearMailboxTokenSingleFlightForTests(): void {
  mailboxTokenFlights.clear();
}

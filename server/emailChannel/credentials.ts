/**
 * Email OAuth token encryption — fail closed if no production key.
 * Reuses AES-256-GCM format compatible with Meta/Twilio helpers.
 */
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function resolveEncryptionKeyMaterial(): string {
  const key =
    String(process.env.EMAIL_ENCRYPTION_KEY || "").trim() ||
    String(process.env.META_ENCRYPTION_KEY || "").trim() ||
    String(process.env.TWILIO_ENCRYPTION_KEY || "").trim() ||
    String(process.env.SESSION_SECRET || "").trim();
  return key;
}

export function assertEmailEncryptionConfigured(): void {
  const key = resolveEncryptionKeyMaterial();
  if (!key || key === "default-encryption-key-change-in-production") {
    throw new Error(
      "Email encryption is not configured. Set EMAIL_ENCRYPTION_KEY (or META_ENCRYPTION_KEY / SESSION_SECRET) before connecting Gmail.",
    );
  }
  if (process.env.NODE_ENV === "production" && key.length < 16) {
    throw new Error("EMAIL_ENCRYPTION_KEY is too short for production.");
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

export function isEmailCredentialEncrypted(text: string): boolean {
  const parts = String(text || "").split(":");
  return parts.length === 3 && parts[0].length === 32;
}

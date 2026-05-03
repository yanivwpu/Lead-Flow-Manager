import { decryptCredential, encryptCredential, isEncrypted } from "./userTwilio";

/** Same key list as `server/routes.ts` native integration encrypt helpers. */
export const INTEGRATION_SENSITIVE_CONFIG_KEYS = [
  "accessToken",
  "secretKey",
  "privateKey",
  "clientSecret",
  "refreshToken",
  "apiKey",
  "webhookSecret",
  "webhookSigningKey",
  "consumerKey",
  "consumerSecret",
] as const;

export function decryptIntegrationConfig(config: Record<string, unknown>): Record<string, unknown> {
  const decrypted: Record<string, unknown> = { ...config };
  for (const key of INTEGRATION_SENSITIVE_CONFIG_KEYS) {
    const v = decrypted[key];
    if (typeof v === "string" && isEncrypted(v)) {
      decrypted[key] = decryptCredential(v);
    }
  }
  return decrypted;
}

export function encryptIntegrationConfig(config: Record<string, unknown>): Record<string, unknown> {
  const encrypted: Record<string, unknown> = { ...config };
  for (const key of INTEGRATION_SENSITIVE_CONFIG_KEYS) {
    const v = encrypted[key];
    if (typeof v === "string" && v && !isEncrypted(v)) {
      encrypted[key] = encryptCredential(v);
    }
  }
  return encrypted;
}

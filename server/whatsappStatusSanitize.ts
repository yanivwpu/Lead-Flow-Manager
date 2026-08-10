/**
 * Strip secrets from WhatsApp status/debug payloads before returning to the client.
 * Never return access tokens, app secrets, webhook verify tokens, auth codes, or PINs.
 */

const SENSITIVE_KEY_RE =
  /^(pin|pin_confirm|confirm_pin|access_token|accessToken|metaAccessToken|app_secret|appSecret|metaAppSecret|webhook_verify_token|webhookVerifyToken|metaWebhookVerifyToken|authorization_code|authCode|client_secret|clientSecret)$/i;

export function stripSensitiveWhatsAppFields<T>(value: T): T {
  return stripRecursive(value) as T;
}

function stripRecursive(value: unknown): unknown {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(stripRecursive);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      continue;
    }
    // OAuth authorization codes (never Graph numeric error codes).
    if (k === "code" && typeof v === "string" && v.length > 20) {
      continue;
    }
    out[k] = stripRecursive(v);
  }
  return out;
}

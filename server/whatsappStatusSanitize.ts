/**
 * Strip secrets from WhatsApp status/debug payloads before returning to the client.
 * Never return access tokens, app secrets, webhook verify tokens, auth codes, or PINs.
 */

const SENSITIVE_KEY_RE =
  /^(pin|pin_confirm|confirm_pin|access_token|accessToken|metaAccessToken|app_secret|appSecret|metaAppSecret|webhook_verify_token|webhookVerifyToken|metaWebhookVerifyToken|authorization_code|authCode|client_secret|clientSecret|META_ENCRYPTION_KEY|EMAIL_ENCRYPTION_KEY|SESSION_SECRET|pendingAccessToken)$/i;

/**
 * Safe OAuth completion status extracted from users.meta_last_oauth_debug.
 * Booleans/strings/categories only — never codes, tokens, secrets, or full config IDs.
 */
export type SanitizedLastOAuthStatusFields = {
  lastOAuthArchitecture: string | null;
  lastOAuthFlow: string | null;
  lastOAuthPhase: string | null;
  lastOAuthErrorCode: string | null;
  exchangeFailureCategory: string | null;
  discoveryFailureCategory: string | null;
  discoveryMethod: string | null;
  codeCallbackReceived: boolean;
  sessionEventReceived: boolean;
  completeSdkAttempted: boolean;
  /** true/false when recorded; null when unknown / not yet written */
  redirectUriSent: boolean | null;
  sessionEventName: string | null;
};

export function buildSanitizedLastOAuthStatusFields(
  oauthDbg: Record<string, unknown> | null | undefined,
): SanitizedLastOAuthStatusFields {
  const dbg = oauthDbg && typeof oauthDbg === "object" ? oauthDbg : null;
  const sessionEvent =
    dbg?.sessionEvent && typeof dbg.sessionEvent === "object"
      ? (dbg.sessionEvent as Record<string, unknown>)
      : null;
  const errorCode =
    dbg && typeof dbg.errorCode === "string"
      ? dbg.errorCode
      : dbg && typeof dbg.error === "string"
        ? dbg.error
        : null;
  return {
    lastOAuthArchitecture: dbg && typeof dbg.architecture === "string" ? dbg.architecture : null,
    lastOAuthFlow: dbg && typeof dbg.flow === "string" ? dbg.flow : null,
    lastOAuthPhase: dbg && typeof dbg.phase === "string" ? dbg.phase : null,
    lastOAuthErrorCode: errorCode,
    exchangeFailureCategory:
      dbg && typeof dbg.exchangeFailureCategory === "string" ? dbg.exchangeFailureCategory : null,
    discoveryFailureCategory:
      dbg && typeof dbg.discoveryFailureCategory === "string" ? dbg.discoveryFailureCategory : null,
    discoveryMethod: dbg && typeof dbg.discoveryMethod === "string" ? dbg.discoveryMethod : null,
    codeCallbackReceived: dbg?.codeCallbackReceived === true,
    sessionEventReceived: dbg?.sessionEventReceived === true,
    completeSdkAttempted: dbg?.completeSdkAttempted === true,
    redirectUriSent:
      dbg?.redirectUriSent === true ? true : dbg?.redirectUriSent === false ? false : null,
    sessionEventName:
      sessionEvent && typeof sessionEvent.event === "string" ? sessionEvent.event : null,
  };
}

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

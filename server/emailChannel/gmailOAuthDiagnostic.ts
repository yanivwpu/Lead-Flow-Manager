/**
 * Safe Gmail OAuth diagnostics — never log tokens, codes, secrets, or email bodies.
 */

export const GMAIL_OAUTH_DIAG_TAG = "[Gmail-OAuth-Diagnostic]";

export type GmailOAuthDiagEvent =
  | "callback_received"
  | "token_exchange_started"
  | "token_exchange_ok"
  | "token_exchange_failed"
  | "profile_fetch_started"
  | "profile_fetch_ok"
  | "profile_fetch_failed"
  | "mailbox_persist_started"
  | "mailbox_persist_ok"
  | "mailbox_persist_failed"
  | "callback_failed";

export type GmailOAuthErrorCategory =
  | "profile_api_401"
  | "profile_api_403"
  | "gmail_api_disabled"
  | "token_exchange_failed"
  | "profile_response_invalid"
  | "mailbox_persist_failed"
  | "missing_refresh_token"
  | "invalid_or_expired_oauth_state"
  | "mailbox_already_connected"
  | "oauth_failed";

export class GmailOAuthDiagnosticError extends Error {
  readonly category: GmailOAuthErrorCategory;
  readonly httpStatus?: number;
  readonly googleErrorCode?: string | number | null;
  readonly googleErrorMessage?: string | null;

  constructor(
    category: GmailOAuthErrorCategory,
    message: string,
    extras?: {
      httpStatus?: number;
      googleErrorCode?: string | number | null;
      googleErrorMessage?: string | null;
    },
  ) {
    super(message);
    this.name = "GmailOAuthDiagnosticError";
    this.category = category;
    this.httpStatus = extras?.httpStatus;
    this.googleErrorCode = extras?.googleErrorCode ?? null;
    this.googleErrorMessage = extras?.googleErrorMessage ?? null;
  }
}

const SENSITIVE_KEY =
  /^(access_token|refresh_token|id_token|code|client_secret|authorization|email_encryption_key)$/i;

/** Strip secrets from arbitrary objects before logging. */
export function sanitizeDiagPayload(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(k)) continue;
    if (typeof v === "string" && /ya29\.|1\/|GOCSPX-|eyJ/.test(v)) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function logGmailOAuthDiag(
  event: GmailOAuthDiagEvent,
  payload: Record<string, unknown> = {},
): void {
  console.error(GMAIL_OAUTH_DIAG_TAG, event, sanitizeDiagPayload(payload));
}

export type ParsedGoogleApiError = {
  httpStatus: number;
  googleErrorCode: string | number | null;
  googleErrorMessage: string | null;
  googleErrorStatus: string | null;
  googleErrorReason: string | null;
};

export function parseGoogleApiErrorBody(
  httpStatus: number,
  json: Record<string, unknown>,
): ParsedGoogleApiError {
  const err = (json.error && typeof json.error === "object" ? json.error : null) as Record<
    string,
    unknown
  > | null;
  const message =
    (typeof err?.message === "string" && err.message) ||
    (typeof json.error_description === "string" && json.error_description) ||
    (typeof json.message === "string" && json.message) ||
    null;
  const status = typeof err?.status === "string" ? err.status : null;
  const code =
    (typeof err?.code === "number" || typeof err?.code === "string" ? err.code : null) ??
    (typeof json.error === "string" ? json.error : null);

  let reason: string | null = null;
  const details = Array.isArray(err?.errors) ? err!.errors : null;
  if (details && details[0] && typeof details[0] === "object") {
    const r = (details[0] as Record<string, unknown>).reason;
    if (typeof r === "string") reason = r;
  }
  if (!reason && Array.isArray(err?.details)) {
    for (const d of err!.details as unknown[]) {
      if (d && typeof d === "object" && typeof (d as any).reason === "string") {
        reason = (d as any).reason;
        break;
      }
    }
  }

  return {
    httpStatus,
    googleErrorCode: code,
    googleErrorMessage: message ? String(message).slice(0, 400) : null,
    googleErrorStatus: status,
    googleErrorReason: reason,
  };
}

export function categorizeProfileFetchFailure(parsed: ParsedGoogleApiError): GmailOAuthErrorCategory {
  const blob = `${parsed.googleErrorMessage || ""} ${parsed.googleErrorReason || ""} ${parsed.googleErrorStatus || ""}`.toLowerCase();
  if (
    parsed.googleErrorReason === "accessNotConfigured" ||
    blob.includes("accessnotconfigured") ||
    blob.includes("has not been used") ||
    blob.includes("is disabled") ||
    blob.includes("api has not been enabled") ||
    blob.includes("gmail api has not been used")
  ) {
    return "gmail_api_disabled";
  }
  if (parsed.httpStatus === 401) return "profile_api_401";
  if (parsed.httpStatus === 403) return "profile_api_403";
  return "profile_api_403";
}

export function categoryFromUnknownError(err: unknown): GmailOAuthErrorCategory {
  if (err instanceof GmailOAuthDiagnosticError) return err.category;
  const msg = err instanceof Error ? err.message : String(err);
  if (/token exchange failed/i.test(msg)) return "token_exchange_failed";
  if (/refresh token/i.test(msg)) return "missing_refresh_token";
  if (/invalid or expired oauth state/i.test(msg)) return "invalid_or_expired_oauth_state";
  if (/already connected/i.test(msg)) return "mailbox_already_connected";
  if (/missing emailAddress|profile response invalid/i.test(msg)) return "profile_response_invalid";
  if (/Failed to load Gmail profile/i.test(msg)) return "profile_api_403";
  return "oauth_failed";
}

/** Human-readable toast line that still includes the diagnostic category. */
export function gmailOAuthErrorUiMessage(category: GmailOAuthErrorCategory, fallbackMessage?: string): string {
  const map: Record<GmailOAuthErrorCategory, string> = {
    profile_api_401: "Failed to load Gmail profile (profile_api_401)",
    profile_api_403: "Failed to load Gmail profile (profile_api_403)",
    gmail_api_disabled: "Failed to load Gmail profile (gmail_api_disabled)",
    token_exchange_failed: "Gmail token exchange failed (token_exchange_failed)",
    profile_response_invalid: "Gmail profile response invalid (profile_response_invalid)",
    mailbox_persist_failed: "Failed to save mailbox (mailbox_persist_failed)",
    missing_refresh_token: "Google did not return a refresh token (missing_refresh_token)",
    invalid_or_expired_oauth_state: "Invalid or expired OAuth state (invalid_or_expired_oauth_state)",
    mailbox_already_connected: "A mailbox is already connected (mailbox_already_connected)",
    oauth_failed: fallbackMessage
      ? `${fallbackMessage} (oauth_failed)`
      : "Gmail connection failed (oauth_failed)",
  };
  return map[category] || map.oauth_failed;
}

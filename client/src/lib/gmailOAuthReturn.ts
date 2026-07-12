/** Gmail OAuth callback query params appended by /api/integrations/email/gmail/callback redirect. */
export const GMAIL_OAUTH_CALLBACK_PARAMS = [
  "emailConnected",
  "emailError",
  "emailErrorMsg",
  "mailbox",
] as const;

export type GmailOAuthReturn =
  | { kind: "none" }
  | { kind: "success"; mailbox: string | null }
  | { kind: "error"; errorCategory: string; errorDetail: string };

export function parseGmailOAuthReturn(search: string): GmailOAuthReturn {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const connected = params.get("emailConnected");
  const emailError = params.get("emailError");
  const emailErrorMsg = params.get("emailErrorMsg");
  const mailbox = params.get("mailbox");

  if (connected === "1") {
    return {
      kind: "success",
      mailbox: mailbox ? safeDecodeURIComponent(mailbox) : null,
    };
  }
  if (emailError) {
    return {
      kind: "error",
      errorCategory: emailError,
      errorDetail: emailErrorMsg
        ? safeDecodeURIComponent(emailErrorMsg)
        : safeDecodeURIComponent(emailError),
    };
  }
  return { kind: "none" };
}

export function hasGmailOAuthCallbackParams(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return GMAIL_OAUTH_CALLBACK_PARAMS.some((key) => params.has(key));
}

/**
 * Remove Gmail OAuth callback params from the query string.
 * When OAuth callback params were present, also drop provider=email (OAuth redirect artifact).
 * Preserves unrelated params such as section=channels.
 */
export function stripGmailOAuthCallbackParams(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const hadOAuthCallback = hasGmailOAuthCallbackParams(search);

  for (const key of GMAIL_OAUTH_CALLBACK_PARAMS) {
    params.delete(key);
  }
  if (hadOAuthCallback && params.get("provider") === "email") {
    params.delete("provider");
  }

  const q = params.toString();
  return q ? `?${q}` : "";
}

/** Deep-link provider=email scrolls to the card; it must not force the connect modal open. */
export function shouldOpenEmailModalFromProviderDeepLink(_provider: string | null): boolean {
  return false;
}

/** OAuth return shows a toast; modal stays closed unless the user clicks Connect Gmail. */
export function shouldOpenEmailModalFromOAuthReturn(_result: GmailOAuthReturn): boolean {
  return false;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

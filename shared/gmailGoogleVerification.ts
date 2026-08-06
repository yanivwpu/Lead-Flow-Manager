/**
 * Client-configurable flags for Gmail Google OAuth verification UX.
 * Set VITE_GMAIL_GOOGLE_VERIFICATION_PENDING=false once Google marks the app verified.
 */

export function isGmailGoogleVerificationPending(envValue?: string | null): boolean {
  const raw = String(envValue ?? "true").trim().toLowerCase();
  if (["0", "false", "no", "off", "complete", "verified", "done"].includes(raw)) {
    return false;
  }
  return true;
}

/** Optional YouTube/Vimeo/hosted URL for the 20-second setup clip. Empty = hide. */
export function getGmailSetupVideoUrl(envValue?: string | null): string | null {
  const url = String(envValue ?? "").trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function shouldShowGmailVerificationGuidance(opts: {
  verificationPending: boolean;
  gmailUiConnected: boolean;
}): boolean {
  return opts.verificationPending && !opts.gmailUiConnected;
}

/** Friendly toast when user leaves Google OAuth without connecting during verification. */
export function gmailVerificationCancelHelpToast() {
  return {
    title: "Need help?",
    description:
      'Google may display an additional verification screen while our application review is in progress. Click "Advanced" then "Continue to WhachatCRM" to complete the connection.',
  } as const;
}

export function shouldShowGmailVerificationCancelHelp(opts: {
  verificationPending: boolean;
  errorCategory?: string | null;
  errorDetail?: string | null;
}): boolean {
  if (!opts.verificationPending) return false;
  const category = (opts.errorCategory || "").toLowerCase();
  const detail = `${opts.errorDetail || ""}`.toLowerCase();
  if (category === "oauth_failed") return true;
  return (
    detail.includes("access_denied") ||
    detail.includes("access denied") ||
    detail.includes("cancelled") ||
    detail.includes("canceled") ||
    detail.includes("denied")
  );
}

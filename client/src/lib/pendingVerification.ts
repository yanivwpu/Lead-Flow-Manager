export const CHECK_EMAIL_PATH = "/check-email";
export const PENDING_VERIFICATION_EMAIL_KEY = "whachat_pending_verification_email";
export const PENDING_VERIFICATION_SEND_KEY = "whachat_pending_verification_send";

export function rememberPendingVerificationEmail(email: string | null | undefined): void {
  if (typeof sessionStorage === "undefined") return;
  const value = String(email || "").trim();
  if (!value) return;
  try {
    sessionStorage.setItem(PENDING_VERIFICATION_EMAIL_KEY, value);
  } catch {
    /* private mode */
  }
}

export function readPendingVerificationEmail(): string {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return sessionStorage.getItem(PENDING_VERIFICATION_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

export function clearPendingVerificationEmail(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_VERIFICATION_EMAIL_KEY);
    sessionStorage.removeItem(PENDING_VERIFICATION_SEND_KEY);
  } catch {
    /* private mode */
  }
}

export function rememberPendingVerificationSend(ok: boolean): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_VERIFICATION_SEND_KEY, ok ? "ok" : "failed");
  } catch {
    /* private mode */
  }
}

export function consumePendingVerificationSend(): "ok" | "failed" | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_VERIFICATION_SEND_KEY);
    sessionStorage.removeItem(PENDING_VERIFICATION_SEND_KEY);
    if (raw === "ok" || raw === "failed") return raw;
    return null;
  } catch {
    return null;
  }
}

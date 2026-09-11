/**
 * Same-origin signup ↔ verification-tab coordination.
 * Never put tokens, emails, session ids, or other personal data in these messages.
 */

export const EMAIL_VERIFICATION_CHANNEL_NAME = "whachat-email-verification";
export const EMAIL_VERIFICATION_WAITER_KEY = "whachat_email_verify_waiter";
export const EMAIL_VERIFICATION_SIGNAL_KEY = "whachat_email_verify_signal";
export const EMAIL_VERIFICATION_WAITER_TTL_MS = 20_000;
export const EMAIL_VERIFICATION_ACK_WAIT_MS = 800;
export const CHECK_EMAIL_SESSION_POLL_MS = 4_000;

export const EMAIL_VERIFICATION_TAB_MESSAGE_TYPES = ["waiter-hello", "waiter-ack", "verified"] as const;
export type EmailVerificationTabMessageType = (typeof EMAIL_VERIFICATION_TAB_MESSAGE_TYPES)[number];
export type EmailVerificationTabMessage = { type: EmailVerificationTabMessageType };

export type EmailVerificationLinkFollowUp = "close-hint" | "continue";

const SAFE_TYPES = new Set<string>(EMAIL_VERIFICATION_TAB_MESSAGE_TYPES);

export function isSafeEmailVerificationTabMessage(raw: unknown): raw is EmailVerificationTabMessage {
  if (!raw || typeof raw !== "object") return false;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.type !== "string" || !SAFE_TYPES.has(rec.type)) return false;
  if ("token" in rec || "email" in rec || "userId" in rec || "session" in rec || "cookie" in rec) {
    return false;
  }
  return true;
}

export function emailVerificationTabMessage(type: EmailVerificationTabMessageType): EmailVerificationTabMessage {
  return { type };
}

export function isWaiterHeartbeatLive(
  raw: string | null | undefined,
  now: number,
  ttlMs = EMAIL_VERIFICATION_WAITER_TTL_MS,
): boolean {
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return now - ts >= 0 && now - ts <= ttlMs;
}

export function detectOriginalVerificationTab(input: {
  now: number;
  waiterHeartbeat?: string | null;
  receivedAck?: boolean;
}): boolean {
  return Boolean(input.receivedAck) || isWaiterHeartbeatLive(input.waiterHeartbeat, input.now);
}

export function decideVerificationLinkFollowUp(originalTabPresent: boolean): EmailVerificationLinkFollowUp {
  return originalTabPresent ? "close-hint" : "continue";
}

export function verificationContinuePath(sessionReady: boolean): "/app/inbox" | "/auth" {
  return sessionReady ? "/app/inbox" : "/auth";
}

/** Only script-opened tabs (window.opener) may be auto-closed. */
export function shouldAutoCloseVerificationTab(hasOpener: boolean): boolean {
  return hasOpener === true;
}

export function tryCloseScriptOpenedTab(win: {
  opener: unknown;
  close: () => void;
}): boolean {
  if (!win.opener) return false;
  try {
    win.close();
    return true;
  } catch {
    return false;
  }
}

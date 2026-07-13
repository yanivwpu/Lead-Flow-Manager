/**
 * Gmail Pub/Sub / users.watch configuration — fail soft when unset (polling continues).
 */

export type GmailPubSubConfig = {
  topicName: string;
  audience: string;
  pushServiceAccount: string;
  configured: true;
};

export type GmailPubSubConfigResult =
  | GmailPubSubConfig
  | { configured: false; reason: string };

export function resolveGmailPubSubConfig(): GmailPubSubConfigResult {
  const topicName = String(process.env.GMAIL_PUBSUB_TOPIC || "").trim();
  const audience = String(process.env.GMAIL_PUBSUB_AUDIENCE || "").trim();
  const pushServiceAccount = String(process.env.GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT || "")
    .trim()
    .toLowerCase();

  if (!topicName) {
    return { configured: false, reason: "GMAIL_PUBSUB_TOPIC not set" };
  }
  if (!/^projects\/[^/]+\/topics\/[^/]+$/.test(topicName)) {
    return {
      configured: false,
      reason: "GMAIL_PUBSUB_TOPIC must be projects/<projectId>/topics/<topic>",
    };
  }
  if (!audience) {
    return { configured: false, reason: "GMAIL_PUBSUB_AUDIENCE not set" };
  }
  if (!pushServiceAccount || !pushServiceAccount.includes("@")) {
    return {
      configured: false,
      reason: "GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT must be a service-account email",
    };
  }

  return {
    configured: true,
    topicName,
    audience,
    pushServiceAccount,
  };
}

/** Renew watches when expiration is within this window. */
export const GMAIL_WATCH_RENEW_WITHIN_MS = 24 * 60 * 60 * 1000;

/** Fallback poll interval (Phase 1B default: 10 minutes). */
export const EMAIL_POLL_FALLBACK_INTERVAL_MS = Number(
  process.env.EMAIL_POLL_FALLBACK_INTERVAL_MS || 10 * 60 * 1000,
);

/** Sync lock lease — prevent stuck locks from blocking forever. */
export const EMAIL_SYNC_LOCK_LEASE_MS = Number(process.env.EMAIL_SYNC_LOCK_LEASE_MS || 120_000);

export function logGmailWatchEvent(
  event: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({ tag: "[GmailWatch]", event, ...fields }));
}

export function logGmailPushEvent(
  event: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({ tag: "[GmailPush]", event, ...fields }));
}

export function logGmailSyncTriggerEvent(
  event: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({ tag: "[GmailSyncTrigger]", event, ...fields }));
}

/**
 * TEMPORARY Phase 1B E2E diagnostics for Railway production push failure triage.
 * Safe fields only — never log tokens, JWTs, Authorization headers, or message bodies.
 */
export type GmailPushE2EEvent =
  | "route_registered"
  | "watch_state"
  | "webhook_http_received"
  | "jwt_verified"
  | "jwt_rejected"
  | "notification_decoded"
  | "mailbox_matched"
  | "mailbox_not_found"
  | "trigger_requested"
  | "lease_acquired"
  | "lease_deferred"
  | "history_started"
  | "history_result"
  | "message_persisted"
  | "inbox_row_result";

/**
 * Railway structured logs require a `message` field for text search/display.
 * Plain EmailRouteBootProbe strings worked; JSON-only { tag, event } without
 * `message` is parsed as structured JSON but is not found by searching [GmailPushE2E].
 */
export function logGmailPushE2EEvent(
  event: GmailPushE2EEvent,
  fields: Record<string, unknown> = {},
): void {
  const message = `[GmailPushE2E] ${event}`;
  const payload = {
    message,
    level: "info",
    tag: "[GmailPushE2E]",
    event,
    at: new Date().toISOString(),
    ...fields,
  };
  // Structured (Railway indexes `message`) + plain stderr twin (same pattern as EmailRouteBootProbe).
  console.log(JSON.stringify(payload));
  console.error(message);
  // #region agent log
  fetch("http://127.0.0.1:7693/ingest/2f005315-cdf4-402a-a15b-868ee3486ee2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "32aec0",
    },
    body: JSON.stringify({
      sessionId: "32aec0",
      hypothesisId: String(fields.hypothesisId || event),
      location: `gmailPushE2E:${event}`,
      message: event,
      data: fields,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

/** Prefer the numerically newer Gmail historyId; never move backward. */
export function preferNewerHistoryId(
  current: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const cur = current != null ? String(current) : null;
  const next = incoming != null ? String(incoming) : null;
  if (!next) return cur;
  if (!cur) return next;
  if (/^\d+$/.test(cur) && /^\d+$/.test(next)) {
    try {
      return BigInt(next) > BigInt(cur) ? next : cur;
    } catch {
      return cur;
    }
  }
  return next;
}

/** Redact email for logs: keep domain only. */
export function redactEmailForLog(email: string | null | undefined): string | null {
  const v = String(email || "")
    .trim()
    .toLowerCase();
  if (!v || !v.includes("@")) return null;
  return `***@${v.split("@")[1]}`;
}

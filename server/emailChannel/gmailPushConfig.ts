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

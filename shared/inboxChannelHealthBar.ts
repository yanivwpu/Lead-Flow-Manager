/**
 * Unified Inbox top channel-health indicators — display order + Email status mapping.
 * Status for Email mirrors Settings (`/api/integrations/email/status` / mailbox syncStatus).
 */

export const INBOX_CHANNEL_HEALTH_ORDER = [
  "whatsapp",
  "facebook",
  "instagram",
  "telegram",
  "tiktok",
  "email",
] as const;

export type InboxChannelHealthKey = (typeof INBOX_CHANNEL_HEALTH_ORDER)[number];

export const INBOX_CHANNEL_HEALTH_LABELS: Record<InboxChannelHealthKey, string> = {
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  instagram: "Instagram",
  telegram: "Telegram",
  tiktok: "TikTok",
  email: "Email",
};

export type InboxChannelHealthLike = {
  channel: string;
  isConnected: boolean;
  isEnabled: boolean;
  pageName: string | null;
  healthy: boolean | null;
  issues: string[];
  warnings?: string[];
  healthState?: "healthy" | "degraded" | "unhealthy" | "unknown";
  checks?: Record<string, unknown>;
};

export type EmailStatusForHealth = {
  connected: boolean;
  mailbox: {
    emailAddress?: string | null;
    syncStatus?: string | null;
    syncError?: string | null;
  } | null;
};

const EMPTY_CHECKS = {
  tokenValid: null,
  tokenScopes: null,
  missingScopes: null,
  pageAccessible: null,
  subscriptionOk: null,
  subscriptionFields: null,
};

/** Map Settings email mailbox status → channel-health entry (no hardcoding connected). */
export function emailStatusToChannelHealthEntry(
  status: EmailStatusForHealth,
): InboxChannelHealthLike {
  if (!status.connected || !status.mailbox) {
    return {
      channel: "email",
      isConnected: false,
      isEnabled: false,
      pageName: null,
      healthy: null,
      issues: [],
      warnings: [],
      healthState: "unknown",
      checks: { ...EMPTY_CHECKS },
    };
  }

  const sync = String(status.mailbox.syncStatus || "");
  const needsAttention = sync === "needs_reconnect" || sync === "error";
  const syncingOrOk = sync === "connected" || sync === "syncing";

  return {
    channel: "email",
    isConnected: true,
    isEnabled: true,
    pageName: status.mailbox.emailAddress ?? null,
    healthy: needsAttention ? false : syncingOrOk ? true : null,
    issues: needsAttention
      ? [status.mailbox.syncError || "Reconnect Gmail in Settings"]
      : [],
    warnings: [],
    healthState: needsAttention ? "unhealthy" : syncingOrOk ? "healthy" : "unknown",
    checks: { ...EMPTY_CHECKS },
  };
}

/** Build ordered rows for the Inbox health bar (missing → not configured). */
export function buildInboxChannelHealthRows(
  channelHealth: InboxChannelHealthLike[],
): InboxChannelHealthLike[] {
  const healthMap = new Map(channelHealth.map((ch) => [ch.channel, ch]));
  return INBOX_CHANNEL_HEALTH_ORDER.map(
    (key) =>
      healthMap.get(key) ?? {
        channel: key,
        isConnected: false,
        isEnabled: false,
        pageName: null,
        healthy: null,
        issues: [],
        warnings: [],
        healthState: "unknown" as const,
        checks: { ...EMPTY_CHECKS },
      },
  );
}

export function inboxChannelHealthDotState(ch: InboxChannelHealthLike): {
  connected: boolean;
  warning: boolean;
  unhealthy: boolean;
} {
  const isDegraded =
    ch.isConnected &&
    ch.healthy !== false &&
    (ch.healthState === "degraded" || (!!ch.warnings && ch.warnings.length > 0));
  return {
    connected: ch.isConnected && ch.healthy === true && !isDegraded,
    warning: Boolean(ch.isConnected && (ch.healthy === false || isDegraded)),
    unhealthy: Boolean(ch.isConnected && ch.healthy === false),
  };
}

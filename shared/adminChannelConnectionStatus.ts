/** Admin users table — compact WA / FB / IG connection indicators from canonical fields. */

export type AdminChannelIndicatorState = "connected" | "attention" | "disconnected" | "error";

export type AdminChannelIndicator = {
  state: AdminChannelIndicatorState;
  tooltip: string;
};

export type AdminUserChannelConnections = {
  whatsapp: AdminChannelIndicator;
  facebook: AdminChannelIndicator;
  instagram: AdminChannelIndicator;
  hasAnyChannel: boolean;
  noChannelsConnected: boolean;
  whatsappConnected: boolean;
  needsAttention: boolean;
};

export type AdminWhatsAppUserFields = {
  whatsappProvider?: string | null;
  metaConnected?: boolean | null;
  metaIntegrationStatus?: string | null;
  metaWebhookSubscribed?: boolean | null;
  metaLastErrorCode?: string | null;
  metaLastErrorMessage?: string | null;
  metaTokenExpiresAt?: Date | string | null;
  metaVerifiedName?: string | null;
  metaDisplayPhoneNumber?: string | null;
  twilioConnected?: boolean | null;
  twilioWhatsappNumber?: string | null;
};

export type AdminChannelSettingRow = {
  channel: string;
  isConnected?: boolean | null;
  isEnabled?: boolean | null;
  config?: unknown;
};

function cfgString(cfg: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = cfg[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function cfgHasToken(cfg: Record<string, unknown>): boolean {
  return !!(
    cfgString(cfg, "accessToken", "pageAccessToken", "page_access_token") ||
    cfgString(cfg, "access_token")
  );
}

function channelConfig(row: AdminChannelSettingRow | undefined): Record<string, unknown> {
  if (!row?.config || typeof row.config !== "object" || Array.isArray(row.config)) return {};
  return row.config as Record<string, unknown>;
}

function isTokenExpired(expiresAt: Date | string | null | undefined): boolean {
  if (!expiresAt) return false;
  const t = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

export function deriveAdminWhatsAppIndicator(user: AdminWhatsAppUserFields): AdminChannelIndicator {
  const provider = (user.whatsappProvider || "twilio").toLowerCase();

  if (provider === "twilio") {
    if (user.twilioConnected) {
      const num = user.twilioWhatsappNumber ? ` (${user.twilioWhatsappNumber})` : "";
      return { state: "connected", tooltip: `WhatsApp connected via Twilio${num}` };
    }
    return { state: "disconnected", tooltip: "WhatsApp not connected" };
  }

  if (!user.metaConnected) {
    return { state: "disconnected", tooltip: "WhatsApp not connected" };
  }

  const status = (user.metaIntegrationStatus || "connected").toLowerCase();
  const errMsg = (user.metaLastErrorMessage || user.metaLastErrorCode || "").trim();

  if (status === "failed" || errMsg) {
    return {
      state: "error",
      tooltip: errMsg ? `WhatsApp error: ${errMsg}` : "WhatsApp connection failed",
    };
  }

  if (isTokenExpired(user.metaTokenExpiresAt)) {
    return { state: "error", tooltip: "WhatsApp error: access token expired" };
  }

  const green =
    provider === "meta" &&
    !!user.metaConnected &&
    status === "connected" &&
    !!user.metaWebhookSubscribed;

  if (green) {
    const label = user.metaVerifiedName || user.metaDisplayPhoneNumber;
    return {
      state: "connected",
      tooltip: label ? `WhatsApp connected: ${label}` : "WhatsApp connected",
    };
  }

  const reasons: string[] = [];
  if (status === "needs_attention") reasons.push("integration needs attention");
  if (!user.metaWebhookSubscribed) reasons.push("webhook not subscribed");
  if (status === "pending") reasons.push("setup pending");
  if (status === "disconnected") reasons.push("disconnected");

  return {
    state: "attention",
    tooltip: `WhatsApp needs attention${reasons.length ? `: ${reasons.join("; ")}` : ""}`,
  };
}

export function deriveAdminFacebookIndicator(
  row: AdminChannelSettingRow | undefined,
): AdminChannelIndicator {
  return deriveAdminMetaMessagingIndicator(row, "Facebook", "Page");
}

export function deriveAdminInstagramIndicator(
  row: AdminChannelSettingRow | undefined,
): AdminChannelIndicator {
  return deriveAdminMetaMessagingIndicator(row, "Instagram", "Account");
}

function deriveAdminMetaMessagingIndicator(
  row: AdminChannelSettingRow | undefined,
  label: "Facebook" | "Instagram",
  entityLabel: "Page" | "Account",
): AdminChannelIndicator {
  if (!row?.isConnected) {
    return { state: "disconnected", tooltip: `${label} not connected` };
  }

  const cfg = channelConfig(row);
  const integrationStatus = cfgString(cfg, "integrationStatus", "status").toLowerCase() || "connected";
  const pageName = cfgString(cfg, "pageName", "page_name");
  const pageId = cfgString(cfg, "pageId", "page_id");
  const username = cfgString(cfg, "instagramUsername", "instagram_username");
  const errMsg = cfgString(cfg, "lastErrorMessage", "errorMessage", "last_error_message");

  if (integrationStatus === "failed" || integrationStatus === "error") {
    return {
      state: "error",
      tooltip: errMsg ? `${label} error: ${errMsg}` : `${label} connection error`,
    };
  }

  const missingCredentials = !pageId || !cfgHasToken(cfg);
  const disabled = row.isEnabled === false;

  if (
    integrationStatus === "needs_attention" ||
    missingCredentials ||
    disabled
  ) {
    const parts: string[] = [];
    if (missingCredentials) parts.push("missing permissions or credentials");
    if (disabled) parts.push("channel disabled");
    if (integrationStatus === "needs_attention") parts.push("needs reconnect");
    return {
      state: "attention",
      tooltip: `${label} needs attention${parts.length ? `: ${parts.join("; ")}` : ""}`,
    };
  }

  if (label === "Instagram") {
    const display = username ? `@${username}` : pageName;
    return {
      state: "connected",
      tooltip: display
        ? `Instagram connected: ${entityLabel} ${display}`
        : "Instagram connected",
    };
  }

  return {
    state: "connected",
    tooltip: pageName ? `Facebook connected: ${entityLabel} ${pageName}` : "Facebook connected",
  };
}

export function deriveAdminUserChannelConnections(input: {
  user: AdminWhatsAppUserFields;
  channelSettings: AdminChannelSettingRow[];
}): AdminUserChannelConnections {
  const facebookRow = input.channelSettings.find((s) => s.channel === "facebook");
  const instagramRow = input.channelSettings.find((s) => s.channel === "instagram");

  const whatsapp = deriveAdminWhatsAppIndicator(input.user);
  const facebook = deriveAdminFacebookIndicator(facebookRow);
  const instagram = deriveAdminInstagramIndicator(instagramRow);

  const hasAnyChannel =
    whatsapp.state === "connected" ||
    facebook.state === "connected" ||
    instagram.state === "connected";

  const noChannelsConnected =
    whatsapp.state === "disconnected" &&
    facebook.state === "disconnected" &&
    instagram.state === "disconnected";

  const needsAttention =
    whatsapp.state === "attention" ||
    whatsapp.state === "error" ||
    facebook.state === "attention" ||
    facebook.state === "error" ||
    instagram.state === "attention" ||
    instagram.state === "error";

  return {
    whatsapp,
    facebook,
    instagram,
    hasAnyChannel,
    noChannelsConnected,
    whatsappConnected: whatsapp.state === "connected",
    needsAttention,
  };
}

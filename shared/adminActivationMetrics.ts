import { isExcludedFromActivationEmails } from "./activationEmailEligibility";

/** Customer messaging channels that count toward activation metrics. */
export const REAL_ACTIVATION_CHANNELS = [
  "whatsapp",
  "instagram",
  "facebook",
  "shopify",
  "gohighlevel",
] as const;

export type RealActivationChannel = (typeof REAL_ACTIVATION_CHANNELS)[number];

export type ActivationMessageProvider = "WhatsApp" | "Facebook" | "Instagram" | "Shopify" | "GHL" | "Unknown";

export type ActivationBillingBadge = "free" | "trial" | "paid" | "canceled" | "expired";

export type ActivationChannelConnections = {
  whatsappConnected: boolean;
  facebookConnected: boolean;
  instagramConnected: boolean;
  shopifyConnected: boolean;
  ghlConnected: boolean;
  hasAnyActivationChannel: boolean;
};

export const ACTIVATION_WARNING_MESSAGES_WITHOUT_CHANNEL =
  "Messages without connected channel" as const;

/** Internal/demo/seed accounts excluded from activation metrics. */
export function isExcludedActivationAccount(email: string | null | undefined): boolean {
  if (!email) return true;
  const lower = email.trim().toLowerCase();
  if (lower === "demo@whachat.com") return true;
  return isExcludedFromActivationEmails(email);
}

/** Test/demo contacts excluded from message counts. */
export function isExcludedActivationContact(contact: { notes?: string | null }): boolean {
  const notes = (contact.notes || "").toLowerCase();
  if (notes.includes("test lead")) return true;
  if (notes.includes("this is a test")) return true;
  return false;
}

export function isRealActivationChannel(channel: string | null | undefined): channel is RealActivationChannel {
  if (!channel) return false;
  return (REAL_ACTIVATION_CHANNELS as readonly string[]).includes(channel.toLowerCase());
}

export function activationMessageProviderLabel(
  channel: string | null | undefined,
): ActivationMessageProvider {
  switch ((channel || "").toLowerCase()) {
    case "whatsapp":
      return "WhatsApp";
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "shopify":
      return "Shopify";
    case "gohighlevel":
      return "GHL";
    default:
      return "Unknown";
  }
}

export function deriveActivationChannelConnections(input: {
  user: {
    id: string;
    shopifyShop?: string | null;
    shopifyInstalledAt?: Date | string | null;
    shopifyAccessToken?: string | null;
  };
  whatsappConnected: boolean;
  facebookConnected: boolean;
  instagramConnected: boolean;
  ghlUserIds: Set<string>;
}): ActivationChannelConnections {
  const shopifyConnected = !!(
    input.user.shopifyShop &&
    (input.user.shopifyInstalledAt || input.user.shopifyAccessToken)
  );
  const ghlConnected = input.ghlUserIds.has(input.user.id);

  return {
    whatsappConnected: input.whatsappConnected,
    facebookConnected: input.facebookConnected,
    instagramConnected: input.instagramConnected,
    shopifyConnected,
    ghlConnected,
    hasAnyActivationChannel:
      input.whatsappConnected ||
      input.facebookConnected ||
      input.instagramConnected ||
      shopifyConnected ||
      ghlConnected,
  };
}

export function isActivationChannelConnected(
  channel: string,
  connections: ActivationChannelConnections,
): boolean {
  switch (channel.toLowerCase()) {
    case "whatsapp":
      return connections.whatsappConnected;
    case "facebook":
      return connections.facebookConnected;
    case "instagram":
      return connections.instagramConnected;
    case "shopify":
      return connections.shopifyConnected;
    case "gohighlevel":
      return connections.ghlConnected;
    default:
      return false;
  }
}

export function deriveActivationBillingBadge(
  user: {
    subscriptionStatus?: string | null;
    shopifySubscriptionStatus?: string | null;
    trialStatus?: string | null;
  },
  billing: { isPaidSubscriber: boolean; isProTrial: boolean },
): ActivationBillingBadge {
  if (billing.isPaidSubscriber) return "paid";
  if (billing.isProTrial) return "trial";
  if ((user.trialStatus || "").toLowerCase() === "expired") return "expired";

  const sub = (user.subscriptionStatus || "").toLowerCase();
  const shopifySub = (user.shopifySubscriptionStatus || "").toLowerCase();
  if (
    sub === "canceled" ||
    sub === "cancelled" ||
    shopifySub === "cancelled" ||
    shopifySub === "canceled"
  ) {
    return "canceled";
  }

  return "free";
}

export type ChannelMessageCounts = {
  sent: number;
  received: number;
  lastAt: Date | string | null;
};

export type UserMessageActivationStats = {
  messagesSent: number;
  messagesReceived: number;
  funnelSent: number;
  funnelReceived: number;
  lastRealActivity: string | null;
  messageSources: ActivationMessageProvider[];
  unknownMessageSources: string[];
  warningFlags: string[];
};

export function buildUserMessageActivationStats(input: {
  channelCounts: Map<string, ChannelMessageCounts>;
  connections: ActivationChannelConnections;
  serializeDate: (value: unknown) => string | null;
}): UserMessageActivationStats {
  let messagesSent = 0;
  let messagesReceived = 0;
  let funnelSent = 0;
  let funnelReceived = 0;
  let lastRealActivity: string | null = null;
  const messageSources = new Set<ActivationMessageProvider>();
  const unknownMessageSources = new Set<string>();

  for (const [channel, counts] of input.channelCounts) {
    if (!isRealActivationChannel(channel)) {
      if ((counts.sent || 0) + (counts.received || 0) > 0) {
        unknownMessageSources.add(channel);
      }
      continue;
    }

    messagesSent += counts.sent || 0;
    messagesReceived += counts.received || 0;

    const provider = activationMessageProviderLabel(channel);
    if ((counts.sent || 0) + (counts.received || 0) > 0) {
      messageSources.add(provider);
    }

    const lastAt = input.serializeDate(counts.lastAt);
    if (lastAt && (!lastRealActivity || lastAt > lastRealActivity)) {
      lastRealActivity = lastAt;
    }

    if (isActivationChannelConnected(channel, input.connections)) {
      funnelSent += counts.sent || 0;
      funnelReceived += counts.received || 0;
    }
  }

  const warningFlags: string[] = [];
  if (
    messagesSent + messagesReceived > 0 &&
    funnelSent + funnelReceived === 0
  ) {
    warningFlags.push(ACTIVATION_WARNING_MESSAGES_WITHOUT_CHANNEL);
  }

  return {
    messagesSent,
    messagesReceived,
    funnelSent,
    funnelReceived,
    lastRealActivity,
    messageSources: [...messageSources].sort(),
    unknownMessageSources: [...unknownMessageSources].sort(),
    warningFlags,
  };
}

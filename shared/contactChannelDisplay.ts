import type { Channel } from "./schema";

/** Contact fields used to derive list/inbox channel labels (shared source of truth). */
export type ContactChannelFields = {
  primaryChannel?: string | null;
  primaryChannelOverride?: string | null;
  lastIncomingChannel?: string | null;
  source?: string | null;
  whatsappId?: string | null;
  instagramId?: string | null;
  facebookId?: string | null;
  telegramId?: string | null;
  phone?: string | null;
  ghlId?: string | null;
  customFields?: unknown;
};

export type ConversationChannelRef = { channel: string };

const MESSAGING_CHANNEL_ORDER: Channel[] = [
  "whatsapp",
  "instagram",
  "facebook",
  "sms",
  "webchat",
  "telegram",
  "gohighlevel",
];

export function isCommerceSourcedContact(contact: ContactChannelFields): boolean {
  if (contact.source === "shopify") return true;
  const cf = contact.customFields as Record<string, unknown> | null | undefined;
  return cf?.lastCommerceSource === "shopify";
}

/**
 * WhatsApp on a Shopify-imported contact may be phone stored as whatsappId — only treat as
 * messaging when the contact has actually conversed on WhatsApp (matches inbox send rules).
 */
function whatsappIsVerifiedMessaging(
  contact: ContactChannelFields,
  conversations?: ConversationChannelRef[],
): boolean {
  if (!contact.whatsappId) return false;
  if (!isCommerceSourcedContact(contact)) return true;
  if (contact.lastIncomingChannel === "whatsapp") return true;
  return conversations?.some((c) => c.channel === "whatsapp") ?? false;
}

function contactHasWebchatReachability(
  contact: ContactChannelFields,
  conversations?: ConversationChannelRef[],
): boolean {
  if (
    contact.lastIncomingChannel === "webchat" ||
    contact.primaryChannel === "webchat" ||
    contact.source === "webchat"
  ) {
    return true;
  }
  return conversations?.some((c) => c.channel === "webchat") ?? false;
}

/** Channels this contact can use for real messaging (aligned with UnifiedInbox reachability). */
export function getReachableMessagingChannels(
  contact: ContactChannelFields,
  conversations?: ConversationChannelRef[],
): Channel[] {
  const keys = new Set<string>();
  if (whatsappIsVerifiedMessaging(contact, conversations)) keys.add("whatsapp");
  if (contact.instagramId) keys.add("instagram");
  if (contact.facebookId) keys.add("facebook");
  if (contact.phone) keys.add("sms");
  if (contact.telegramId) keys.add("telegram");
  if (contact.ghlId) keys.add("gohighlevel");
  if (contactHasWebchatReachability(contact, conversations)) keys.add("webchat");
  return MESSAGING_CHANNEL_ORDER.filter((ch) => keys.has(ch));
}

/**
 * Label channel for Contacts list / exports — messaging channel if any, else Shopify for commerce-only, else null.
 */
export function getContactDisplayChannel(
  contact: ContactChannelFields,
  conversations?: ConversationChannelRef[],
): Channel | "shopify" | null {
  const reachable = getReachableMessagingChannels(contact, conversations);
  if (reachable.length > 0) {
    const override = contact.primaryChannelOverride as Channel | undefined;
    if (override && reachable.includes(override)) return override;

    const last = contact.lastIncomingChannel as Channel | undefined;
    if (last && reachable.includes(last)) return last;

    const primary = contact.primaryChannel as Channel | undefined;
    if (primary && reachable.includes(primary)) return primary;

    return reachable[0];
  }

  if (isCommerceSourcedContact(contact)) return "shopify";
  if (conversations?.some((c) => c.channel === "shopify")) return "shopify";
  return null;
}

export const CONTACT_DISPLAY_CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Messenger",
  sms: "SMS",
  webchat: "Web Chat",
  telegram: "Telegram",
  gohighlevel: "GoHighLevel",
  calendly: "Calendly",
  shopify: "Shopify",
};

export function getContactDisplayChannelLabel(channel: string | null): string {
  if (!channel) return "No channel";
  return CONTACT_DISPLAY_CHANNEL_LABELS[channel] ?? channel;
}

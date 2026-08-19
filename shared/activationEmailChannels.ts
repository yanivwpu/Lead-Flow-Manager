/**
 * Email-sequence suppression only.
 * Do not use this for GET /api/activation-status or ActivationSetupModal.
 *
 * TikTok lead ingestion is not a two-way Inbox messaging channel here.
 */
export const ACTIVATION_EMAIL_MESSAGING_CHANNELS = [
  "whatsapp",
  "facebook",
  "instagram",
  "email",
  "sms",
  "telegram",
  "webchat",
] as const;

export type ActivationEmailMessagingChannel = (typeof ACTIVATION_EMAIL_MESSAGING_CHANNELS)[number];

const CHANNEL_SET = new Set<string>(ACTIVATION_EMAIL_MESSAGING_CHANNELS);

export function isActivationEmailMessagingChannel(channel: string): boolean {
  return CHANNEL_SET.has(channel);
}

/** True when any qualifying Inbox messaging channel is connected. */
export function hasQualifyingMessagingChannelForActivationEmails(input: {
  canonicalWhatsAppConnected?: boolean;
  channels: Array<{ channel: string; isConnected?: boolean | null }>;
  nativeEmailMailboxConnected?: boolean;
}): boolean {
  if (input.canonicalWhatsAppConnected) return true;
  if (input.nativeEmailMailboxConnected) return true;
  return input.channels.some(
    (row) => !!row.isConnected && isActivationEmailMessagingChannel(row.channel),
  );
}

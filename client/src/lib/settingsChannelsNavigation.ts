/** Deep-link query params for Settings → Communication Channels (see Settings + ChannelSettings). */

export type SettingsChannelProvider = "whatsapp" | "instagram" | "facebook";

export function settingsChannelsQuery(opts?: { provider?: SettingsChannelProvider }): string {
  const q = new URLSearchParams();
  q.set("section", "channels");
  if (opts?.provider) q.set("provider", opts.provider);
  return q.toString();
}

/** Path + query for `/app/settings` channels section. */
export function settingsChannelsHref(opts?: { provider?: SettingsChannelProvider }): string {
  return `/app/settings?${settingsChannelsQuery(opts)}`;
}

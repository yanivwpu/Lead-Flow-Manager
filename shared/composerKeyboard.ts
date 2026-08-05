/**
 * Channel-aware composer keyboard mapping.
 * Chat channels: Enter sends. Email: Enter newlines; Ctrl/Cmd+Enter sends.
 */

export type ComposerKeyboardChannelKind = "email" | "chat";

export type ComposerEnterAction = "send" | "newline" | "ignore";

export type ComposerEnterDecision = {
  action: ComposerEnterAction;
  preventDefault: boolean;
};

/** Channels that use chat-style Enter-to-send (explicit list for docs/tests). */
export const COMPOSER_CHAT_CHANNELS = [
  "whatsapp",
  "facebook",
  "instagram",
  "telegram",
  "webchat",
  "web_chat",
  "sms",
  "messenger",
  "tiktok",
] as const;

export function resolveComposerKeyboardChannelKind(
  channel: string | null | undefined,
): ComposerKeyboardChannelKind {
  const normalized = String(channel || "").toLowerCase().trim();
  if (normalized === "email") return "email";
  return "chat";
}

export function isComposerEmailChannel(channel: string | null | undefined): boolean {
  return resolveComposerKeyboardChannelKind(channel) === "email";
}

/**
 * Resolve Enter-key behavior for the message composer.
 * Mobile: bare Enter never sends (virtual keyboard); Ctrl/Cmd+Enter still can.
 */
export function resolveComposerEnterAction(params: {
  channel: string | null | undefined;
  isMobile: boolean;
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  canSend: boolean;
}): ComposerEnterDecision {
  if (params.key !== "Enter") {
    return { action: "ignore", preventDefault: false };
  }

  const modSend = params.ctrlKey || params.metaKey;
  const kind = resolveComposerKeyboardChannelKind(params.channel);

  if (params.isMobile) {
    if (modSend) {
      if (!params.canSend) return { action: "ignore", preventDefault: false };
      return { action: "send", preventDefault: true };
    }
    return { action: "newline", preventDefault: false };
  }

  if (kind === "email") {
    if (modSend) {
      if (!params.canSend) return { action: "ignore", preventDefault: false };
      return { action: "send", preventDefault: true };
    }
    // Enter and Shift+Enter insert a newline (native textarea).
    return { action: "newline", preventDefault: false };
  }

  // Chat: Enter sends; Shift+Enter newlines. Ctrl/Cmd+Enter also sends (existing behavior).
  if (params.shiftKey) {
    return { action: "newline", preventDefault: false };
  }
  if (!params.canSend) {
    return { action: "ignore", preventDefault: false };
  }
  return { action: "send", preventDefault: true };
}

/** Subtle helper copy shown under the composer (desktop). */
export function composerKeyboardHelperText(channel: string | null | undefined): string {
  if (resolveComposerKeyboardChannelKind(channel) === "email") {
    return "Enter = New line • Ctrl+Enter = Send";
  }
  return "Enter = Send • Shift+Enter = New line";
}

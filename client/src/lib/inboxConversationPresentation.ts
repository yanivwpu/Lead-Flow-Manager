/**
 * Channel-adaptive presentation tokens for Unified Inbox center conversation.
 * Shared business logic stays in UnifiedInbox; only layout/chrome differs here.
 */

import type { CSSProperties } from "react";

export type ConversationLayoutMode = "email-document" | "chat-bubbles";

export type ChatChannelPresentation = {
  layout: ConversationLayoutMode;
  /** Messages scroller outer classes */
  scrollerClassName: string;
  scrollerStyle?: CSSProperties;
  /** Optional dim overlay over chat wallpaper */
  overlayClassName: string | null;
  /** Inner message list padding/gap */
  innerClassName: string;
  /** Composer strip / AIComposer presentation hint */
  composerLayout: "email" | "chat";
  /** Chat bubble shell (ignored for email-document) */
  bubbleMaxWidthClass: string;
};

const WA_WALLPAPER =
  'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")';

/** Chat bubble width — must NOT be applied to email document layout. */
export const CHAT_BUBBLE_MAX_WIDTH_CLASS =
  "max-w-[min(82vw,100%)] sm:max-w-[70%]";

/** Email document cards use the full center pane (no chat-bubble cap). */
export const EMAIL_DOCUMENT_MAX_WIDTH_CLASS = "w-full max-w-full min-w-0";

/** Assert helpers for tests / contracts. */
export const EMAIL_FORBIDDEN_BUBBLE_WIDTH = /sm:max-w-\[70%\]/;

export function normalizeInboxPresentationChannel(
  channel: string | null | undefined,
): string {
  return String(channel || "")
    .trim()
    .toLowerCase();
}

export function resolveConversationLayoutMode(
  channel: string | null | undefined,
): ConversationLayoutMode {
  return normalizeInboxPresentationChannel(channel) === "email"
    ? "email-document"
    : "chat-bubbles";
}

export function getConversationThreadChrome(
  channel: string | null | undefined,
): ChatChannelPresentation {
  const mode = resolveConversationLayoutMode(channel);
  if (mode === "email-document") {
    return {
      layout: "email-document",
      scrollerClassName: "flex-1 min-h-0 overflow-y-auto relative bg-slate-50",
      scrollerStyle: undefined,
      overlayClassName: null,
      innerClassName:
        "relative z-10 flex min-w-0 w-full max-w-full flex-col gap-4 p-3 sm:p-4 md:px-5 md:py-4",
      composerLayout: "email",
      bubbleMaxWidthClass: EMAIL_DOCUMENT_MAX_WIDTH_CLASS,
    };
  }

  return {
    layout: "chat-bubbles",
    scrollerClassName: "flex-1 overflow-y-auto relative",
    scrollerStyle: {
      backgroundImage: WA_WALLPAPER,
      backgroundRepeat: "repeat",
      backgroundSize: "400px",
    },
    overlayClassName: "absolute inset-0 bg-[#efeae2]/90 pointer-events-none",
    innerClassName: "relative z-10 flex min-w-0 flex-col gap-1.5 p-2 sm:p-3",
    composerLayout: "chat",
    bubbleMaxWidthClass: CHAT_BUBBLE_MAX_WIDTH_CLASS,
  };
}

/**
 * Familiar (not pixel-perfect) bubble chrome by chat channel.
 * WhatsApp keeps the existing green outbound / white inbound look.
 */
export function chatBubbleShellClassName(
  channel: string | null | undefined,
  opts: {
    isOutbound: boolean;
    tightPadding?: boolean;
    sending?: boolean;
  },
): string {
  const ch = normalizeInboxPresentationChannel(channel);
  const { isOutbound, tightPadding, sending } = opts;
  const pad = tightPadding ? "px-1.5 pt-0.5 pb-1" : "px-2.5 py-1.5 sm:px-3";
  const base = [
    "relative flex min-w-0 flex-col text-sm shadow-sm",
    CHAT_BUBBLE_MAX_WIDTH_CLASS,
    pad,
    sending ? "opacity-75" : "",
  ];

  if (ch === "instagram") {
    return [
      ...base,
      "rounded-2xl",
      isOutbound
        ? "bg-gradient-to-br from-violet-100 via-fuchsia-50 to-amber-50 text-gray-900 rounded-br-md"
        : "bg-white text-gray-900 rounded-bl-md border border-gray-100",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (ch === "facebook") {
    return [
      ...base,
      "rounded-2xl",
      isOutbound
        ? "bg-[#e7f3ff] text-gray-900 rounded-br-md"
        : "bg-white text-gray-900 rounded-bl-md border border-gray-100",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (ch === "sms") {
    return [
      ...base,
      "rounded-xl",
      isOutbound
        ? "bg-slate-800 text-white rounded-br-md"
        : "bg-white text-gray-900 rounded-bl-md border border-gray-200",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (ch === "telegram") {
    return [
      ...base,
      "rounded-xl",
      isOutbound
        ? "bg-[#dceeff] text-gray-900 rounded-br-md"
        : "bg-white text-gray-900 rounded-bl-md border border-gray-100",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (ch === "webchat" || ch === "gohighlevel") {
    return [
      ...base,
      "rounded-2xl",
      isOutbound
        ? "bg-emerald-50 text-gray-900 rounded-br-md border border-emerald-100"
        : "bg-white text-gray-900 rounded-bl-md border border-gray-100",
    ]
      .filter(Boolean)
      .join(" ");
  }

  // WhatsApp (default chat) — preserve familiar bubble look
  return [
    ...base,
    "rounded-lg",
    isOutbound
      ? "bg-[#d9fdd3] text-gray-900 rounded-tr-none"
      : "bg-white text-gray-900 rounded-tl-none",
  ]
    .filter(Boolean)
    .join(" ");
}

export function chatBubbleMetaTextClass(channel: string | null | undefined, isOutbound: boolean): string {
  const ch = normalizeInboxPresentationChannel(channel);
  if (ch === "sms" && isOutbound) return "text-[10px] text-white/70";
  return "text-[10px] text-gray-400";
}

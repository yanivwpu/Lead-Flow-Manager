/**
 * Channel-isolated composer textarea auto-grow bounds.
 * Email: comfortable reply height with a hard cap + internal scroll.
 * Chat (WhatsApp / IG / FB / SMS / …): compact existing behavior.
 */

import { isComposerEmailChannel } from "./composerKeyboard";

/** Chat composer — keep compact (WhatsApp-style). Do not change these. */
export const CHAT_COMPOSER_TEXTAREA_MIN_PX = 58;
export const CHAT_COMPOSER_TEXTAREA_MAX_PX = 160;

/** Email composer — initial ~120–150px; grow up to ~220–260px then scroll. */
export const EMAIL_COMPOSER_TEXTAREA_MIN_PX = 140;
export const EMAIL_COMPOSER_TEXTAREA_MAX_PX = 240;

export type ComposerTextareaKind = "email" | "chat";

export type ComposerTextareaBounds = {
  kind: ComposerTextareaKind;
  minPx: number;
  maxPx: number;
};

export type ComposerTextareaLayout = {
  heightPx: number;
  overflowY: "hidden" | "auto";
};

export function composerTextareaBounds(
  channel: string | null | undefined,
): ComposerTextareaBounds {
  if (isComposerEmailChannel(channel)) {
    return {
      kind: "email",
      minPx: EMAIL_COMPOSER_TEXTAREA_MIN_PX,
      maxPx: EMAIL_COMPOSER_TEXTAREA_MAX_PX,
    };
  }
  return {
    kind: "chat",
    minPx: CHAT_COMPOSER_TEXTAREA_MIN_PX,
    maxPx: CHAT_COMPOSER_TEXTAREA_MAX_PX,
  };
}

/**
 * Clamp measured content height into [min, max].
 * Beyond max, height stays fixed and the textarea must scroll internally.
 */
export function nextComposerTextareaLayout(
  contentScrollHeight: number,
  minPx: number,
  maxPx: number,
): ComposerTextareaLayout {
  const measured = Math.max(0, contentScrollHeight);
  const heightPx = Math.min(Math.max(measured, minPx), maxPx);
  return {
    heightPx,
    overflowY: measured > maxPx ? "auto" : "hidden",
  };
}

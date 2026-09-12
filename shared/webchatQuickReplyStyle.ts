/**
 * Ask Question / Send Message quick-reply chip colors.
 * Idle chips sit on a white surface — never use headerTextColor or raw light accents as text.
 */

import {
  contrastRatio,
  contrastTextForBackground,
  sanitizeWidgetHexColor,
  WEBCHAT_AA_CONTRAST_RATIO,
  WEBCHAT_FOREGROUND_ON_LIGHT,
  webchatFilledAccentStyle,
} from "./webchatWidgetBranding";

export const QUICK_REPLY_SURFACE = "#ffffff";
export const QUICK_REPLY_DISABLED_BG = "#f3f4f6";
export const QUICK_REPLY_DISABLED_FG = "#1f2937";
export const QUICK_REPLY_DISABLED_BORDER = "#d1d5db";
export const QUICK_REPLY_UI_CONTRAST = 3;

export type WebchatQuickReplyState = "idle" | "hover" | "focus" | "selected" | "disabled";

export type WebchatQuickReplyColors = {
  background: string;
  color: string;
  borderColor: string;
  opacity: number;
};

function hex(raw: string, fallback: string): string {
  return sanitizeWidgetHexColor(raw, fallback) || fallback;
}

/** Text on the white chip. Accent if it meets AA; otherwise dark gray. */
export function quickReplyIdleForeground(accentColor: string): string {
  const accent = hex(accentColor, "#10b981");
  if (contrastRatio(accent, QUICK_REPLY_SURFACE) >= WEBCHAT_AA_CONTRAST_RATIO) return accent;
  return WEBCHAT_FOREGROUND_ON_LIGHT;
}

/** Chip outline on white. Accent if it meets 3:1 UI contrast; otherwise dark gray. */
export function quickReplyIdleBorder(accentColor: string): string {
  const accent = hex(accentColor, "#10b981");
  if (contrastRatio(accent, QUICK_REPLY_SURFACE) >= QUICK_REPLY_UI_CONTRAST) return accent;
  return WEBCHAT_FOREGROUND_ON_LIGHT;
}

export function webchatQuickReplyTheme(accentColor: string): Record<WebchatQuickReplyState, WebchatQuickReplyColors> {
  const accent = hex(accentColor, "#10b981");
  const filled = webchatFilledAccentStyle(accent);
  const idleFg = quickReplyIdleForeground(accent);
  const idleBorder = quickReplyIdleBorder(accent);
  const idle: WebchatQuickReplyColors = {
    background: QUICK_REPLY_SURFACE,
    color: idleFg,
    borderColor: idleBorder,
    opacity: 1,
  };
  const hover: WebchatQuickReplyColors = {
    background: filled.background,
    color: filled.color,
    borderColor: filled.background,
    opacity: 1,
  };
  const selected: WebchatQuickReplyColors = {
    background: filled.background,
    color: filled.color,
    borderColor: filled.background,
    opacity: 1,
  };
  const disabled: WebchatQuickReplyColors = {
    background: QUICK_REPLY_DISABLED_BG,
    color: QUICK_REPLY_DISABLED_FG,
    borderColor: QUICK_REPLY_DISABLED_BORDER,
    opacity: 1,
  };
  return {
    idle,
    hover,
    focus: hover,
    selected,
    disabled,
  };
}

export function webchatQuickReplyCssVars(accentColor: string): Record<string, string> {
  const theme = webchatQuickReplyTheme(accentColor);
  return {
    "--qr-bg": theme.idle.background,
    "--qr-fg": theme.idle.color,
    "--qr-border": theme.idle.borderColor,
    "--qr-hover-bg": theme.hover.background,
    "--qr-hover-fg": theme.hover.color,
    "--qr-hover-border": theme.hover.borderColor,
    "--qr-selected-bg": theme.selected.background,
    "--qr-selected-fg": theme.selected.color,
    "--qr-selected-border": theme.selected.borderColor,
    "--qr-disabled-bg": theme.disabled.background,
    "--qr-disabled-fg": theme.disabled.color,
    "--qr-disabled-border": theme.disabled.borderColor,
  };
}

export const WEBCHAT_QUICK_REPLY_CLASS = "wcw-ask-qr";

export const WEBCHAT_QUICK_REPLY_CSS = [
  `.${WEBCHAT_QUICK_REPLY_CLASS}{background:var(--qr-bg);color:var(--qr-fg);border:1.5px solid var(--qr-border);opacity:1;}`,
  `.${WEBCHAT_QUICK_REPLY_CLASS}:hover:not(:disabled),.${WEBCHAT_QUICK_REPLY_CLASS}:focus-visible:not(:disabled){background:var(--qr-hover-bg);color:var(--qr-hover-fg);border-color:var(--qr-hover-border);}`,
  `.${WEBCHAT_QUICK_REPLY_CLASS}:focus-visible{outline:2px solid var(--qr-hover-fg);outline-offset:2px;}`,
  `.${WEBCHAT_QUICK_REPLY_CLASS}:disabled{background:var(--qr-disabled-bg);color:var(--qr-disabled-fg);border-color:var(--qr-disabled-border);opacity:1;cursor:not-allowed;}`,
  `.${WEBCHAT_QUICK_REPLY_CLASS}[data-selected="true"]{background:var(--qr-selected-bg);color:var(--qr-selected-fg);border-color:var(--qr-selected-border);opacity:1;}`,
].join("");

export function assertQuickReplyContrast(colors: WebchatQuickReplyColors): boolean {
  if (colors.opacity < 1) return false;
  return contrastRatio(colors.color, colors.background) >= WEBCHAT_AA_CONTRAST_RATIO;
}

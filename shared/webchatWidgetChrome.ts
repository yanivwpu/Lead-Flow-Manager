/**
 * Shared Website Chat chrome layout: launcher, teaser, open panel.
 * Used by public widget.js and the settings preview — one source of truth.
 */

import {
  NEUTRAL_WEBCHAT_BRANDING,
  contrastTextForBackground,
  resolvePublicWebchatPresentation,
  WEBCHAT_CORNER_PX,
  WEBCHAT_PANEL_WIDTH_PX,
  type PublicWebchatPresentation,
  type WebchatChatIcon,
} from "./webchatWidgetBranding";
import { NEUTRAL_WIDGET_COLOR, NEUTRAL_WIDGET_WELCOME } from "./webchatWidgetSettings";

export type WebchatChromeState = "collapsed" | "teaser" | "open";

export const WEBCHAT_CHAT_ICON_SVG: Record<WebchatChatIcon, string> = {
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  message:
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  support:
    '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
};

export const WEBCHAT_CLOSE_ICON_SVG =
  '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';

export type WebchatChromeLayout = {
  presentation: PublicWebchatPresentation;
  side: "left" | "right";
  launcherAriaLabel: string;
  launcherCss: string;
  launcherInnerCss: string;
  teaserCss: string;
  panelCss: string;
  headerCss: string;
  avatarCss: string;
  cornerPx: number;
  panelWidthPx: number;
  iconSvg: string;
  closeIconSvg: string;
};

export function buildWebchatChromeLayout(
  settings: Record<string, unknown>,
  opts?: {
    businessName?: string | null;
    companyName?: string | null;
    agentName?: string | null;
    chatGreeting?: string;
    appOrigin?: string;
    allowedLogoHttpsHosts?: string[];
  },
): WebchatChromeLayout {
  const presentation = resolvePublicWebchatPresentation({
    settings,
    businessName: opts?.businessName,
    companyName: opts?.companyName,
    agentName: opts?.agentName,
    chatGreeting: opts?.chatGreeting,
    appOrigin: opts?.appOrigin,
    allowedLogoHttpsHosts: opts?.allowedLogoHttpsHosts,
  });
  const side = presentation.position;
  const inset = side === "left" ? "left:20px;right:auto;" : "right:20px;left:auto;";
  const corner = WEBCHAT_CORNER_PX[presentation.cornerStyle];
  const width = WEBCHAT_PANEL_WIDTH_PX[presentation.panelWidth];
  const launcherRadius =
    presentation.launcherStyle === "circle" ? 999 : Math.max(8, corner);
  let launcherCss =
    `position:fixed;bottom:20px;${inset}z-index:2147483647;border:none;cursor:pointer;` +
    `background:${presentation.color};color:${contrastTextForBackground(presentation.color)};` +
    `box-shadow:0 4px 16px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center;` +
    `font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;` +
    `touch-action:manipulation;-webkit-tap-highlight-color:transparent;max-width:min(240px,calc(100vw - 40px));`;
  if (presentation.launcherStyle === "circle") {
    launcherCss += "width:56px;height:56px;border-radius:50%;padding:0;";
  } else if (presentation.launcherStyle === "pill") {
    launcherCss += `height:48px;border-radius:${launcherRadius}px;padding:0 16px;gap:8px;width:auto;`;
  } else {
    launcherCss +=
      `height:auto;min-height:52px;border-radius:${corner}px;padding:8px 12px;gap:8px;` +
      "width:min(220px,calc(100vw - 40px));justify-content:flex-start;text-align:left;";
  }
  const teaserCss =
    `position:fixed;bottom:90px;${inset}z-index:2147483646;background:#fff;` +
    `border-radius:${corner}px;box-shadow:0 4px 20px rgba(0,0,0,.16);padding:12px 14px;` +
    `max-width:min(260px,calc(100vw - 40px));font-size:13px;line-height:1.4;` +
    `font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111827;` +
    `overflow-wrap:anywhere;word-break:break-word;`;
  const panelCss =
    `position:fixed;bottom:90px;${inset}z-index:2147483646;` +
    `width:min(${width}px,calc(100vw - 32px));height:min(560px,calc(100vh - 110px));` +
    `border-radius:${corner}px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.22);` +
    `max-width:calc(100vw - 32px);`;
  const headerCss = `background:${presentation.color};color:${presentation.headerTextColor};`;
  const avatarCss = `border-radius:${presentation.cornerStyle === "square" ? "4px" : "999px"};`;
  return {
    presentation,
    side,
    launcherAriaLabel: `Open ${presentation.displayName}`,
    launcherCss,
    launcherInnerCss: "display:flex;align-items:center;gap:8px;min-width:0;max-width:100%;",
    teaserCss,
    panelCss,
    headerCss,
    avatarCss,
    cornerPx: corner,
    panelWidthPx: width,
    iconSvg: WEBCHAT_CHAT_ICON_SVG[presentation.chatIcon],
    closeIconSvg: WEBCHAT_CLOSE_ICON_SVG,
  };
}

export function webchatChromeFromUnknown(
  settings: unknown,
  businessName?: string | null,
  agentName?: string | null,
): WebchatChromeLayout {
  const s = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  return buildWebchatChromeLayout(s, { businessName, agentName });
}

export function defaultChromeSettings(): Record<string, unknown> {
  return {
    color: NEUTRAL_WIDGET_COLOR,
    welcomeMessage: NEUTRAL_WIDGET_WELCOME,
    position: "right",
    ...NEUTRAL_WEBCHAT_BRANDING,
  };
}

/** Settings preview sits in a relative box — public widget.js stays position:fixed. */
export function chromeCssForPreview(css: string, opts?: { panelFill?: boolean }): string {
  let next = css.replace(/position:fixed/g, "position:absolute").replace(/z-index:\d+/g, "z-index:3");
  if (opts?.panelFill) {
    next = next
      .replace(/height:min\(560px,calc\(100vh - 110px\)\)/, "height:calc(100% - 76px)")
      .replace(/bottom:90px/, "bottom:72px");
  }
  return next;
}

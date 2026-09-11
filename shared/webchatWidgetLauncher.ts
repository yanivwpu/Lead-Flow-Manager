/**
 * Visitor-safe launcher payload for /api/webchat/:id/settings.
 * Chrome CSS is computed from current tenant branding — never baked into /widget.js.
 */

import { sanitizePlainWidgetText } from "./webchatWidgetBranding";
import type { WebchatChromeLayout } from "./webchatWidgetChrome";
import { toVisitorSafePublicWebchatPayload } from "./webchatWidgetBranding";

export type VisitorSafeWidgetPageRule = {
  urlContains: string;
  greeting: string;
  prefilledMessage: string;
  suggestedQuestions: string[];
};

export type VisitorSafeWidgetLauncher = {
  triggerType: "always" | "delay" | "scroll" | "exit_intent";
  triggerDelaySeconds: number;
  triggerScrollPercent: number;
  showOnDesktop: boolean;
  showOnMobile: boolean;
  pageRules: VisitorSafeWidgetPageRule[];
  launcherCss: string;
  teaserCss: string;
  panelCss: string;
  iconSvg: string;
  closeIconSvg: string;
  launcherAriaLabel: string;
};

export function widgetTriggerConfig(settings: Record<string, unknown>): {
  triggerType: VisitorSafeWidgetLauncher["triggerType"];
  triggerDelaySeconds: number;
  triggerScrollPercent: number;
  showOnDesktop: boolean;
  showOnMobile: boolean;
} {
  const tt = settings.triggerType;
  const triggerType =
    tt === "delay" || tt === "scroll" || tt === "exit_intent" || tt === "always" ? tt : "always";
  const delayRaw = settings.triggerDelaySeconds;
  const scrollRaw = settings.triggerScrollPercent;
  return {
    triggerType,
    triggerDelaySeconds:
      typeof delayRaw === "number" && !Number.isNaN(delayRaw)
        ? Math.min(3600, Math.max(0, Math.floor(delayRaw)))
        : 5,
    triggerScrollPercent:
      typeof scrollRaw === "number" && !Number.isNaN(scrollRaw)
        ? Math.min(100, Math.max(1, Math.floor(scrollRaw)))
        : 50,
    showOnDesktop: settings.showOnDesktop !== false,
    showOnMobile: settings.showOnMobile !== false,
  };
}

export function visitorSafeWidgetPageRules(settings: Record<string, unknown>): VisitorSafeWidgetPageRule[] {
  const rules = Array.isArray(settings.pageRules) ? settings.pageRules : [];
  const out: VisitorSafeWidgetPageRule[] = [];
  for (const raw of rules) {
    const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const urlContains = sanitizePlainWidgetText(r.urlContains, 500);
    if (!urlContains) continue;
    const questions = Array.isArray(r.suggestedQuestions)
      ? r.suggestedQuestions
          .filter((q): q is string => typeof q === "string")
          .map((q) => sanitizePlainWidgetText(q, 200))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    out.push({
      urlContains,
      greeting: sanitizePlainWidgetText(r.greeting, 500),
      prefilledMessage: sanitizePlainWidgetText(r.prefilledMessage, 2000),
      suggestedQuestions: questions,
    });
    if (out.length >= 30) break;
  }
  return out;
}

export function toVisitorSafeWidgetLauncher(
  settings: Record<string, unknown>,
  chrome: WebchatChromeLayout,
): VisitorSafeWidgetLauncher {
  const trigger = widgetTriggerConfig(settings);
  return {
    ...trigger,
    pageRules: visitorSafeWidgetPageRules(settings),
    launcherCss: chrome.launcherCss,
    teaserCss: chrome.teaserCss,
    panelCss: chrome.panelCss,
    iconSvg: chrome.iconSvg,
    closeIconSvg: chrome.closeIconSvg,
    launcherAriaLabel: chrome.launcherAriaLabel,
  };
}

export function visitorRuntimeConfigFromPublicSettings(
  data: Record<string, unknown> | null | undefined,
  origin: string,
  widgetId: string,
): (VisitorSafeWidgetLauncher & {
  color: unknown;
  position: "left" | "right";
  welcomeMessage: unknown;
  widgetId: string;
  origin: string;
  launcherStyle: unknown;
  openBehavior: unknown;
  launcherLabel: unknown;
  displayName: unknown;
  teaserGreeting: unknown;
  logoUrl: unknown;
}) | null {
  if (!data || typeof data !== "object") return null;
  const L =
    data.launcher && typeof data.launcher === "object"
      ? (data.launcher as Partial<VisitorSafeWidgetLauncher>)
      : {};
  if (typeof L.launcherCss !== "string" || !L.launcherCss) return null;
  return {
    color: data.color,
    position: data.position === "left" ? "left" : "right",
    welcomeMessage: data.welcomeMessage,
    widgetId,
    origin,
    triggerType: L.triggerType || "always",
    triggerDelaySeconds: typeof L.triggerDelaySeconds === "number" ? L.triggerDelaySeconds : 5,
    triggerScrollPercent: typeof L.triggerScrollPercent === "number" ? L.triggerScrollPercent : 50,
    showOnDesktop: L.showOnDesktop !== false,
    showOnMobile: L.showOnMobile !== false,
    pageRules: Array.isArray(L.pageRules) ? L.pageRules : [],
    launcherStyle: data.launcherStyle,
    openBehavior: data.openBehavior,
    launcherCss: L.launcherCss,
    teaserCss: typeof L.teaserCss === "string" ? L.teaserCss : "",
    panelCss: typeof L.panelCss === "string" ? L.panelCss : "",
    launcherAriaLabel: typeof L.launcherAriaLabel === "string" ? L.launcherAriaLabel : "Open website chat",
    launcherLabel: data.launcherLabel,
    displayName: data.displayName,
    teaserGreeting: data.teaserGreeting,
    logoUrl: data.logoUrl || "",
    iconSvg: typeof L.iconSvg === "string" ? L.iconSvg : "",
    closeIconSvg: typeof L.closeIconSvg === "string" ? L.closeIconSvg : "",
  };
}

export function toVisitorSafeWebchatPublicBody(
  presentation: Parameters<typeof toVisitorSafePublicWebchatPayload>[0],
  settings: Record<string, unknown>,
  chrome: WebchatChromeLayout,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...toVisitorSafePublicWebchatPayload(presentation),
    launcher: toVisitorSafeWidgetLauncher(settings, chrome),
    ...(extra || {}),
  };
}

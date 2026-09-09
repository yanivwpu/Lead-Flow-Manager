/**
 * Tenant-controlled Website Chat launcher/branding.
 * Missing keys stay at defaults — never overwrite customized accounts.
 */

export const WEBCHAT_DEFAULT_DISPLAY_NAME = "Website chat";
export const WEBCHAT_DEFAULT_SUBTITLE = "We're here to help";
export const WEBCHAT_DEFAULT_LAUNCHER_LABEL = "Chat";

export const WEBCHAT_LAUNCHER_STYLES = ["circle", "pill", "card"] as const;
export const WEBCHAT_CORNER_STYLES = ["rounded", "soft", "square"] as const;
export const WEBCHAT_PANEL_WIDTHS = ["compact", "standard", "wide"] as const;
export const WEBCHAT_OPEN_BEHAVIORS = ["teaser", "direct"] as const;
export const WEBCHAT_CHAT_ICONS = ["chat", "message", "support"] as const;

export type WebchatLauncherStyle = (typeof WEBCHAT_LAUNCHER_STYLES)[number];
export type WebchatCornerStyle = (typeof WEBCHAT_CORNER_STYLES)[number];
export type WebchatPanelWidth = (typeof WEBCHAT_PANEL_WIDTHS)[number];
export type WebchatOpenBehavior = (typeof WEBCHAT_OPEN_BEHAVIORS)[number];
export type WebchatChatIcon = (typeof WEBCHAT_CHAT_ICONS)[number];

const HEX = /^#[0-9A-Fa-f]{6}$/;

export type WebchatBrandingSettings = {
  launcherStyle: WebchatLauncherStyle;
  launcherLabel: string;
  brandName: string;
  logoUrl: string;
  panelHeading: string;
  panelSubtitle: string;
  accentColor: string;
  headerTextColor: "auto" | string;
  cornerStyle: WebchatCornerStyle;
  panelWidth: WebchatPanelWidth;
  openBehavior: WebchatOpenBehavior;
  teaserGreeting: string;
  chatIcon: WebchatChatIcon;
};

export const NEUTRAL_WEBCHAT_BRANDING: WebchatBrandingSettings = {
  launcherStyle: "circle",
  launcherLabel: "",
  brandName: "",
  logoUrl: "",
  panelHeading: "",
  panelSubtitle: "",
  accentColor: "",
  headerTextColor: "auto",
  cornerStyle: "rounded",
  panelWidth: "standard",
  openBehavior: "teaser",
  teaserGreeting: "",
  chatIcon: "chat",
};

export function widgetTextContainsUnsafeMarkup(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  if (/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(raw)) return true;
  if (/javascript\s*:/i.test(raw)) return true;
  return false;
}

export function sanitizePlainWidgetText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  if (widgetTextContainsUnsafeMarkup(raw)) return "";
  return raw.slice(0, max).trim();
}

export function sanitizeWidgetHexColor(raw: unknown, fallback = ""): string {
  if (typeof raw !== "string") return fallback;
  const v = raw.trim();
  return HEX.test(v) ? v.toLowerCase() : fallback;
}

const FIRST_PARTY_RASTER_PATH =
  /^\/(?:objects\/uploads|uploads)\/[\w][\w-]*\.(jpg|jpeg|png|webp)$/i;

function hostnameIsBlocked(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (h.includes(":")) {
    if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  }
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export function sanitizeWidgetLogoUrl(
  raw: unknown,
  opts?: { allowedHttpsHosts?: string[] },
): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim().slice(0, 500);
  if (!s || s.includes("..") || s.includes("\\") || s.includes("<") || s.includes(">")) return "";
  const pathOnly = s.split("?")[0];
  if (FIRST_PARTY_RASTER_PATH.test(pathOnly) && !s.includes("://")) {
    return pathOnly;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password) return "";
    if (hostnameIsBlocked(u.hostname)) return "";
    const allowed = (opts?.allowedHttpsHosts || []).map((h) => h.toLowerCase()).filter(Boolean);
    if (!allowed.includes(u.hostname.toLowerCase())) return "";
    if (FIRST_PARTY_RASTER_PATH.test(u.pathname)) {
      return u.pathname;
    }
    if (!/\.(jpg|jpeg|png|webp)$/i.test(u.pathname)) return "";
    if (u.pathname.includes("..") || u.pathname.includes("//")) return "";
    return u.href.slice(0, 500);
  } catch {
    return "";
  }
}

export function widgetLogoAllowedHttpsHosts(urls: Array<string | undefined | null>): string[] {
  const hosts = new Set<string>();
  for (const raw of urls) {
    if (!raw || typeof raw !== "string") continue;
    for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      try {
        const u = new URL(part.includes("://") ? part : `https://${part}`);
        if (u.hostname && !hostnameIsBlocked(u.hostname)) hosts.add(u.hostname.toLowerCase());
      } catch {
        /* skip */
      }
    }
  }
  return [...hosts];
}

export function absoluteWidgetLogoUrl(
  logoUrl: string,
  appOrigin: string,
  opts?: { allowedHttpsHosts?: string[] },
): string {
  const cleaned = sanitizeWidgetLogoUrl(logoUrl, opts);
  if (!cleaned) return "";
  if (cleaned.startsWith("/")) {
    return `${appOrigin.replace(/\/$/, "")}${cleaned}`;
  }
  return cleaned;
}

function pickEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export function sanitizeWebchatBranding(
  raw: unknown,
  opts?: { allowedHttpsHosts?: string[] },
): WebchatBrandingSettings {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const headerRaw = typeof s.headerTextColor === "string" ? s.headerTextColor.trim().toLowerCase() : "auto";
  const headerTextColor =
    headerRaw === "auto" ? "auto" : sanitizeWidgetHexColor(headerRaw, "auto");
  return {
    launcherStyle: pickEnum(s.launcherStyle, WEBCHAT_LAUNCHER_STYLES, "circle"),
    launcherLabel: sanitizePlainWidgetText(s.launcherLabel, 40),
    brandName: sanitizePlainWidgetText(s.brandName, 80),
    logoUrl: sanitizeWidgetLogoUrl(s.logoUrl, { allowedHttpsHosts: opts?.allowedHttpsHosts }),
    panelHeading: sanitizePlainWidgetText(s.panelHeading, 80),
    panelSubtitle: sanitizePlainWidgetText(s.panelSubtitle, 80),
    accentColor: sanitizeWidgetHexColor(s.accentColor, ""),
    headerTextColor: headerTextColor === "auto" ? "auto" : headerTextColor,
    cornerStyle: pickEnum(s.cornerStyle, WEBCHAT_CORNER_STYLES, "rounded"),
    panelWidth: pickEnum(s.panelWidth, WEBCHAT_PANEL_WIDTHS, "standard"),
    openBehavior: pickEnum(s.openBehavior, WEBCHAT_OPEN_BEHAVIORS, "teaser"),
    teaserGreeting: sanitizePlainWidgetText(s.teaserGreeting, 200),
    chatIcon: pickEnum(s.chatIcon, WEBCHAT_CHAT_ICONS, "chat"),
  };
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const v = sanitizeWidgetHexColor(hex, "");
  if (!v) return null;
  return {
    r: parseInt(v.slice(1, 3), 16),
    g: parseInt(v.slice(3, 5), 16),
    b: parseInt(v.slice(5, 7), 16),
  };
}

export function contrastTextForBackground(hex: string): "#ffffff" | "#111827" {
  const rgb = hexToRgb(hex) || { r: 16, g: 185, b: 129 };
  const lin = [rgb.r, rgb.g, rgb.b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return L > 0.55 ? "#111827" : "#ffffff";
}

export function resolveWebchatDisplayName(input: {
  brandName?: string;
  businessName?: string | null;
}): string {
  const brand = sanitizePlainWidgetText(input.brandName, 80);
  if (brand) return brand;
  const biz = sanitizePlainWidgetText(input.businessName, 80);
  if (biz) return biz;
  return WEBCHAT_DEFAULT_DISPLAY_NAME;
}

export type PublicWebchatPresentation = {
  color: string;
  accentColor: string;
  welcomeMessage: string;
  chatGreeting: string;
  chatPrefill: string;
  suggestedQuestions: string[];
  ctaLabel: string;
  ctaUrl: string;
  displayName: string;
  panelHeading: string;
  panelSubtitle: string;
  logoUrl: string;
  headerTextColor: string;
  cornerStyle: WebchatCornerStyle;
  chatIcon: WebchatChatIcon;
  launcherStyle: WebchatLauncherStyle;
  launcherLabel: string;
  panelWidth: WebchatPanelWidth;
  openBehavior: WebchatOpenBehavior;
  teaserGreeting: string;
  position: "left" | "right";
};

export function resolvePublicWebchatPresentation(input: {
  settings: Record<string, unknown>;
  businessName?: string | null;
  chatGreeting?: string;
  chatPrefill?: string;
  suggestedQuestions?: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  allowedLogoHttpsHosts?: string[];
  appOrigin?: string;
}): PublicWebchatPresentation {
  const branding = sanitizeWebchatBranding(input.settings, {
    allowedHttpsHosts: input.allowedLogoHttpsHosts,
  });
  const color = sanitizeWidgetHexColor(input.settings.color, "#10b981") || "#10b981";
  const welcome =
    sanitizePlainWidgetText(input.settings.welcomeMessage, 500) || "Hi! How can we help you today?";
  const displayName = resolveWebchatDisplayName({
    brandName: branding.brandName,
    businessName: input.businessName,
  });
  const heading = branding.panelHeading || displayName;
  const subtitle = branding.panelSubtitle || WEBCHAT_DEFAULT_SUBTITLE;
  const headerText =
    branding.headerTextColor === "auto"
      ? contrastTextForBackground(color)
      : branding.headerTextColor;
  const position = input.settings.position === "left" ? "left" : "right";
  let visitorCta = "";
  const rawCta = typeof input.ctaUrl === "string" ? input.ctaUrl.trim() : "";
  if (rawCta) {
    try {
      const u = new URL(rawCta);
      if (u.protocol === "https:" || u.protocol === "http:") visitorCta = u.href.slice(0, 2000);
    } catch {
      visitorCta = "";
    }
  }
  return {
    color,
    accentColor: branding.accentColor || color,
    welcomeMessage: welcome,
    chatGreeting: sanitizePlainWidgetText(input.chatGreeting, 500) || welcome,
    chatPrefill: sanitizePlainWidgetText(input.chatPrefill, 2000),
    suggestedQuestions: (input.suggestedQuestions || [])
      .filter((q): q is string => typeof q === "string")
      .map((q) => sanitizePlainWidgetText(q, 200))
      .filter(Boolean)
      .slice(0, 8),
    ctaLabel: sanitizePlainWidgetText(input.ctaLabel, 80),
    ctaUrl: visitorCta,
    displayName,
    panelHeading: heading,
    panelSubtitle: subtitle,
    logoUrl: input.appOrigin
      ? absoluteWidgetLogoUrl(branding.logoUrl, input.appOrigin, {
          allowedHttpsHosts: input.allowedLogoHttpsHosts,
        })
      : branding.logoUrl,
    headerTextColor: headerText,
    cornerStyle: branding.cornerStyle,
    chatIcon: branding.chatIcon,
    launcherStyle: branding.launcherStyle,
    launcherLabel: branding.launcherLabel || WEBCHAT_DEFAULT_LAUNCHER_LABEL,
    panelWidth: branding.panelWidth,
    openBehavior: branding.openBehavior,
    teaserGreeting: branding.teaserGreeting || welcome,
    position,
  };
}

export const WEBCHAT_PANEL_WIDTH_PX: Record<WebchatPanelWidth, number> = {
  compact: 300,
  standard: 360,
  wide: 420,
};

export const WEBCHAT_CORNER_PX: Record<WebchatCornerStyle, number> = {
  rounded: 16,
  soft: 12,
  square: 4,
};

export const PUBLIC_WEBCHAT_PRESENTATION_KEYS = [
  "color",
  "accentColor",
  "welcomeMessage",
  "chatGreeting",
  "chatPrefill",
  "suggestedQuestions",
  "ctaLabel",
  "ctaUrl",
  "displayName",
  "panelHeading",
  "panelSubtitle",
  "logoUrl",
  "headerTextColor",
  "cornerStyle",
  "chatIcon",
  "launcherStyle",
  "launcherLabel",
  "panelWidth",
  "openBehavior",
  "teaserGreeting",
  "position",
] as const;

export function toVisitorSafePublicWebchatPayload(
  presentation: PublicWebchatPresentation,
): Record<(typeof PUBLIC_WEBCHAT_PRESENTATION_KEYS)[number], unknown> {
  return {
    color: presentation.color,
    accentColor: presentation.accentColor,
    welcomeMessage: presentation.welcomeMessage,
    chatGreeting: presentation.chatGreeting,
    chatPrefill: presentation.chatPrefill,
    suggestedQuestions: presentation.suggestedQuestions,
    ctaLabel: presentation.ctaLabel,
    ctaUrl: presentation.ctaUrl,
    displayName: presentation.displayName,
    panelHeading: presentation.panelHeading,
    panelSubtitle: presentation.panelSubtitle,
    logoUrl: presentation.logoUrl,
    headerTextColor: presentation.headerTextColor,
    cornerStyle: presentation.cornerStyle,
    chatIcon: presentation.chatIcon,
    launcherStyle: presentation.launcherStyle,
    launcherLabel: presentation.launcherLabel,
    panelWidth: presentation.panelWidth,
    openBehavior: presentation.openBehavior,
    teaserGreeting: presentation.teaserGreeting,
    position: presentation.position,
  };
}

export const WEBCHAT_BRANDING_TEXT_KEYS = [
  "welcomeMessage",
  "launcherLabel",
  "brandName",
  "panelHeading",
  "panelSubtitle",
  "teaserGreeting",
] as const;

export function firstUnsafeWidgetTextField(patch: Record<string, unknown>): string | null {
  for (const key of WEBCHAT_BRANDING_TEXT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key) && widgetTextContainsUnsafeMarkup(patch[key])) {
      return key;
    }
  }
  return null;
}

export const WEBCHAT_BRANDING_FIELD_KEYS = [
  "launcherStyle",
  "launcherLabel",
  "brandName",
  "logoUrl",
  "panelHeading",
  "panelSubtitle",
  "accentColor",
  "headerTextColor",
  "cornerStyle",
  "panelWidth",
  "openBehavior",
  "teaserGreeting",
  "chatIcon",
] as const;

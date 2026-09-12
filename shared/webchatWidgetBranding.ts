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
    if (u.username || u.password) return "";
    // Public widget settings re-absolutize /objects/uploads with APP_URL. The open
    // panel re-sanitizes that payload without allowedHttpsHosts — keep the path.
    if (
      (u.protocol === "https:" || u.protocol === "http:") &&
      FIRST_PARTY_RASTER_PATH.test(u.pathname)
    ) {
      return u.pathname;
    }
    if (u.protocol !== "https:") return "";
    if (hostnameIsBlocked(u.hostname)) return "";
    const allowed = (opts?.allowedHttpsHosts || []).map((h) => h.toLowerCase()).filter(Boolean);
    if (!allowed.includes(u.hostname.toLowerCase())) return "";
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

export const WEBCHAT_FOREGROUND_ON_LIGHT = "#111827";
export const WEBCHAT_FOREGROUND_ON_DARK = "#ffffff";
export const WEBCHAT_AA_CONTRAST_RATIO = 4.5;

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const v = sanitizeWidgetHexColor(hex, "");
  if (!v) return null;
  return {
    r: parseInt(v.slice(1, 3), 16),
    g: parseInt(v.slice(3, 5), 16),
    b: parseInt(v.slice(5, 7), 16),
  };
}

function srgbChannelToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex) || { r: 16, g: 185, b: 129 };
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const a = relativeLuminance(foregroundHex);
  const b = relativeLuminance(backgroundHex);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Dark or white foreground for an accent-colored surface so normal text meets WCAG AA (4.5:1).
 * Does not use headerTextColor — that control applies only to the header.
 */
export function contrastTextForBackground(hex: string): typeof WEBCHAT_FOREGROUND_ON_LIGHT | typeof WEBCHAT_FOREGROUND_ON_DARK {
  const bg = sanitizeWidgetHexColor(hex, "#10b981") || "#10b981";
  const dark = contrastRatio(WEBCHAT_FOREGROUND_ON_LIGHT, bg);
  const light = contrastRatio(WEBCHAT_FOREGROUND_ON_DARK, bg);
  if (dark >= WEBCHAT_AA_CONTRAST_RATIO && light >= WEBCHAT_AA_CONTRAST_RATIO) {
    return dark >= light ? WEBCHAT_FOREGROUND_ON_LIGHT : WEBCHAT_FOREGROUND_ON_DARK;
  }
  if (dark >= WEBCHAT_AA_CONTRAST_RATIO) return WEBCHAT_FOREGROUND_ON_LIGHT;
  if (light >= WEBCHAT_AA_CONTRAST_RATIO) return WEBCHAT_FOREGROUND_ON_DARK;
  return dark >= light ? WEBCHAT_FOREGROUND_ON_LIGHT : WEBCHAT_FOREGROUND_ON_DARK;
}

export function webchatFilledAccentStyle(backgroundHex: string): {
  background: string;
  color: typeof WEBCHAT_FOREGROUND_ON_LIGHT | typeof WEBCHAT_FOREGROUND_ON_DARK;
} {
  const background = sanitizeWidgetHexColor(backgroundHex, "#10b981") || "#10b981";
  return { background, color: contrastTextForBackground(background) };
}

/**
 * Canonical visitor accent: saved Branding accentColor, else legacy Appearance color.
 * Editor preview and the public widget must resolve this the same way.
 */
export function resolveWebchatAccentColor(input: {
  color?: unknown;
  accentColor?: unknown;
}): string {
  const primary = sanitizeWidgetHexColor(input.color, "#10b981") || "#10b981";
  const accent = sanitizeWidgetHexColor(input.accentColor, "");
  return accent || primary;
}

export type WebchatDisplayNameInput = {
  /** Explicitly saved Website Widget Business name / brandName. */
  brandName?: string | null;
  /**
   * Verified AI Brain / Business Profile company name only.
   * Never pass users.name, login name, email profile name, contact name,
   * or team-member identity here.
   */
  businessName?: string | null;
  /** Alias of businessName (verified company). */
  companyName?: string | null;
};

/**
 * Visitor-facing widget title.
 * Priority: saved widget brandName → verified company name → "Website chat".
 * Extra identity fields (ownerName, userName, email, contactName, teamMemberName)
 * are ignored even if present on the input object.
 */
export function resolveWebchatDisplayName(input: WebchatDisplayNameInput): string {
  const brand = sanitizePlainWidgetText(input.brandName, 80);
  if (brand) return brand;
  const company = sanitizePlainWidgetText(input.companyName ?? input.businessName, 80);
  if (company) return company;
  return WEBCHAT_DEFAULT_DISPLAY_NAME;
}

/** Verified company name from AI Brain / Business Profile — never users.name. */
export function pickVerifiedWebchatCompanyName(
  knowledge: { businessName?: string | null } | null | undefined,
): string {
  return sanitizePlainWidgetText(knowledge?.businessName, 80);
}

/**
 * Representative/agent name only when explicitly saved on Business Profile.
 * Does not fall back to users.name.
 */
export function pickExplicitWebchatAgentName(
  knowledge: { displayName?: string | null } | null | undefined,
): string {
  return sanitizePlainWidgetText(knowledge?.displayName, 80);
}

export function resolveWebchatAgentName(agentName?: string | null): string {
  return sanitizePlainWidgetText(agentName, 80);
}

export type PublicWebchatPresentation = {
  color: string;
  accentColor: string;
  accentForeground: string;
  welcomeMessage: string;
  chatGreeting: string;
  chatPrefill: string;
  suggestedQuestions: string[];
  ctaLabel: string;
  ctaUrl: string;
  displayName: string;
  brandName: string;
  agentName: string;
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
  companyName?: string | null;
  agentName?: string | null;
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
    companyName: input.companyName,
    businessName: input.businessName,
  });
  const agentName = resolveWebchatAgentName(input.agentName);
  const heading = branding.panelHeading || displayName;
  const subtitle = branding.panelSubtitle || WEBCHAT_DEFAULT_SUBTITLE;
  const headerText =
    branding.headerTextColor === "auto"
      ? contrastTextForBackground(color)
      : branding.headerTextColor;
  const accentColor = resolveWebchatAccentColor({
    color,
    accentColor: branding.accentColor,
  });
  const accentForeground = contrastTextForBackground(accentColor);
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
    accentColor,
    accentForeground,
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
    brandName: branding.brandName,
    agentName,
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

export const WEBCHAT_BRANDING_READY_MESSAGE_TYPE = "wcw-branding-ready";
export const WEBCHAT_BRANDING_MESSAGE_SOURCE = "wcw";

export type WebchatBrandingReadyMessage = {
  source: typeof WEBCHAT_BRANDING_MESSAGE_SOURCE;
  type: typeof WEBCHAT_BRANDING_READY_MESSAGE_TYPE;
  widgetId: string;
};

export function webchatBrandingReadyMessage(widgetId: string): WebchatBrandingReadyMessage {
  return {
    source: WEBCHAT_BRANDING_MESSAGE_SOURCE,
    type: WEBCHAT_BRANDING_READY_MESSAGE_TYPE,
    widgetId: String(widgetId || ""),
  };
}

export function isWebchatBrandingReadyMessage(data: unknown, widgetId: string): boolean {
  if (!data || typeof data !== "object") return false;
  const payload = data as Record<string, unknown>;
  return (
    payload.source === WEBCHAT_BRANDING_MESSAGE_SOURCE &&
    payload.type === WEBCHAT_BRANDING_READY_MESSAGE_TYPE &&
    String(payload.widgetId || "") === String(widgetId || "")
  );
}

export type WebchatSettingsLoadStatus = "loading" | "ready" | "failed";

export type WebchatPanelHeaderPaint =
  | { visible: false; color: null; headerTextColor: null; presentation: null }
  | {
      visible: true;
      color: string;
      headerTextColor: string;
      presentation: PublicWebchatPresentation;
    };

type WebchatPanelHeaderPaintInput = {
  settingsStatus: WebchatSettingsLoadStatus;
  settings?: Record<string, unknown> | null;
  businessName?: string | null;
  companyName?: string | null;
  agentName?: string | null;
  chatGreeting?: string;
  chatPrefill?: string;
  suggestedQuestions?: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  allowedLogoHttpsHosts?: string[];
  appOrigin?: string;
};

/**
 * Header paint for the public widget and editor preview.
 * While settings are still loading the panel must not use the default brand color.
 * The existing empty-settings fallback applies only after the request succeeds empty or fails.
 */
export function resolveWebchatPanelHeaderPaint(
  input: WebchatPanelHeaderPaintInput & { settingsStatus: "loading" },
): Extract<WebchatPanelHeaderPaint, { visible: false }>;
export function resolveWebchatPanelHeaderPaint(
  input: WebchatPanelHeaderPaintInput & { settingsStatus: "ready" | "failed" },
): Extract<WebchatPanelHeaderPaint, { visible: true }>;
export function resolveWebchatPanelHeaderPaint(input: WebchatPanelHeaderPaintInput): WebchatPanelHeaderPaint;
export function resolveWebchatPanelHeaderPaint(input: WebchatPanelHeaderPaintInput): WebchatPanelHeaderPaint {
  if (input.settingsStatus === "loading") {
    return { visible: false, color: null, headerTextColor: null, presentation: null };
  }
  const presentation = resolvePublicWebchatPresentation({
    settings: input.settingsStatus === "failed" || !input.settings ? {} : input.settings,
    businessName: input.businessName,
    companyName: input.companyName,
    agentName: input.agentName,
    chatGreeting: input.chatGreeting,
    chatPrefill: input.chatPrefill,
    suggestedQuestions: input.suggestedQuestions,
    ctaLabel: input.ctaLabel,
    ctaUrl: input.ctaUrl,
    allowedLogoHttpsHosts: input.allowedLogoHttpsHosts,
    appOrigin: input.appOrigin,
  });
  return {
    visible: true,
    color: presentation.color,
    headerTextColor: presentation.headerTextColor,
    presentation,
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
  "accentForeground",
  "welcomeMessage",
  "chatGreeting",
  "chatPrefill",
  "suggestedQuestions",
  "ctaLabel",
  "ctaUrl",
  "displayName",
  "brandName",
  "agentName",
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
    accentForeground: presentation.accentForeground,
    welcomeMessage: presentation.welcomeMessage,
    chatGreeting: presentation.chatGreeting,
    chatPrefill: presentation.chatPrefill,
    suggestedQuestions: presentation.suggestedQuestions,
    ctaLabel: presentation.ctaLabel,
    ctaUrl: presentation.ctaUrl,
    displayName: presentation.displayName,
    brandName: presentation.brandName,
    agentName: presentation.agentName,
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
  if (widgetTextContainsUnsafeMarkup(patch.inputPlaceholder)) return "inputPlaceholder";
  if (widgetTextContainsUnsafeMarkup(patch.offlineMessage)) return "offlineMessage";
  if (patch.localized && typeof patch.localized === "object") {
    for (const loc of ["en", "es", "he"]) {
      const fields = (patch.localized as Record<string, unknown>)[loc];
      if (!fields || typeof fields !== "object") continue;
      for (const value of Object.values(fields as Record<string, unknown>)) {
        if (widgetTextContainsUnsafeMarkup(value)) return "localized";
      }
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

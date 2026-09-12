/**
 * Website Chat chrome + static copy locale.
 * Independent of dashboard UI language and of AI reply language.
 */

import { parseLocalizedPath } from "./localeRoutes";

export const WIDGET_STATIC_LOCALES = ["en", "es", "he"] as const;
export type WidgetStaticLocale = (typeof WIDGET_STATIC_LOCALES)[number];

export type WidgetChromeCopy = {
  launcherLabel: string;
  launcherAriaLabel: string;
  closeAriaLabel: string;
  welcomeMessage: string;
  teaserGreeting: string;
  panelSubtitle: string;
  inputPlaceholder: string;
  attachAriaLabel: string;
  optionSelected: string;
  chatUnavailable: string;
  pollError: string;
  attachTypeError: string;
  attachSizeError: string;
  poweredBy: string;
};

export const WIDGET_CHROME_COPY: Record<WidgetStaticLocale, WidgetChromeCopy> = {
  en: {
    launcherLabel: "Let's Chat",
    launcherAriaLabel: "Open website chat",
    closeAriaLabel: "Close website chat",
    welcomeMessage: "Hi! How can we help you today?",
    teaserGreeting: "Hi! How can we help you today?",
    panelSubtitle: "We're here to help",
    inputPlaceholder: "Type a message…",
    attachAriaLabel: "Attach image",
    optionSelected: "Option selected",
    chatUnavailable: "Chat is unavailable.",
    pollError: "Couldn't refresh messages. Retrying…",
    attachTypeError: "Use a JPEG, PNG, or WebP image.",
    attachSizeError: "That image is too large.",
    poweredBy: "Powered by WhaChat",
  },
  es: {
    launcherLabel: "Chatea ahora",
    launcherAriaLabel: "Abrir el chat del sitio",
    closeAriaLabel: "Cerrar el chat del sitio",
    welcomeMessage: "¡Hola! ¿En qué podemos ayudarte hoy?",
    teaserGreeting: "¡Hola! ¿En qué podemos ayudarte hoy?",
    panelSubtitle: "Estamos para ayudarte",
    inputPlaceholder: "Escribe un mensaje…",
    attachAriaLabel: "Adjuntar imagen",
    optionSelected: "Opción seleccionada",
    chatUnavailable: "El chat no está disponible.",
    pollError: "No se pudieron actualizar los mensajes. Reintentando…",
    attachTypeError: "Usa una imagen JPEG, PNG o WebP.",
    attachSizeError: "Esa imagen es demasiado grande.",
    poweredBy: "Con tecnología de WhaChat",
  },
  he: {
    launcherLabel: "בואו נדבר",
    launcherAriaLabel: "פתח את הצ׳אט באתר",
    closeAriaLabel: "סגור את הצ׳אט באתר",
    welcomeMessage: "היי! איך אפשר לעזור לך היום?",
    teaserGreeting: "היי! איך אפשר לעזור לך היום?",
    panelSubtitle: "אנחנו כאן כדי לעזור",
    inputPlaceholder: "כתבו הודעה…",
    attachAriaLabel: "צרף תמונה",
    optionSelected: "האפשרות נבחרה",
    chatUnavailable: "הצ׳אט אינו זמין.",
    pollError: "לא ניתן לרענן הודעות. מנסים שוב…",
    attachTypeError: "יש להשתמש בתמונת JPEG, PNG או WebP.",
    attachSizeError: "התמונה גדולה מדי.",
    poweredBy: "מופעל על ידי WhaChat",
  },
};

const DEFAULT_ENGLISH_CHROME = new Set([
  "hi",
  "let's chat",
  "lets chat",
  "chat",
  "hi! how can we help you today?",
  "hi there! how can we help you today?",
  "we're here to help",
  "we’re here to help",
  "type a message…",
  "type a message...",
  "open website chat",
  "close website chat",
  "option selected",
  "chat is unavailable.",
  "chat is unavailable",
]);

export function isWidgetStaticLocale(value: string | null | undefined): value is WidgetStaticLocale {
  const base = String(value || "").trim().toLowerCase().split("-")[0];
  return base === "en" || base === "es" || base === "he";
}

export function normalizeWidgetStaticLocale(value: string | null | undefined): WidgetStaticLocale {
  const base = String(value || "").trim().toLowerCase().split("-")[0];
  if (base === "es" || base === "he") return base;
  return "en";
}

export function widgetLocaleFromHtmlLang(raw: string | null | undefined): WidgetStaticLocale | null {
  const base = String(raw || "").trim().toLowerCase().split("-")[0];
  if (base === "es" || base === "he" || base === "en") return base;
  return null;
}

export function widgetLocaleFromPathname(pathname: string | null | undefined): WidgetStaticLocale | null {
  const href = String(pathname || "").trim();
  if (!href) return null;
  try {
    const path = href.startsWith("http") ? new URL(href).pathname : href;
    const parsed = parseLocalizedPath(path);
    if (parsed.locale === "es" || parsed.locale === "he") return parsed.locale;
    if (parsed.locale === "en") return "en";
  } catch {
    const m = href.match(/\/(es|he)(?:\/|$)/i);
    if (m) return m[1].toLowerCase() as WidgetStaticLocale;
  }
  return null;
}

export function widgetLocaleFromBrowser(raw: string | null | undefined): WidgetStaticLocale | null {
  return widgetLocaleFromHtmlLang(raw);
}

export function resolveWidgetStaticLocale(input: {
  explicit?: string | null;
  htmlLang?: string | null;
  pathname?: string | null;
  browserLanguage?: string | null;
}): WidgetStaticLocale {
  if (isWidgetStaticLocale(input.explicit)) return normalizeWidgetStaticLocale(input.explicit);
  const fromHtml = widgetLocaleFromHtmlLang(input.htmlLang);
  if (fromHtml) return fromHtml;
  const fromPath = widgetLocaleFromPathname(input.pathname);
  if (fromPath) return fromPath;
  const fromBrowser = widgetLocaleFromBrowser(input.browserLanguage);
  if (fromBrowser) return fromBrowser;
  return "en";
}

export function widgetChromeDir(locale: string | null | undefined): "rtl" | "ltr" {
  const base = String(locale || "").trim().toLowerCase().split("-")[0];
  return base === "he" || base === "ar" ? "rtl" : "ltr";
}

export function messageTextDir(text: string | null | undefined): "rtl" | "ltr" | "auto" {
  const s = String(text || "");
  if (/[\u0590-\u05FF\u0600-\u06FF]/.test(s)) return "rtl";
  if (/[\u4E00-\u9FFF]/.test(s)) return "ltr";
  return "auto";
}

export function isDefaultEnglishChromeText(value: string | null | undefined): boolean {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return true;
  return DEFAULT_ENGLISH_CHROME.has(v);
}

export function localizeDefaultChromeText(
  value: string | null | undefined,
  locale: WidgetStaticLocale,
  key: keyof WidgetChromeCopy,
): string {
  const copy = WIDGET_CHROME_COPY[locale];
  if (isDefaultEnglishChromeText(value)) return copy[key];
  return String(value || "").trim() || copy[key];
}

export function widgetChromeCopyForLocale(locale: string | null | undefined): WidgetChromeCopy {
  return WIDGET_CHROME_COPY[normalizeWidgetStaticLocale(locale)];
}

/** Safe token for iframe / API query — never a secret. */
export function sanitizeWidgetLocaleParam(raw: unknown): string {
  const base = String(raw || "").trim().toLowerCase().split("-")[0];
  if (!base || !/^[a-z]{2,8}$/.test(base)) return "";
  return base.slice(0, 8);
}

export function localizeWebchatPresentationStrings<T extends {
  welcomeMessage?: string;
  chatGreeting?: string;
  launcherLabel?: string;
  panelSubtitle?: string;
  teaserGreeting?: string;
}>(presentation: T, locale: WidgetStaticLocale): T {
  const copy = WIDGET_CHROME_COPY[locale];
  return {
    ...presentation,
    welcomeMessage: localizeDefaultChromeText(presentation.welcomeMessage, locale, "welcomeMessage"),
    chatGreeting: localizeDefaultChromeText(presentation.chatGreeting, locale, "welcomeMessage"),
    launcherLabel: localizeDefaultChromeText(presentation.launcherLabel, locale, "launcherLabel"),
    panelSubtitle: localizeDefaultChromeText(presentation.panelSubtitle, locale, "panelSubtitle"),
    teaserGreeting: localizeDefaultChromeText(presentation.teaserGreeting, locale, "teaserGreeting"),
  };
}

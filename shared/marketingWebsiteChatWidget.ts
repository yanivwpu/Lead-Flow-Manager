/**
 * Official Website Chat widget on public marketing hosts only.
 * Uses the Website Widget script snippet (wgt_…) — no custom launcher or iframe UI.
 */

import { isWidgetPublicId } from "./opaquePublicToken";
import { normalizeAllowedOriginsList } from "./webchatOriginPolicy";
import { buildWebchatScriptSnippet } from "./webchatWidgetSnippet";

/** Public widget ID copied from Website Widget settings. */
export const MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID =
  "wgt_3c14a2d2a3f30565406e0a2a395c7dcc0903e0f4fba9d188";

export const MARKETING_WEBSITE_CHAT_WIDGET_BASE_URL = "https://app.whachatcrm.com";

export const MARKETING_WEBSITE_CHAT_HOSTS = ["whachatcrm.com", "www.whachatcrm.com"] as const;

/** Origins that must be allowlisted on this widget (apex + www are paired). */
export const MARKETING_WEBSITE_CHAT_ALLOWED_ORIGINS = normalizeAllowedOriginsList(
  ["https://www.whachatcrm.com", "https://whachatcrm.com"],
  { nodeEnv: "production" },
);

export const MARKETING_WEBSITE_CHAT_SUPPRESS_CLASS = "wcs-marketing-chat-suppressed";

export const MARKETING_WEBSITE_CHAT_WIDGET_SNIPPET = buildWebchatScriptSnippet({
  baseUrl: MARKETING_WEBSITE_CHAT_WIDGET_BASE_URL,
  widgetPublicId: MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID,
});

const EXCLUDED_PATH_PREFIXES = [
  "/app",
  "/sales-admin",
  "/sales-portal",
  "/partner-portal",
  "/widget-frame",
  "/chat",
  "/shopify",
] as const;

type ScriptLike = {
  src: string;
  async: boolean;
  setAttribute: (name: string, value: string) => void;
  getAttribute?: (name: string) => string | null;
};

export type MarketingChatWidgetDom = {
  documentElement: {
    className: string;
    classList: {
      add: (name: string) => void;
      remove: (name: string) => void;
    };
  };
  head: { appendChild: (node: ScriptLike) => void };
  querySelectorAll: (selector: string) => ArrayLike<ScriptLike>;
  createElement: (tagName: string) => ScriptLike;
};

export type MarketingChatWidgetWindow = {
  WhachatWidget?: string;
};

export type MarketingWebsiteChatWidgetLocation = {
  hostname: string;
  pathname: string;
  search?: string;
  htmlClassName?: string;
};

export function marketingWebsiteChatWidgetScriptSrc(): string {
  return `${MARKETING_WEBSITE_CHAT_WIDGET_BASE_URL}/widget.js?id=${MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID}`;
}

export function assertMarketingWebsiteChatWidgetConfig(): void {
  if (!isWidgetPublicId(MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID)) {
    throw new Error("marketing website chat widget id is not a public wgt_ token");
  }
  const origins = new Set(MARKETING_WEBSITE_CHAT_ALLOWED_ORIGINS);
  if (!origins.has("https://whachatcrm.com") || !origins.has("https://www.whachatcrm.com")) {
    throw new Error("marketing website chat widget origins must include apex and www");
  }
  if (origins.has("https://app.whachatcrm.com")) {
    throw new Error("marketing website chat widget must not allowlist the app host");
  }
}

export function isMarketingWebsiteChatHost(hostname: string): boolean {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  return host === "whachatcrm.com" || host === "www.whachatcrm.com";
}

function normalizePathname(pathname: string): string {
  const pathOnly = String(pathname || "/").split("?")[0].split("#")[0] || "/";
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) return pathOnly.slice(0, -1) || "/";
  return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
}

export function isExcludedMarketingWebsiteChatPath(pathname: string): boolean {
  const path = normalizePathname(pathname).toLowerCase();
  for (const prefix of EXCLUDED_PATH_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

function isShopifyEmbeddedSurface(search: string | undefined, htmlClassName: string | undefined): boolean {
  const classes = String(htmlClassName || "");
  if (/\bwcs-shopify-(?:preboot|bootstrap)\b/.test(classes)) return true;
  const raw = String(search || "");
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  if (params.get("embedded") === "1") return true;
  if (params.get("shopify_installed") === "1") return true;
  return false;
}

export function shouldLoadMarketingWebsiteChatWidget(
  location: MarketingWebsiteChatWidgetLocation,
): boolean {
  if (!isMarketingWebsiteChatHost(location.hostname)) return false;
  if (isShopifyEmbeddedSurface(location.search, location.htmlClassName)) return false;
  if (isExcludedMarketingWebsiteChatPath(location.pathname)) return false;
  return true;
}

function readScriptSrc(el: ScriptLike): string {
  if (typeof el.getAttribute === "function") {
    const attr = el.getAttribute("src");
    if (attr) return attr;
  }
  return String(el.src || "");
}

export function countMarketingWebsiteChatWidgetScripts(doc: MarketingChatWidgetDom): number {
  const src = marketingWebsiteChatWidgetScriptSrc();
  const scripts = Array.from(doc.querySelectorAll("script"));
  return scripts.filter((el) => readScriptSrc(el) === src).length;
}

/**
 * Injects the official Website Widget snippet once. Safe across SPA navigations
 * and React remounts.
 */
export function injectOfficialMarketingWebsiteChatWidget(
  win: MarketingChatWidgetWindow,
  doc: MarketingChatWidgetDom,
): boolean {
  if (countMarketingWebsiteChatWidgetScripts(doc) > 0) return false;
  win["WhachatWidget"] = "wcw";
  const js = doc.createElement("script");
  js.src = `${MARKETING_WEBSITE_CHAT_WIDGET_BASE_URL}/widget.js?id=${MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID}`;
  js.async = true;
  js.setAttribute("fetchpriority", "low");
  doc.head.appendChild(js);
  return true;
}

export function syncMarketingWebsiteChatWidget(
  location: MarketingWebsiteChatWidgetLocation,
  win: MarketingChatWidgetWindow,
  doc: MarketingChatWidgetDom,
): "injected" | "present" | "suppressed" {
  const htmlClassName = location.htmlClassName ?? doc.documentElement.className;
  const allow = shouldLoadMarketingWebsiteChatWidget({ ...location, htmlClassName });
  if (!allow) {
    doc.documentElement.classList.add(MARKETING_WEBSITE_CHAT_SUPPRESS_CLASS);
    return "suppressed";
  }
  doc.documentElement.classList.remove(MARKETING_WEBSITE_CHAT_SUPPRESS_CLASS);
  const injected = injectOfficialMarketingWebsiteChatWidget(win, doc);
  return injected ? "injected" : "present";
}

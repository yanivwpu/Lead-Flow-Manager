/**
 * Parent → iframe page-context protocol.
 * Only the embedding parent may send this; the iframe never trusts a child/third-party.
 */

import { parseHttpUrl } from "./webchatPageContext";
import { sanitizeWidgetLocaleParam } from "./webchatWidgetLocale";

export const WEBCHAT_PAGE_CONTEXT_MESSAGE_SOURCE = "wcw-parent";
export const WEBCHAT_PAGE_CONTEXT_MESSAGE_TYPE = "wcw-page-context";

export type WebchatPageContextMessage = {
  source: typeof WEBCHAT_PAGE_CONTEXT_MESSAGE_SOURCE;
  type: typeof WEBCHAT_PAGE_CONTEXT_MESSAGE_TYPE;
  widgetId: string;
  href: string;
  pageTitle?: string;
  referrer?: string;
  /** Live display locale from the parent page. Independent of page-rule identity. */
  locale?: string;
};

const MAX_HREF = 4000;
const MAX_TITLE = 300;
const MAX_REFERRER = 2000;

export function buildWebchatPageContextMessage(input: {
  widgetId: string;
  href: string;
  pageTitle?: string;
  referrer?: string;
  locale?: string;
}): WebchatPageContextMessage | null {
  const widgetId = String(input.widgetId || "").trim();
  const parsed = parseHttpUrl(input.href);
  if (!widgetId || !parsed) return null;
  const referrerParsed = input.referrer ? parseHttpUrl(input.referrer) : null;
  return {
    source: WEBCHAT_PAGE_CONTEXT_MESSAGE_SOURCE,
    type: WEBCHAT_PAGE_CONTEXT_MESSAGE_TYPE,
    widgetId,
    href: parsed.toString().slice(0, MAX_HREF),
    ...(input.pageTitle ? { pageTitle: String(input.pageTitle).trim().slice(0, MAX_TITLE) } : {}),
    ...(referrerParsed ? { referrer: referrerParsed.toString().slice(0, MAX_REFERRER) } : {}),
    ...(sanitizeWidgetLocaleParam(input.locale)
      ? { locale: sanitizeWidgetLocaleParam(input.locale) }
      : {}),
  };
}

/** Path + title + display locale. Query/hash do not create a new context. Rule key is not part of this. */
export function effectivePageContextKey(href: string, pageTitle?: string, locale?: string): string {
  const parsed = parseHttpUrl(href);
  const url = parsed ? `${parsed.origin}${parsed.pathname}` : "";
  return `${url}\n${String(pageTitle || "").trim()}\n${sanitizeWidgetLocaleParam(locale)}`;
}

export function parseTrustedParentPageContextMessage(
  event: { origin?: string; source?: unknown; data?: unknown },
  opts: {
    widgetId: string;
    expectedParentOrigin: string;
    expectedSource?: unknown;
  },
): WebchatPageContextMessage | null {
  const expectedOrigin = String(opts.expectedParentOrigin || "").replace(/\/$/, "").toLowerCase();
  const eventOrigin = String(event.origin || "").replace(/\/$/, "").toLowerCase();
  if (!expectedOrigin || !eventOrigin || eventOrigin !== expectedOrigin) return null;
  if (opts.expectedSource != null && event.source !== opts.expectedSource) return null;
  const data = event.data;
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  if (payload.source !== WEBCHAT_PAGE_CONTEXT_MESSAGE_SOURCE) return null;
  if (payload.type !== WEBCHAT_PAGE_CONTEXT_MESSAGE_TYPE) return null;
  if (String(payload.widgetId || "") !== String(opts.widgetId || "")) return null;
  const built = buildWebchatPageContextMessage({
    widgetId: String(payload.widgetId || ""),
    href: typeof payload.href === "string" ? payload.href : "",
    pageTitle: typeof payload.pageTitle === "string" ? payload.pageTitle : undefined,
    referrer: typeof payload.referrer === "string" ? payload.referrer : undefined,
    locale: typeof payload.locale === "string" ? payload.locale : undefined,
  });
  if (!built) return null;
  const hrefOrigin = parseHttpUrl(built.href)?.origin.toLowerCase() || "";
  if (hrefOrigin !== expectedOrigin) return null;
  if (built.referrer) {
    const refOrigin = parseHttpUrl(built.referrer)?.origin.toLowerCase();
    if (refOrigin && refOrigin !== expectedOrigin) {
      delete built.referrer;
    }
  }
  return built;
}

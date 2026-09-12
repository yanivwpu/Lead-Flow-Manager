/**
 * Optional per-node locale variants for static chatbot copy.
 * Default `content` / `options` remain the English fallback. Never machine-translate
 * tenant copy into this structure without a human review.
 */

import {
  sanitizeAskQuestionQuickReplies,
  type ChatbotAskQuickReply,
} from "./chatbotAskQuestionOptions";
import type { WidgetStaticLocale } from "./webchatWidgetLocale";

export const CHATBOT_STATIC_LOCALES = ["en", "es", "he"] as const;
export type ChatbotStaticLocale = (typeof CHATBOT_STATIC_LOCALES)[number];

export type ChatbotNodeLocaleVariant = {
  content?: string;
  options?: ChatbotAskQuickReply[];
};

export type ChatbotNodeLocalizedMap = Partial<Record<ChatbotStaticLocale, ChatbotNodeLocaleVariant>>;

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function cleanContent(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 2000);
}

function parseVariant(raw: unknown, channel?: string | null): ChatbotNodeLocaleVariant {
  const o = asRecord(raw);
  return {
    content: cleanContent(o.content) || undefined,
    options: sanitizeAskQuestionQuickReplies(o.options, { channel }),
  };
}

export function parseChatbotNodeLocalized(raw: unknown, channel?: string | null): ChatbotNodeLocalizedMap {
  const o = asRecord(raw);
  const out: ChatbotNodeLocalizedMap = {};
  for (const loc of CHATBOT_STATIC_LOCALES) {
    if (o[loc] && typeof o[loc] === "object") {
      out[loc] = parseVariant(o[loc], channel);
    }
  }
  return out;
}

export function chatbotStaticLocaleFromWidget(locale: string | null | undefined): ChatbotStaticLocale | null {
  const base = String(locale || "").trim().toLowerCase().split("-")[0];
  if (base === "es" || base === "he" || base === "en") return base;
  return null;
}

export function resolveChatbotNodeCopy(
  data: {
    content?: unknown;
    options?: unknown;
    localized?: unknown;
  },
  locale?: string | null,
  channel?: string | null,
): { content: string; options: ChatbotAskQuickReply[]; usedLocale: ChatbotStaticLocale | "default" } {
  const fallbackContent = cleanContent(data.content);
  const fallbackOptions = sanitizeAskQuestionQuickReplies(data.options, { channel });
  const localized = parseChatbotNodeLocalized(data.localized, channel);
  const staticLocale = chatbotStaticLocaleFromWidget(locale);
  if (staticLocale && staticLocale !== "en") {
    const variant = localized[staticLocale];
    if (variant && (variant.content || (variant.options && variant.options.length))) {
      return {
        content: variant.content || fallbackContent,
        options: variant.options && variant.options.length ? variant.options : fallbackOptions,
        usedLocale: staticLocale,
      };
    }
  }
  if (staticLocale === "en" && localized.en) {
    return {
      content: localized.en.content || fallbackContent,
      options: localized.en.options && localized.en.options.length ? localized.en.options : fallbackOptions,
      usedLocale: "en",
    };
  }
  return { content: fallbackContent, options: fallbackOptions, usedLocale: "default" };
}

export function isChatbotStaticLocale(value: string | null | undefined): value is ChatbotStaticLocale {
  return value === "en" || value === "es" || value === "he";
}

export function widgetLocaleToStaticFallback(locale: string | null | undefined): WidgetStaticLocale {
  const staticLocale = chatbotStaticLocaleFromWidget(locale);
  return staticLocale || "en";
}

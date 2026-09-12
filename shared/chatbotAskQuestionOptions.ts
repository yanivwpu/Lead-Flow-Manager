/**
 * Ask Question quick replies are visitor-facing answer chips — not Send Message
 * branching buttons. They wait, capture one answer, save the variable, and resume once.
 */

export const WEBCHAT_ASK_QUICK_REPLY_MAX = 8;
export const WHATSAPP_ASK_QUICK_REPLY_MAX = 3;
export const ASK_QUICK_REPLY_LABEL_MAX_WEBCHAT = 40;
export const ASK_QUICK_REPLY_LABEL_MAX_WHATSAPP = 20;

export type ChatbotAskQuickReply = {
  label: string;
  value: string;
};

export type ChatbotAskChannelLimit = {
  channel: "webchat" | "whatsapp" | "other";
  maxOptions: number;
  maxLabel: number;
};

export function askQuestionChannelLimit(channel?: string | null): ChatbotAskChannelLimit {
  const c = String(channel || "").toLowerCase();
  if (c === "webchat") {
    return { channel: "webchat", maxOptions: WEBCHAT_ASK_QUICK_REPLY_MAX, maxLabel: ASK_QUICK_REPLY_LABEL_MAX_WEBCHAT };
  }
  if (c === "whatsapp") {
    return { channel: "whatsapp", maxOptions: WHATSAPP_ASK_QUICK_REPLY_MAX, maxLabel: ASK_QUICK_REPLY_LABEL_MAX_WHATSAPP };
  }
  return { channel: "other", maxOptions: WEBCHAT_ASK_QUICK_REPLY_MAX, maxLabel: ASK_QUICK_REPLY_LABEL_MAX_WEBCHAT };
}

function cleanLabel(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001F\u007F<>]/g, "").replace(/javascript:/gi, "").trim().slice(0, max);
}

function slugValue(label: string): string {
  return label.trim();
}

export function sanitizeAskQuestionQuickReplies(
  raw: unknown,
  opts?: { channel?: string | null; max?: number },
): ChatbotAskQuickReply[] {
  if (!Array.isArray(raw)) return [];
  const limit = askQuestionChannelLimit(opts?.channel);
  const max = Math.min(opts?.max ?? limit.maxOptions, WEBCHAT_ASK_QUICK_REPLY_MAX);
  const out: ChatbotAskQuickReply[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= max) break;
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const label = cleanLabel(o ? o.label ?? o.value : item, limit.maxLabel);
    if (!label) continue;
    const value = cleanLabel(o?.value, limit.maxLabel) || slugValue(label);
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, value });
  }
  return out;
}

export function matchAskQuestionQuickReply(
  message: unknown,
  options: ChatbotAskQuickReply[],
): ChatbotAskQuickReply | null {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text || !options.length) return null;
  const norm = text.toLowerCase();
  const byValue = options.find((o) => o.value.trim().toLowerCase() === norm);
  if (byValue) return byValue;
  const byLabel = options.find((o) => o.label.trim().toLowerCase() === norm);
  if (byLabel) return byLabel;
  const num = Number.parseInt(norm, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= options.length) return options[num - 1];
  return null;
}

export function formatAskQuestionOptionsFallback(prompt: string, options: ChatbotAskQuickReply[]): string {
  if (!options.length) return prompt;
  const list = options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
  return prompt ? `${prompt}\n\n${list}` : list;
}

export function chatbotAskQuestionPublishError(
  nodes: unknown,
  opts?: { channels?: string[] | null },
): string | null {
  if (!Array.isArray(nodes)) return null;
  const channels = Array.isArray(opts?.channels) ? opts!.channels : [];
  const includesWhatsapp = channels.includes("whatsapp");
  const includesWebchat = channels.length === 0 || channels.includes("webchat");
  const limit = includesWhatsapp && !includesWebchat
    ? askQuestionChannelLimit("whatsapp")
    : askQuestionChannelLimit("webchat");

  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const typed = node as { type?: unknown; data?: Record<string, unknown> };
    if (typed.type !== "question") continue;
    const data = typed.data && typeof typed.data === "object" ? typed.data : {};
    const rawOptions = Array.isArray(data.options) ? data.options : [];
    if (rawOptions.length === 0) continue;
    const label = String(data.label || "Ask Question");
    for (const item of rawOptions) {
      const o = item && typeof item === "object" ? (item as { label?: unknown }) : null;
      const rawLabel = typeof o?.label === "string" ? o.label.trim() : "";
      if (!rawLabel) {
        return `"${label}" has an empty Quick Reply option. Add a label or remove the option before publishing.`;
      }
      if (includesWhatsapp && rawLabel.length > ASK_QUICK_REPLY_LABEL_MAX_WHATSAPP) {
        return `"${label}" has a Quick Reply longer than ${ASK_QUICK_REPLY_LABEL_MAX_WHATSAPP} characters. WhatsApp will truncate it.`;
      }
    }
    if (includesWhatsapp && rawOptions.length > WHATSAPP_ASK_QUICK_REPLY_MAX) {
      return `"${label}" has ${rawOptions.length} Quick Reply options. WhatsApp supports ${WHATSAPP_ASK_QUICK_REPLY_MAX}; extra options are omitted on WhatsApp.`;
    }
    if (rawOptions.length > WEBCHAT_ASK_QUICK_REPLY_MAX) {
      return `"${label}" has too many Quick Reply options (max ${WEBCHAT_ASK_QUICK_REPLY_MAX} for Website Chat).`;
    }
    const localized = data.localized && typeof data.localized === "object"
      ? (data.localized as Record<string, unknown>)
      : {};
    for (const loc of ["es", "he"] as const) {
      const variant = localized[loc];
      if (!variant || typeof variant !== "object") continue;
      const locOptions = (variant as { options?: unknown }).options;
      if (!Array.isArray(locOptions) || locOptions.length === 0) continue;
      const filled = locOptions.filter((item) => {
        const o = item && typeof item === "object" ? (item as { label?: unknown }) : null;
        return typeof o?.label === "string" && o.label.trim().length > 0;
      });
      if (filled.length !== locOptions.length) {
        return `"${label}" has an empty ${loc.toUpperCase()} Quick Reply option. Localized variants must be complete.`;
      }
      if (filled.length !== rawOptions.length) {
        return `"${label}" ${loc.toUpperCase()} Quick Reply count must match the default options.`;
      }
    }
    void limit;
  }
  return null;
}

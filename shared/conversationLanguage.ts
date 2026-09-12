/**
 * Visitor conversation language — independent of dashboard UI locale.
 * Persist a reliable language so later replies stay consistent.
 */

export type ConversationLanguageCode = string;

const HEBREW_RE = /[\u0590-\u05FF]/;
const ARABIC_RE = /[\u0600-\u06FF]/;
const CJK_RE = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
const HIRAGANA_KATAKANA_RE = /[\u3040-\u30FF]/;
const HANGUL_RE = /[\uAC00-\uD7AF]/;
const CYRILLIC_RE = /[\u0400-\u04FF]/;
const SPANISH_HINT_RE =
  /[áéíóúüñ¿¡]|\b(?:hola|gracias|precio|precios|características|quiero|ayuda|información|información)\b/i;
const FRENCH_HINT_RE = /[àâçéèêëîïôùûüÿœæ]|\b(?:bonjour|merci|prix|fonctionnalités|aide)\b/i;
const GERMAN_HINT_RE = /[äöüß]|\b(?:hallo|danke|preis|funktionen|hilfe)\b/i;
const PORTUGUESE_HINT_RE = /[ãõç]|\b(?:olá|obrigad[oa]|preço|ajuda)\b/i;

export type DetectedConversationLanguage = {
  code: ConversationLanguageCode;
  scriptDir: "rtl" | "ltr";
  /** True when we have a script or strong lexical signal — not a default English guess. */
  confident: boolean;
};

export function detectConversationLanguage(text: unknown): DetectedConversationLanguage {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) return { code: "en", scriptDir: "ltr", confident: false };
  if (HEBREW_RE.test(raw)) return { code: "he", scriptDir: "rtl", confident: true };
  if (ARABIC_RE.test(raw)) return { code: "ar", scriptDir: "rtl", confident: true };
  if (HIRAGANA_KATAKANA_RE.test(raw)) return { code: "ja", scriptDir: "ltr", confident: true };
  if (HANGUL_RE.test(raw)) return { code: "ko", scriptDir: "ltr", confident: true };
  if (CJK_RE.test(raw)) return { code: "zh", scriptDir: "ltr", confident: true };
  if (CYRILLIC_RE.test(raw)) return { code: "ru", scriptDir: "ltr", confident: true };
  if (SPANISH_HINT_RE.test(raw)) return { code: "es", scriptDir: "ltr", confident: true };
  if (FRENCH_HINT_RE.test(raw)) return { code: "fr", scriptDir: "ltr", confident: true };
  if (GERMAN_HINT_RE.test(raw)) return { code: "de", scriptDir: "ltr", confident: true };
  if (PORTUGUESE_HINT_RE.test(raw)) return { code: "pt", scriptDir: "ltr", confident: true };
  return { code: "en", scriptDir: "ltr", confident: /[a-zA-Z]{3,}/.test(raw) };
}

export function languageInstructionForConversation(code: string | null | undefined): string {
  const lang = String(code || "en").trim().toLowerCase().split("-")[0] || "en";
  switch (lang) {
    case "he":
      return "השב בעברית. Respond in Hebrew using natural, conversational Hebrew.";
    case "es":
      return "Responde en español. Respond in Spanish using neutral, Latin American Spanish.";
    case "ar":
      return "الرد باللغة العربية. Respond in Arabic using Modern Standard Arabic.";
    case "zh":
      return "请用中文回复。Respond in Chinese, matching simplified vs traditional to the visitor.";
    case "ja":
      return "日本語で返信してください。Respond in natural Japanese.";
    case "ko":
      return "한국어로 답하세요. Respond in natural Korean.";
    case "ru":
      return "Отвечайте по-русски. Respond in natural Russian.";
    case "fr":
      return "Répondez en français. Respond in natural French.";
    case "de":
      return "Antworten Sie auf Deutsch. Respond in natural German.";
    case "pt":
      return "Responda em português. Respond in natural Portuguese.";
    case "en":
      return "Respond in English.";
    default:
      return `Respond in the visitor's language (${lang}). Keep product names, plan names, prices, and URLs exactly as published.`;
  }
}

export function mergeConversationLanguage(
  previous: unknown,
  inboundText: unknown,
  widgetLocale?: string | null,
): string {
  const detected = detectConversationLanguage(inboundText);
  if (detected.confident) return detected.code;
  const prior = typeof previous === "string" ? previous.trim().toLowerCase().split("-")[0] : "";
  if (prior) return prior;
  const widget = String(widgetLocale || "").trim().toLowerCase().split("-")[0];
  if (widget) return widget;
  return detected.code || "en";
}

export function sanitizeConversationLanguage(raw: unknown): string {
  const v = String(raw || "").trim().toLowerCase().split("-")[0];
  if (!v || !/^[a-z]{2,8}$/.test(v)) return "";
  return v.slice(0, 8);
}

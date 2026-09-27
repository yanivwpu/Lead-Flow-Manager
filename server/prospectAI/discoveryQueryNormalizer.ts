import { aiProvider } from "../aiProvider";

export type ProspectDiscoveryLanguage = "en" | "he" | "es";

export type ProspectDiscoveryQueryNormalization = {
  originalBusinessType: string;
  originalLocation: string;
  providerBusinessType: string;
  providerLocation: string;
  language: ProspectDiscoveryLanguage;
  translated: boolean;
  fallbackUsed: boolean;
};

type TranslateBusinessCategory = (params: {
  businessType: string;
  sourceLanguage: "he" | "es";
}) => Promise<string>;

const HEBREW_RE = /[\u0590-\u05ff]/u;
const SPANISH_MARK_RE = /[áéíóúüñ¿¡]/iu;
const SPANISH_CATEGORY_WORD_RE = /\b(?:agentes?|cl[ií]nicas?|dentales?|inmobiliari[oa]s?|plomeros?|salones?|belleza|abogados?|restaurantes?|tiendas?|servicios?)\b/iu;
const URL_EMAIL_PHONE_RE = /(?:https?:\/\/|www\.|\S+@\S+|\+?\d[\d\s().-]{5,})/iu;

export function detectProspectDiscoveryLanguage(
  businessType: string,
  preferredLocale?: string | null,
): ProspectDiscoveryLanguage {
  const locale = String(preferredLocale || "").trim().toLowerCase().split(/[-_]/)[0];
  if (locale === "he" || locale === "es" || locale === "en") return locale;
  if (HEBREW_RE.test(businessType)) return "he";
  if (SPANISH_MARK_RE.test(businessType) || SPANISH_CATEGORY_WORD_RE.test(businessType)) return "es";
  return "en";
}

async function translateWithExistingAi(params: {
  businessType: string;
  sourceLanguage: "he" | "es";
}): Promise<string> {
  const response = await aiProvider.complete(
    "extraction",
    [
      {
        role: "system",
        content: `Normalize a business-category search phrase from ${params.sourceLanguage === "he" ? "Hebrew" : "Spanish"} into concise English for Google Places Text Search. Translate only the generic business category. Never translate or alter company names, brands, proper nouns, URLs, emails, phone numbers, or locations. Return JSON only: {"businessType":"..."}.`,
      },
      { role: "user", content: JSON.stringify({ businessType: params.businessType }) },
    ],
    { jsonMode: true, maxTokens: 80 },
  );
  const content = typeof response === "string" ? response : response.content;
  const parsed = JSON.parse(content) as { businessType?: unknown };
  return typeof parsed.businessType === "string" ? parsed.businessType.trim() : "";
}

/**
 * Converts only discovery category semantics for the provider. Original category and
 * native location remain available for display/history and safe fallback.
 */
export async function normalizeProspectDiscoveryQuery(
  input: { businessType: string; location: string; preferredLocale?: string | null },
  deps: { translateBusinessCategory?: TranslateBusinessCategory } = {},
): Promise<ProspectDiscoveryQueryNormalization> {
  const originalBusinessType = String(input.businessType || "").trim();
  const originalLocation = String(input.location || "").trim();
  const language = detectProspectDiscoveryLanguage(originalBusinessType, input.preferredLocale);
  const base = {
    originalBusinessType,
    originalLocation,
    providerBusinessType: originalBusinessType,
    providerLocation: originalLocation,
    language,
    translated: false,
    fallbackUsed: false,
  };

  // These resemble identifiers/proper nouns rather than category semantics; preserve verbatim.
  if (language === "en" || URL_EMAIL_PHONE_RE.test(originalBusinessType)) return base;

  try {
    const translated = await (deps.translateBusinessCategory ?? translateWithExistingAi)({
      businessType: originalBusinessType,
      sourceLanguage: language,
    });
    if (!translated || translated.length > 120 || HEBREW_RE.test(translated)) {
      throw new Error("normalizer returned an invalid category");
    }
    return { ...base, providerBusinessType: translated, translated: translated !== originalBusinessType };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown normalization error";
    console.warn("[ProspectAI] discovery query normalization failed; using original category", {
      language,
      reason: reason.slice(0, 160),
    });
    return { ...base, fallbackUsed: true };
  }
}

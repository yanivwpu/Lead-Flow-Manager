/**
 * Pricing savings journey: extract slots, ask only for missing inputs,
 * and compute a grounded comparison from the canonical commercial catalog.
 */

import {
  getPaidPlanMonthlyPriceUsd,
  getPaidPlanYearlyPriceUsd,
} from "./pricingEntitlements";
import type { WebchatSavingsCollected } from "./webchatActiveJourney";

const PLATFORM_RE =
  /(?:using|use|on|from|con|uso|usando|משתמש(?:ת)?\s+ב)\s+([A-Za-z][A-Za-z0-9._-]{1,40})/i;
const KNOWN_PLATFORMS = [
  "manychat",
  "many chat",
  "whatsapp",
  "hubspot",
  "zendesk",
  "intercom",
  "pabbly",
  "respond.io",
  "wati",
  "twilio",
];

const TEAM_RE =
  /(\d{1,3})\s*(?:team\s*\w+|members|seats|users|personas|miembros|אנשי\s*צוות|בצוות)/i;
const VOLUME_RE =
  /(?:about|around|approximately|cerca de|כ[- ]?)\s*(\d[\d,]{2,6})\s*(?:messages?|msg|contacts?|mensajes|הודעות)|(\d[\d,]{2,6})\s*(?:messages?|msg|contacts?|mensajes|הודעות)\s*(?:a month|\/\s*month|al mes|בחודש)/i;

const COST_RE =
  /(?:pay(?:ing)?|cost(?:s)?|bill(?:ed)?|charge[ds]?|pago|pagando|cuesta|משלם(?:ת)?|עולה)\s*(?:about|around|approximately|unos|כ[- ]?)?\s*(?:(US\$|R\$|\$|€|£|₪)|(?:(USD|EUR|GBP|ILS)\s*))?\s*(\d[\d,]*(?:\.\d{1,2})?)|(?:(US\$|R\$|\$|€|£|₪)|(USD|EUR|GBP|ILS))\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:\/\s*|per\s+)?(?:month|mo|mes|חודש)?/i;

const CURRENCY_WORD: Record<string, string> = {
  $: "USD",
  "US$": "USD",
  usd: "USD",
  "€": "EUR",
  eur: "EUR",
  "£": "GBP",
  gbp: "GBP",
  "₪": "ILS",
  ils: "ILS",
};

export type SavingsCalculation = {
  visitorMonthly: number;
  visitorAnnualized: number;
  currency: string;
  catalogCurrency: "USD";
  proMonthly: number;
  proYearly: number;
  monthlySavings: number;
  yearlySavings: number;
  hasMonthlySavings: boolean;
  hasYearlySavings: boolean;
  formula: string;
};

export type SavingsJourneyEvidenceItem = {
  sourceType: "visitor_provided" | "canonical_catalog" | "derived_arithmetic";
  text: string;
  identity: string;
  amounts: string[];
};

function parseAmount(raw: string): number | undefined {
  const n = Number(String(raw || "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
}

function normalizePlatform(raw: string): string {
  const t = raw.replace(/[.,]/g, "").trim();
  if (/^manychat$/i.test(t) || /^many$/i.test(t)) return "ManyChat";
  return t.slice(0, 40);
}

export function extractSavingsSlots(text: string): WebchatSavingsCollected {
  const inbound = String(text || "").trim();
  if (!inbound) return {};
  const out: WebchatSavingsCollected = {};
  const lower = inbound.toLowerCase();
  for (const name of KNOWN_PLATFORMS) {
    if (lower.includes(name)) {
      out.platform = name === "many chat" || name === "manychat" ? "ManyChat" : name;
      break;
    }
  }
  if (!out.platform) {
    const platform = inbound.match(PLATFORM_RE)?.[1];
    if (platform && !/^(a|the|my|our|la|el)$/i.test(platform)) {
      out.platform = normalizePlatform(platform);
    }
  }
  const team = inbound.match(TEAM_RE)?.[1];
  if (team) out.teamSize = Number(team);
  const volumeMatch = inbound.match(VOLUME_RE);
  const volumeRaw = volumeMatch?.[1] || volumeMatch?.[2];
  if (volumeRaw) out.monthlyVolume = Number(volumeRaw.replace(/,/g, ""));
  const cost = inbound.match(COST_RE);
  if (cost) {
    const symbol = cost[1] || cost[4];
    const code = cost[2] || cost[5];
    const amount = cost[3] || cost[6];
    if (amount) {
      const parsed = parseAmount(amount);
      if (parsed != null) {
        out.monthlyCost = parsed;
        const mapped = CURRENCY_WORD[String(symbol || code || "").trim()] || (code ? String(code).toUpperCase() : undefined);
        if (mapped) out.currency = mapped;
      }
    }
  }
  return out;
}

export function detectSavingsIntentChange(text: string): boolean {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(book(?:ing)?\s+(?:a\s+)?demo|schedule\s+(?:a\s+)?demo)\b/.test(t) ||
    /reservar\s+(?:una\s+)?demo|קביעת\s*הדגמה/.test(t) ||
    /\bcompare\s+(?:free|plans?|pricing)\b/.test(t) ||
    /comparar\s+(?:free|planes)|השוואת/.test(t)
  );
}

export function canonicalWhachatProPrices(): { monthly: number; yearly: number; currency: "USD" } {
  return {
    monthly: getPaidPlanMonthlyPriceUsd("pro"),
    yearly: getPaidPlanYearlyPriceUsd("pro"),
    currency: "USD",
  };
}

export function calculatePricingSavings(input: {
  monthlyCost: number;
  currency?: string | null;
}):
  | { ok: true; calculation: SavingsCalculation }
  | { ok: false; reason: "currency_mismatch" | "invalid_amount" } {
  const monthly = Number(input.monthlyCost);
  if (!Number.isFinite(monthly) || monthly <= 0) return { ok: false, reason: "invalid_amount" };
  const currency = String(input.currency || "USD").toUpperCase();
  const catalog = canonicalWhachatProPrices();
  if (currency !== catalog.currency) return { ok: false, reason: "currency_mismatch" };
  const visitorAnnualized = Math.round(monthly * 12 * 100) / 100;
  const monthlySavings = Math.round((monthly - catalog.monthly) * 100) / 100;
  const yearlySavings = Math.round((visitorAnnualized - catalog.yearly) * 100) / 100;
  return {
    ok: true,
    calculation: {
      visitorMonthly: monthly,
      visitorAnnualized,
      currency,
      catalogCurrency: catalog.currency,
      proMonthly: catalog.monthly,
      proYearly: catalog.yearly,
      monthlySavings,
      yearlySavings,
      hasMonthlySavings: monthlySavings > 0,
      hasYearlySavings: yearlySavings > 0,
      formula: "(visitorMonthly - proMonthly); (visitorMonthly * 12 - proYearly)",
    },
  };
}

export function formatMoneyUsd(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
}

export function savingsClarifyingQuestion(input: {
  locale?: string | null;
  collected: WebchatSavingsCollected;
  missing: string[];
}): string {
  const locale = String(input.locale || "en").split("-")[0];
  const platform = input.collected.platform || "";
  const needCost = input.missing.includes("monthlyCost") || input.missing.includes("currency");
  const needPlatform = input.missing.includes("platform");
  if (needPlatform && needCost) {
    if (locale === "es") {
      return "Para estimar el ahorro, ¿qué plataforma usas ahora y cuánto pagas al mes, incluyendo contactos o mensajes?";
    }
    if (locale === "he") {
      return "כדי להעריך חיסכון, באיזו פלטפורמה אתם משתמשים היום וכמה אתם משלמים בחודש, כולל אנשי קשר או הודעות?";
    }
    return "To estimate savings, what platform do you use today and about how much do you pay each month, including contact or messaging charges?";
  }
  if (needCost) {
    if (locale === "es") {
      return platform
        ? `Gracias. ¿Cuánto pagas aproximadamente a ${platform} cada mes, incluyendo cargos por contactos o mensajes?`
        : "Gracias. ¿Cuánto pagas aproximadamente cada mes, incluyendo cargos por contactos o mensajes?";
    }
    if (locale === "he") {
      return platform
        ? `תודה. בערך כמה אתם משלמים ל-${platform} בכל חודש, כולל חיובים על אנשי קשר או הודעות?`
        : "תודה. בערך כמה אתם משלמים בכל חודש, כולל חיובים על אנשי קשר או הודעות?";
    }
    return platform
      ? `Thanks. Approximately how much are you currently paying ${platform} each month, including any contact or messaging charges?`
      : "Thanks. Approximately how much are you currently paying each month, including any contact or messaging charges?";
  }
  if (needPlatform) {
    if (locale === "es") return "¿Qué plataforma usas hoy?";
    if (locale === "he") return "באיזו פלטפורמה אתם משתמשים היום?";
    return "Which platform are you using today?";
  }
  return "";
}

export function savingsCurrencyClarification(locale?: string | null): string {
  const lang = String(locale || "en").split("-")[0];
  if (lang === "es") {
    return "Puedo comparar tu factura con el precio publicado de WhachatCRM en USD. ¿Puedes confirmar el importe mensual en USD?";
  }
  if (lang === "he") {
    return "אפשר להשוות את החיוב למחיר המפורסם של WhachatCRM ב-USD. אפשר לאשר את הסכום החודשי ב-USD?";
  }
  return "I can compare your bill to the published WhachatCRM price in USD. Can you confirm the monthly amount in USD?";
}

export function savingsComparisonReply(input: {
  locale?: string | null;
  collected: WebchatSavingsCollected;
  calculation: SavingsCalculation;
}): string {
  const locale = String(input.locale || "en").split("-")[0];
  const platform = input.collected.platform || "your current platform";
  const current = formatMoneyUsd(input.calculation.visitorMonthly);
  const proMonth = formatMoneyUsd(input.calculation.proMonthly);
  const proYear = formatMoneyUsd(input.calculation.proYearly);
  const monthSave = formatMoneyUsd(Math.abs(input.calculation.monthlySavings));
  const yearSave = formatMoneyUsd(Math.abs(input.calculation.yearlySavings));
  if (!input.calculation.hasMonthlySavings && !input.calculation.hasYearlySavings) {
    if (locale === "es") {
      return `Con ${current}/mes en ${platform}, tu factura actual ya es igual o menor que Pro de WhachatCRM (${proMonth}/mes o ${proYear}/año). No hay un ahorro mensual o anual claro con esos números.`;
    }
    if (locale === "he") {
      return `עם ${current} לחודש ב-${platform}, החיוב הנוכחי כבר שווה או נמוך ממחיר Pro של WhachatCRM (${proMonth} לחודש או ${proYear} לשנה). אין חיסכון חודשי או שנתי ברור לפי המספרים האלה.`;
    }
    return `At ${current}/month on ${platform}, your current bill is already at or below WhachatCRM Pro (${proMonth}/month or ${proYear}/year). Those numbers do not show a clear monthly or annual savings.`;
  }
  if (locale === "es") {
    return `Con ${current}/mes en ${platform}, Pro de WhachatCRM es ${proMonth}/mes (${proYear}/año). Eso es aproximadamente ${monthSave}/mes o ${yearSave}/año menos, usando tu factura actual — no un precio estimado de ${platform}.`;
  }
  if (locale === "he") {
    return `עם ${current} לחודש ב-${platform}, Pro של WhachatCRM הוא ${proMonth} לחודש (${proYear} לשנה). זה בערך ${monthSave} לחודש או ${yearSave} לשנה פחות, לפי החיוב שציינתם — לא לפי מחיר מוערך של ${platform}.`;
  }
  return `At ${current}/month on ${platform}, WhachatCRM Pro is ${proMonth}/month (${proYear}/year). That is about ${monthSave}/month or ${yearSave}/year less, using your current bill — not an estimated ${platform} list price.`;
}

export function savingsJourneyEvidence(calculation: SavingsCalculation): SavingsJourneyEvidenceItem[] {
  return [
    {
      sourceType: "visitor_provided",
      text: `Visitor-provided current monthly bill: ${formatMoneyUsd(calculation.visitorMonthly)} ${calculation.currency}`,
      identity: "visitor monthly bill",
      amounts: [String(calculation.visitorMonthly)],
    },
    {
      sourceType: "visitor_provided",
      text: `Visitor-provided annualized bill: ${formatMoneyUsd(calculation.visitorAnnualized)} ${calculation.currency}`,
      identity: "visitor annualized bill",
      amounts: [String(calculation.visitorAnnualized)],
    },
    {
      sourceType: "canonical_catalog",
      text: `Canonical WhachatCRM Pro monthly: ${formatMoneyUsd(calculation.proMonthly)}/month`,
      identity: "whachatcrm pro monthly",
      amounts: [String(calculation.proMonthly)],
    },
    {
      sourceType: "canonical_catalog",
      text: `Canonical WhachatCRM Pro yearly: ${formatMoneyUsd(calculation.proYearly)}/year`,
      identity: "whachatcrm pro yearly",
      amounts: [String(calculation.proYearly)],
    },
    {
      sourceType: "derived_arithmetic",
      text: `Derived monthly savings: ${formatMoneyUsd(calculation.monthlySavings)}/month`,
      identity: "derived monthly savings",
      amounts: [String(Math.abs(calculation.monthlySavings))],
    },
    {
      sourceType: "derived_arithmetic",
      text: `Derived yearly savings: ${formatMoneyUsd(calculation.yearlySavings)}/year`,
      identity: "derived yearly savings",
      amounts: [String(Math.abs(calculation.yearlySavings))],
    },
  ];
}

export function resolveSavingsJourneyReply(input: {
  locale?: string | null;
  collected: WebchatSavingsCollected;
  missing: string[];
}): {
  text: string;
  complete: boolean;
  retrievalIntent: "pricing_question";
  evidence: SavingsJourneyEvidenceItem[];
  holdReason?: "currency_mismatch";
} {
  const missing = input.missing.filter((field) => field === "platform" || field === "monthlyCost" || field === "currency");
  if (missing.includes("platform") || missing.includes("monthlyCost")) {
    return {
      text: savingsClarifyingQuestion(input),
      complete: false,
      retrievalIntent: "pricing_question",
      evidence: [],
    };
  }
  const calc = calculatePricingSavings({
    monthlyCost: input.collected.monthlyCost || 0,
    currency: input.collected.currency,
  });
  if (!calc.ok) {
    return {
      text: savingsCurrencyClarification(input.locale),
      complete: false,
      retrievalIntent: "pricing_question",
      evidence: [],
      holdReason: calc.reason === "currency_mismatch" ? "currency_mismatch" : undefined,
    };
  }
  return {
    text: savingsComparisonReply({ locale: input.locale, collected: input.collected, calculation: calc.calculation }),
    complete: true,
    retrievalIntent: "pricing_question",
    evidence: savingsJourneyEvidence(calc.calculation),
  };
}

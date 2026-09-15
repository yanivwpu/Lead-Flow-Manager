/**
 * Trusted Pricing Compare / Features replies from canonical PLAN_LIMITS,
 * yearly catalog prices, and localized public pricing copy.
 * Distinct from pageAction click provenance: continuation is server-owned.
 */

import { formatNaturalPrice } from "./chatbotCompletionContext";
import { isMarketingWebsiteChatHost } from "./marketingWebsiteChatWidget";
import { normalizeMarketingLocale, type MarketingLocale } from "./marketingLocale";
import {
  buildLocalizedPricingCompareRows,
  getLocalizedPlanPricingHighlights,
  getLocalizedPricingPage,
} from "./localizeMarketingContent";
import {
  getCanonicalCommercialCatalog,
  type CanonicalCommercialOffer,
  type PricingCompareCell,
  type PricingCompareRow,
} from "./pricingEntitlements";
import { parseHttpUrl } from "./webchatPageContext";
import type { EvidenceSourceType } from "./turnEvidence";

export type PricingCompareTopic =
  | "full"
  | "pricing"
  | "users"
  | "whatsapp"
  | "ai_brain"
  | "automation"
  | "limits";

export type CanonicalCompareEvidenceItem = {
  sourceType: Extract<EvidenceSourceType, "canonical_catalog">;
  text: string;
  identity: string;
  amounts: string[];
};

function localeOf(raw?: string | null): MarketingLocale {
  return normalizeMarketingLocale(raw);
}

export function parentUrlAllowsCanonicalWhachatCatalog(parentUrl?: string | null): boolean {
  const parsed = parseHttpUrl(parentUrl || "");
  return Boolean(parsed && isMarketingWebsiteChatHost(parsed.hostname));
}

function subscriptionOffers(): CanonicalCommercialOffer[] {
  return getCanonicalCommercialCatalog().filter((item) => item.kind === "subscription_plan");
}

function formatOfferPrice(
  offer: CanonicalCommercialOffer["offers"][number],
  locale: MarketingLocale,
): string {
  if (offer.billingPeriod === "once") return "";
  return formatNaturalPrice(offer.amount, offer.billingPeriod, locale);
}

export function formatCanonicalPlanPrices(
  planId: "free" | "pro",
  locale?: string | null,
): string {
  const loc = localeOf(locale);
  const item = subscriptionOffers().find((row) => row.id === planId);
  const bits = (item?.offers || []).map((offer) => formatOfferPrice(offer, loc)).filter(Boolean);
  if (bits.length <= 1) return bits[0] || "";
  if (loc === "he") return bits.join(" או ");
  if (loc === "es") return bits.join(" o ");
  return bits.join(" or ");
}

export function canonicalPricingCompareEvidence(): CanonicalCompareEvidenceItem[] {
  const items: CanonicalCompareEvidenceItem[] = [];
  for (const plan of subscriptionOffers()) {
    const combined = formatCanonicalPlanPrices(plan.id, "en");
    if (combined) {
      items.push({
        sourceType: "canonical_catalog",
        text: `${plan.name} is ${combined}.`,
        identity: `whachatcrm ${plan.name.toLowerCase()} price`,
        amounts: plan.offers.map((offer) => String(offer.amount)),
      });
    }
    for (const offer of plan.offers) {
      const price = formatOfferPrice(offer, "en");
      if (!price) continue;
      items.push({
        sourceType: "canonical_catalog",
        text: `Canonical WhachatCRM ${plan.name} ${offer.billingPeriod}: ${price}`,
        identity: `whachatcrm ${plan.name.toLowerCase()} ${offer.billingPeriod}`,
        amounts: [String(offer.amount)],
      });
    }
  }
  return items;
}

export function classifyPricingCompareTopic(text: unknown): PricingCompareTopic {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return "full";
  const users = /\b(?:users?|user limits?|team (?:members?|seats?)|miembros|usuarios|משתמשים)\b/.test(t);
  const whatsapp = /\b(?:whatsapp(?:\s+numbers?)?|números?\s+de\s+whatsapp|מספרי\s+whatsapp)\b/.test(t);
  const brain = /\bai\s*brain\b/.test(t);
  const automation = /\b(?:automations?|workflows?|automatizaci[oó]n|אוטומצי(?:ה|ות))\b/.test(t);
  const limits = /\b(?:plan limits?|limits?|l[ií]mites|מגבלות)\b/.test(t);
  const pricing = /\b(?:pricing|prices?|cost|fees?|precios?|מחיר|מחירים)\b/.test(t);
  const fullAsk =
    /side[\s-]*by[\s-]*side/.test(t) ||
    /\b(?:show me (?:a |the )?compar|the comparison|comparaci[oó]n lado a lado|השוואה בין התוכניות)\b/.test(t);
  const hits = [users, whatsapp, brain, automation, pricing].filter(Boolean).length;
  if (fullAsk || hits >= 2) return "full";
  if (users) return "users";
  if (whatsapp) return "whatsapp";
  if (brain) return "ai_brain";
  if (automation) return "automation";
  if (limits) return "limits";
  if (pricing) return "pricing";
  return "full";
}

export function detectPricingCompareIntentChange(text: string): boolean {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(book(?:ing)?\s+(?:a\s+)?demo|schedule\s+(?:a\s+)?demo|find(?:ing)?\s+my\s+solution)\b/.test(t) ||
    /reservar\s+(?:una\s+)?demo|קביעת\s*הדגמה|encontrar\s+mi\s+soluci[oó]n|למצוא\s+את\s+הפתרון/.test(t)
  );
}

export function detectSavingsFollowUpFromCompare(text: string): boolean {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(?:savings estimate|estimate(?:\s+\w+)?\s+savings|calculate(?:\s+my)?\s+savings)\b/.test(t) ||
    /estimaci[oó]n de ahorro|calcular\s+(?:mi\s+)?ahorro/.test(t) ||
    /הערכת\s+חיסכון|חישוב\s+החיסכון/.test(t)
  );
}

function formatCell(cell: PricingCompareCell, locale: MarketingLocale): string {
  const cells = getLocalizedPricingPage(locale).compareCells;
  if (cell === true) return cells.included;
  if (cell === false) return cells.notIncluded;
  return String(cell);
}

function rowByKey(rows: PricingCompareRow[], key: string): PricingCompareRow | undefined {
  return rows.find((row) => row.featureKey === key);
}

function labeledRow(row: PricingCompareRow | undefined, locale: MarketingLocale): string {
  if (!row) return "";
  const label = getLocalizedPricingPage(locale).compareLabels[row.featureKey] || row.featureKey;
  const free = formatCell(row.free, locale);
  const pro = formatCell(row.pro, locale);
  if (locale === "es") return `${label}: Free ${free}. Pro ${pro}.`;
  if (locale === "he") return `${label}: Free ${free}. Pro ${pro}.`;
  return `${label}: Free ${free}. Pro ${pro}.`;
}

function intro(kind: "compare_plans" | "features_pricing", locale: MarketingLocale): string {
  if (kind === "features_pricing") {
    if (locale === "es") return "Hay dos planes:";
    if (locale === "he") return "יש שתי תוכניות:";
    return "There are two plans:";
  }
  if (locale === "es") return "Esta es la comparación Free frente a Pro:";
  if (locale === "he") return "הנה ההשוואה בין Free ל-Pro:";
  return "Here is the Free versus Pro comparison:";
}

function unverifiedOmit(locale: MarketingLocale, topic: string): string {
  if (locale === "es") return `No pude verificar ${topic} en las fuentes publicadas.`;
  if (locale === "he") return `לא הצלחתי לאמת את ${topic} במקורות שפורסמו.`;
  return `I could not verify ${topic} from the published sources.`;
}

function joinHighlights(lines: string[]): string {
  return lines
    .map((line) => String(line || "").trim().replace(/[.;]+$/g, ""))
    .filter(Boolean)
    .join(". ");
}

export function formatCanonicalPricingComparison(params: {
  locale?: string | null;
  kind?: "compare_plans" | "features_pricing";
  topic?: PricingCompareTopic;
}): { text: string; evidence: CanonicalCompareEvidenceItem[] } {
  const locale = localeOf(params.locale);
  const kind = params.kind === "features_pricing" ? "features_pricing" : "compare_plans";
  const topic = params.topic || "full";
  const page = getLocalizedPricingPage(locale);
  const rows = buildLocalizedPricingCompareRows({ includeGrowthEngines: false }, locale);
  const evidence = canonicalPricingCompareEvidence();
  const freePrice = formatCanonicalPlanPrices("free", locale);
  const proPrice = formatCanonicalPlanPrices("pro", locale);
  const markup = page.transparent.points.find((point) => /0\s*%/.test(point) || /markup/i.test(point));

  const topicRow = (key: string, fallbackLabel: string) => {
    const line = labeledRow(rowByKey(rows, key), locale);
    if (line) return line;
    return unverifiedOmit(locale, fallbackLabel);
  };

  if (topic === "users") {
    return { text: topicRow("users", locale === "es" ? "los límites de usuarios" : locale === "he" ? "מגבלות המשתמשים" : "user limits"), evidence };
  }
  if (topic === "whatsapp") {
    return {
      text: topicRow(
        "whatsappNumbers",
        locale === "es" ? "los números de WhatsApp" : locale === "he" ? "מספרי WhatsApp" : "WhatsApp-number limits",
      ),
      evidence,
    };
  }
  if (topic === "ai_brain") {
    const line = labeledRow(rowByKey(rows, "aiBrain"), locale);
    const trial = page.trialBanner.trim();
    const bits = [line, trial].filter(Boolean);
    return {
      text: bits.length ? bits.join(" ") : unverifiedOmit(locale, "AI Brain"),
      evidence,
    };
  }
  if (topic === "automation") {
    const workflow = labeledRow(rowByKey(rows, "workflowAutomation"), locale);
    const followUps = labeledRow(rowByKey(rows, "followUps"), locale);
    const bits = [workflow, followUps].filter(Boolean);
    return {
      text: bits.length ? bits.join(" ") : unverifiedOmit(locale, locale === "es" ? "las automatizaciones" : locale === "he" ? "האוטומציות" : "automations"),
      evidence,
    };
  }
  if (topic === "limits") {
    const bits = [
      labeledRow(rowByKey(rows, "users"), locale),
      labeledRow(rowByKey(rows, "whatsappNumbers"), locale),
      labeledRow(rowByKey(rows, "activeConversations"), locale),
    ].filter(Boolean);
    return { text: bits.join(" "), evidence };
  }
  if (topic === "pricing") {
    const line =
      locale === "es"
        ? `Free es ${freePrice}. Pro es ${proPrice}.`
        : locale === "he"
          ? `Free הוא ${freePrice}. Pro הוא ${proPrice}.`
          : `Free is ${freePrice}. Pro is ${proPrice}.`;
    return { text: line, evidence };
  }

  const freeHighlights = joinHighlights(getLocalizedPlanPricingHighlights("free", locale));
  const proHighlights = joinHighlights(getLocalizedPlanPricingHighlights("pro", locale));
  const lines: string[] = [intro(kind, locale), ""];
  lines.push(freePrice ? `Free — ${freePrice}` : "Free");
  if (freeHighlights) lines.push(`${freeHighlights}.`);
  lines.push("");
  lines.push(proPrice ? `Pro — ${proPrice}` : "Pro");
  if (proHighlights) lines.push(`${proHighlights}.`);
  const extras = [page.trialBanner.trim(), markup || ""].filter(Boolean);
  if (extras.length) {
    lines.push("");
    lines.push(extras.join(" "));
  }
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), evidence };
}

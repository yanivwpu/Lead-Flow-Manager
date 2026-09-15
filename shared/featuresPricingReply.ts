/**
 * Visitor-facing Free vs Pro answers realized from structured evidence ids.
 * Never copies catalog sentences or "USD 49 per month" prompt rendering.
 */

import { formatNaturalPrice } from "./chatbotCompletionContext";
import {
  listedPlanPrices,
  type FactMoney,
  type KnowledgeFact,
} from "./businessKnowledgeFacts";
import type { RetrievedFact } from "./knowledgeRetrieval";
import {
  extractSupportedAmountsFromText,
  supportingAmounts,
  type TurnEvidenceBundle,
} from "./turnEvidence";
import { normalizeWidgetStaticLocale, type WidgetStaticLocale } from "./webchatWidgetLocale";

const VAGUE_BENEFIT_RE =
  /clear (?:conversation|user) limits|free and pro plans with|various (?:needs|budgets)|competitively priced|contact us for (?:details|pricing)/i;

const SHARED_SCOPE_RE = /every plan|all plans|both plans|included on (?:every|all)/i;

const BENEFIT_IDS = [
  "ai_brain",
  "markup_0",
  "no_setup",
  "trial_14",
  "prospect_ai",
  "unified_inbox",
  "wa_templates",
] as const;

type BenefitId = (typeof BENEFIT_IDS)[number];

type BenefitHit = {
  id: BenefitId;
  whachat: boolean;
  conversationFees: boolean;
};

type PlanView = {
  name: string;
  prices: FactMoney[];
  hits: BenefitHit[];
};

function classifyBenefit(raw: string): BenefitHit | null {
  const t = String(raw || "")
    .toLowerCase()
    .replace(/[·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.length < 4 || VAGUE_BENEFIT_RE.test(t)) return null;
  let id: BenefitId | null = null;
  if (/ai brain/.test(t)) id = "ai_brain";
  else if (/0\s*%/.test(t) && /markup|meta/.test(t)) id = "markup_0";
  else if (/no setup/.test(t)) id = "no_setup";
  else if (/14[\s-]*day/.test(t) && /trial/.test(t)) id = "trial_14";
  else if (/prospect ai/.test(t)) id = "prospect_ai";
  else if (/unified inbox|shared inbox/.test(t)) id = "unified_inbox";
  else if (/whatsapp template|integrat/.test(t)) id = "wa_templates";
  if (!id) return null;
  return {
    id,
    whachat: /whachat/.test(t),
    conversationFees: /conversation/.test(t),
  };
}

function mergeHit(existing: BenefitHit | undefined, incoming: BenefitHit): BenefitHit {
  if (!existing) return incoming;
  return {
    id: incoming.id,
    whachat: existing.whachat || incoming.whachat,
    conversationFees: existing.conversationFees || incoming.conversationFees,
  };
}

function collectHits(raw: string[]): BenefitHit[] {
  const byId = new Map<BenefitId, BenefitHit>();
  const order: BenefitId[] = [];
  for (const item of raw) {
    const hit = classifyBenefit(item);
    if (!hit) continue;
    if (!byId.has(hit.id)) order.push(hit.id);
    byId.set(hit.id, mergeHit(byId.get(hit.id), hit));
  }
  return order.map((id) => byId.get(id)!);
}

function planNameRank(name: string): number {
  const n = name.trim().toLowerCase();
  if (n === "free") return 0;
  if (n === "pro") return 1;
  return 10;
}

function formatVisitorPrice(money: FactMoney, locale: WidgetStaticLocale): string {
  if (money.currency === "USD" && (money.billingPeriod === "month" || money.billingPeriod === "year")) {
    return formatNaturalPrice(money.amount, money.billingPeriod, locale);
  }
  const amount = Number.isInteger(money.amount) ? String(money.amount) : money.amount.toFixed(2);
  if (money.billingPeriod === "once") return `${money.currency} ${amount}`;
  return `${money.currency} ${amount}/${money.billingPeriod}`;
}

function formatPlanPrices(prices: FactMoney[], locale: WidgetStaticLocale): string {
  const bits = prices.map((p) => formatVisitorPrice(p, locale));
  if (bits.length <= 1) return bits[0] || "";
  // Comma keeps month+year on one visitor line while amount-identity
  // matching still treats the yearly figure as the same published Pro plan.
  const sep = locale === "he" ? ", או " : locale === "es" ? ", o " : ", or ";
  return bits.join(sep);
}

function collectPlans(retrieved: RetrievedFact[], conflictingKeys?: string[]): PlanView[] {
  const blocked = new Set(conflictingKeys ?? []);
  const byName = new Map<string, { name: string; prices: FactMoney[]; raw: string[] }>();
  const extras: string[] = [];
  for (const entry of retrieved) {
    const fact = entry.fact as KnowledgeFact;
    if (blocked.has(fact.factKey)) continue;
    if (fact.factType === "pricing_plan") {
      const d = fact.data as {
        name?: string;
        price?: FactMoney | null;
        additionalPrices?: FactMoney[];
        benefits?: string[];
        priceQualifier?: "from" | "up_to" | "exact";
      };
      const name = String(d.name || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = byName.get(key) || { name, prices: [], raw: [] };
      const incoming = listedPlanPrices({
        name,
        description: null,
        price: d.price ?? null,
        additionalPrices: d.additionalPrices || [],
        priceQualifier: d.priceQualifier || "exact",
        benefits: [],
      });
      const seen = new Set(existing.prices.map((p) => `${p.currency}:${p.amount}:${p.billingPeriod}`));
      for (const price of incoming) {
        const id = `${price.currency}:${price.amount}:${price.billingPeriod}`;
        if (seen.has(id)) continue;
        seen.add(id);
        existing.prices.push(price);
      }
      existing.raw.push(...(Array.isArray(d.benefits) ? d.benefits : []));
      byName.set(key, existing);
      continue;
    }
    if (fact.factType === "benefit") {
      const d = fact.data as { statement?: string; appliesTo?: string | null };
      const statement = String(d.statement || "").trim();
      if (!statement) continue;
      const applies = String(d.appliesTo || "").trim().toLowerCase();
      if (applies && byName.has(applies)) {
        byName.get(applies)!.raw.push(statement);
      } else {
        extras.push(statement);
      }
    }
  }
  for (const extra of extras) {
    if (SHARED_SCOPE_RE.test(extra) || classifyBenefit(extra)?.id === "prospect_ai") {
      for (const plan of byName.values()) plan.raw.push(extra);
    }
  }
  for (const plan of byName.values()) {
    for (const b of [...plan.raw]) {
      if (!SHARED_SCOPE_RE.test(b) && classifyBenefit(b)?.id !== "prospect_ai") continue;
      for (const other of byName.values()) {
        if (other !== plan) other.raw.push(b);
      }
    }
  }
  return [...byName.values()]
    .map((plan) => ({ name: plan.name, prices: plan.prices, hits: collectHits(plan.raw) }))
    .sort((a, b) => planNameRank(a.name) - planNameRank(b.name) || a.name.localeCompare(b.name));
}

function realizeBenefit(hit: BenefitHit, locale: WidgetStaticLocale): string {
  if (hit.id === "ai_brain") return "AI Brain";
  if (hit.id === "trial_14") {
    if (locale === "es") return "una prueba Pro de 14 días";
    if (locale === "he") return "ניסיון Pro ל-14 יום";
    return "a 14-day Pro trial";
  }
  if (hit.id === "markup_0") {
    if (locale === "es") {
      const esFees = hit.conversationFees || hit.whachat ? "tarifas de conversación" : "tarifas";
      const brandBit = hit.whachat ? "de WhachatCRM " : "";
      return `0% de recargo ${brandBit}en las ${esFees} de Meta`;
    }
    if (locale === "he") {
      const heFees = hit.conversationFees || hit.whachat ? "עמלות השיחה" : "העמלות";
      const brandBit = hit.whachat ? "WhachatCRM " : "";
      return `0% תוספת ${brandBit}על ${heFees} של Meta`;
    }
    const brandBit = hit.whachat ? "WhachatCRM " : "";
    const fees = hit.conversationFees || hit.whachat ? "conversation fees" : "fees";
    return `0% ${brandBit}markup on Meta ${fees}`;
  }
  if (hit.id === "wa_templates") {
    if (locale === "es") return "integraciones y plantillas básicas de WhatsApp";
    if (locale === "he") return "אינטגרציות ותבניות WhatsApp בסיסיות";
    return "integrations and basic WhatsApp templates";
  }
  if (hit.id === "unified_inbox") {
    if (locale === "es") return "bandeja unificada";
    if (locale === "he") return "תיבת דואר מאוחדת";
    return "a unified inbox";
  }
  if (hit.id === "prospect_ai") return "Prospect AI";
  if (hit.id === "no_setup") {
    if (locale === "es") return "sin cuotas de alta";
    if (locale === "he") return "בלי דמי הקמה";
    return "no setup fees";
  }
  return "";
}

function includesLine(items: string[], locale: WidgetStaticLocale): string {
  if (!items.length) return "";
  if (items.length === 1) {
    if (locale === "es") return `Incluye ${items[0]}.`;
    if (locale === "he") return `כולל ${items[0]}.`;
    return `Includes ${items[0]}.`;
  }
  const last = items[items.length - 1];
  const rest = items.slice(0, -1).join(", ");
  if (locale === "es") return `Incluye ${rest} y ${last}.`;
  if (locale === "he") return `כולל ${rest} ו-${last}.`;
  return `Includes ${rest}, and ${last}.`;
}

function sharedClosing(hits: BenefitHit[], locale: WidgetStaticLocale): string {
  const hasProspect = hits.some((h) => h.id === "prospect_ai");
  const hasSetup = hits.some((h) => h.id === "no_setup");
  if (hasProspect && hasSetup) {
    if (locale === "es") return "Prospect AI está disponible en todos los planes, y no hay cuotas de alta.";
    if (locale === "he") return "Prospect AI זמין בכל תוכנית, ואין דמי הקמה.";
    return "Prospect AI is available on every plan, and there are no setup fees.";
  }
  if (hasProspect) {
    if (locale === "es") return "Prospect AI está disponible en todos los planes.";
    if (locale === "he") return "Prospect AI זמין בכל תוכנית.";
    return "Prospect AI is available on every plan.";
  }
  if (hasSetup) {
    if (locale === "es") return "No hay cuotas de alta.";
    if (locale === "he") return "אין דמי הקמה.";
    return "There are no setup fees.";
  }
  return "";
}

function followUp(locale: WidgetStaticLocale): string {
  if (locale === "es") return "¿Quieres una comparación lado a lado o una estimación de ahorro?";
  if (locale === "he") return "רוצים השוואה בין התוכניות או הערכת חיסכון?";
  return "Would you like a side-by-side comparison or a savings estimate?";
}

function intro(locale: WidgetStaticLocale, count: number): string {
  if (count <= 1) return "";
  if (locale === "es") return "Hay dos planes:";
  if (locale === "he") return "יש שתי תוכניות:";
  return "There are two plans:";
}

function sharedHits(plans: PlanView[]): BenefitHit[] {
  const counts = new Map<BenefitId, number>();
  const merged = new Map<BenefitId, BenefitHit>();
  for (const plan of plans) {
    const seen = new Set<BenefitId>();
    for (const hit of plan.hits) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      counts.set(hit.id, (counts.get(hit.id) || 0) + 1);
      merged.set(hit.id, mergeHit(merged.get(hit.id), hit));
    }
  }
  const out: BenefitHit[] = [];
  const threshold = Math.min(2, plans.length);
  for (const hit of merged.values()) {
    const count = counts.get(hit.id) || 0;
    if (hit.id === "prospect_ai" && count >= threshold) out.push(hit);
    else if (hit.id === "no_setup" && count >= 1) out.push(hit);
  }
  return out;
}

function exclusiveHits(plan: PlanView, sharedIds: Set<BenefitId>): BenefitHit[] {
  const rank: Record<string, number> = {
    ai_brain: 0,
    trial_14: 1,
    unified_inbox: 2,
    wa_templates: 3,
    markup_0: 4,
  };
  return plan.hits
    .filter((h) => !sharedIds.has(h.id) && h.id !== "prospect_ai" && h.id !== "no_setup")
    .sort((a, b) => (rank[a.id] ?? 20) - (rank[b.id] ?? 20));
}

function canonicalAmountSet(plans: PlanView[], bundle?: TurnEvidenceBundle): Set<string> {
  const out = new Set<string>();
  for (const plan of plans) {
    for (const price of plan.prices) {
      out.add(String(price.amount).replace(/\.0+$/, ""));
    }
  }
  if (bundle) {
    for (const amount of supportingAmounts(bundle)) {
      if (amount.amount) out.add(amount.amount);
    }
  }
  return out;
}

function draftAmountsSupported(draft: string, allowed: Set<string>): boolean {
  const claimed = extractSupportedAmountsFromText(draft, "website_chunk");
  for (const item of claimed) {
    if (!allowed.has(item.amount)) return false;
  }
  return true;
}

export function isRoboticFeaturesPricingDraft(draft: string): boolean {
  const text = String(draft || "");
  if (!text.trim()) return true;
  if (/USD\s+\d[\d.,]*\s+per\s+(month|year)/i.test(text)) return true;
  if (/\bIt includes:/i.test(text)) return true;
  if (/\bon Free\b|\bincluded with Pro\b/i.test(text)) return true;
  if (/^or\s+\$/m.test(text)) return true;
  if (/VERIFIED BUSINESS FACTS|tenant_chunk|published_fact|factKey/i.test(text)) return true;
  const keys = text
    .split(/[·;.\n]/)
    .map((part) => classifyBenefit(part)?.id)
    .filter((id): id is BenefitId => Boolean(id));
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function assembleFeaturesPricingReply(params: {
  retrieved: RetrievedFact[];
  conflictingKeys?: string[];
  locale?: string | null;
  bundle?: TurnEvidenceBundle;
}): string | null {
  const locale = normalizeWidgetStaticLocale(params.locale);
  const plans = collectPlans(params.retrieved, params.conflictingKeys).filter(
    (p) => p.prices.length > 0 || p.hits.length > 0,
  );
  if (plans.length === 0) return null;
  const shared = sharedHits(plans);
  const sharedIds = new Set(shared.map((h) => h.id));
  const lines: string[] = [];
  const heading = intro(locale, plans.length);
  if (heading) lines.push(heading, "");
  for (const plan of plans) {
    const priceBit = formatPlanPrices(plan.prices, locale);
    lines.push(priceBit ? `${plan.name} — ${priceBit}` : plan.name);
    const exclusive = exclusiveHits(plan, sharedIds)
      .slice(0, 4)
      .map((hit) => realizeBenefit(hit, locale))
      .filter(Boolean);
    const include = includesLine(exclusive, locale);
    if (include) lines.push(include);
    lines.push("");
  }
  const closing = sharedClosing(shared, locale);
  if (closing) {
    lines.push(closing, "");
  }
  lines.push(followUp(locale));
  const draft = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const allowed = canonicalAmountSet(plans, params.bundle);
  if (!draftAmountsSupported(draft, allowed)) return null;
  if (/USD\s+\d/i.test(draft) && /per\s+(month|year)/i.test(draft)) return null;
  return draft;
}

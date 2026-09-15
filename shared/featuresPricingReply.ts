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
  evaluateBundleAmountGrounding,
  extractSupportedAmountsFromText,
  supportingAmounts,
  type TurnEvidenceBundle,
} from "./turnEvidence";
import {
  classifyPricingCompareTopic,
  formatCanonicalPricingComparison,
  parentUrlAllowsCanonicalWhachatCatalog,
} from "./webchatPricingCompare";
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

type PlanAccum = { name: string; prices: FactMoney[]; raw: string[] };

export type FeaturesPricingRealizeOutcome = "formatted" | "clarification" | "formatter_error";

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

function priceJoin(locale: WidgetStaticLocale, compact: boolean): string {
  if (locale === "he") return compact ? ", או " : " או ";
  if (locale === "es") return compact ? ", o " : " o ";
  return compact ? ", or " : " or ";
}

function formatPlanPrices(prices: FactMoney[], locale: WidgetStaticLocale, compact = false): string {
  const bits = prices.map((p) => formatVisitorPrice(p, locale)).filter(Boolean);
  if (bits.length <= 1) return bits[0] || "";
  return bits.join(priceJoin(locale, compact));
}

function pushUniquePrice(existing: PlanAccum, price: FactMoney): void {
  if (!price || !Number.isFinite(price.amount)) return;
  const id = `${price.currency}:${price.amount}:${price.billingPeriod}`;
  if (existing.prices.some((p) => `${p.currency}:${p.amount}:${p.billingPeriod}` === id)) return;
  existing.prices.push(price);
}

function ensurePlan(byName: Map<string, PlanAccum>, name: string): PlanAccum {
  const key = name.toLowerCase();
  const existing = byName.get(key) || { name, prices: [], raw: [] };
  byName.set(key, existing);
  return existing;
}

function mentionsFreePlan(lower: string): boolean {
  if (!/\bfree\b/.test(lower)) return false;
  if (/\b\d+[\s-]*day\s+free\b/.test(lower)) return false;
  if (/\bfree\s+pro\s+trial\b/.test(lower)) return false;
  return true;
}

function absorbEvidenceText(text: string, byName: Map<string, PlanAccum>, extras: string[]): void {
  const src = String(text || "");
  if (!src.trim()) return;
  for (const line of src.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const clauses = trimmed
      .split(/\s*[·;]\s*|(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const clause of clauses.length ? clauses : [trimmed]) {
      const lower = clause.toLowerCase();
      const mentionsFree = mentionsFreePlan(lower);
      const mentionsPro = /\bpro\b/.test(lower);
      const amounts = extractSupportedAmountsFromText(clause, "website_chunk");
      const fragments = [clause];
      const assign = (name: string, withFragments: boolean) => {
        const existing = ensurePlan(byName, name);
        const key = name.toLowerCase();
        for (const extracted of amounts) {
          const amount = Number(String(extracted.amount || "").replace(/,/g, ""));
          if (!Number.isFinite(amount)) continue;
          if (extracted.interval !== "month" && extracted.interval !== "year") continue;
          const identity = (extracted.identity || "").toLowerCase();
          if (mentionsFree && mentionsPro && identity && !identity.includes(key)) continue;
          pushUniquePrice(existing, {
            amount,
            currency:
              extracted.currency === "EUR" || extracted.currency === "GBP" || extracted.currency === "ILS"
                ? extracted.currency
                : "USD",
            billingPeriod: extracted.interval,
          });
        }
        if (withFragments) existing.raw.push(...fragments);
      };
      if (mentionsFree && !mentionsPro) assign("Free", true);
      else if (mentionsPro && !mentionsFree) assign("Pro", true);
      else if (mentionsFree && mentionsPro) {
        assign("Free", false);
        assign("Pro", false);
        extras.push(...fragments);
      } else {
        extras.push(...fragments);
      }
    }
  }
}

function collectPlans(
  retrieved: RetrievedFact[],
  conflictingKeys?: string[],
  bundle?: TurnEvidenceBundle,
): PlanView[] {
  const blocked = new Set(conflictingKeys ?? []);
  const byName = new Map<string, PlanAccum>();
  const extras: string[] = [];
  for (const entry of retrieved || []) {
    if (!entry?.fact) continue;
    const fact = entry.fact as KnowledgeFact;
    if (blocked.has(fact.factKey)) continue;
    if (fact.factType === "pricing_plan") {
      const d = (fact.data || {}) as {
        name?: string;
        price?: FactMoney | null;
        additionalPrices?: FactMoney[];
        benefits?: string[];
        priceQualifier?: "from" | "up_to" | "exact";
      };
      const name = String(d?.name || "").trim();
      if (!name) continue;
      const existing = ensurePlan(byName, name);
      try {
        const incoming = listedPlanPrices({
          name,
          description: null,
          price: d.price ?? null,
          additionalPrices: Array.isArray(d.additionalPrices) ? d.additionalPrices : [],
          priceQualifier: d.priceQualifier || "exact",
          benefits: [],
        });
        for (const price of incoming) pushUniquePrice(existing, price);
      } catch {
        /* omit a malformed price object rather than failing the turn */
      }
      existing.raw.push(...(Array.isArray(d.benefits) ? d.benefits : []));
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
  if (bundle) {
    for (const item of bundle.items || []) {
      if (!item || item.inactive) continue;
      absorbEvidenceText(String(item.text || ""), byName, extras);
    }
  }
  for (const extra of extras) {
    const extraId = classifyBenefit(extra)?.id;
    if (SHARED_SCOPE_RE.test(extra) || extraId === "prospect_ai" || extraId === "no_setup") {
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
  if (locale === "es") return "Si quieres, puedo revisar un límite concreto.";
  if (locale === "he") return "אפשר גם לעבור על מגבלה ספציפית.";
  return "I can also walk through a specific limit if you want more detail.";
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

function renderFeaturesPricingDraft(
  plans: PlanView[],
  locale: WidgetStaticLocale,
  compactPrices: boolean,
): string {
  const shared = sharedHits(plans);
  const sharedIds = new Set(shared.map((h) => h.id));
  const lines: string[] = [];
  const heading = intro(locale, plans.length);
  if (heading) lines.push(heading, "");
  for (const plan of plans) {
    const priceBit = formatPlanPrices(plan.prices, locale, compactPrices);
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
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

export function featuresPricingClarification(locale?: string | null): string {
  const loc = normalizeWidgetStaticLocale(locale);
  if (loc === "es") {
    return "Puedo explicarte los planes Free y Pro publicados. Pregunta por un precio o un límite del plan y usaré los datos verificados.";
  }
  if (loc === "he") {
    return "אפשר לעבור איתכם על תוכניות Free ו-Pro שפורסמו. שאלו על מחיר או מגבלת תוכנית ואשתמש בפרטים המאומתים.";
  }
  return "I can walk you through the published Free and Pro plans. Ask about a price or plan limit and I will use the verified details.";
}

function finalizeDraft(draft: string, plans: PlanView[], bundle?: TurnEvidenceBundle): string | null {
  const allowed = canonicalAmountSet(plans, bundle);
  if (!draftAmountsSupported(draft, allowed)) return null;
  if (/USD\s+\d/i.test(draft) && /per\s+(month|year)/i.test(draft)) return null;
  if (bundle) {
    const natural = evaluateBundleAmountGrounding({ draft, bundle });
    if (natural.ok) return draft;
    return null;
  }
  return draft;
}

export function assembleFeaturesPricingReply(params: {
  retrieved: RetrievedFact[];
  conflictingKeys?: string[];
  locale?: string | null;
  bundle?: TurnEvidenceBundle;
}): string | null {
  const locale = normalizeWidgetStaticLocale(params.locale);
  const plans = collectPlans(params.retrieved || [], params.conflictingKeys, params.bundle).filter(
    (p) => p.prices.length > 0 || p.hits.length > 0,
  );
  if (plans.length === 0) return null;
  const natural = renderFeaturesPricingDraft(plans, locale, false);
  const naturalOk = finalizeDraft(natural, plans, params.bundle);
  if (naturalOk) return naturalOk;
  const compact = renderFeaturesPricingDraft(plans, locale, true);
  return finalizeDraft(compact, plans, params.bundle);
}

export function realizeTrustedFeaturesPricingReply(params: {
  retrieved: RetrievedFact[];
  conflictingKeys?: string[];
  locale?: string | null;
  bundle?: TurnEvidenceBundle;
  useCanonicalCatalog?: boolean;
  parentUrl?: string | null;
  inbound?: string | null;
  pageActionKind?: string | null;
}): { text: string; outcome: FeaturesPricingRealizeOutcome } {
  const useCanonical =
    params.useCanonicalCatalog === true || parentUrlAllowsCanonicalWhachatCatalog(params.parentUrl);
  try {
    if (useCanonical) {
      const kind = params.pageActionKind === "features_pricing" ? "features_pricing" : "compare_plans";
      const formatted = formatCanonicalPricingComparison({
        locale: params.locale,
        kind,
        topic: classifyPricingCompareTopic(params.inbound),
      });
      if (formatted.text.trim()) {
        const grounded = finalizeDraft(formatted.text, [], params.bundle);
        if (grounded) return { text: grounded, outcome: "formatted" };
        if (!params.bundle) return { text: formatted.text, outcome: "formatted" };
      }
    }
    const formatted = assembleFeaturesPricingReply(params);
    if (formatted && formatted.trim()) return { text: formatted, outcome: "formatted" };
    if (useCanonical) {
      const fallback = formatCanonicalPricingComparison({
        locale: params.locale,
        kind: params.pageActionKind === "features_pricing" ? "features_pricing" : "compare_plans",
        topic: classifyPricingCompareTopic(params.inbound),
      });
      if (fallback.text.trim()) return { text: fallback.text, outcome: "formatted" };
    }
    return { text: featuresPricingClarification(params.locale), outcome: "clarification" };
  } catch {
    if (useCanonical) {
      try {
        const fallback = formatCanonicalPricingComparison({
          locale: params.locale,
          kind: params.pageActionKind === "features_pricing" ? "features_pricing" : "compare_plans",
          topic: "full",
        });
        if (fallback.text.trim()) return { text: fallback.text, outcome: "formatter_error" };
      } catch {
        /* fall through to clarification without prices */
      }
    }
    return { text: featuresPricingClarification(params.locale), outcome: "formatter_error" };
  }
}

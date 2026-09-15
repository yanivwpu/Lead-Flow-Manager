/**
 * Visitor-facing Free vs Pro answers synthesized from selected evidence.
 * Never copies catalog labels or "USD 49 per month" prompt rendering.
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

const SHARED_BENEFIT_RE = /every plan|all plans|both plans|included on (?:every|all)/i;

type PlanView = {
  name: string;
  prices: FactMoney[];
  benefits: string[];
};

function normalizeBenefitKey(raw: string): string {
  const t = String(raw || "")
    .toLowerCase()
    .replace(/[·•]/g, " ")
    .replace(/[^a-z0-9%]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/ai brain/.test(t)) return "ai_brain";
  if (/0\s*%/.test(t) && /markup|meta/.test(t)) return "markup_0";
  if (/no setup/.test(t)) return "no_setup";
  if (/14[\s-]*day/.test(t) && /trial/.test(t)) return "trial_14";
  if (/prospect ai/.test(t)) return "prospect_ai";
  if (/unified inbox|shared inbox/.test(t)) return "unified_inbox";
  if (/whatsapp template/.test(t)) return "wa_templates";
  return t.slice(0, 80);
}

function isVagueBenefit(text: string): boolean {
  const t = String(text || "").trim();
  if (t.length < 4) return true;
  return VAGUE_BENEFIT_RE.test(t);
}

function preferBenefitText(current: string, incoming: string): string {
  if (incoming.length > current.length) return incoming;
  return current;
}

function dedupeBenefits(items: string[]): string[] {
  const byKey = new Map<string, string>();
  const order: string[] = [];
  for (const raw of items) {
    const text = String(raw || "").replace(/\s+/g, " ").trim();
    if (!text || isVagueBenefit(text)) continue;
    const key = normalizeBenefitKey(text);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, text);
      order.push(key);
      continue;
    }
    byKey.set(key, preferBenefitText(existing, text));
  }
  return order.map((key) => byKey.get(key)!);
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

function collectPlans(retrieved: RetrievedFact[], conflictingKeys?: string[]): PlanView[] {
  const blocked = new Set(conflictingKeys ?? []);
  const byName = new Map<string, PlanView>();
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
      const existing = byName.get(key) || { name, prices: [], benefits: [] };
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
      existing.benefits.push(...(Array.isArray(d.benefits) ? d.benefits : []));
      byName.set(key, existing);
      continue;
    }
    if (fact.factType === "benefit") {
      const d = fact.data as { statement?: string; appliesTo?: string | null };
      const statement = String(d.statement || "").trim();
      if (!statement) continue;
      const applies = String(d.appliesTo || "").trim().toLowerCase();
      if (applies && byName.has(applies)) {
        byName.get(applies)!.benefits.push(statement);
      } else {
        extras.push(statement);
      }
    }
  }
  for (const extra of extras) {
    if (SHARED_BENEFIT_RE.test(extra)) {
      for (const plan of byName.values()) plan.benefits.push(extra);
    }
  }
  for (const plan of byName.values()) {
    for (const b of [...plan.benefits]) {
      if (!SHARED_BENEFIT_RE.test(b)) continue;
      for (const other of byName.values()) {
        if (other !== plan) other.benefits.push(b);
      }
    }
  }
  return [...byName.values()]
    .map((plan) => ({ ...plan, benefits: dedupeBenefits(plan.benefits) }))
    .sort((a, b) => planNameRank(a.name) - planNameRank(b.name) || a.name.localeCompare(b.name));
}

function followUp(locale: WidgetStaticLocale): string {
  if (locale === "es") return "¿Quieres que compare los límites de cada plan o estime tu ahorro?";
  if (locale === "he") return "רוצים שאבדוק את מגבלות התוכניות או שאעריך את החיסכון?";
  return "Would you like me to compare the plan limits or estimate your savings?";
}

function intro(locale: WidgetStaticLocale, count: number): string {
  if (count <= 1) return "";
  if (locale === "es") return "Hay dos planes:";
  if (locale === "he") return "יש שתי תוכניות:";
  return "There are two plans:";
}

function includesPrefix(locale: WidgetStaticLocale): string {
  if (locale === "es") return "Incluye ";
  if (locale === "he") return "כולל ";
  return "Includes ";
}

function joinList(items: string[], locale: WidgetStaticLocale): string {
  if (items.length <= 1) return items[0] || "";
  if (locale === "he") return items.join(" · ");
  const last = items[items.length - 1];
  const rest = items.slice(0, -1).join(", ");
  return locale === "es" ? `${rest} y ${last}` : `${rest}, and ${last}`;
}

function orWord(locale: WidgetStaticLocale): string {
  if (locale === "es") return "o";
  if (locale === "he") return "או";
  return "or";
}

function sharedClosing(plans: PlanView[]): string[] {
  const keys = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const plan of plans) {
    const seen = new Set<string>();
    for (const b of plan.benefits) {
      const key = normalizeBenefitKey(b);
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!keys.has(key)) keys.set(key, b);
      else keys.set(key, preferBenefitText(keys.get(key)!, b));
    }
  }
  const out: string[] = [];
  if ((counts.get("prospect_ai") || 0) >= Math.min(2, plans.length) && keys.get("prospect_ai")) {
    out.push(keys.get("prospect_ai")!);
  }
  if ((counts.get("no_setup") || 0) >= 1 && keys.get("no_setup")) {
    out.push(keys.get("no_setup")!);
  }
  return dedupeBenefits(out);
}

function planExclusiveBenefits(plan: PlanView, sharedKeys: Set<string>): string[] {
  return plan.benefits.filter((b) => !sharedKeys.has(normalizeBenefitKey(b)));
}

function canonicalAmountSet(plans: PlanView[], bundle?: TurnEvidenceBundle): Set<string> {
  const out = new Set<string>();
  for (const plan of plans) {
    for (const price of plan.prices) {
      const n = Number.isInteger(price.amount) ? String(price.amount) : String(price.amount);
      out.add(n.replace(/\.0+$/, ""));
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
  if (/VERIFIED BUSINESS FACTS|tenant_chunk|published_fact|factKey/i.test(text)) return true;
  const keys = text
    .split(/[·;.\n]/)
    .map((part) => normalizeBenefitKey(part))
    .filter((k) => k.length >= 8);
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function pushPlanBlock(lines: string[], plan: PlanView, locale: WidgetStaticLocale, exclusive: string[]) {
  const prices = plan.prices.map((p) => formatVisitorPrice(p, locale));
  if (prices.length === 0) {
    lines.push(plan.name);
  } else {
    lines.push(`${plan.name} — ${prices[0]}`);
    for (const extra of prices.slice(1)) {
      lines.push(`${orWord(locale)} ${extra}`);
    }
  }
  if (!exclusive.length) return;
  if (planNameRank(plan.name) === 0) {
    lines.push(exclusive[0]);
    return;
  }
  lines.push(`${includesPrefix(locale)}${joinList(exclusive.slice(0, 4), locale)}.`);
}

export function assembleFeaturesPricingReply(params: {
  retrieved: RetrievedFact[];
  conflictingKeys?: string[];
  locale?: string | null;
  bundle?: TurnEvidenceBundle;
}): string | null {
  const locale = normalizeWidgetStaticLocale(params.locale);
  const plans = collectPlans(params.retrieved, params.conflictingKeys).filter(
    (p) => p.prices.length > 0 || p.benefits.length > 0,
  );
  if (plans.length === 0) return null;
  const shared = sharedClosing(plans);
  const sharedKeys = new Set(shared.map(normalizeBenefitKey));
  const lines: string[] = [];
  const heading = intro(locale, plans.length);
  if (heading) lines.push(heading, "");
  for (const plan of plans) {
    pushPlanBlock(lines, plan, locale, planExclusiveBenefits(plan, sharedKeys));
    lines.push("");
  }
  if (shared.length) {
    lines.push(shared.map((s) => (/[.!?…]$/.test(s) ? s : `${s}.`)).join(" "));
    lines.push("");
  }
  lines.push(followUp(locale));
  const draft = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const allowed = canonicalAmountSet(plans, params.bundle);
  if (!draftAmountsSupported(draft, allowed)) return null;
  if (/USD\s+\d/i.test(draft) && /per\s+(month|year)/i.test(draft)) return null;
  return draft;
}

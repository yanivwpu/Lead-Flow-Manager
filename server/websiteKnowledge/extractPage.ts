/**
 * Deterministic, per-page extraction. No model calls.
 *
 * Runs before the AI pass and owns everything that can be read literally off the page:
 * JSON-LD, prices with a billing period, contact links, hours, FAQ pairs. Facts produced
 * here carry origin `website_verified`, which outranks anything the model infers from the
 * same page — a literal on-page price always beats a paraphrase.
 *
 * `prepareHtmlPage` is pure so fixtures can be tested without network access.
 */

import { createHash } from "node:crypto";
import {
  factKey,
  parseFactData,
  truncateExcerpt,
  type FactCandidate,
  type FactType,
} from "@shared/businessKnowledgeFacts";
import { fetchPublicHtmlPage } from "../websiteKnowledgeScraper";
import type { SourceDetectedType } from "./sourceStore";

export const MAX_PAGE_TEXT = 60_000;
/** Below this, a page is almost certainly client-rendered and we say so instead of guessing. */
const MIN_MEANINGFUL_TEXT = 120;

export type PreparedPage = {
  finalUrl: string;
  title: string | null;
  /** Structure-preserving text: one line per block, `- ` for list items, ` | ` between cells. */
  text: string;
  charCount: number;
  contentHash: string;
  detectedType: SourceDetectedType;
  jsonLd: unknown[];
  truncated: boolean;
  /** True when the fetch succeeded but yielded no readable text (client-rendered page). */
  renderedEmpty: boolean;
};

// ---------------------------------------------------------------------------
// HTML -> structured text
// ---------------------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&bull;": "•",
  "&pound;": "£",
  "&euro;": "€",
  "&yen;": "¥",
  "&cent;": "¢",
};

function decodeEntities(input: string): string {
  let out = input;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    out = out.split(entity).join(char);
  }
  return out
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)));
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

export function extractPageTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return title || null;
}

/**
 * Keeps block structure so a pricing card's name, price, and bullet list stay adjacent.
 * Flattening everything to one line is what makes benefits detach from their plan.
 */
export function cleanHtmlToStructuredText(html: string, maxLen = MAX_PAGE_TEXT): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ");

  // Prefer <main> when the page marks it; otherwise drop chrome that repeats site-wide.
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(s);
  if (main && main[1].length > 400) {
    s = main[1];
  } else {
    s = s
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  }

  s = s
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|h5|h6|tr|ul|ol|dl|dd|dt|blockquote|figcaption|label|button|span)>/gi, "\n")
    .replace(/<(h1|h2|h3|h4|h5|h6|p|section|article|tr|dt)[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ");

  s = decodeEntities(s);

  const lines = s
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").replace(/\s\|\s*$/, "").trim())
    .filter((line) => line.length > 0);

  const deduped: string[] = [];
  for (const line of lines) {
    // Collapse the immediate repeats that markup duplication produces.
    if (deduped[deduped.length - 1] === line) continue;
    deduped.push(line);
  }

  return deduped.join("\n").slice(0, maxLen).trim();
}

export function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(decodeEntities(raw));
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      /* malformed JSON-LD is common; ignore rather than fail the page */
    }
  }
  // Flatten @graph containers so callers see plain nodes.
  const flattened: unknown[] = [];
  for (const node of out) {
    if (node && typeof node === "object" && Array.isArray((node as any)["@graph"])) {
      flattened.push(...((node as any)["@graph"] as unknown[]));
    } else {
      flattened.push(node);
    }
  }
  return flattened;
}

function jsonLdTypes(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const raw = (node as Record<string, unknown>)["@type"];
  if (typeof raw === "string") return [raw.toLowerCase()];
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase());
  return [];
}

// ---------------------------------------------------------------------------
// Page classification
// ---------------------------------------------------------------------------

const TYPE_PATTERNS: Array<{ type: SourceDetectedType; re: RegExp }> = [
  { type: "pricing", re: /\b(pricing|prices|plans|packages|rates|advertis(?:e|ing)|membership|subscribe|subscription)\b/i },
  { type: "faq", re: /\b(faq|faqs|frequently\s+asked|questions?\s+and\s+answers?|help\s*center|support\s*center)\b/i },
  { type: "policy", re: /\b(policy|policies|terms|privacy|refund|returns?|shipping|cancellation|guarantee|legal)\b/i },
  { type: "contact", re: /\b(contact|get\s+in\s+touch|reach\s+us|book(?:ing)?|schedule|appointments?)\b/i },
  { type: "locations", re: /\b(locations?|store\s*locator|areas?\s+we\s+serve|service\s+areas?|branches|directions|hours)\b/i },
  { type: "services", re: /\b(services?|products?|solutions?|what\s+we\s+do|offerings?|features?|shop|catalog)\b/i },
  { type: "about", re: /\b(about|our\s+story|who\s+we\s+are|team|company|mission)\b/i },
];

/**
 * Path first (most reliable), then title, then the first headings. JSON-LD only settles
 * the answer when nothing else matched, since a site-wide Organization block appears
 * on every page.
 */
export function classifyPage(params: {
  url: string;
  title?: string | null;
  text?: string;
  jsonLd?: unknown[];
}): SourceDetectedType {
  let path = "";
  try {
    path = new URL(params.url).pathname;
  } catch {
    path = params.url;
  }
  const pathSlug = path.replace(/[-_/]+/g, " ");
  for (const { type, re } of TYPE_PATTERNS) {
    if (re.test(pathSlug)) return type;
  }

  const title = params.title || "";
  for (const { type, re } of TYPE_PATTERNS) {
    if (re.test(title)) return type;
  }

  const headings = (params.text || "").split("\n").slice(0, 25).join(" ");
  for (const { type, re } of TYPE_PATTERNS) {
    if (re.test(headings)) return type;
  }

  for (const node of params.jsonLd || []) {
    const types = jsonLdTypes(node);
    if (types.includes("faqpage")) return "faq";
    if (types.includes("product") || types.includes("offer") || types.includes("aggregateoffer")) {
      return "pricing";
    }
    if (types.includes("localbusiness") || types.includes("place")) return "locations";
  }

  return "other";
}

// ---------------------------------------------------------------------------
// Page preparation
// ---------------------------------------------------------------------------

export function prepareHtmlPage(html: string, finalUrl: string, truncated = false): PreparedPage {
  const title = extractPageTitle(html);
  const text = cleanHtmlToStructuredText(html);
  const jsonLd = extractJsonLdBlocks(html);
  return {
    finalUrl,
    title,
    text,
    charCount: text.length,
    contentHash: createHash("sha256").update(text).digest("hex"),
    detectedType: classifyPage({ url: finalUrl, title, text, jsonLd }),
    jsonLd,
    truncated,
    renderedEmpty: text.length < MIN_MEANINGFUL_TEXT,
  };
}

export async function fetchAndPreparePage(
  url: string,
  signal?: AbortSignal,
): Promise<PreparedPage> {
  const { finalUrl, html, truncated } = await fetchPublicHtmlPage(url, signal);
  return prepareHtmlPage(html, finalUrl, truncated);
}

// ---------------------------------------------------------------------------
// Money parsing
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "US$": "USD",
  "€": "EUR",
  "£": "GBP",
  "₪": "ILS",
  "¥": "JPY",
  "₹": "INR",
  "₩": "KRW",
  "₺": "TRY",
  "R$": "BRL",
  "C$": "CAD",
  "A$": "AUD",
};

const ISO_CODES = new Set([
  "USD", "EUR", "GBP", "ILS", "JPY", "INR", "CAD", "AUD", "NZD", "CHF", "SEK", "NOK", "DKK",
  "PLN", "CZK", "HUF", "RON", "BRL", "MXN", "ARS", "CLP", "COP", "ZAR", "AED", "SAR", "TRY",
  "SGD", "HKD", "KRW", "CNY", "THB", "PHP", "MYR", "IDR",
]);

const PERIOD_WORDS: Array<{ re: RegExp; period: "day" | "week" | "month" | "quarter" | "year" | "once" }> = [
  { re: /\b(?:per\s+month|\/\s*month|\/\s*mo\b|a\s+month|monthly|p\/m\b|each\s+month)\b/i, period: "month" },
  { re: /\b(?:per\s+year|\/\s*year|\/\s*yr\b|a\s+year|yearly|annually|annual|p\/a\b)\b/i, period: "year" },
  { re: /\b(?:per\s+week|\/\s*week|\/\s*wk\b|a\s+week|weekly)\b/i, period: "week" },
  { re: /\b(?:per\s+day|\/\s*day|a\s+day|daily)\b/i, period: "day" },
  { re: /\b(?:per\s+quarter|\/\s*quarter|quarterly)\b/i, period: "quarter" },
  { re: /\b(?:one[-\s]?time|once\s+off|single\s+payment|lifetime|flat\s+fee)\b/i, period: "once" },
];

export type ParsedPrice = {
  amount: number;
  currency: string;
  billingPeriod: "day" | "week" | "month" | "quarter" | "year" | "once";
  /** Character offset in the searched text, used to attach a price to the nearest heading. */
  index: number;
  matchText: string;
};

const AMOUNT_RE =
  /(?:(US\$|R\$|C\$|A\$|[$€£₪¥₹₩₺])\s*([\d][\d.,]*)|\b([A-Z]{3})\s*([\d][\d.,]*)|\b([\d][\d.,]*)\s*([A-Z]{3})\b)/g;

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "");
  // Decide whether the last separator is a decimal point or a thousands separator.
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * Only returns a price when a billing period is stated nearby. An amount with no period
 * is ambiguous (setup fee? deposit? crossed-out price?) and is left to the AI pass rather
 * than asserted as a plan price.
 */
export function findPricesInText(text: string, periodWindow = 60): ParsedPrice[] {
  const out: ParsedPrice[] = [];
  AMOUNT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = AMOUNT_RE.exec(text)) !== null) {
    const [full, symbol, symbolAmount, isoBefore, isoBeforeAmount, isoAfterAmount, isoAfter] = match;
    let currency: string | null = null;
    let amountRaw: string | null = null;

    if (symbol && symbolAmount) {
      currency = CURRENCY_SYMBOLS[symbol] ?? null;
      amountRaw = symbolAmount;
    } else if (isoBefore && isoBeforeAmount) {
      currency = ISO_CODES.has(isoBefore) ? isoBefore : null;
      amountRaw = isoBeforeAmount;
    } else if (isoAfter && isoAfterAmount) {
      currency = ISO_CODES.has(isoAfter) ? isoAfter : null;
      amountRaw = isoAfterAmount;
    }
    if (!currency || !amountRaw) continue;

    const amount = parseAmount(amountRaw);
    if (amount === null) continue;

    const windowText = text.slice(match.index, match.index + full.length + periodWindow);
    const period = PERIOD_WORDS.find((p) => p.re.test(windowText));
    if (!period) continue;

    out.push({
      amount,
      currency,
      billingPeriod: period.period,
      index: match.index,
      matchText: full.trim(),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic fact extraction
// ---------------------------------------------------------------------------

type CandidateContext = {
  sourceId: string | null;
  sourceUrl: string;
  sourceTitle: string | null;
};

function buildCandidate(
  ctx: CandidateContext,
  factType: FactType,
  data: unknown,
  excerpt: string | null,
  confidence: number,
): FactCandidate | null {
  const parsed = parseFactData(factType, data);
  if (!parsed.ok) return null;
  return {
    factType: parsed.factType,
    factKey: factKey(parsed.factType, parsed.data),
    data: parsed.data,
    origin: "website_verified",
    confidence,
    sourceId: ctx.sourceId,
    sourceUrl: ctx.sourceUrl,
    sourceTitle: ctx.sourceTitle,
    excerpt: truncateExcerpt(excerpt),
  };
}

const PRICE_LINE_RE = /(US\$|R\$|C\$|A\$|[$€£₪¥₹₩₺])\s*\d|(?:\b[A-Z]{3}\s*\d)|(?:\b\d[\d.,]*\s*[A-Z]{3}\b)/;
const PLAN_NAME_MAX = 60;
const BULLET_RE = /^[-•*\u2022]\s*/;

function looksLikePlanName(line: string): boolean {
  if (line.length < 2 || line.length > PLAN_NAME_MAX) return false;
  if (BULLET_RE.test(line)) return false;
  if (PRICE_LINE_RE.test(line)) return false;
  if (/[.!?]$/.test(line) && line.split(" ").length > 6) return false;
  return true;
}

/**
 * Pricing cards render as: plan name, then a price, then a bullet list of what's included.
 * Walking that block keeps each benefit attached to the plan it was printed under, which
 * a flat regex sweep cannot do.
 */
export function extractPricingPlansFromText(
  text: string,
  ctx: CandidateContext,
): FactCandidate[] {
  const lines = text.split("\n");
  const candidates: FactCandidate[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const priceHits = findPricesInText(lines[i]);
    if (priceHits.length !== 1) continue;
    const price = priceHits[0];

    // The plan name is the nearest preceding non-bullet, non-price line.
    let name: string | null = null;
    for (let back = i - 1; back >= 0 && back >= i - 4; back--) {
      const candidateName = lines[back].trim();
      if (!candidateName) continue;
      if (looksLikePlanName(candidateName)) {
        name = candidateName;
        break;
      }
      if (PRICE_LINE_RE.test(candidateName)) break;
    }
    // Some cards put the name on the same line as the price ("Starter — $49/month").
    if (!name) {
      const inline = lines[i].slice(0, price.index).replace(/[—–:-]\s*$/, "").trim();
      if (looksLikePlanName(inline)) name = inline;
    }
    if (!name || usedNames.has(name.toLowerCase())) continue;

    const benefits: string[] = [];
    let description: string | null = null;
    for (let fwd = i + 1; fwd < lines.length && fwd <= i + 25; fwd++) {
      const line = lines[fwd].trim();
      if (!line) continue;
      // Stop at the next card so benefits never bleed across plans.
      if (PRICE_LINE_RE.test(line) && findPricesInText(line).length > 0) break;
      if (BULLET_RE.test(line)) {
        const benefit = line.replace(BULLET_RE, "").trim();
        if (benefit.length >= 2 && benefit.length <= 200) benefits.push(benefit);
        continue;
      }
      if (benefits.length > 0) break;
      if (!description && line.length >= 12 && line.length <= 600) description = line;
      if (looksLikePlanName(line) && !description) break;
    }

    const candidate = buildCandidate(
      ctx,
      "pricing_plan",
      {
        name,
        description,
        price: {
          amount: price.amount,
          currency: price.currency,
          billingPeriod: price.billingPeriod,
        },
        priceQualifier: /\bfrom\b/i.test(lines[i]) ? "from" : /\bup\s+to\b/i.test(lines[i]) ? "up_to" : "exact",
        benefits: benefits.slice(0, 30),
      },
      `${name} ${lines[i].trim()}`,
      0.9,
    );
    if (candidate) {
      candidates.push(candidate);
      usedNames.add(name.toLowerCase());
    }
  }

  return candidates;
}

function extractFromJsonLd(nodes: unknown[], ctx: CandidateContext): FactCandidate[] {
  const out: FactCandidate[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const o = node as Record<string, unknown>;
    const types = jsonLdTypes(node);

    if (types.includes("faqpage") && Array.isArray(o.mainEntity)) {
      for (const entity of o.mainEntity as unknown[]) {
        if (!entity || typeof entity !== "object") continue;
        const q = entity as Record<string, unknown>;
        const question = typeof q.name === "string" ? q.name : null;
        const acceptedRaw = q.acceptedAnswer;
        const answer =
          acceptedRaw && typeof acceptedRaw === "object"
            ? stripTags(String((acceptedRaw as Record<string, unknown>).text ?? ""))
            : null;
        if (!question || !answer) continue;
        const candidate = buildCandidate(ctx, "faq", { question, answer }, answer, 0.95);
        if (candidate) out.push(candidate);
      }
    }

    if (types.includes("product") || types.includes("service")) {
      const name = typeof o.name === "string" ? o.name : null;
      const offer = normalizeOffer(o.offers);
      if (name) {
        const candidate = buildCandidate(
          ctx,
          types.includes("service") ? "service" : "product",
          {
            name,
            description: typeof o.description === "string" ? stripTags(o.description) : null,
            price: offer,
            url: typeof o.url === "string" ? o.url : null,
          },
          name,
          0.95,
        );
        if (candidate) out.push(candidate);
      }
    }

    if (types.includes("localbusiness") || types.includes("organization") || types.includes("place")) {
      const address = o.address;
      if (address && typeof address === "object") {
        const a = address as Record<string, unknown>;
        const candidate = buildCandidate(
          ctx,
          "location",
          {
            name: typeof o.name === "string" ? o.name : null,
            addressLine: typeof a.streetAddress === "string" ? a.streetAddress : null,
            city: typeof a.addressLocality === "string" ? a.addressLocality : null,
            region: typeof a.addressRegion === "string" ? a.addressRegion : null,
            postalCode: typeof a.postalCode === "string" ? a.postalCode : null,
            country: typeof a.addressCountry === "string" ? a.addressCountry : null,
            phone: typeof o.telephone === "string" ? o.telephone : null,
          },
          typeof o.name === "string" ? o.name : null,
          0.95,
        );
        if (candidate) out.push(candidate);
      }

      const hours = normalizeOpeningHours(o.openingHours ?? o.openingHoursSpecification);
      if (hours.length > 0) {
        const candidate = buildCandidate(ctx, "business_hours", { entries: hours }, null, 0.95);
        if (candidate) out.push(candidate);
      }

      if (typeof o.telephone === "string" && o.telephone.trim()) {
        const candidate = buildCandidate(
          ctx,
          "contact_method",
          { kind: "phone", value: o.telephone.trim() },
          null,
          0.95,
        );
        if (candidate) out.push(candidate);
      }
      if (typeof o.email === "string" && o.email.trim()) {
        const candidate = buildCandidate(
          ctx,
          "contact_method",
          { kind: "email", value: o.email.replace(/^mailto:/i, "").trim() },
          null,
          0.95,
        );
        if (candidate) out.push(candidate);
      }
    }
  }

  return out;
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOffer(offers: unknown): {
  amount: number;
  currency: string;
  billingPeriod: string;
} | null {
  const node = Array.isArray(offers) ? offers[0] : offers;
  if (!node || typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  const rawPrice = o.price ?? o.lowPrice;
  const amount = typeof rawPrice === "number" ? rawPrice : parseAmount(String(rawPrice ?? ""));
  const currency = typeof o.priceCurrency === "string" ? o.priceCurrency.toUpperCase() : null;
  if (amount === null || !currency || !ISO_CODES.has(currency)) return null;
  const duration = typeof o.billingDuration === "string" ? o.billingDuration : "";
  const period = /P1M|month/i.test(duration) ? "month" : /P1Y|year/i.test(duration) ? "year" : "once";
  return { amount, currency, billingPeriod: period };
}

const DAY_NAMES: Record<string, string> = {
  mo: "Monday", tu: "Tuesday", we: "Wednesday", th: "Thursday",
  fr: "Friday", sa: "Saturday", su: "Sunday",
};

function normalizeOpeningHours(raw: unknown): Array<{ days: string; opens: string; closes: string }> {
  const out: Array<{ days: string; opens: string; closes: string }> = [];
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const item of items) {
    if (typeof item === "string") {
      // "Mo-Fr 09:00-17:00"
      const m = /^([A-Za-z,\-\s]+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(item.trim());
      if (!m) continue;
      out.push({ days: expandDayToken(m[1]), opens: m[2], closes: m[3] });
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const days = o.dayOfWeek;
      const opens = typeof o.opens === "string" ? o.opens : null;
      const closes = typeof o.closes === "string" ? o.closes : null;
      if (!opens || !closes) continue;
      const dayLabel = Array.isArray(days)
        ? days.map((d) => String(d).split("/").pop()).join(", ")
        : days
          ? String(days).split("/").pop() || "Daily"
          : "Daily";
      out.push({ days: dayLabel, opens, closes });
    }
  }
  return out.slice(0, 14);
}

function expandDayToken(token: string): string {
  return token
    .trim()
    .split(/[,\s]+/)
    .map((part) =>
      part
        .split("-")
        .map((d) => DAY_NAMES[d.slice(0, 2).toLowerCase()] || d)
        .join("–"),
    )
    .join(", ");
}

const BOOKING_HOSTS = /(calendly\.com|cal\.com|acuityscheduling\.com|squareup\.com\/appointments|setmore\.com|youcanbook\.me|hubspot\.com\/meetings|book(?:ing)?\.)/i;

function extractContactsFromHtml(html: string, ctx: CandidateContext): FactCandidate[] {
  const out: FactCandidate[] = [];
  const seen = new Set<string>();

  const mailto = /href=["']mailto:([^"'?]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mailto.exec(html)) !== null) {
    const email = decodeEntities(m[1]).trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const candidate = buildCandidate(ctx, "contact_method", { kind: "email", value: email }, null, 0.95);
    if (candidate) out.push(candidate);
  }

  const tel = /href=["']tel:([^"']+)/gi;
  while ((m = tel.exec(html)) !== null) {
    const phone = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    const candidate = buildCandidate(ctx, "contact_method", { kind: "phone", value: phone }, null, 0.95);
    if (candidate) out.push(candidate);
  }

  const href = /href=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = href.exec(html)) !== null) {
    const url = decodeEntities(m[1]).trim();
    if (!BOOKING_HOSTS.test(url) || seen.has(url)) continue;
    seen.add(url);
    const candidate = buildCandidate(ctx, "booking_link", { url }, null, 0.9);
    if (candidate) out.push(candidate);
    if (out.length > 40) break;
  }

  return out;
}

/** "Question?" followed by its answer — the shape almost every hand-written FAQ uses. */
export function extractFaqPairsFromText(text: string, ctx: CandidateContext): FactCandidate[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: FactCandidate[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].replace(/^Q[:.\s]+/i, "").trim();
    if (!line.endsWith("?") || line.length < 8 || line.length > 300) continue;
    const answerParts: string[] = [];
    for (let j = i + 1; j < lines.length && j <= i + 4; j++) {
      const next = lines[j].replace(/^A[:.\s]+/i, "").trim();
      if (next.endsWith("?") && next.length < 300) break;
      if (next.length < 2) continue;
      answerParts.push(next.replace(BULLET_RE, ""));
      if (answerParts.join(" ").length > 400) break;
    }
    const answer = answerParts.join(" ").trim();
    if (answer.length < 12) continue;
    const candidate = buildCandidate(
      ctx,
      "faq",
      { question: line, answer: answer.slice(0, 1500) },
      answer,
      0.75,
    );
    if (candidate) out.push(candidate);
  }
  return out;
}

export type DeterministicExtraction = {
  candidates: FactCandidate[];
  /** Signals worth surfacing to the user, e.g. a page that rendered no text. */
  notes: string[];
};

/**
 * Everything readable literally off one page. Deduped by factKey, highest confidence wins,
 * so a JSON-LD FAQ beats the same FAQ recovered from prose.
 */
export function extractDeterministicFacts(
  page: PreparedPage,
  rawHtml: string,
  sourceId: string | null,
): DeterministicExtraction {
  const ctx: CandidateContext = {
    sourceId,
    sourceUrl: page.finalUrl,
    sourceTitle: page.title,
  };
  const notes: string[] = [];
  if (page.renderedEmpty) {
    notes.push("This page returned almost no readable text, which usually means its content is rendered in the browser. Nothing was extracted from it.");
  }

  const all: FactCandidate[] = [
    ...extractFromJsonLd(page.jsonLd, ctx),
    ...extractPricingPlansFromText(page.text, ctx),
    ...extractContactsFromHtml(rawHtml, ctx),
  ];

  if (page.detectedType === "faq") {
    all.push(...extractFaqPairsFromText(page.text, ctx));
  }

  const byKey = new Map<string, FactCandidate>();
  for (const candidate of all) {
    const existing = byKey.get(candidate.factKey);
    if (!existing || candidate.confidence > existing.confidence) {
      byKey.set(candidate.factKey, candidate);
    }
  }

  return { candidates: [...byKey.values()], notes };
}

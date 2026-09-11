/**
 * Per-source AI extraction. One page per call — never a concatenation of every page.
 *
 * Concatenating sources is what let a long guides page starve the pricing page: the
 * combined blob hit the character cap before the prices were ever read. Here each source
 * gets its own budget and its own call, so page order cannot change the result.
 *
 * The model output is JSON-mode text with no schema guarantee, so everything is zod-checked
 * afterwards (same approach as `parseAndValidateProspectIntelligence`). Facts already found
 * by the deterministic pass are passed in as "already known" and are not re-proposed at the
 * lower `ai_extracted` tier.
 */

import { aiProvider } from "../aiProvider";
import {
  factKey,
  parseFactData,
  truncateExcerpt,
  type FactCandidate,
  type FactType,
} from "@shared/businessKnowledgeFacts";
import {
  preprocessAiFactData,
  mergePricingPlanCandidates,
  sanitizeExtractedCandidates,
} from "@shared/knowledgeExtractionGuards";
import type { PreparedPage } from "./extractPage";
import type { SourceDetectedType } from "./sourceStore";

/** Per-source input cap. Each source gets its own budget, so no page can crowd out another. */
export const MAX_AI_EXTRACTION_CHARS = 25_000;
const MAX_OUTPUT_TOKENS = 3000;
const MAX_FACTS_PER_PAGE = 60;

const TYPE_GUIDANCE: Record<SourceDetectedType, string> = {
  pricing:
    "This is a pricing or advertising page. Capture every subscription plan as a pricing_plan with its exact amount, currency, billing period, and the benefits listed under that specific plan. If both monthly and yearly prices are shown, put monthly in price and yearly in additionalPrices — never convert one into the other, never invent a missing interval. Realtor Growth Engine is a one-time product requiring Pro, not a Free/Pro subscription tier — capture it as a product. Classify links by destination URL, not only the label: /contact and real scheduling URLs are booking_link; /pricing is pricing (not booking); /realtor-growth-engine is a product page, not booking. Book a Demo that points at /contact is booking. View plans / pricing CTAs are not booking. Do not capture Start free, trial, signup, or navigation links as booking.",
  services:
    "This is a products or services page. Capture each distinct offering as a product or service fact. Industries and use cases are audience facts, not locations. /realtor-growth-engine is a product page, not a booking URL.",
  about:
    "This is an about or homepage. Capture one business_summary and any concrete offerings, service areas, or differentiators stated as fact. Industries and who it is for are audience facts. Do not file them as locations. Book a Demo pointing at /contact is a booking_link. Pricing and signup links are not booking.",
  faq: "This is an FAQ page. Capture each question with its own answer as a faq fact.",
  policy:
    "This is a policy page. Capture each policy as a policy fact with its category, title, the details, and every stated condition as a separate conditions entry.",
  contact:
    "This is a contact or booking page. Capture verified contact_method (phone, email, form) and genuine booking_link / demo URLs only. /contact is a genuine demo/contact destination. Social profile URLs are social_link. Signup, trial, /pricing, and navigation CTAs are not booking.",
  locations:
    "This is a locations or service-area page. Capture only physical/service locations, geographic service areas, business hours, or timezone-supported availability.",
  other: "Capture whatever is stated as concrete fact. Prefer fewer, well-supported facts. Do not invent prices or booking links.",
};

const SYSTEM_PROMPT = `You extract structured business facts from a single web page for a CRM's AI assistant.

ABSOLUTE RULES
- Only output values that appear literally on the page. Never infer, estimate, average, or complete a partial value.
- Never invent a price. If the amount is missing or unreadable, omit price entirely. Never output amount 0 unless the page literally shows $0 (or equivalent) for that plan.
- Never guess a billing period. If the page does not state monthly/yearly/one-time, omit price rather than using "once".
- A paid plan (Pro, Premium, Business, …) must never be stored as $0.
- A free plan at $0 is only valid with the stated interval (usually month). It is not a one-time charge.
- Keep monthly and yearly prices as separate amounts on the same plan. Do not convert $49/month into a yearly figure or collapse them.
- Keep benefits with the plan they are printed under. Never move a benefit to a different plan or merge unrelated plans.
- Quote wording from the page. Do not add marketing adjectives, do not rewrite claims to sound better.
- Every fact must include an "excerpt": the sentence or line from the page that supports it, copied verbatim.
- If the page does not support a fact type, return no facts of that type. An empty list is a correct answer.
- Do not include facts about other businesses, advertisers, or third parties mentioned on the page.
- Locations and Hours: only physical/service locations, service areas, hours, or timezone availability. Industries and use cases are audience, never location or service_area.
- Contact and Booking: only verified phone/email/form and genuine booking or demo URLs. Facebook and other social URLs are social_link. "Start free", trial, signup, pricing, and navigation links are not booking.
- Vague navigation or link text is not a business fact. Omit it.

OUTPUT
Return JSON: { "facts": [ { "factType": string, "data": object, "excerpt": string, "confidence": number } ] }
confidence is 0..1 for how literally the page states the fact.

FACT TYPES AND THEIR data SHAPES
- business_summary: { summary, positioning? }
- product | service: { name, description?, price?: { amount, currency, billingPeriod }, url? }
- pricing_plan: { name, description?, price?: { amount, currency (ISO 4217), billingPeriod: month|year|day|week|quarter|once }, additionalPrices?: same money objects, priceQualifier?: from|up_to|exact, benefits: string[], planUrl? }
- audience: { label, description? }  // industries, use cases, who it is for
- benefit: { statement, appliesTo? }
- feature: { name, description? }
- faq: { question, answer }
- policy: { category: shipping|returns|refunds|cancellation|guarantee|privacy|terms|payment|other, title, details, conditions: string[] }
- location: { name?, addressLine?, city?, region?, postalCode?, country?, phone?, url? }  // must include a real address/city/region
- service_area: { area, notes? }  // geographic only
- business_hours: { entries: [{ days, opens, closes }], timezone?, notes? }
- contact_method: { kind: phone|email|whatsapp|sms|form|chat|other, value, label? }
- booking_link: { url, label? }  // genuine booking/demo only
- social_link: { network, url, label? }
- call_to_action: { label, url?, description?, locationHint?, responseTiming? }
- eligibility_rule: { rule, appliesTo? }
- numeric_limit: { label, value: number, unit?, appliesTo? }
- custom_fact: { label, value }`;

export type AiExtractionInput = {
  page: PreparedPage;
  sourceId: string | null;
  /** Fact keys already captured deterministically — do not duplicate at a lower tier. */
  knownFactKeys?: Set<string>;
};

export type AiExtractionResult = {
  candidates: FactCandidate[];
  /** Facts the model returned that failed validation, for diagnostics only. */
  rejected: number;
  attempted: boolean;
};

function buildUserPrompt(page: PreparedPage): string {
  const guidance = TYPE_GUIDANCE[page.detectedType] ?? TYPE_GUIDANCE.other;
  const body = page.text.slice(0, MAX_AI_EXTRACTION_CHARS);
  const truncatedNote =
    page.text.length > MAX_AI_EXTRACTION_CHARS
      ? "\n\n[The page was longer than the extraction budget and was cut here. Extract only from the text above.]"
      : "";
  return `PAGE URL: ${page.finalUrl}
PAGE TITLE: ${page.title || "(none)"}
PAGE TYPE: ${page.detectedType}

${guidance}

PAGE CONTENT (structure preserved; "- " marks a list item):
${body}${truncatedNote}`;
}

/**
 * Coerce a JSON-mode response into validated candidates.
 * Exported so the validation contract can be tested without calling a model.
 */
export function parseAiExtractionResponse(
  raw: string,
  ctx: { sourceId: string | null; sourceUrl: string; sourceTitle: string | null },
  knownFactKeys?: Set<string>,
): { candidates: FactCandidate[]; rejected: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    return { candidates: [], rejected: 0 };
  }

  const list = extractFactList(parsed);
  const candidates: FactCandidate[] = [];
  const known = knownFactKeys ?? new Set<string>();
  let rejected = 0;

  for (const item of list.slice(0, MAX_FACTS_PER_PAGE)) {
    if (!item || typeof item !== "object") {
      rejected += 1;
      continue;
    }
    const o = item as Record<string, unknown>;
    const preparedData = preprocessAiFactData(o.factType, o.data);
    const validated = parseFactData(o.factType, preparedData);
    if (!validated.ok) {
      rejected += 1;
      continue;
    }
    const key = factKey(validated.factType, validated.data);
    if (known.has(key) && validated.factType !== "pricing_plan") continue;

    const rawConfidence = Number(o.confidence);
    const confidence = Number.isFinite(rawConfidence)
      ? Math.min(0.95, Math.max(0.1, rawConfidence))
      : 0.6;

    const reviewReasons = Array.isArray((preparedData as { reviewReasons?: unknown })?.reviewReasons)
      ? ((preparedData as { reviewReasons: unknown[] }).reviewReasons).filter(
          (r): r is string => typeof r === "string" && r.trim().length > 0,
        )
      : [];

    const next: FactCandidate = {
      factType: validated.factType as FactType,
      factKey: key,
      data: validated.data,
      origin: "ai_extracted",
      confidence,
      sourceId: ctx.sourceId,
      sourceUrl: ctx.sourceUrl,
      sourceTitle: ctx.sourceTitle,
      excerpt: truncateExcerpt(typeof o.excerpt === "string" ? o.excerpt : null),
      reviewReasons: reviewReasons.length ? reviewReasons : undefined,
    };

    const existingIdx = candidates.findIndex((c) => c.factKey === key);
    if (existingIdx >= 0) {
      const existing = candidates[existingIdx]!;
      if (existing.factType === "pricing_plan" && next.factType === "pricing_plan") {
        candidates[existingIdx] = mergePricingPlanCandidates(existing, next);
      }
      continue;
    }

    candidates.push(next);
  }

  return { candidates: sanitizeExtractedCandidates(candidates), rejected };
}

function extractFactList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.facts)) return o.facts;
    // Tolerate a model that keys facts by type instead of returning a flat list.
    const flattened: unknown[] = [];
    for (const [key, value] of Object.entries(o)) {
      if (!Array.isArray(value)) continue;
      for (const entry of value) {
        if (entry && typeof entry === "object" && "factType" in entry) flattened.push(entry);
        else flattened.push({ factType: key, data: entry });
      }
    }
    return flattened;
  }
  return [];
}

export async function extractFactsWithAi(input: AiExtractionInput): Promise<AiExtractionResult> {
  const { page } = input;
  if (page.renderedEmpty || page.text.length < 200) {
    return { candidates: [], rejected: 0, attempted: false };
  }

  const ctx = {
    sourceId: input.sourceId,
    sourceUrl: page.finalUrl,
    sourceTitle: page.title,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await aiProvider.complete(
        "extraction",
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(page) },
          ...(attempt > 0
            ? [
                {
                  role: "user" as const,
                  content:
                    "The previous response was not valid JSON in the required shape. Return only the JSON object described above.",
                },
              ]
            : []),
        ],
        { jsonMode: true, maxTokens: MAX_OUTPUT_TOKENS },
      );
      const content = typeof response === "string" ? response : response.content;
      const { candidates, rejected } = parseAiExtractionResponse(content, ctx, input.knownFactKeys);
      if (candidates.length > 0 || rejected === 0) {
        return { candidates, rejected, attempted: true };
      }
    } catch (err) {
      console.error(
        "[KnowledgeExtraction] AI pass failed",
        err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      );
      break;
    }
  }

  return { candidates: [], rejected: 0, attempted: true };
}

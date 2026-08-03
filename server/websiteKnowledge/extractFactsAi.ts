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
import type { PreparedPage } from "./extractPage";
import type { SourceDetectedType } from "./sourceStore";

/** Per-source input cap. Each source gets its own budget, so no page can crowd out another. */
export const MAX_AI_EXTRACTION_CHARS = 25_000;
const MAX_OUTPUT_TOKENS = 3000;
const MAX_FACTS_PER_PAGE = 60;

const TYPE_GUIDANCE: Record<SourceDetectedType, string> = {
  pricing:
    "This is a pricing or advertising page. Capture every plan or package as a pricing_plan with its exact amount, currency, billing period, and the benefits listed under that specific plan. Also capture any apply/list/advertise call_to_action, including on-page application forms (use the page URL when the form has no separate action URL) and any stated confirmation timing.",
  services:
    "This is a products or services page. Capture each distinct offering as a product or service fact.",
  about:
    "This is an about or homepage. Capture one business_summary and any concrete offerings, service areas, or differentiators stated as fact.",
  faq: "This is an FAQ page. Capture each question with its own answer as a faq fact.",
  policy:
    "This is a policy page. Capture each policy as a policy fact with its category, title, the details, and every stated condition as a separate conditions entry.",
  contact:
    "This is a contact or booking page. Capture contact_method, booking_link, business_hours, and location facts.",
  locations:
    "This is a locations or service-area page. Capture location, service_area, and business_hours facts.",
  other: "Capture whatever is stated as concrete fact. Prefer fewer, well-supported facts.",
};

const SYSTEM_PROMPT = `You extract structured business facts from a single web page for a CRM's AI assistant.

ABSOLUTE RULES
- Only output values that appear literally on the page. Never infer, estimate, average, or complete a partial value.
- Never invent a price. If an amount has no stated billing period, omit the fact entirely rather than guessing "per month".
- Keep benefits with the plan they are printed under. Never move a benefit to a different plan or merge plans.
- Quote wording from the page. Do not add marketing adjectives, do not rewrite claims to sound better.
- Every fact must include an "excerpt": the sentence or line from the page that supports it, copied verbatim.
- If the page does not support a fact type, return no facts of that type. An empty list is a correct answer.
- Do not include facts about other businesses, advertisers, or third parties mentioned on the page.

OUTPUT
Return JSON: { "facts": [ { "factType": string, "data": object, "excerpt": string, "confidence": number } ] }
confidence is 0..1 for how literally the page states the fact.

FACT TYPES AND THEIR data SHAPES
- business_summary: { summary, positioning? }
- product | service: { name, description?, price?: { amount, currency, billingPeriod }, url? }
- pricing_plan: { name, description?, price: { amount, currency (ISO 4217), billingPeriod: once|day|week|month|quarter|year }, priceQualifier?: from|up_to|exact, benefits: string[], planUrl? }
- benefit: { statement, appliesTo? }
- feature: { name, description? }
- faq: { question, answer }
- policy: { category: shipping|returns|refunds|cancellation|guarantee|privacy|terms|payment|other, title, details, conditions: string[] }
- location: { name?, addressLine?, city?, region?, postalCode?, country?, phone?, url? }
- service_area: { area, notes? }
- business_hours: { entries: [{ days, opens, closes }], timezone?, notes? }
- contact_method: { kind: phone|email|whatsapp|sms|form|chat|other, value, label? }
- booking_link: { url, label? }
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
  const seen = new Set<string>(knownFactKeys ? [...knownFactKeys] : []);
  let rejected = 0;

  for (const item of list.slice(0, MAX_FACTS_PER_PAGE)) {
    if (!item || typeof item !== "object") {
      rejected += 1;
      continue;
    }
    const o = item as Record<string, unknown>;
    const validated = parseFactData(o.factType, o.data);
    if (!validated.ok) {
      rejected += 1;
      continue;
    }
    const key = factKey(validated.factType, validated.data);
    if (seen.has(key)) continue;
    seen.add(key);

    const rawConfidence = Number(o.confidence);
    const confidence = Number.isFinite(rawConfidence)
      ? Math.min(0.95, Math.max(0.1, rawConfidence))
      : 0.6;

    candidates.push({
      factType: validated.factType as FactType,
      factKey: key,
      data: validated.data,
      origin: "ai_extracted",
      confidence,
      sourceId: ctx.sourceId,
      sourceUrl: ctx.sourceUrl,
      sourceTitle: ctx.sourceTitle,
      excerpt: truncateExcerpt(typeof o.excerpt === "string" ? o.excerpt : null),
    });
  }

  return { candidates, rejected };
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

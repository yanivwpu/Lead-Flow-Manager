import { createHash } from "node:crypto";
import { z } from "zod";

export const SEO_ACTION_STATES = ["detected", "researching", "proposed", "approved", "rejected", "executing", "measuring", "kept", "revision_required", "rolled_back", "failed"] as const;
export const PHASE_2B_TRANSITIONS: Record<string, readonly string[]> = {
  detected: ["researching", "failed"], researching: ["proposed", "failed"], proposed: ["approved", "rejected", "researching"],
  approved: [], rejected: ["researching"],
};
export function mayTransitionSeoAction(from: string, to: string) { return PHASE_2B_TRANSITIONS[from]?.includes(to) ?? false; }

const optionalText = z.string().trim().max(12_000).nullable().optional();
export const seoRecommendationOutputSchema = z.object({
  actionType: z.enum(["title_tag", "meta_description", "heading", "content_expansion", "content_rewrite", "faq", "structured_data", "internal_link", "supporting_article", "cannibalization", "canonical_indexing", "human_technical_review"]),
  proposedTitle: z.string().trim().min(10).max(70).nullable().optional(), proposedMetaDescription: z.string().trim().min(30).max(170).nullable().optional(),
  proposedContent: optionalText, contentBrief: optionalText, insertionLocation: z.string().trim().min(2).max(500),
  internalLinkSource: z.string().url().nullable().optional(), internalLinkDestination: z.string().url().nullable().optional(), structuredDataProposal: z.record(z.unknown()).nullable().optional(),
  explanation: z.string().trim().min(20).max(2_000), expectedBenefit: z.string().trim().min(10).max(1_000), confidence: z.number().min(0).max(1),
  risk: z.enum(["low", "medium", "high"]), automaticExecutionEligible: z.boolean(), rollbackConcept: z.string().trim().min(10).max(1_000), evidenceIds: z.array(z.string().min(1)).min(1).max(30),
}).superRefine((value, ctx) => {
  if (value.actionType === "title_tag" && !value.proposedTitle) ctx.addIssue({ code: "custom", message: "Title actions require exact proposedTitle" });
  if (value.actionType === "meta_description" && !value.proposedMetaDescription) ctx.addIssue({ code: "custom", message: "Meta actions require exact proposedMetaDescription" });
  if (["content_expansion", "content_rewrite", "faq"].includes(value.actionType) && !value.proposedContent && !value.contentBrief) ctx.addIssue({ code: "custom", message: "Content actions require proposed content or a detailed brief" });
});
export type SeoRecommendationOutput = z.infer<typeof seoRecommendationOutputSchema>;

const prohibitedClaims = /\b(guarantee(?:d)?|#1|number one|best in the world|100%|double(?:d)? (?:your|their) (?:sales|revenue)|trusted by \d+)\b/i;
export function validateRecommendationOutput(input: unknown, competitorTexts: string[] = []): SeoRecommendationOutput {
  const value = seoRecommendationOutputSchema.parse(input);
  const generated = [value.proposedTitle, value.proposedMetaDescription, value.proposedContent].filter(Boolean).join(" ");
  if (prohibitedClaims.test(generated)) throw new Error("Recommendation contains an unsupported promotional claim");
  const normalized = generated.toLowerCase().replace(/\s+/g, " ");
  for (const source of competitorTexts) {
    const words = source.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
    for (let i = 0; i + 11 < words.length; i += 1) if (normalized.includes(words.slice(i, i + 12).join(" "))) throw new Error("Recommendation overlaps competitor language");
  }
  return value;
}
export function contentFingerprint(content: unknown): string {
  return createHash("sha256").update(JSON.stringify(content, Object.keys((content && typeof content === "object" ? content : {}) as object).sort())).digest("hex");
}
export function recommendationIdempotencyKey(propertyId: string, page: string, cluster: string[], actionType: string) {
  return createHash("sha256").update([propertyId, page, [...cluster].map(q => q.trim().toLowerCase()).sort().join("\0"), actionType].join("\0")).digest("hex");
}
export const SEO_META_DESCRIPTION_MAX = 170;
function truncateAtWord(value: string, maximum: number) {
  if (value.length <= maximum) return value;
  let candidate = "";
  for (const point of value) { if ((candidate + point).length > maximum - 1) break; candidate += point; }
  const boundary = candidate.search(/\s+\S*$/u);
  return `${(boundary >= Math.floor(maximum * .55) ? candidate.slice(0, boundary) : candidate).trimEnd()}…`;
}
/** Bounds untrusted GSC query text before it enters a fixed-size metadata field. */
export function proposedMetaDescriptionForQuery(query: string) {
  const prefix = "Explore WhachatCRM for ", suffix = ": organize conversations, follow up consistently, and manage customer relationships in one workspace.";
  const queryBudget = SEO_META_DESCRIPTION_MAX - prefix.length - suffix.length;
  const conciseQuery = truncateAtWord(query.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim() || "WhatsApp CRM", queryBudget);
  return truncateAtWord(`${prefix}${conciseQuery}${suffix}`, SEO_META_DESCRIPTION_MAX);
}

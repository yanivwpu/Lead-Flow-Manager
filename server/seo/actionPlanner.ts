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
  observedProblem: z.string().trim().min(20).max(2_000), currentValue: z.string().trim().min(1).max(12_000),
  rationale: z.string().trim().min(20).max(2_000), evidenceSummary: z.string().trim().min(20).max(3_000),
  evidenceDateRange: z.string().trim().min(5).max(200), evidenceLimitations: z.string().trim().min(10).max(1_000),
  implementationTarget: z.string().trim().min(3).max(500), acceptanceChecks: z.array(z.string().trim().min(3).max(500)).min(1).max(10),
  repositoryTarget: z.string().trim().max(500).nullable(),
}).superRefine((value, ctx) => {
  if (value.actionType === "title_tag" && !value.proposedTitle) ctx.addIssue({ code: "custom", message: "Title actions require exact proposedTitle" });
  if (value.actionType === "meta_description" && !value.proposedMetaDescription) ctx.addIssue({ code: "custom", message: "Meta actions require exact proposedMetaDescription" });
  if (value.actionType === "meta_description" && (value.proposedContent || value.contentBrief)) ctx.addIssue({ code: "custom", message: "Meta actions cannot propose body content" });
  if (value.actionType === "meta_description" && !/\b(replace|update)\b/i.test(value.insertionLocation)) ctx.addIssue({ code: "custom", message: "Meta actions require a replace/update metadata instruction" });
  if (["content_expansion", "content_rewrite", "faq"].includes(value.actionType) && !value.proposedContent && !value.contentBrief) ctx.addIssue({ code: "custom", message: "Content actions require proposed content or a detailed brief" });
});
export type SeoRecommendationOutput = z.infer<typeof seoRecommendationOutputSchema>;

const prohibitedClaims = /(?:^|[^\p{L}\p{N}_])(?:guarantee(?:d)?|#\s*1(?!\d)|number one|best in the world|100\s*%(?!\p{N})|double(?:d)? (?:your|their) (?:sales|revenue)|trusted by \d+)(?=$|[^\p{L}\p{N}_])/iu;
export function validateRecommendationOutput(input: unknown, competitorTexts: string[] = []): SeoRecommendationOutput {
  const value = seoRecommendationOutputSchema.parse(input);
  const generated = [value.proposedTitle, value.proposedMetaDescription, value.proposedContent, value.contentBrief].filter(Boolean).join(" ");
  if (prohibitedClaims.test(generated)) throw new Error("Recommendation contains an unsupported promotional claim");
  if (/explore whachatcrm for|manage customer relationships in one workspace|unlock (?:growth|success)|take your .* to the next level/i.test(generated)) throw new Error("Recommendation contains generic boilerplate");
  const normalize=(text:string)=>text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
  const proposed=value.proposedMetaDescription??value.proposedTitle??value.proposedContent??"";
  if(proposed&&normalize(proposed)===normalize(value.currentValue))throw new Error("Recommendation does not materially change the current value");
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
type RecommendationLanguage="en"|"es"|"he";
export function recommendationLanguageForPage(targetPage:string):RecommendationLanguage{try{const path=new URL(targetPage,"https://seo-language.invalid").pathname;return path==="/es"||path.startsWith("/es/")?"es":path==="/he"||path.startsWith("/he/")?"he":"en";}catch{return "en";}}
const SCRIPT_PATTERN:Record<RecommendationLanguage,RegExp>={en:/\p{Script=Latin}/u,es:/\p{Script=Latin}/u,he:/\p{Script=Hebrew}/u};
const FOREIGN_SCRIPT=/[\p{Script=Thai}\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const QUERY_FALLBACK:Record<RecommendationLanguage,string>={en:"WhatsApp CRM",es:"CRM de WhatsApp",he:"מערכת CRM ל-WhatsApp"};
/** Prevent raw GSC text in a different writing system from leaking into generated copy. */
export function queryForTargetPage(query:string,targetPage:string){const language=recommendationLanguageForPage(targetPage),clean=query.replace(/[\u0000-\u001f\u007f]+/gu," ").replace(/\s+/gu," ").trim();if(!clean)return QUERY_FALLBACK[language];const hasExpected=SCRIPT_PATTERN[language].test(clean),hasForeign=FOREIGN_SCRIPT.test(clean);return hasExpected&&(!hasForeign||(language==="he"&&/\p{Script=Hebrew}/u.test(clean)))?clean:QUERY_FALLBACK[language];}
function safeFirstPartyIntent(value:string|undefined,targetPage:string){if(value){const language=recommendationLanguageForPage(targetPage),clean=value.replace(/\s*[|–—-]\s*Whachat(?:CRM)?\b.*$/iu,"").replace(/\s+/gu," ").trim(),hasForeign=FOREIGN_SCRIPT.test(clean);if(clean&&SCRIPT_PATTERN[language].test(clean)&&(!hasForeign||(language==="he"&&/\p{Script=Hebrew}/u.test(clean))))return clean;}try{const slug=new URL(targetPage,"https://seo-language.invalid").pathname.split("/").filter(Boolean).at(-1)?.replace(/[-_]+/g," ").trim();return slug||undefined;}catch{return undefined;}}
export function proposedMetaDescriptionForQuery(query: string,targetPage="/",firstPartyIntent?:string) {
  const safeQuery=queryForTargetPage(query,targetPage),intent=safeQuery===QUERY_FALLBACK[recommendationLanguageForPage(targetPage)]?safeFirstPartyIntent(firstPartyIntent,targetPage)??safeQuery:safeQuery;
  const prefix = "", suffix = ": coordinate WhatsApp conversations, lead ownership, and follow-up from a shared team inbox.";
  const queryBudget = SEO_META_DESCRIPTION_MAX - prefix.length - suffix.length;
  const conciseQuery = truncateAtWord(intent.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim() || "WhatsApp CRM", queryBudget);
  return truncateAtWord(`${prefix}${conciseQuery}${suffix}`, SEO_META_DESCRIPTION_MAX);
}
export function selectStaleCheckCandidates<T extends {id:string;status:string;staleCheckedAt:Date|null;staleCheckRetryAt:Date|null}>(actions:T[],now:Date,limit:number){return actions.filter(row=>(row.status==="proposed"||row.status==="approved")&&(!row.staleCheckRetryAt||row.staleCheckRetryAt<=now)).sort((a,b)=>(a.staleCheckedAt?.getTime()??0)-(b.staleCheckedAt?.getTime()??0)||a.id.localeCompare(b.id)).slice(0,limit);}

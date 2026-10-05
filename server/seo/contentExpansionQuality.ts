import { aiProvider } from "../aiProvider";
import { classifyQueryIntent, type MetaGenerationAudit } from "./metaDescriptionQuality";

export const CONTENT_EXPANSION_PROMPT_VERSION = "seo-content-expansion-v3-query-retry";

export type ContentExpansionEvidence = {
  pageUrl: string;
  title: string;
  metaDescription: string;
  headings: string[];
  bodyText: string;
  pageType: string;
  queryCluster: string[];
  fingerprint: string;
  metrics: { clicks: number; impressions: number; ctr?: number; position: number };
};

export type ContentExpansionPacket = {
  pageUrl: string;
  pageTitle: string;
  h1: string;
  relevantHeadings: string[];
  currentPageExcerpt: string;
  currentPageText: string;
  existingMetaDescription: string;
  pageType: string;
  searchIntent: string;
  searchConsole: { queryCluster: string[]; clicks: number; impressions: number; ctr: number; averagePosition: number };
  currentProductFacts: string[];
  existingFeatureAndPricingFacts: string[];
  contentFingerprint: string;
};

export type ContentExpansionCandidate = { proposedContent: string; insertionLocation: string; rationale: string };
export type ContentExpansionRevision = { previousDraft: string; rejectionReasons: string[] };
export interface ContentExpansionCopywriter {
  provider: string;
  model: string;
  generate(packet: ContentExpansionPacket, revision?: ContentExpansionRevision): Promise<ContentExpansionCandidate>;
}
export type ContentExpansionResult =
  | { decision: "accept"; candidate: ContentExpansionCandidate; packet: ContentExpansionPacket; audit: MetaGenerationAudit }
  | { decision: "no_material_improvement"; packet: ContentExpansionPacket; audit: MetaGenerationAudit };

const words = (value: string) => value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const normalize = (value: string) => words(value).join(" ");
const sentences = (value: string) => value.split(/(?<=[.!?])\s+|\n+/).map(part => part.trim()).filter(part => part.length >= 20 && part.length <= 320);
const generic = /\b(?:expand the existing page|original section|target query|search intent|seo|take (?:your|the) business to the next level|powerful solution|seamless experience|in today'?s digital world)\b/i;
const unsupportedPromotion = /\b(?:guarantee(?:d)?|number one|best in the world|100\s*%|double (?:your|their) (?:sales|revenue)|trusted by \d+)\b/i;
const featureTerms = ["shopify", "instagram", "messenger", "gmail", "email", "sms", "chatbot", "shared inbox", "unlimited users", "free plan", "ai", "automation"];
const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "your", "business", "whatsapp"]);

export function buildContentExpansionPacket(evidence: ContentExpansionEvidence): ContentExpansionPacket {
  const headings = evidence.headings.map(value => value.trim()).filter(Boolean);
  const facts = [...new Set([...headings, ...sentences(evidence.bodyText)])].slice(0, 36);
  const queryTerms = [...new Set(evidence.queryCluster.flatMap(words).filter(term => term.length > 2 && !stop.has(term)))];
  const relevant = headings.filter(heading => queryTerms.some(term => normalize(heading).includes(term))).slice(0, 8);
  const relevantSentence = sentences(evidence.bodyText).find(sentence => queryTerms.some(term => normalize(sentence).includes(term)));
  const currentPageExcerpt = (relevantSentence ?? sentences(evidence.bodyText)[0] ?? evidence.bodyText.slice(0, 1_200)).slice(0, 1_500);
  return {
    pageUrl: evidence.pageUrl,
    pageTitle: evidence.title,
    h1: headings[0] ?? "",
    relevantHeadings: (relevant.length ? relevant : headings.slice(1, 9)),
    currentPageExcerpt,
    currentPageText: evidence.bodyText.slice(0, 12_000),
    existingMetaDescription: evidence.metaDescription,
    pageType: evidence.pageType,
    searchIntent: classifyQueryIntent(evidence.queryCluster, evidence.title),
    searchConsole: {
      queryCluster: evidence.queryCluster,
      clicks: evidence.metrics.clicks,
      impressions: evidence.metrics.impressions,
      ctr: evidence.metrics.ctr ?? (evidence.metrics.impressions ? evidence.metrics.clicks / evidence.metrics.impressions : 0),
      averagePosition: evidence.metrics.position,
    },
    currentProductFacts: facts,
    existingFeatureAndPricingFacts: facts.filter(fact => /\$|price|plan|free|feature|inbox|automation|user|message/i.test(fact)),
    contentFingerprint: evidence.fingerprint,
  };
}

export function reviewContentExpansion(candidate: ContentExpansionCandidate, evidence: ContentExpansionEvidence) {
  const reasons: string[] = [], content = candidate.proposedContent.trim(), contentWords = words(content);
  const source = normalize(`${evidence.title} ${evidence.metaDescription} ${evidence.headings.join(" ")} ${evidence.bodyText}`);
  const queryTerms = [...new Set(evidence.queryCluster.flatMap(words).filter(term => term.length > 2 && !stop.has(term)))];
  if (contentWords.length < 120 || contentWords.length > 400) reasons.push("inappropriate_length");
  if (generic.test(content) || sentences(content).length < 3) reasons.push("generic_or_weak");
  if (unsupportedPromotion.test(content)) reasons.push("unsupported_claim");
  if (!queryTerms.some(term => normalize(content).includes(term))) reasons.push("query_intent_not_covered");
  const repeatedQueryTerms = queryTerms.filter(term => (contentWords.filter(word => word === term).length > Math.max(4, Math.ceil(contentWords.length / 45))));
  if (repeatedQueryTerms.length) reasons.push("keyword_stuffing");
  for (const claim of content.match(/\$\s?\d+(?:\.\d+)?|\b\d+\s*%/g) ?? []) if (!source.includes(normalize(claim))) reasons.push(`unsupported_fact:${claim}`);
  for (const term of featureTerms) if ((" " + normalize(content) + " ").includes(" " + normalize(term) + " ") && !(" " + source + " ").includes(" " + normalize(term) + " ")) reasons.push(`unsupported_fact:${term}`);
  const candidateSentences = sentences(content).map(normalize).filter(value => words(value).length >= 8);
  if (candidateSentences.some(sentence => source.includes(sentence))) reasons.push("duplicates_existing_content");
  const contentSet = new Set(contentWords.filter(word => word.length > 3 && !stop.has(word)));
  const evidenceSet = new Set(words(source).filter(word => word.length > 3 && !stop.has(word)));
  const grounded = [...contentSet].filter(word => evidenceSet.has(word)).length / Math.max(1, contentSet.size);
  if (grounded < .22) reasons.push("insufficient_first_party_grounding");
  if (!candidate.insertionLocation.trim() || !candidate.rationale.trim()) reasons.push("missing_review_context");
  return { accepted: reasons.length === 0, reasons: [...new Set(reasons)], groundedTermRatio: grounded };
}

const systemPrompt = `You are a careful website editor. Return exactly one JSON object with string fields proposedContent, insertionLocation, and rationale. Draft the actual visitor-facing section, normally 150-250 words. Use the language of the page. Write an original section heading and practical guidance supported by the supplied facts; do not copy existing headings or sentences. Directly answer the query intent, match the page tone, and add useful coverage without repeating the excerpt. Use only facts supplied in the first-party evidence packet. Never invent features, prices, results, guarantees, or superiority and never mention SEO, keywords, evidence packets, repositories, or internal systems. insertionLocation must be a clear "Insert after: [existing heading]" instruction. rationale must concisely explain the visitor benefit and query fit.`;

export class ExistingAiContentExpansionCopywriter implements ContentExpansionCopywriter {
  provider: string;
  model: string;
  constructor() { const config = aiProvider.getModelConfig("automation"); this.provider = config.provider; this.model = config.model; }
  async generate(packet: ContentExpansionPacket, revision?: ContentExpansionRevision) {
    const targetQueries = packet.searchConsole.queryCluster.filter(Boolean);
    const revisionInstruction = revision
      ? `Revise the prior draft to resolve every review issue without adding unverified facts. The visitor-facing section must substantively answer these Search Console queries: ${targetQueries.join(" | ")}. If query_intent_not_covered was rejected, make the answer unmistakable and naturally use at least one meaningful term from the target query where it fits. Do not keyword-stuff or force awkward wording.`
      : `Draft a visitor-facing section that substantively answers these Search Console queries: ${targetQueries.join(" | ")}. Make the answer explicit while keeping the wording natural and grounded only in the supplied first-party facts.`;
    const raw = await aiProvider.complete("automation", [{ role: "system", content: systemPrompt }, { role: "user", content: JSON.stringify({ ...packet, ...(revision ? { revision } : {}), instruction: revisionInstruction }) }], { jsonMode: true, maxTokens: 1_600 });
    const parsed = JSON.parse(typeof raw === "string" ? raw : raw.content) as Partial<ContentExpansionCandidate>;
    if (typeof parsed.proposedContent !== "string" || typeof parsed.insertionLocation !== "string" || typeof parsed.rationale !== "string") throw new Error("Invalid content expansion response");
    return { proposedContent: parsed.proposedContent.trim(), insertionLocation: parsed.insertionLocation.trim(), rationale: parsed.rationale.trim() };
  }
}

export async function generateAndReviewContentExpansion(evidence: ContentExpansionEvidence, copywriter: ContentExpansionCopywriter = new ExistingAiContentExpansionCopywriter()): Promise<ContentExpansionResult> {
  const packet = buildContentExpansionPacket(evidence);
  const audit: MetaGenerationAudit = { provider: copywriter.provider, model: copywriter.model, promptVersion: CONTENT_EXPANSION_PROMPT_VERSION, candidateCount: 0, selectedCandidateIndex: null, reviewerScores: [] };
  if (!packet.pageTitle || !packet.h1 || (packet.currentProductFacts.length < 2 && words(packet.currentPageText).length < 60) || !packet.currentPageExcerpt) {
    audit.reviewerScores.push({ index: -1, score: 0, better: false, rejectionReasons: ["insufficient_evidence"] });
    return { decision: "no_material_improvement", packet, audit };
  }
  let revision: ContentExpansionRevision | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const candidate = await copywriter.generate(packet, revision);
      audit.candidateCount++;
      const review = reviewContentExpansion(candidate, evidence);
      audit.reviewerScores.push({ index: attempt, score: Math.round(review.groundedTermRatio * 100), better: review.accepted, rejectionReasons: review.reasons });
      if (review.accepted) {
        audit.selectedCandidateIndex = attempt;
        return { decision: "accept", candidate, packet, audit };
      }
      revision = { previousDraft: candidate.proposedContent, rejectionReasons: review.reasons };
    } catch {
      // Do not retry provider failures, and never replace a failed draft with filler.
      audit.reviewerScores.push({ index: -1, score: 0, better: false, rejectionReasons: ["ai_provider_failure_or_malformed_json"] });
      break;
    }
  }
  return { decision: "no_material_improvement", packet, audit };
}

import { assessBacklinkCandidate, dedupeBacklinkCandidates, type BacklinkCandidate } from "./backlinkIntelligence";

/** Provenance-backed backlink research: external data must be supplied; no synthetic link counts. */
export type BacklinkResearchRecord = BacklinkCandidate & {
  sourceKind: "gsc_links_export" | "manual_research" | "partner_submission" | "provider_export";
  sourceReference: string;
  intent: "existing_backlink" | "editorial_opportunity";
  sourceRelevant: boolean;
  targetLive: boolean;
  independentEditorialFit: boolean;
};
export type BacklinkReviewItem = {
  record: BacklinkResearchRecord;
  score: number;
  reviewStatus: "needs_review" | "rejected";
  reasons: string[];
};

export function scoreBacklinkResearch(record: BacklinkResearchRecord): BacklinkReviewItem {
  const decision = assessBacklinkCandidate(record);
  const reasons = [...decision.reasons];
  if (!record.sourceReference.trim()) reasons.push("missing_provenance");
  if (!record.sourceRelevant) reasons.push("not_relevant_to_source");
  if (!record.targetLive) reasons.push("target_not_live");
  if (!record.independentEditorialFit) reasons.push("no_editorial_fit");
  // Source freshness must be checked at intake time; this score is relative, not domain authority.
  const score = Math.max(0, Math.min(100,
    20 + (record.sourceRelevant ? 25 : 0)
    + (record.independentEditorialFit ? 25 : 0)
    + (record.targetLive ? 15 : 0)
    + (record.placement === "editorial" || record.placement === "partner" ? 15 : 0)
  ));
  return { record, score, reasons, reviewStatus: reasons.length ? "rejected" : "needs_review" };
}

export function createBacklinkReviewQueue(records: BacklinkResearchRecord[]): BacklinkReviewItem[] {
  return dedupeBacklinkCandidates(records)
    .map(candidate => scoreBacklinkResearch(candidate as BacklinkResearchRecord))
    .sort((a, b) => (a.reviewStatus === "rejected" ? 1 : 0) - (b.reviewStatus === "rejected" ? 1 : 0) || b.score - a.score);
}

export type OutreachReview = { candidateSource: string; content: string; approved: boolean; sent: false };
export function draftBacklinkOutreach(item: BacklinkReviewItem, content: string): OutreachReview {
  if (item.reviewStatus !== "needs_review") throw new Error("Candidate has not passed research review");
  if (content.trim().length < 40) throw new Error("Personalized outreach context is required");
  // No network-side sending; a draft is never implicit approval to contact someone.
  return { candidateSource: item.record.sourceUrl, content, approved: false, sent: false };
}

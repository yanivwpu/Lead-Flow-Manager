/**
 * Extraction artifacts are independent of the page-content checksum.
 *
 * The checksum says whether the HTML changed. The artifact says whether we already ran
 * the current extractor against that HTML. Draft-review and published knowledge are
 * separate again: deleting drafts must not make an unchanged page unreadable.
 */

import {
  parseFactData,
  type FactCandidate,
  type FactOrigin,
} from "@shared/businessKnowledgeFacts";
import { sanitizeExtractedCandidates } from "@shared/knowledgeExtractionGuards";

/** Bump when the extractor, schema, or normalizer changes so unchanged HTML is read again. */
export const KNOWLEDGE_EXTRACTOR_VERSION = 4;

const FACT_ORIGINS = new Set<string>([
  "user_edited",
  "user_entered",
  "website_verified",
  "document",
  "integration",
  "ai_extracted",
  "migrated_source",
  "legacy_summary",
]);

export type KnowledgeExtractionArtifact = {
  extractorVersion: number;
  contentHash: string;
  candidates: FactCandidate[];
  extractedAt: string;
};

export type KnowledgeScanReuseReason =
  | "content_changed"
  | "missing_artifact"
  | "invalid_artifact"
  | "version_mismatch"
  | "force"
  | "valid_artifact";

export type KnowledgeScanReuseDecision = {
  action: "extract" | "reuse_artifact";
  reason: KnowledgeScanReuseReason;
};

function parseStoredCandidate(raw: unknown): FactCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const parsed = parseFactData(row.factType, row.data);
  if (!parsed.ok) return null;
  if (typeof row.factKey !== "string" || !row.factKey.trim()) return null;
  if (typeof row.origin !== "string" || !FACT_ORIGINS.has(row.origin)) return null;
  const confidence =
    typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : 0;
  return {
    factType: parsed.factType,
    factKey: row.factKey,
    data: parsed.data,
    origin: row.origin as FactOrigin,
    confidence,
    sourceId: typeof row.sourceId === "string" ? row.sourceId : null,
    sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : null,
    sourceTitle: typeof row.sourceTitle === "string" ? row.sourceTitle : null,
    excerpt: typeof row.excerpt === "string" ? row.excerpt : null,
    reviewReasons: Array.isArray(row.reviewReasons)
      ? row.reviewReasons.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

/**
 * Reads `metadata.extractionArtifact` (or a bare artifact object). Any corrupt candidate
 * invalidates the whole artifact so the page is extracted again instead of reused.
 */
export function parseKnowledgeExtractionArtifact(metadata: unknown): KnowledgeExtractionArtifact | null {
  if (!metadata || typeof metadata !== "object") return null;
  const bag = metadata as Record<string, unknown>;
  const raw = bag.extractionArtifact !== undefined ? bag.extractionArtifact : bag;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const art = raw as Record<string, unknown>;
  if (typeof art.extractorVersion !== "number" || !Number.isFinite(art.extractorVersion)) return null;
  if (typeof art.contentHash !== "string" || !art.contentHash.trim()) return null;
  if (!Array.isArray(art.candidates)) return null;
  const candidates: FactCandidate[] = [];
  for (const item of art.candidates) {
    const parsed = parseStoredCandidate(item);
    if (!parsed) return null;
    candidates.push(parsed);
  }
  return {
    extractorVersion: art.extractorVersion,
    contentHash: art.contentHash,
    candidates: sanitizeExtractedCandidates(candidates),
    extractedAt: typeof art.extractedAt === "string" ? art.extractedAt : "",
  };
}

export function buildKnowledgeExtractionArtifact(input: {
  contentHash: string;
  candidates: FactCandidate[];
  extractedAt: string;
  extractorVersion?: number;
}): KnowledgeExtractionArtifact {
  return {
    extractorVersion: input.extractorVersion ?? KNOWLEDGE_EXTRACTOR_VERSION,
    contentHash: input.contentHash,
    candidates: sanitizeExtractedCandidates(input.candidates),
    extractedAt: input.extractedAt,
  };
}

export function decideKnowledgeScanReuse(input: {
  pageContentHash: string;
  storedContentHash?: string | null;
  artifact: KnowledgeExtractionArtifact | null;
  extractorVersion?: number;
  forceReextract?: boolean;
}): KnowledgeScanReuseDecision {
  const version = input.extractorVersion ?? KNOWLEDGE_EXTRACTOR_VERSION;
  if (input.forceReextract) return { action: "extract", reason: "force" };
  const hashMatch = Boolean(input.storedContentHash && input.storedContentHash === input.pageContentHash);
  if (!hashMatch) return { action: "extract", reason: "content_changed" };
  if (!input.artifact) return { action: "extract", reason: "missing_artifact" };
  if (input.artifact.contentHash !== input.pageContentHash) {
    return { action: "extract", reason: "invalid_artifact" };
  }
  if (input.artifact.extractorVersion !== version) {
    return { action: "extract", reason: "version_mismatch" };
  }
  return { action: "reuse_artifact", reason: "valid_artifact" };
}

export function knowledgeReanalysisNote(reason: KnowledgeScanReuseReason): string | null {
  switch (reason) {
    case "missing_artifact":
      return "Page content was unchanged; facts were read again because the previous extraction was missing.";
    case "invalid_artifact":
      return "Page content was unchanged; facts were read again because the stored extraction was invalid.";
    case "version_mismatch":
      return "Page content was unchanged; facts were read again because the extractor was updated.";
    case "force":
      return "Page content was unchanged; a forced re-extract rebuilt the review.";
    case "valid_artifact":
      return "Page content was unchanged; saved extraction was applied again for review.";
    default:
      return null;
  }
}

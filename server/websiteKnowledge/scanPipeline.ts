/**
 * Per-source scan pipeline: fetch -> checksum/artifact decision -> extract or reuse -> merge.
 *
 * The page-content checksum, the extraction artifact/version, draft-review state, and
 * published knowledge are separate. Matching HTML is not a license to skip extraction when
 * the artifact is missing, the extractor changed, or drafts were discarded.
 *
 * Dependencies are injected so the whole pipeline can be driven from HTML fixtures in tests
 * without network or model access. Each source is processed independently and its failure
 * is recorded against that source only, so one dead URL cannot cost the workspace the facts
 * it already has.
 */

import {
  factPrecedence,
  type FactCandidate,
  type KnowledgeFact,
} from "@shared/businessKnowledgeFacts";
import { isUmbrellaCommercialName, mergePricingPlanCandidates, sanitizeExtractedCandidates } from "@shared/knowledgeExtractionGuards";
import { extractDeterministicFacts, prepareHtmlPage, type PreparedPage } from "./extractPage";
import { fetchPublicHtmlPage } from "../websiteKnowledgeScraper";
import { extractFactsWithAi, type AiExtractionResult } from "./extractFactsAi";
import { mergeFactsForSource, type FactMergeOperation } from "./mergeFacts";
import type { SourceDetectedType } from "./sourceStore";
import {
  buildKnowledgeExtractionArtifact,
  decideKnowledgeScanReuse,
  knowledgeReanalysisNote,
  type KnowledgeExtractionArtifact,
  KNOWLEDGE_EXTRACTOR_VERSION,
} from "./extractionArtifact";

export type ScanSourceRef = {
  id: string;
  url: string;
  /** Hash of the last fetched page text — not a signal that extraction may be skipped. */
  contentHash: string | null;
  extractionArtifact?: KnowledgeExtractionArtifact | null;
  forceReextract?: boolean;
};

export type FetchedPage = { page: PreparedPage; rawHtml: string };

export type ScanPipelineDeps = {
  fetchPage: (url: string, signal?: AbortSignal) => Promise<FetchedPage>;
  extractAi: (input: {
    page: PreparedPage;
    sourceId: string | null;
    knownFactKeys?: Set<string>;
  }) => Promise<AiExtractionResult>;
  now: () => Date;
};

export const defaultScanPipelineDeps: ScanPipelineDeps = {
  fetchPage: async (url, signal) => {
    // The raw body is kept alongside the cleaned page so link extraction can read hrefs.
    const { finalUrl, html, truncated } = await fetchPublicHtmlPage(url, signal);
    return { page: prepareHtmlPage(html, finalUrl, truncated), rawHtml: html };
  },
  extractAi: (input) => extractFactsWithAi(input),
  now: () => new Date(),
};

export type SourceScanStatus = "scanned" | "unchanged" | "reanalyzed" | "failed" | "empty";

export type SourceScanResult = {
  sourceId: string;
  status: SourceScanStatus;
  detectedType?: SourceDetectedType;
  title?: string | null;
  contentHash?: string | null;
  charCount?: number;
  extractionArtifact?: KnowledgeExtractionArtifact | null;
  candidates: FactCandidate[];
  operations: FactMergeOperation[];
  stats: { added: number; changed: number; unchanged: number; retiring: number; suggestions: number };
  notes: string[];
  errorCode?: string;
  errorMessage?: string;
};

const EMPTY_STATS = { added: 0, changed: 0, unchanged: 0, retiring: 0, suggestions: 0 };

/**
 * Deterministic facts win over the model's version of the same fact key. Both passes may
 * see the same plan; the literal reading is the one that keeps `website_verified`.
 */
export function combineCandidates(
  deterministic: FactCandidate[],
  ai: FactCandidate[],
): FactCandidate[] {
  const byKey = new Map<string, FactCandidate>();
  for (const candidate of deterministic) byKey.set(candidate.factKey, candidate);
  for (const candidate of ai) {
    const existing = byKey.get(candidate.factKey);
    if (!existing) {
      if (
        candidate.factType === "pricing_plan" &&
        candidate.origin !== "website_verified" &&
        isUmbrellaCommercialName(String((candidate.data as { name?: string }).name || ""), candidate.sourceTitle)
      ) {
        continue;
      }
      byKey.set(candidate.factKey, candidate);
      continue;
    }
    if (existing.factType === "pricing_plan" && candidate.factType === "pricing_plan") {
      byKey.set(candidate.factKey, mergePricingPlanCandidates(existing, candidate));
      continue;
    }
    const existingRank = factPrecedence({
      origin: existing.origin,
      isPinned: false,
      userEdited: false,
    });
    const incomingRank = factPrecedence({
      origin: candidate.origin,
      isPinned: false,
      userEdited: false,
    });
    if (incomingRank > existingRank) byKey.set(candidate.factKey, candidate);
  }
  return sanitizeExtractedCandidates([...byKey.values()]);
}

export async function scanSourceIntoDrafts(params: {
  source: ScanSourceRef;
  existingFacts: KnowledgeFact[];
  deps?: Partial<ScanPipelineDeps>;
  signal?: AbortSignal;
  extractorVersion?: number;
}): Promise<SourceScanResult> {
  const deps: ScanPipelineDeps = { ...defaultScanPipelineDeps, ...params.deps };
  const { source } = params;
  const extractorVersion = params.extractorVersion ?? KNOWLEDGE_EXTRACTOR_VERSION;

  let fetched: FetchedPage;
  try {
    fetched = await deps.fetchPage(source.url, params.signal);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err ? String((err as any).code) : "FETCH_FAILED";
    return {
      sourceId: source.id,
      status: "failed",
      candidates: [],
      operations: [],
      stats: { ...EMPTY_STATS },
      notes: [],
      errorCode: code,
      errorMessage: err instanceof Error ? err.message.slice(0, 240) : "Fetch failed",
    };
  }

  const { page, rawHtml } = fetched;
  const now = deps.now();

  if (page.renderedEmpty) {
    const deterministic = extractDeterministicFacts(page, rawHtml, source.id);
    return {
      sourceId: source.id,
      status: "empty",
      detectedType: page.detectedType,
      title: page.title,
      contentHash: page.contentHash,
      charCount: page.charCount,
      candidates: [],
      operations: [],
      stats: { ...EMPTY_STATS },
      notes: deterministic.notes,
      errorCode: "NO_TEXT",
      errorMessage: "The page returned no readable text",
    };
  }

  const storedArtifact = source.extractionArtifact ?? null;
  const decision = decideKnowledgeScanReuse({
    pageContentHash: page.contentHash,
    storedContentHash: source.contentHash,
    artifact: storedArtifact,
    extractorVersion,
    forceReextract: source.forceReextract,
  });

  let candidates: FactCandidate[] = [];
  const notes: string[] = [];
  let extractedFresh = false;

  if (decision.action === "reuse_artifact" && storedArtifact) {
    candidates = sanitizeExtractedCandidates(storedArtifact.candidates);
    const reuseNote = knowledgeReanalysisNote(decision.reason);
    if (reuseNote) notes.push(reuseNote);
  } else {
    extractedFresh = true;
    const deterministic = extractDeterministicFacts(page, rawHtml, source.id);
    notes.push(...deterministic.notes);
    const knownFactKeys = new Set(deterministic.candidates.map((c) => c.factKey));
    let aiCandidates: FactCandidate[] = [];
    try {
      const aiResult = await deps.extractAi({
        page,
        sourceId: source.id,
        knownFactKeys,
      });
      aiCandidates = aiResult.candidates;
      if (aiResult.attempted && aiResult.rejected > 0) {
        notes.push(
          `${aiResult.rejected} extracted item${aiResult.rejected === 1 ? "" : "s"} did not match a known fact shape and ${aiResult.rejected === 1 ? "was" : "were"} dropped.`,
        );
      }
    } catch (err) {
      // The deterministic pass already succeeded; a model failure must not lose it.
      notes.push("AI extraction was unavailable for this page; only literal facts were captured.");
      console.error(
        "[KnowledgeScan] AI extraction failed",
        err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      );
    }
    candidates = combineCandidates(deterministic.candidates, aiCandidates);
    const reanalysisNote = knowledgeReanalysisNote(decision.reason);
    if (reanalysisNote && source.contentHash && source.contentHash === page.contentHash) {
      notes.push(reanalysisNote);
    }
  }

  const merged = mergeFactsForSource({
    sourceId: source.id,
    existingFacts: params.existingFacts,
    candidates,
    now,
  });

  const proposed =
    merged.stats.added + merged.stats.changed + merged.stats.suggestions + merged.stats.retiring;
  const hashUnchanged = Boolean(source.contentHash && source.contentHash === page.contentHash);
  let status: SourceScanStatus = "scanned";
  if (hashUnchanged && !extractedFresh && proposed === 0) status = "unchanged";
  else if (hashUnchanged) status = "reanalyzed";

  const extractionArtifact = buildKnowledgeExtractionArtifact({
    contentHash: page.contentHash,
    candidates,
    extractedAt: now.toISOString(),
    extractorVersion,
  });

  return {
    sourceId: source.id,
    status,
    detectedType: page.detectedType,
    title: page.title,
    contentHash: page.contentHash,
    charCount: page.charCount,
    extractionArtifact,
    candidates,
    operations: merged.operations,
    stats: merged.stats,
    notes,
  };
}

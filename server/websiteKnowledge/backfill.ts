/**
 * Idempotent, additive migration of V1 Website Knowledge into the V2 fact model.
 *
 * Nothing is deleted and nothing is scanned: the guided slot URLs become source rows in
 * `pending`, and the existing prose summary becomes one published `business_summary` fact
 * at the lowest precedence tier so any structured fact extracted later outranks it.
 *
 * Safe to run repeatedly — every write is guarded by an existence check.
 */

import type { AiBusinessKnowledge } from "@shared/schema";
import {
  factKey,
  parseFactData,
  type FactType,
} from "@shared/businessKnowledgeFacts";
import {
  parseWebsiteKnowledgeSources,
  sourcesFromLegacyRow,
} from "@shared/websiteKnowledgeSources";
import { detectedTypeForSlotKey, listKnowledgeSources, upsertKnowledgeSource } from "./sourceStore";
import { insertFactIfAbsent, listFacts } from "./factStore";

export type BackfillResult = {
  sourcesCreated: number;
  sourcesExisting: number;
  legacySummaryFactCreated: boolean;
};

const LEGACY_SUMMARY_MAX = 2000;

export async function backfillWorkspaceKnowledgeV2(
  userId: string,
  knowledge: Partial<AiBusinessKnowledge> | null | undefined,
  now = new Date(),
): Promise<BackfillResult> {
  const result: BackfillResult = {
    sourcesCreated: 0,
    sourcesExisting: 0,
    legacySummaryFactCreated: false,
  };
  if (!knowledge) return result;

  const before = await listKnowledgeSources(userId);
  const knownUrls = new Set(before.map((s) => s.normalizedUrl));

  const slotSources = parseWebsiteKnowledgeSources(knowledge.websiteKnowledgeSources);
  const legacySources = slotSources.length
    ? []
    : sourcesFromLegacyRow({
        websiteKnowledgeUrl: knowledge.websiteKnowledgeUrl ?? null,
        websiteKnowledgeUpdatedAt: knowledge.websiteKnowledgeUpdatedAt ?? null,
      });

  for (const entry of [...slotSources, ...legacySources]) {
    const row = await upsertKnowledgeSource(userId, {
      url: entry.url,
      slotKey: entry.key,
      customLabel: entry.label,
      detectedType: detectedTypeForSlotKey(entry.key),
    });
    if (knownUrls.has(row.normalizedUrl)) result.sourcesExisting += 1;
    else {
      result.sourcesCreated += 1;
      knownUrls.add(row.normalizedUrl);
    }
  }

  // URLs actually fetched during the last successful save, in case a slot was cleared.
  const fetchedUrls = Array.isArray(knowledge.websiteKnowledgeSourceUrls)
    ? (knowledge.websiteKnowledgeSourceUrls as unknown[]).filter(
        (u): u is string => typeof u === "string" && u.trim().length > 0,
      )
    : [];
  for (const url of fetchedUrls) {
    const row = await upsertKnowledgeSource(userId, { url });
    if (knownUrls.has(row.normalizedUrl)) result.sourcesExisting += 1;
    else {
      result.sourcesCreated += 1;
      knownUrls.add(row.normalizedUrl);
    }
  }

  result.legacySummaryFactCreated = await backfillLegacySummaryFact(userId, knowledge, now);
  return result;
}

/**
 * The prose summary becomes a real fact so a workspace that never rescans still has
 * something structured to ground on. Origin `legacy_summary` is the lowest tier, so the
 * first extracted fact for the same key supersedes it.
 */
async function backfillLegacySummaryFact(
  userId: string,
  knowledge: Partial<AiBusinessKnowledge>,
  now: Date,
): Promise<boolean> {
  const summary = String(knowledge.websiteKnowledgeSummary ?? "").trim();
  if (!summary) return false;

  const existing = await listFacts(userId, {
    states: ["draft", "published"],
    factTypes: ["business_summary" as FactType],
  });
  if (existing.length > 0) return false;

  const data = {
    summary: summary.length > LEGACY_SUMMARY_MAX ? summary.slice(0, LEGACY_SUMMARY_MAX) : summary,
  };
  const parsed = parseFactData("business_summary", data);
  if (!parsed.ok) return false;

  return insertFactIfAbsent(
    userId,
    {
      factType: "business_summary",
      factKey: factKey("business_summary", parsed.data),
      data: parsed.data,
      origin: "legacy_summary",
      confidence: 0.5,
      state: "published",
      sourceUrl: knowledge.websiteKnowledgeUrl ?? null,
      excerpt: summary,
    },
    now,
  );
}

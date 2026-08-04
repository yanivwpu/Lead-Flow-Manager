/**
 * Server-side access to published facts for the AI reply path.
 *
 * Published facts change only on publish, so they are cached per workspace for a short
 * window — a reply must not pay a table scan per turn.
 */

import {
  parseKnowledgeFreshnessPolicy,
  type KnowledgeFact,
  type KnowledgeFreshnessPolicy,
} from "@shared/businessKnowledgeFacts";
import {
  buildGroundedPromptBlock,
  type GroundedPromptBlock,
  type GroundedResponsePackage,
} from "@shared/factGrounding";
import {
  retrieveFactsForTurnWithNextAction,
  type RetrievedFact,
} from "@shared/knowledgeRetrieval";
import { detectFactConflicts } from "@shared/businessKnowledgeFacts";
import { listPublishedFacts } from "./factStore";
import { knowledgeFactsActiveForWorkspace } from "./knowledgeFlags";

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  facts: KnowledgeFact[];
  policy: KnowledgeFreshnessPolicy | undefined;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export function invalidatePublishedFactsCache(userId: string): void {
  cache.delete(userId);
}

export async function getPublishedFactsCached(
  userId: string,
  freshnessPolicyRaw?: unknown,
): Promise<{ facts: KnowledgeFact[]; policy: KnowledgeFreshnessPolicy | undefined }> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return { facts: cached.facts, policy: cached.policy };
  }
  const facts = await listPublishedFacts(userId);
  const policy = parseKnowledgeFreshnessPolicy(freshnessPolicyRaw);
  cache.set(userId, { facts, policy, expiresAt: Date.now() + CACHE_TTL_MS });
  return { facts, policy };
}

export type TurnGrounding = GroundedResponsePackage;

const EMPTY_GROUNDING: TurnGrounding = {
  retrieved: [],
  block: { text: "", factCount: 0, staleFactCount: 0, coveredTypes: [] },
  conflictingKeys: [],
};

/**
 * Facts for one inbound turn, ready to drop into a prompt.
 *
 * Returns an empty block — and therefore a prompt byte-identical to V1 — when the kill
 * switch is on, when the workspace has not been switched onto V2, or when nothing is
 * published. This is the single gate for fact consumption on the reply path.
 */
export async function buildTurnGrounding(params: {
  userId: string;
  message: string;
  /** The workspace's ai_business_knowledge row; its knowledge_v2_enabled flag decides. */
  knowledgeRow?: unknown;
  subIntents?: string[];
  freshnessPolicyRaw?: unknown;
  limit?: number;
}): Promise<TurnGrounding> {
  if (!knowledgeFactsActiveForWorkspace(params.knowledgeRow)) {
    return { ...EMPTY_GROUNDING, block: { ...EMPTY_GROUNDING.block } };
  }

  const { facts, policy } = await getPublishedFactsCached(params.userId, params.freshnessPolicyRaw);
  if (facts.length === 0) {
    return { ...EMPTY_GROUNDING, block: { ...EMPTY_GROUNDING.block } };
  }

  const retrieved = retrieveFactsForTurnWithNextAction({
    facts,
    message: params.message,
    subIntents: params.subIntents,
    policy,
    limit: params.limit,
  });

  const conflictingKeys = detectFactConflicts(facts)
    .filter((c) => c.resolution === "blocked")
    .map((c) => c.factKey);

  return {
    retrieved,
    block: buildGroundedPromptBlock(retrieved, { conflictingKeys }),
    conflictingKeys,
  };
}

/**
 * Drop specific fact types from a turn's grounding (e.g. prefer Live Business Packages
 * over scanned pricing_plan rows). Does not mutate Knowledge Sources storage.
 */
export function excludeFactTypesFromGrounding(
  grounding: TurnGrounding,
  factTypes: readonly string[],
): TurnGrounding {
  if (!factTypes.length || grounding.retrieved.length === 0) return grounding;
  const drop = new Set(factTypes);
  const retrieved = grounding.retrieved.filter((r) => !drop.has(r.fact.factType));
  if (retrieved.length === grounding.retrieved.length) return grounding;
  return {
    retrieved,
    block: buildGroundedPromptBlock(retrieved, {
      conflictingKeys: grounding.conflictingKeys,
    }),
    conflictingKeys: grounding.conflictingKeys,
  };
}

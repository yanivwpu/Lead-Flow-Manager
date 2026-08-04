/**
 * Knowledge Sources status adapter for the Live Business Data registry.
 * Semantic retrieval stays in websiteKnowledge / fact grounding — this provider
 * only reports readiness and does not re-index or query documents here.
 */

import { listPublishedFacts } from "../../websiteKnowledge/factStore";
import { listKnowledgeSources } from "../../websiteKnowledge/sourceStore";
import type {
  LiveBusinessDataProvider,
  LiveBusinessDataProviderStatusResult,
  LiveBusinessDataQueryContext,
} from "../types";

export const websiteKnowledgeProvider: LiveBusinessDataProvider = {
  id: "websiteKnowledge",

  async getStatus(userId: string): Promise<LiveBusinessDataProviderStatusResult> {
    try {
      const [facts, sources] = await Promise.all([
        listPublishedFacts(userId),
        listKnowledgeSources(userId),
      ]);
      if (facts.length > 0) {
        return {
          status: "connected",
          detail:
            facts.length === 1
              ? "1 published fact"
              : `${facts.length.toLocaleString()} published facts`,
        };
      }
      if (sources.length > 0) {
        return { status: "disconnected", detail: "Pages added — publish after review" };
      }
      return { status: "disconnected", detail: "Not set up" };
    } catch {
      return { status: "error", detail: "Unable to load knowledge status" };
    }
  },

  async query(_ctx: LiveBusinessDataQueryContext) {
    // Knowledge Sources are retrieved via buildTurnGrounding — not this path.
    return [];
  },
};

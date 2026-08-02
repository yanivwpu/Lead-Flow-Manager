/**
 * V2 structured-knowledge API.
 *
 * Every handler requires an authenticated user and the AI Brain add-on, and every query
 * filters on that user's id. Responses carry validated facts and short excerpts only.
 */

import type { Express, Request, Response } from "express";
import { parseKnowledgeFreshnessPolicy } from "@shared/businessKnowledgeFacts";
import { buildKnowledgeReviewPayload } from "@shared/knowledgeReview";
import { assertSafePublicHttpUrl, WebsiteKnowledgeScrapeError } from "../websiteKnowledgeScraper";
import { storage } from "../storage";
import { backfillWorkspaceKnowledgeV2 } from "./backfill";
import { discardDraftFacts, listFacts } from "./factStore";
import { knowledgeFactsDisabled } from "./knowledgeFlags";
import { publishKnowledgeFacts, previewSourceRemoval, removeKnowledgeFact } from "./publishFacts";
import {
  createScanJob,
  getLatestScanJob,
  getScanJob,
  toScanJobView,
} from "./scanJobService";
import {
  deleteKnowledgeSource,
  listKnowledgeSources,
  sourceDisplayLabel,
  upsertKnowledgeSource,
} from "./sourceStore";

export type KnowledgeRouteDeps = {
  /** Sends its own 403 and returns false when the workspace lacks the add-on. */
  requireAiBrainPremium: (req: Request, res: Response) => Promise<boolean>;
};

async function loadFreshnessPolicy(userId: string) {
  const knowledge = await storage.getAiBusinessKnowledge(userId);
  return {
    knowledge,
    policy: parseKnowledgeFreshnessPolicy(knowledge?.knowledgeFreshnessPolicy),
  };
}

export function registerKnowledgeV2Routes(app: Express, deps: KnowledgeRouteDeps): void {
  const guard = async (req: Request, res: Response): Promise<boolean> => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
    if (knowledgeFactsDisabled()) {
      res.status(503).json({ error: "Structured knowledge is temporarily disabled." });
      return false;
    }
    return deps.requireAiBrainPremium(req, res);
  };

  app.get("/api/ai/knowledge/sources", async (req, res) => {
    try {
      if (!(await guard(req, res))) return;
      const userId = req.user!.id;

      let sources = await listKnowledgeSources(userId);
      if (sources.length === 0) {
        // First visit after the upgrade: adopt the V1 slot URLs without scanning them.
        const knowledge = await storage.getAiBusinessKnowledge(userId);
        const backfill = await backfillWorkspaceKnowledgeV2(userId, knowledge);
        if (backfill.sourcesCreated > 0 || backfill.legacySummaryFactCreated) {
          sources = await listKnowledgeSources(userId);
        }
      }

      const latestJob = await getLatestScanJob(userId);
      res.json({
        sources: sources.map((s) => ({
          id: s.id,
          url: s.url,
          label: sourceDisplayLabel(s),
          detectedType: s.detectedType,
          status: s.status,
          isEnabled: s.isEnabled,
          charCount: s.charCount,
          errorMessage: s.errorMessage,
          lastScannedAt: s.lastScannedAt,
          lastSuccessfulScanAt: s.lastSuccessfulScanAt,
        })),
        latestJob: latestJob ? toScanJobView(latestJob) : null,
      });
    } catch (error) {
      console.error("[Knowledge] list sources failed:", error);
      res.status(500).json({ error: "Failed to load knowledge sources" });
    }
  });

  app.post("/api/ai/knowledge/sources", async (req, res) => {
    try {
      if (!(await guard(req, res))) return;
      const body = (req.body || {}) as Record<string, unknown>;
      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (!url) return res.status(400).json({ error: "A URL is required." });

      try {
        assertSafePublicHttpUrl(url);
      } catch (err) {
        const message =
          err instanceof WebsiteKnowledgeScrapeError ? err.message : "That URL is not allowed.";
        return res.status(400).json({ error: message });
      }

      const source = await upsertKnowledgeSource(req.user!.id, {
        url,
        customLabel: typeof body.label === "string" && body.label.trim() ? body.label.trim() : null,
      });
      res.json({
        source: {
          id: source.id,
          url: source.url,
          label: sourceDisplayLabel(source),
          detectedType: source.detectedType,
          status: source.status,
          isEnabled: source.isEnabled,
        },
      });
    } catch (error) {
      console.error("[Knowledge] add source failed:", error);
      res.status(500).json({ error: "Failed to add source" });
    }
  });

  app.get("/api/ai/knowledge/sources/:id/removal-impact", async (req, res) => {
    try {
      if (!(await guard(req, res))) return;
      const impact = await previewSourceRemoval(req.user!.id, req.params.id);
      res.json(impact);
    } catch (error) {
      console.error("[Knowledge] removal impact failed:", error);
      res.status(500).json({ error: "Failed to analyze source removal" });
    }
  });

  app.delete("/api/ai/knowledge/sources/:id", async (req, res) => {
    try {
      if (!(await guard(req, res))) return;
      // Facts keep their provenance and stay published; source_id is set null by the FK.
      const removed = await deleteKnowledgeSource(req.user!.id, req.params.id);
      if (!removed) return res.status(404).json({ error: "Source not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("[Knowledge] delete source failed:", error);
      res.status(500).json({ error: "Failed to remove source" });
    }
  });

  app.post("/api/ai/knowledge/scan", async (req, res) => {
    try {
      if (!(await guard(req, res))) return;
      const body = (req.body || {}) as Record<string, unknown>;
      const sourceIds = Array.isArray(body.sourceIds)
        ? (body.sourceIds as unknown[]).filter((v): v is string => typeof v === "string")
        : undefined;

      const job = await createScanJob(req.user!.id, sourceIds);
      if ((job.progressTotal ?? 0) === 0) {
        return res.status(400).json({ error: "Add at least one page before scanning." });
      }
      res.json({ jobId: job.id, job: toScanJobView(job) });
    } catch (error) {
      console.error("[Knowledge] scan enqueue failed:", error);
      res.status(500).json({ error: "Failed to start scan" });
    }
  });

  app.get("/api/ai/knowledge/scan/:id", async (req, res) => {
    try {
      if (!(await guard(req, res))) return;
      const job = await getScanJob(req.user!.id, req.params.id);
      if (!job) return res.status(404).json({ error: "Scan not found" });
      res.json(toScanJobView(job));
    } catch (error) {
      console.error("[Knowledge] scan status failed:", error);
      res.status(500).json({ error: "Failed to load scan status" });
    }
  });

  app.get("/api/ai/knowledge/facts", async (req, res) => {
    try {
      if (!(await guard(req, res))) return;
      const userId = req.user!.id;
      const { knowledge, policy } = await loadFreshnessPolicy(userId);
      const facts = await listFacts(userId, { states: ["draft", "published", "retired"] });
      const payload = buildKnowledgeReviewPayload({ facts, policy });
      res.json({
        ...payload,
        knowledgeV2Enabled: knowledge?.knowledgeV2Enabled === true,
      });
    } catch (error) {
      console.error("[Knowledge] list facts failed:", error);
      res.status(500).json({ error: "Failed to load knowledge" });
    }
  });

  app.delete("/api/ai/knowledge/facts/:id", async (req, res) => {
    try {
      if (!(await guard(req, res))) return;
      // Drafts are discarded outright; a published fact is retired and the prose summary
      // rebuilt in the same transaction, so the two can never describe different prices.
      const outcome = await removeKnowledgeFact(req.user!.id, req.params.id);
      if (outcome === "not_found") return res.status(404).json({ error: "Fact not found" });
      res.json({ ok: true, outcome });
    } catch (error) {
      console.error("[Knowledge] delete fact failed:", error);
      res.status(500).json({ error: "Failed to remove fact" });
    }
  });

  app.post("/api/ai/knowledge/discard", async (req, res) => {
    try {
      if (!(await guard(req, res))) return;
      const discarded = await discardDraftFacts(req.user!.id);
      res.json({ ok: true, discarded });
    } catch (error) {
      console.error("[Knowledge] discard failed:", error);
      res.status(500).json({ error: "Failed to discard proposed changes" });
    }
  });

  app.post("/api/ai/knowledge/publish", async (req, res) => {
    try {
      if (!(await guard(req, res))) return;
      const result = await publishKnowledgeFacts(req.user!.id);
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[Knowledge] publish failed:", error);
      res.status(500).json({ error: "Failed to publish knowledge" });
    }
  });
}

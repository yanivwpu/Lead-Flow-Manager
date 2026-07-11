import type { Express, Request, Response, NextFunction } from "express";
import type { ProspectIntelligenceListFilters } from "@shared/prospectImport";
import { prospectIntelligenceService } from "../prospectImport/prospectIntelligenceService";
import { getProspectImportJob } from "../prospectImport/prospectImportService";
import { getImportJobContactIds } from "../prospectImport/prospectIntelligenceService";
import { requireProspectImportAccess } from "./prospectImportAccess";

export function registerProspectIntelligenceRoutes(app: Express): void {
  app.post(
    "/api/growth-tools/prospect-import/jobs/:jobId/analyze",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const importJob = await getProspectImportJob(req.params.jobId);
        if (!importJob) return res.status(404).json({ error: "Import job not found" });

        const contactIds = await getImportJobContactIds(req.params.jobId);
        const userId = (req.user as { id: string }).id;
        const job = await prospectIntelligenceService.createProspectIntelligenceJob({
          importJobId: req.params.jobId,
          initiatedByUserId: userId,
          force: req.body?.force === true,
        });

        res.status(202).json({
          job,
          preview: {
            batchName: importJob.batchName,
            contactCount: contactIds.length,
          },
        });
      } catch (err) {
        console.error("[ProspectIntelligence] analyze start error:", err);
        res.status(400).json({ error: err instanceof Error ? err.message : "Failed to start analysis" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-intelligence/jobs/:jobId",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const job = await prospectIntelligenceService.getProspectIntelligenceJob(req.params.jobId);
        if (!job) return res.status(404).json({ error: "Analysis job not found" });
        res.json({ job });
      } catch (err) {
        console.error("[ProspectIntelligence] job status error:", err);
        res.status(500).json({ error: "Failed to load analysis job" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-intelligence/dashboard",
    requireProspectImportAccess,
    async (_req, res) => {
      try {
        const counts = await prospectIntelligenceService.getProspectIntelligenceDashboardCounts();
        res.json(counts);
      } catch (err) {
        console.error("[ProspectIntelligence] dashboard error:", err);
        res.status(500).json({ error: "Failed to load AI dashboard" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-intelligence",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const filters: ProspectIntelligenceListFilters = {
          priority: req.query.priority as ProspectIntelligenceListFilters["priority"],
          businessType: typeof req.query.businessType === "string" ? req.query.businessType : undefined,
          recommendedOffer:
            typeof req.query.recommendedOffer === "string" ? req.query.recommendedOffer : undefined,
          segment: req.query.segment as ProspectIntelligenceListFilters["segment"],
          needsReviewOnly: req.query.needsReviewOnly === "true",
          importJobId: typeof req.query.importJobId === "string" ? req.query.importJobId : undefined,
          sortBy: req.query.sortBy as ProspectIntelligenceListFilters["sortBy"],
          sortDir: req.query.sortDir as ProspectIntelligenceListFilters["sortDir"],
          limit: req.query.limit ? Number(req.query.limit) : undefined,
        };
        const items = await prospectIntelligenceService.listProspectIntelligence(filters);
        res.json({ items });
      } catch (err) {
        console.error("[ProspectIntelligence] list error:", err);
        res.status(500).json({ error: "Failed to list prospect intelligence" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-intelligence/:contactId",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const item = await prospectIntelligenceService.getProspectIntelligenceDetail(req.params.contactId);
        if (!item) return res.status(404).json({ error: "Prospect intelligence not found" });
        res.json(item);
      } catch (err) {
        console.error("[ProspectIntelligence] detail error:", err);
        res.status(500).json({ error: "Failed to load prospect intelligence" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-intelligence/:contactId/reanalyze",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const intelligence = await prospectIntelligenceService.reanalyzeProspectContact(req.params.contactId);
        res.json({ intelligence });
      } catch (err) {
        console.error("[ProspectIntelligence] reanalyze error:", err);
        res.status(400).json({ error: err instanceof Error ? err.message : "Re-analysis failed" });
      }
    },
  );

  app.patch(
    "/api/growth-tools/prospect-intelligence/:contactId",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const { suggestedFirstMessage, suggestedOutreachAngle, reasoningSummary } = req.body as {
          suggestedFirstMessage?: string;
          suggestedOutreachAngle?: string;
          reasoningSummary?: string;
        };
        const item = await prospectIntelligenceService.patchProspectIntelligence(req.params.contactId, {
          suggestedFirstMessage,
          suggestedOutreachAngle,
          reasoningSummary,
        });
        if (!item) return res.status(404).json({ error: "Prospect intelligence not found" });
        res.json(item);
      } catch (err) {
        console.error("[ProspectIntelligence] patch error:", err);
        res.status(400).json({ error: err instanceof Error ? err.message : "Update failed" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-intelligence/:contactId/approve",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const userId = (req.user as { id: string }).id;
        await prospectIntelligenceService.approveProspectIntelligence(req.params.contactId, userId);
        const item = await prospectIntelligenceService.getProspectIntelligenceDetail(req.params.contactId);
        res.json({ item });
      } catch (err) {
        console.error("[ProspectIntelligence] approve error:", err);
        res.status(400).json({ error: err instanceof Error ? err.message : "Approve failed" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-intelligence/:contactId/needs-review",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        await prospectIntelligenceService.markProspectNeedsReview(req.params.contactId);
        const item = await prospectIntelligenceService.getProspectIntelligenceDetail(req.params.contactId);
        res.json({ item });
      } catch (err) {
        console.error("[ProspectIntelligence] needs-review error:", err);
        res.status(400).json({ error: err instanceof Error ? err.message : "Update failed" });
      }
    },
  );
}

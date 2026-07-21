import type { Express } from "express";
import type { ProspectIntelligenceListFilters } from "@shared/prospectImport";
import { prospectIntelligenceService } from "../prospectImport/prospectIntelligenceService";
import { getProspectImportJob } from "../prospectImport/prospectImportService";
import { getImportJobContactIds } from "../prospectImport/prospectIntelligenceService";
import { requireProspectImportAccess } from "./prospectImportAccess";
import { resolveProspectWorkspaceUserId } from "../prospectImport/prospectWorkspaceScope";

export function registerProspectIntelligenceRoutes(app: Express): void {
  app.post(
    "/api/growth-tools/prospect-import/jobs/:jobId/analyze",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const workspaceUserId = await resolveProspectWorkspaceUserId((req.user as { id: string }).id);
        const importJob = await getProspectImportJob(req.params.jobId, workspaceUserId);
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
    async (req, res) => {
      try {
        const workspaceUserId = await resolveProspectWorkspaceUserId((req.user as { id: string }).id);
        const counts = await prospectIntelligenceService.getProspectIntelligenceDashboardCounts(
          workspaceUserId,
        );
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
        const workspaceUserId = await resolveProspectWorkspaceUserId((req.user as { id: string }).id);
        const filters: ProspectIntelligenceListFilters = {
          priority: req.query.priority as ProspectIntelligenceListFilters["priority"],
          businessType: typeof req.query.businessType === "string" ? req.query.businessType : undefined,
          recommendedOffer:
            typeof req.query.recommendedOffer === "string" ? req.query.recommendedOffer : undefined,
          segment: req.query.segment as ProspectIntelligenceListFilters["segment"],
          needsReviewOnly: req.query.needsReviewOnly === "true",
          importJobId: typeof req.query.importJobId === "string" ? req.query.importJobId : undefined,
          statusFilter: req.query.statusFilter as ProspectIntelligenceListFilters["statusFilter"],
          hasEmail: req.query.hasEmail === "true" ? true : undefined,
          hasPhone: req.query.hasPhone === "true" ? true : undefined,
          emailEligible: req.query.emailEligible === "true" ? true : undefined,
          anyEligibleChannel: req.query.anyEligibleChannel === "true" ? true : undefined,
          sortBy: req.query.sortBy as ProspectIntelligenceListFilters["sortBy"],
          sortDir: req.query.sortDir as ProspectIntelligenceListFilters["sortDir"],
          limit: req.query.limit ? Number(req.query.limit) : undefined,
        };
        const items = await prospectIntelligenceService.listProspectIntelligence(
          filters,
          workspaceUserId,
        );
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
        const workspaceUserId = await resolveProspectWorkspaceUserId((req.user as { id: string }).id);
        const item = await prospectIntelligenceService.getProspectIntelligenceDetail(
          req.params.contactId,
          workspaceUserId,
        );
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
        const workspaceUserId = await resolveProspectWorkspaceUserId((req.user as { id: string }).id);
        const intelligence = await prospectIntelligenceService.reanalyzeProspectContact(
          req.params.contactId,
          workspaceUserId,
        );
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
        const workspaceUserId = await resolveProspectWorkspaceUserId((req.user as { id: string }).id);
        const { suggestedFirstMessage, suggestedOutreachAngle, reasoningSummary } = req.body as {
          suggestedFirstMessage?: string;
          suggestedOutreachAngle?: string;
          reasoningSummary?: string;
        };
        const item = await prospectIntelligenceService.patchProspectIntelligence(
          req.params.contactId,
          {
            suggestedFirstMessage,
            suggestedOutreachAngle,
            reasoningSummary,
          },
          workspaceUserId,
        );
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
        const workspaceUserId = await resolveProspectWorkspaceUserId(userId);
        const suggestedFirstMessage =
          typeof req.body?.suggestedFirstMessage === "string"
            ? req.body.suggestedFirstMessage
            : undefined;
        const item = await prospectIntelligenceService.approveProspectIntelligence(
          req.params.contactId,
          userId,
          {
            suggestedFirstMessage,
            workspaceUserId,
          },
        );
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
        const workspaceUserId = await resolveProspectWorkspaceUserId((req.user as { id: string }).id);
        await prospectIntelligenceService.markProspectNeedsReview(
          req.params.contactId,
          workspaceUserId,
        );
        const item = await prospectIntelligenceService.getProspectIntelligenceDetail(
          req.params.contactId,
          workspaceUserId,
        );
        res.json({ item });
      } catch (err) {
        console.error("[ProspectIntelligence] needs-review error:", err);
        res.status(400).json({ error: err instanceof Error ? err.message : "Update failed" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-intelligence/:contactId/enrichment",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const workspaceUserId = await resolveProspectWorkspaceUserId((req.user as { id: string }).id);
        const item = await prospectIntelligenceService.getProspectIntelligenceDetail(
          req.params.contactId,
          workspaceUserId,
        );
        if (!item) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const intel = item.intelligence;
        res.json({
          enrichmentStatus: intel.enrichmentStatus || "none",
          websiteAnalyzedAt: intel.websiteAnalyzedAt || null,
          websiteUrlUsed: intel.websiteUrlUsed || null,
          emailFound: Boolean(intel.enrichmentEmailFound),
          phoneFound: Boolean(intel.enrichmentPhoneFound),
          enrichmentResult: intel.enrichmentResult || null,
          errorMessage: intel.enrichmentErrorMessage || null,
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Failed" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-intelligence/:contactId/enrichment/retry",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const userId = (req.user as { id: string }).id;
        const workspaceUserId = await resolveProspectWorkspaceUserId(userId);
        const { retryFailedEnrichment } = await import("../prospectImport/prospectEnrichmentService");
        const job = await retryFailedEnrichment({
          contactId: req.params.contactId,
          workspaceUserId,
          initiatedByUserId: userId,
        });
        res.json({ job });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : "Enrichment retry failed",
        });
      }
    },
  );
}

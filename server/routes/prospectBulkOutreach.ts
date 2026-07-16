import type { Express } from "express";
import type { ProspectIntelligenceListFilters } from "@shared/prospectImport";
import type { ProspectOutreachPreferredChannel } from "@shared/prospectBulkOutreach";
import { PROSPECT_BULK_MAX_BATCH_SIZE } from "@shared/prospectBulkSelection";
import { requireProspectImportAccess } from "./prospectImportAccess";
import { prospectBulkAnalysisService } from "../prospectImport/prospectBulkAnalysisService";
import { prospectOutreachQueueService } from "../prospectImport/prospectOutreachQueueService";
import {
  ProspectBulkSelectionError,
  resolveProspectBulkSelection,
} from "../prospectImport/prospectBulkSelectionService";
import { resolveProspectImportDestinationUserId } from "../prospectImport/prospectImportService";

type SelectionBody = {
  contactIds?: string[];
  allFiltered?: boolean;
  filters?: ProspectIntelligenceListFilters;
};

async function resolveFromBody(body: SelectionBody) {
  return resolveProspectBulkSelection({
    contactIds: body.contactIds,
    allFiltered: body.allFiltered === true,
    filters: body.filters,
  });
}

function selectionErrorResponse(err: unknown, res: import("express").Response) {
  if (err instanceof ProspectBulkSelectionError) {
    return res.status(400).json({
      error: err.message,
      code: err.code,
      maxBatchSize: PROSPECT_BULK_MAX_BATCH_SIZE,
      matchedCount: err.matchedCount,
    });
  }
  return null;
}

export function registerProspectBulkOutreachRoutes(app: Express): void {
  // Resolve selection (confirmation counts) — frozen IDs for subsequent actions
  app.post(
    "/api/growth-tools/prospect-intelligence/resolve-selection",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const selection = await resolveFromBody(req.body || {});
        res.json({ selection });
      } catch (err) {
        if (selectionErrorResponse(err, res)) return;
        res.status(400).json({ error: err instanceof Error ? err.message : "Resolve failed" });
      }
    },
  );

  // --- Bulk AI analysis ---
  app.post(
    "/api/growth-tools/prospect-intelligence/bulk-analyze",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const userId = (req.user as { id: string }).id;
        const body = req.body as SelectionBody & { force?: boolean };
        const selection = await resolveFromBody(body);

        const job = await prospectBulkAnalysisService.createBulkAnalysisJob({
          contactIds: selection.contactIds,
          initiatedByUserId: userId,
          selectionMode: selection.selectionMode,
          force: body.force === true,
          filtersSnapshot: selection.filters || null,
        });
        res.status(202).json({ job, selection });
      } catch (err) {
        if (selectionErrorResponse(err, res)) return;
        console.error("[ProspectBulkOutreach] bulk-analyze error:", err);
        res.status(400).json({ error: err instanceof Error ? err.message : "Bulk analyze failed" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-intelligence/bulk-analyze/active",
    requireProspectImportAccess,
    async (_req, res) => {
      try {
        const job = await prospectBulkAnalysisService.getActiveOrRecentBulkAnalysisJob();
        res.json({ job });
      } catch (err) {
        res.status(500).json({ error: "Failed to load analysis job" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-intelligence/bulk-analyze/:jobId",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const job = await prospectBulkAnalysisService.getBulkAnalysisJob(req.params.jobId);
        if (!job) return res.status(404).json({ error: "Analysis job not found" });
        res.json({ job });
      } catch (err) {
        res.status(500).json({ error: "Failed to load analysis job" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-intelligence/bulk-analyze/:jobId/retry-failed",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const userId = (req.user as { id: string }).id;
        const job = await prospectBulkAnalysisService.retryFailedBulkAnalysisItems({
          jobId: req.params.jobId,
          initiatedByUserId: userId,
        });
        res.status(202).json({ job });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Retry failed" });
      }
    },
  );

  // --- Bulk review actions ---
  app.post(
    "/api/growth-tools/prospect-intelligence/bulk-approve",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const userId = (req.user as { id: string }).id;
        const selection = await resolveFromBody(req.body || {});
        const result = await prospectOutreachQueueService.bulkApproveProspects({
          contactIds: selection.contactIds,
          userId,
        });
        res.json({ ...result, selection });
      } catch (err) {
        if (selectionErrorResponse(err, res)) return;
        res.status(400).json({ error: err instanceof Error ? err.message : "Bulk approve failed" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-intelligence/bulk-needs-review",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const selection = await resolveFromBody(req.body || {});
        const result = await prospectOutreachQueueService.bulkMarkNeedsReview(selection.contactIds);
        res.json({ ...result, selection });
      } catch (err) {
        if (selectionErrorResponse(err, res)) return;
        res.status(400).json({ error: err instanceof Error ? err.message : "Bulk needs-review failed" });
      }
    },
  );

  // --- Queue preview / create ---
  app.post(
    "/api/growth-tools/prospect-outreach/queue/preview",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const selection = await resolveFromBody(req.body || {});
        const preferredChannel = req.body?.preferredChannel as
          | ProspectOutreachPreferredChannel
          | undefined;
        const preview = await prospectOutreachQueueService.previewQueueBatch({
          contactIds: selection.contactIds,
          preferredChannel,
        });
        res.json({ preview, selection });
      } catch (err) {
        if (selectionErrorResponse(err, res)) return;
        res.status(400).json({ error: err instanceof Error ? err.message : "Preview failed" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-outreach/queue",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const userId = (req.user as { id: string }).id;
        const selection = await resolveFromBody(req.body || {});
        const preferredChannel = req.body?.preferredChannel as
          | ProspectOutreachPreferredChannel
          | undefined;
        const result = await prospectOutreachQueueService.createQueueBatch({
          contactIds: selection.contactIds,
          createdByUserId: userId,
          preferredChannel,
          idempotencyKey:
            typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : undefined,
        });
        res.status(201).json({ ...result, selection });
      } catch (err) {
        if (selectionErrorResponse(err, res)) return;
        console.error("[ProspectBulkOutreach] queue create error:", err);
        res.status(400).json({ error: err instanceof Error ? err.message : "Queue failed" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-outreach/queue",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const status = typeof req.query.status === "string" ? req.query.status : undefined;
        const items = await prospectOutreachQueueService.listQueueItems({ status });
        res.json({ items });
      } catch (err) {
        res.status(500).json({ error: "Failed to list queue" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-outreach/dashboard",
    requireProspectImportAccess,
    async (_req, res) => {
      try {
        const dashboard = await prospectOutreachQueueService.getQueueDashboard();
        res.json(dashboard);
      } catch (err) {
        res.status(500).json({ error: "Failed to load outreach dashboard" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-outreach/settings",
    requireProspectImportAccess,
    async (_req, res) => {
      try {
        const settings = await prospectOutreachQueueService.getOutreachSettings();
        res.json({ settings });
      } catch (err) {
        res.status(500).json({ error: "Failed to load settings" });
      }
    },
  );

  app.patch(
    "/api/growth-tools/prospect-outreach/settings",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const workspaceUserId = await resolveProspectImportDestinationUserId();
        const settings = await prospectOutreachQueueService.updateOutreachSettings(
          workspaceUserId,
          req.body || {},
        );
        res.json({ settings });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Update failed" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-outreach/queue/start",
    requireProspectImportAccess,
    async (_req, res) => {
      try {
        const workspaceUserId = await resolveProspectImportDestinationUserId();
        const settings = await prospectOutreachQueueService.startQueue(workspaceUserId);
        res.json({ settings });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Start failed" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-outreach/queue/pause",
    requireProspectImportAccess,
    async (_req, res) => {
      try {
        const workspaceUserId = await resolveProspectImportDestinationUserId();
        const settings = await prospectOutreachQueueService.pauseQueue(workspaceUserId);
        res.json({ settings });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Pause failed" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-outreach/queue/resume",
    requireProspectImportAccess,
    async (_req, res) => {
      try {
        const workspaceUserId = await resolveProspectImportDestinationUserId();
        const settings = await prospectOutreachQueueService.resumeQueue(workspaceUserId);
        res.json({ settings });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Resume failed" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-outreach/queue/:itemId/remove",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const workspaceUserId = await resolveProspectImportDestinationUserId();
        const result = await prospectOutreachQueueService.removeQueueItem({
          queueItemId: req.params.itemId,
          workspaceUserId,
        });
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Remove failed" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-outreach/queue/:itemId/retry",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const workspaceUserId = await resolveProspectImportDestinationUserId();
        const result = await prospectOutreachQueueService.retryFailedQueueItem({
          queueItemId: req.params.itemId,
          workspaceUserId,
        });
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Retry failed" });
      }
    },
  );
}

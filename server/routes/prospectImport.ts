import type { Express, Request, Response } from "express";
import type {
  ProspectImportContactFilter,
  ProspectImportInternalTag,
  ProspectImportOptions,
  ProspectImportProvider,
  ProspectImportReason,
} from "@shared/prospectImport";
import { canAccessProspectImportTools } from "@shared/prospectImportAccess";
import { prospectImportService } from "../prospectImport/prospectImportService";
import { requireProspectImportAccess } from "./prospectImportAccess";

export function registerProspectImportRoutes(app: Express): void {
  app.get("/api/growth-tools/prospect-import/access", (req, res) => {
    if (!req.isAuthenticated?.() || !req.user) {
      return res.json({ allowed: false });
    }
    const session = req.session as { isAdmin?: boolean } | undefined;
    const allowed = canAccessProspectImportTools(
      req.user as { id: string; email?: string | null },
      session,
    );
    res.json({ allowed });
  });

  app.get(
    "/api/growth-tools/prospect-import/ghl/locations",
    requireProspectImportAccess,
    async (_req, res) => {
      try {
        const locations = await prospectImportService.listGhlProspectLocations();
        res.json({ locations });
      } catch (err) {
        console.error("[ProspectImport] locations error:", err);
        res.status(500).json({ error: "Failed to list GHL locations" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-import/ghl/locations/:integrationId/metadata",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const locationId =
          typeof req.query.locationId === "string" ? req.query.locationId.trim() : undefined;
        const metadata = await prospectImportService.getGhlLocationMetadata(
          req.params.integrationId,
          locationId,
        );
        res.json(metadata);
      } catch (err) {
        console.error("[ProspectImport] metadata error:", err);
        res.status(500).json({
          error: err instanceof Error ? err.message : "Failed to load location metadata",
        });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-import/ghl/preview",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const { integrationId, locationId, filters, appliedTemplateHint } = req.body as {
          integrationId?: string;
          locationId?: string;
          filters?: ProspectImportContactFilter;
          appliedTemplateHint?: string | null;
        };
        if (!integrationId) return res.status(400).json({ error: "integrationId required" });
        if (!locationId?.trim()) return res.status(400).json({ error: "locationId required" });

        const destinationUserId = await prospectImportService.resolveProspectImportDestinationUserId();
        const outcome = await prospectImportService.previewGhlProspectImport({
          integrationId,
          locationId: locationId.trim(),
          filters: filters || {},
          destinationUserId,
          initiatedByUserId: (req.user as { id: string }).id,
          appliedTemplateHint: appliedTemplateHint ?? null,
        });

        if (outcome.mode === "async") {
          return res.status(202).json({ async: true, previewJobId: outcome.previewJobId });
        }
        res.json({ async: false, preview: outcome.result });
      } catch (err) {
        console.error("[ProspectImport] preview error:", err);
        res.status(500).json({
          error: err instanceof Error ? err.message : "Preview failed",
        });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-import/ghl/preview-jobs/:jobId",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const job = await prospectImportService.getGhlProspectPreviewJob(req.params.jobId);
        if (!job) return res.status(404).json({ error: "Preview job not found" });
        res.json({ job });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : "Failed to load preview job",
        });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-import/ghl/import",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const { integrationId, locationId, filters, importOptions, previewTotal, previewJobId, filterFingerprint } =
          req.body as {
          integrationId?: string;
          locationId?: string;
          filters?: ProspectImportContactFilter;
          importOptions?: ProspectImportOptions;
          previewTotal?: number;
          previewJobId?: string;
          filterFingerprint?: string;
        };
        if (!integrationId) return res.status(400).json({ error: "integrationId required" });
        if (!locationId?.trim()) return res.status(400).json({ error: "locationId required" });
        if (!previewJobId?.trim()) return res.status(400).json({ error: "previewJobId required" });
        const batchName = String(importOptions?.batchName || "").trim();
        if (!batchName) return res.status(400).json({ error: "batchName is required" });

        const job = await prospectImportService.createProspectImportJob({
          initiatedByUserId: (req.user as { id: string }).id,
          integrationId,
          locationId: locationId.trim(),
          filters: filters || {},
          importOptions: {
            internalTag: "Imported-GHL",
            ...importOptions,
            batchName,
          },
          previewTotal: previewTotal ?? 0,
          previewJobId: previewJobId.trim(),
          filterFingerprint: filterFingerprint?.trim(),
        });
        res.status(202).json({ job });
      } catch (err) {
        console.error("[ProspectImport] import start error:", err);
        res.status(500).json({
          error: err instanceof Error ? err.message : "Import failed to start",
        });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-import/jobs/:jobId",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const job = await prospectImportService.getProspectImportJob(req.params.jobId);
        if (!job) return res.status(404).json({ error: "Job not found" });
        res.json({ job });
      } catch (err) {
        res.status(500).json({ error: "Failed to load job" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-import/history",
    requireProspectImportAccess,
    async (_req, res) => {
      try {
        const history = await prospectImportService.listProspectImportHistory();
        res.json({ history });
      } catch (err) {
        res.status(500).json({ error: "Failed to load import history" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-import/jobs/:jobId/undo-preview",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const preview = await prospectImportService.previewProspectImportUndo(req.params.jobId);
        if (!preview) return res.status(404).json({ error: "Job not found" });
        res.json({ preview });
      } catch (err) {
        res.status(500).json({ error: "Failed to preview undo" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-import/jobs/:jobId/undo",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const result = await prospectImportService.executeProspectImportUndo({
          jobId: req.params.jobId,
          undoneByUserId: (req.user as { id: string }).id,
        });
        res.json({ result });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : "Undo failed",
        });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-import/templates",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const templates = await prospectImportService.listProspectImportTemplates(
          (req.user as { id: string }).id,
        );
        res.json({ templates });
      } catch (err) {
        res.status(500).json({ error: "Failed to load templates" });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-import/templates",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const body = req.body as {
          templateName?: string;
          provider?: ProspectImportProvider;
          filters?: ProspectImportContactFilter;
          defaultInternalTag?: ProspectImportInternalTag;
          defaultImportReason?: ProspectImportReason | string;
          defaultImportLimit?: number;
        };
        if (!body.templateName?.trim()) {
          return res.status(400).json({ error: "templateName required" });
        }
        const template = await prospectImportService.saveProspectImportTemplate({
          userId: (req.user as { id: string }).id,
          templateName: body.templateName,
          provider: body.provider || "gohighlevel",
          filters: body.filters || {},
          defaultInternalTag: body.defaultInternalTag,
          defaultImportReason: body.defaultImportReason,
          defaultImportLimit: body.defaultImportLimit,
        });
        res.status(201).json({ template });
      } catch (err) {
        res.status(500).json({ error: "Failed to save template" });
      }
    },
  );

  app.delete(
    "/api/growth-tools/prospect-import/templates/:templateId",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const ok = await prospectImportService.deleteProspectImportTemplate(
          (req.user as { id: string }).id,
          req.params.templateId,
        );
        if (!ok) return res.status(404).json({ error: "Template not found" });
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: "Failed to delete template" });
      }
    },
  );

  app.get(
    "/api/growth-tools/prospect-import/dashboard",
    requireProspectImportAccess,
    async (_req, res) => {
      try {
        const destinationUserId = await prospectImportService.resolveProspectImportDestinationUserId();
        const stats = await prospectImportService.getProspectImportDashboardStats(destinationUserId);
        res.json(stats);
      } catch (err) {
        res.status(500).json({ error: "Failed to load dashboard stats" });
      }
    },
  );
}

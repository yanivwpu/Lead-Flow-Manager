import type { Express, Request, Response, NextFunction } from "express";
import { canAccessProspectImportTools } from "@shared/prospectImportAccess";
import type {
  ProspectImportContactFilter,
  ProspectImportInternalTag,
  ProspectImportOptions,
  ProspectImportProvider,
  ProspectImportReason,
} from "@shared/prospectImport";
import { prospectImportService } from "../prospectImport/prospectImportService";

function requireProspectImportAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const session = req.session as { isAdmin?: boolean } | undefined;
  if (!canAccessProspectImportTools(req.user as { id: string; email?: string | null }, session)) {
    res.status(403).json({ error: "Growth Tools access denied" });
    return;
  }
  next();
}

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
        const metadata = await prospectImportService.getGhlLocationMetadata(req.params.integrationId);
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
        const { integrationId, filters } = req.body as {
          integrationId?: string;
          filters?: ProspectImportContactFilter;
        };
        if (!integrationId) return res.status(400).json({ error: "integrationId required" });

        const destinationUserId = await prospectImportService.resolveProspectImportDestinationUserId();
        const preview = await prospectImportService.previewGhlProspectImport({
          integrationId,
          filters: filters || {},
          destinationUserId,
        });
        res.json(preview);
      } catch (err) {
        console.error("[ProspectImport] preview error:", err);
        res.status(500).json({
          error: err instanceof Error ? err.message : "Preview failed",
        });
      }
    },
  );

  app.post(
    "/api/growth-tools/prospect-import/ghl/import",
    requireProspectImportAccess,
    async (req, res) => {
      try {
        const { integrationId, filters, importOptions, previewTotal } = req.body as {
          integrationId?: string;
          filters?: ProspectImportContactFilter;
          importOptions?: ProspectImportOptions;
          previewTotal?: number;
        };
        if (!integrationId) return res.status(400).json({ error: "integrationId required" });
        const batchName = String(importOptions?.batchName || "").trim();
        if (!batchName) return res.status(400).json({ error: "batchName is required" });

        const job = await prospectImportService.createProspectImportJob({
          initiatedByUserId: (req.user as { id: string }).id,
          integrationId,
          filters: filters || {},
          importOptions: {
            internalTag: "Imported-GHL",
            ...importOptions,
            batchName,
          },
          previewTotal: previewTotal ?? 0,
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

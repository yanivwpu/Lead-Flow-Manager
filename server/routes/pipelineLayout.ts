import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { workspacePipelineLayouts } from "@shared/schema";
import { defaultPipelineLayout, pipelineLayoutPatchSchema, pipelineLayoutSchema, type PipelineLayoutResponse } from "@shared/pipelineLayout";
import { inboxContentReadLimiter } from "../inboxContentRateLimit";
import { requireInboxWorkspace, inboxWorkspaceId, isInboxAdmin } from "../inboxWorkspaceAccess";

const endpoint = "/api/inbox/pipeline-layout";

export function registerPipelineLayoutRoutes(app: Express): void {
  app.get(endpoint, inboxContentReadLimiter, requireInboxWorkspace, async (req, res) => {
    try {
      const workspaceId = inboxWorkspaceId(req);
      const [row] = await db.select().from(workspacePipelineLayouts).where(eq(workspacePipelineLayouts.workspaceId, workspaceId)).limit(1);
      const response: PipelineLayoutResponse = {
        workspaceId, canEdit: isInboxAdmin(req),
        revision: row?.revision ?? 0,
        stages: row ? pipelineLayoutSchema.parse(row.stages) : defaultPipelineLayout(),
      };
      res.json(response);
    } catch {
      res.status(503).json({ error: "Pipeline configuration unavailable" });
    }
  });

  app.patch(endpoint, inboxContentReadLimiter, requireInboxWorkspace, async (req, res) => {
    try {
      if (!isInboxAdmin(req)) return res.status(403).json({ error: "Workspace admin required" });
      if (req.get("sec-fetch-site") === "cross-site") return res.status(403).json({ error: "Forbidden" });
      const origin = req.get("origin");
      if (origin) {
        try {
          if (new URL(origin).origin !== `${req.protocol}://${req.get("host")}`) return res.status(403).json({ error: "Forbidden" });
        } catch { return res.status(403).json({ error: "Forbidden" }); }
      }
      const patch = pipelineLayoutPatchSchema.safeParse(req.body);
      if (!patch.success) return res.status(400).json({ error: "Invalid pipeline configuration" });
      const workspaceId = inboxWorkspaceId(req);
      if (patch.data.workspaceId !== workspaceId) return res.status(409).json({ error: "Workspace changed; reload configuration" });
      const { revision, stages } = patch.data;
      // Compare-and-swap prevents a stale editor from overwriting another admin.
      const [saved] = revision === 0
        ? await db.insert(workspacePipelineLayouts).values({ workspaceId, stages, revision: 1 }).onConflictDoNothing().returning()
        : await db.update(workspacePipelineLayouts).set({ stages, revision: revision + 1, updatedAt: new Date() })
            .where(and(eq(workspacePipelineLayouts.workspaceId, workspaceId), eq(workspacePipelineLayouts.revision, revision))).returning();
      if (!saved) return res.status(409).json({ error: "Pipeline configuration changed; reload before saving" });
      const response: PipelineLayoutResponse = { workspaceId, canEdit: true, revision: saved.revision, stages: saved.stages };
      res.json(response);
    } catch {
      res.status(503).json({ error: "Pipeline configuration unavailable" });
    }
  });
}

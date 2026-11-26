import type { Express, Request } from "express";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { workspacePipelineLayouts } from "@shared/schema";
import { defaultPipelineLayout, pipelineLayoutPatchSchema, pipelineLayoutSchema, preparePipelineLayoutSave, type PipelineLayoutResponse } from "@shared/pipelineLayout";
import { inboxContentReadLimiter } from "../inboxContentRateLimit";
import { requireInboxWorkspace, inboxWorkspaceId, isInboxAdmin } from "../inboxWorkspaceAccess";

const endpoint = "/api/inbox/pipeline-layout";
const csrfCookie = "pipelineCsrfToken";

function isSameOriginRequest(req: Request): boolean {
  const site = req.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return false;
  const origin = req.get("origin");
  if (!origin) return true; // Token is still required for every mutation.
  try { return origin === new URL(`${req.protocol}://${req.get("host")}`).origin; }
  catch { return false; }
}

/** Express-session generates a high-entropy opaque session ID; it remains server-side.
 * Domain separation and actor/workspace binding make the token useless in another session.
 * No session writes are needed when multiple editors read the layout simultaneously.
 */
function sessionCsrfToken(req: Request): string | undefined {
  if (!req.sessionID || !req.user?.id) return undefined;
  return createHmac("sha256", req.sessionID)
    .update(JSON.stringify(["whachat:pipeline-layout:csrf:v1", req.user.id, inboxWorkspaceId(req)]))
    .digest("hex");
}
function equalCsrfToken(actual: unknown, expected: unknown): boolean {
  if (typeof actual !== "string" || typeof expected !== "string" ||
      !/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

export function registerPipelineLayoutRoutes(app: Express): void {
  app.get(endpoint, inboxContentReadLimiter, requireInboxWorkspace, async (req, res) => {
    try {
      if (!isSameOriginRequest(req)) return res.status(403).json({ error: "Forbidden" });
      const workspaceId = inboxWorkspaceId(req);
      const [row] = await db.select().from(workspacePipelineLayouts).where(eq(workspacePipelineLayouts.workspaceId, workspaceId)).limit(1);
      const response: PipelineLayoutResponse = {
        workspaceId, canEdit: isInboxAdmin(req),
        revision: row?.revision ?? 0,
        stages: row ? pipelineLayoutSchema.parse(row.stages) : defaultPipelineLayout(),
      };
      if (response.canEdit) {
        const token = sessionCsrfToken(req);
        if (!token) return res.status(403).json({ error: "Authenticated session required" });
        // Double submit, cryptographically bound to the authenticated session.
        res.cookie(csrfCookie, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: endpoint });
        response.csrfToken = token;
      }
      res.json(response);
    } catch {
      res.status(503).json({ error: "Pipeline configuration unavailable" });
    }
  });

  app.patch(endpoint, inboxContentReadLimiter, requireInboxWorkspace, async (req, res) => {
    try {
      if (!isInboxAdmin(req)) return res.status(403).json({ error: "Workspace admin required" });
      if (!isSameOriginRequest(req)) return res.status(403).json({ error: "Forbidden" });
      const token = sessionCsrfToken(req);
      const submittedToken = req.get("x-csrf-token");
      if (!req.is("application/json") ||
          !equalCsrfToken(req.cookies?.pipelineCsrfToken, submittedToken) ||
          !equalCsrfToken(submittedToken, token)) {
        return res.status(403).json({ error: "Invalid CSRF token", code: "CSRF_INVALID" });
      }
      const patch = pipelineLayoutPatchSchema.safeParse(req.body);
      if (!patch.success) return res.status(400).json({ error: "Invalid pipeline configuration" });
      const workspaceId = inboxWorkspaceId(req);
      if (patch.data.workspaceId !== workspaceId) return res.status(409).json({ error: "Workspace changed; reload configuration" });
      const { revision } = patch.data;
      const [current] = await db.select().from(workspacePipelineLayouts).where(eq(workspacePipelineLayouts.workspaceId, workspaceId)).limit(1);
      if ((current?.revision ?? 0) !== revision) return res.status(409).json({ error: "Pipeline configuration changed; reload before saving" });
      const stages = preparePipelineLayoutSave(patch.data.stages, current ? pipelineLayoutSchema.parse(current.stages) : defaultPipelineLayout(), () => `custom:${randomUUID()}`);
      if (!stages) return res.status(400).json({ error: "Custom stage mapping cannot be changed" });
      // Compare-and-swap prevents a stale editor from overwriting another admin.
      const [saved] = revision === 0
        ? await db.insert(workspacePipelineLayouts).values({ workspaceId, stages, revision: 1 }).onConflictDoNothing().returning()
        : await db.update(workspacePipelineLayouts).set({ stages, revision: revision + 1, updatedAt: new Date() })
            .where(and(eq(workspacePipelineLayouts.workspaceId, workspaceId), eq(workspacePipelineLayouts.revision, revision))).returning();
      if (!saved) return res.status(409).json({ error: "Pipeline configuration changed; reload before saving" });
      const response: PipelineLayoutResponse = { workspaceId, canEdit: true, revision: saved.revision, stages: saved.stages, csrfToken: token };
      res.json(response);
    } catch {
      res.status(503).json({ error: "Pipeline configuration unavailable" });
    }
  });
}

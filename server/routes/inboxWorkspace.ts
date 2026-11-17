import { inboxContentReadLimiter } from "../inboxContentRateLimit";
import { db } from "../../drizzle/db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import { getInboxWorkspaceAccess, listInboxWorkspaces, resolveInboxWorkspace } from "../inboxWorkspaceAccess";

export function registerInboxWorkspaceRoutes(app: Express): void {
  app.get("/api/inbox/workspaces", inboxContentReadLimiter, async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      res.setHeader("Cache-Control", "no-store");
      const workspaceIds = await listInboxWorkspaces(req.user.id);
      const workspaces = await Promise.all(workspaceIds.map(async id => {
        const [owner] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, id));
        const access = await getInboxWorkspaceAccess(req.user!.id, id);
        return { id, name: owner?.name || owner?.email || id, role: access?.role };
      }));
      const selected = await resolveInboxWorkspace(req);
      res.json({ workspaceIds, workspaces, currentWorkspaceId: req.session?.inboxWorkspaceId || selected?.workspaceUserId || req.user.id });
    } catch (error) { next(error); }
  });
  // Explicit selection for accounts with multiple workspaces. This grants no access;
  // the authenticated actor's current linked membership is checked here and on every use.
  app.post("/api/inbox/workspace", inboxContentReadLimiter, async (req, res, next) => {
    try {
      if (!req.user || !req.session) return res.status(401).json({ error: "Unauthorized" });
      if (req.get("sec-fetch-site") === "cross-site") return res.status(403).json({ error: "Forbidden" });
      const origin = req.get("origin");
      if (origin) {
        try {
          if (new URL(origin).origin !== `${req.protocol}://${req.get("host")}`) return res.status(403).json({ error: "Forbidden" });
        } catch { return res.status(403).json({ error: "Forbidden" }); }
      }
      const id = req.body?.workspaceId;
      if (typeof id !== "string" || !id || id.length > 128) return res.status(400).json({ error: "Invalid workspace selection" });
      const access = await getInboxWorkspaceAccess(req.user.id, id);
      if (!access) return res.status(403).json({ error: "Forbidden" });
      req.session.inboxWorkspaceId = access.workspaceUserId;
      await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
      res.setHeader("Cache-Control", "no-store");
      res.json({ workspaceId: access.workspaceUserId, role: access.role, reloadRequired: true });
    } catch (error) { next(error); }
  });
}

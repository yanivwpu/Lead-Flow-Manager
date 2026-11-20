import { Router, type Express, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { buildPublicAgentPageHtml } from "@shared/agent/publicAgentPageHtml";
import { buildNeighborhoodUrl, neighborhoodContentComplete } from "@shared/agent/neighborhoodPages";
import { canResolvePublicAgentPage } from "@shared/agent/publicAgentPage";
import { buildPublicAgentPageData } from "../agentPage/agentPageService";
import { getAgentPageSettingsRow } from "../agentPage/agentPageDb";
import { hasAgentPagePublicationAccess } from "../agentPage/agentPagePublication";
import { isAgentPageSlugConflictError } from "../agentPage/agentPageSettingsPatch";
import {
  createNeighborhoodPage, deleteNeighborhoodPage, getNeighborhoodPage,
  isPublishedNeighborhood, listNeighborhoodPages, updateNeighborhoodPage, type NeighborhoodPage,
} from "../agentPage/neighborhoodPages";
import { getAppOrigin } from "../urlOrigins";

const fields = z.object({
  name: z.string().trim().min(1).max(80).regex(/[\p{L}\p{N}]/u),
  city: z.string().trim().min(1).max(80).regex(/[\p{L}\p{N}]/u),
  state: z.string().trim().min(1).max(60).regex(/[\p{L}\p{N}]/u),
  content: z.string().trim().max(5000),
});

function settings(page: NeighborhoodPage, agentSlug: string | null) {
  const { id, name, city, state, content, slug, published, updatedAt } = page;
  return { id, name, city, state, content, slug, published, updatedAt: updatedAt.toISOString(), publicUrl: agentSlug && isPublishedNeighborhood(page)
    ? buildNeighborhoodUrl(agentSlug, slug, getAppOrigin()) : null };
}

function run(handler: (req: Request, res: Response, userId: string) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    if (!req.user) { res.sendStatus(401); return; }
    void handler(req, res, req.user.id).catch(next);
  };
}

export function registerAgentNeighborhoodPagesRoutes(app: Express): void {
  const router = Router();
  router.use((req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
    if (!req.user) { res.sendStatus(401); return; }
    void hasAgentPagePublicationAccess(req.user.id).then((allowed) => {
      if (allowed) next();
      else res.sendStatus(403);
    }).catch(next);
  });

  router.get("/", run(async (_req, res, userId) => {
    const [agent, pages] = await Promise.all([getAgentPageSettingsRow(userId), listNeighborhoodPages(userId)]);
    const liveSlug = agent && canResolvePublicAgentPage(agent) ? agent.agentPageSlug : null;
    res.json({ canPublish: Boolean(liveSlug), pages: pages.map((page) => settings(page, liveSlug)) });
  }));

  router.post("/", run(async (req, res, userId) => {
    const parsed = fields.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a neighborhood, city, state, and up to 5,000 characters of local content." });
    const page = await createNeighborhoodPage(userId, parsed.data);
    res.status(201).json(settings(page, null));
  }));

  router.put("/:id", run(async (req, res, userId) => {
    const parsed = fields.extend({ published: z.boolean(), expectedUpdatedAt: z.string().datetime().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a neighborhood, city, state, and up to 5,000 characters of local content." });
    let liveSlug: string | null = null;
    if (parsed.data.published) {
      const agent = await getAgentPageSettingsRow(userId);
      if (!agent || !canResolvePublicAgentPage(agent)) return res.status(403).json({ error: "Enable your public Agent Page before publishing." });
      if (!neighborhoodContentComplete(parsed.data.content)) return res.status(400).json({ error: "Write two distinct paragraphs of local information, with at least 240 characters total." });
      liveSlug = agent.agentPageSlug;
    }
    const id = String(req.params.id);
    const { expectedUpdatedAt, ...content } = parsed.data;
    const page = await updateNeighborhoodPage(userId, id, content, expectedUpdatedAt);
    if (!page) {
      if (expectedUpdatedAt && await getNeighborhoodPage(userId, id)) {
        return res.status(409).json({ error: "This page changed since you opened it. Review the saved version before editing again." });
      }
      return res.sendStatus(404);
    }
    res.json(settings(page, liveSlug));
  }));

  router.delete("/:id", run(async (req, res, userId) => {
    const version = z.string().datetime().optional().safeParse(req.query.expectedUpdatedAt);
    if (!version.success) return res.sendStatus(400);
    const id = String(req.params.id);
    if (await deleteNeighborhoodPage(userId, id, version.data)) return res.sendStatus(204);
    if (version.data && await getNeighborhoodPage(userId, id)) {
      return res.status(409).json({ error: "This page changed since you opened it. Review the saved version before deleting." });
    }
    res.sendStatus(404);
  }));

  router.get("/:id/preview", run(async (req, res, userId) => {
    const [page, agent] = await Promise.all([getNeighborhoodPage(userId, String(req.params.id)), getAgentPageSettingsRow(userId)]);
    if (!page || !agent) return res.sendStatus(404);
    const data = await buildPublicAgentPageData(agent, getAppOrigin(), { profileOnly: true, preview: true });
    res.type("html").send(buildPublicAgentPageHtml({
      ...data, neighborhood: { ...page, parentUrl: canResolvePublicAgentPage(agent) ? data.pageUrl : "", preview: true },
    }));
  }));

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const cause = error && typeof error === "object" && "cause" in error ? error.cause : undefined;
    if (isAgentPageSlugConflictError(error) || (cause && isAgentPageSlugConflictError(cause))) {
      res.status(409).json({ error: "You already have a neighborhood page with this URL." });
      return;
    }
    console.error("[agent-neighborhoods] settings failed", error);
    res.status(500).json({ error: "Unable to update neighborhood pages." });
  });
  app.use("/api/agent-page/neighborhoods", router);
}

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { buildPublicAgentPageHtml } from "@shared/agent/publicAgentPageHtml";
import { VICTORIA_PARK_AGENT_SLUG, victoriaParkContentComplete } from "@shared/agent/victoriaPark";
import { getPublicAgentPageData } from "../agentPage/agentPageService";
import { resolveAgentPageBySlug } from "../agentPage/agentPageDb";
import {
  isVictoriaParkPilotOwner, readVictoriaParkDraft, saveVictoriaParkDraft, victoriaParkUrl,
} from "../agentPage/victoriaParkPilot";
import { getAppOrigin } from "../urlOrigins";

const url = "/api/agent-page/neighborhood";
const draftBody = z.object({ content: z.string().trim().max(5000), published: z.boolean() });

export function registerAgentNeighborhoodPilotRoutes(app: Express): void {
  app.use(url, (_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
    next();
  });
  app.get(url, async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    if (!isVictoriaParkPilotOwner(req.user.id)) return res.sendStatus(404);
    try {
      const agent = await resolveAgentPageBySlug(VICTORIA_PARK_AGENT_SLUG);
      const draft = await readVictoriaParkDraft(req.user.id);
      const eligible = agent?.userId === req.user.id;
      res.json({ content: draft.content, published: draft.published, eligible, publicUrl: eligible && draft.published && victoriaParkContentComplete(draft.content) ? victoriaParkUrl() : null });
    } catch (error) {
      console.error("[agent-neighborhood] load failed", error);
      res.status(500).json({ error: "Unable to load neighborhood settings" });
    }
  });
  app.put(url, async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    if (!isVictoriaParkPilotOwner(req.user.id)) return res.sendStatus(404);
    const parsed = draftBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter up to 5,000 characters of neighborhood content." });
    try {
      const { content, published } = parsed.data;
      if (published) {
        const agent = await resolveAgentPageBySlug(VICTORIA_PARK_AGENT_SLUG);
        if (agent?.userId !== req.user.id) return res.status(403).json({ error: "The pilot Agent Page must be live to publish." });
        if (!victoriaParkContentComplete(content)) return res.status(400).json({ error: "Add at least two substantial paragraphs with 240 characters total." });
      }
      await saveVictoriaParkDraft(req.user.id, content, published);
      res.json({ content, published, publicUrl: published ? victoriaParkUrl() : null });
    } catch (error) {
      console.error("[agent-neighborhood] save failed", error);
      res.status(500).json({ error: "Unable to save neighborhood settings" });
    }
  });
  app.get(`${url}/preview`, async (req: Request, res: Response) => {
    if (!req.user) return res.sendStatus(401);
    if (!isVictoriaParkPilotOwner(req.user.id)) return res.sendStatus(404);
    try {
      const data = await getPublicAgentPageData(VICTORIA_PARK_AGENT_SLUG, getAppOrigin(), { profileOnly: true });
      if (data?.userId !== req.user.id) return res.status(403).send("Enable your pilot Agent Page to preview the neighborhood.");
      const draft = await readVictoriaParkDraft(req.user.id);
      res.type("html").send(buildPublicAgentPageHtml({
        ...data, widgetEnabled: false, widgetPublicId: "",
        neighborhood: { content: draft.content, parentUrl: data.pageUrl, preview: true },
      }));
    } catch (error) {
      console.error("[agent-neighborhood] preview failed", error);
      res.status(500).send("Preview unavailable");
    }
  });
}

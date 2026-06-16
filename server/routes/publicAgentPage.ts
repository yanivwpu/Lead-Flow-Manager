import type { Express, Request, Response } from "express";
import { publicAgentAnalyticsBodySchema, publicAgentLeadBodySchema } from "@shared/agent/agentPageSchema";
import {
  buildPublicAgentPageHtml,
  buildPublicAgentPageNotFoundHtml,
} from "@shared/agent/publicAgentPageHtml";
import { getRequestOrigin } from "../urlOrigins";
import { getPublicAgentPageData } from "../agentPage/agentPageService";
import { processPublicAgentPageLead } from "../agentPage/publicAgentPageLeadService";
import { incrementAgentPageAnalytics, resolveAgentPageBySlug } from "../agentPage/agentPageDb";
import { requirePublicListingSchemaReady } from "../middleware/requirePublicListingSchemaReady";

export function registerPublicAgentPageRoutes(app: Express): void {
  app.get("/agents/:slug", requirePublicListingSchemaReady, async (req: Request, res: Response) => {
    const slug = req.params.slug?.trim() ?? "";
    if (!slug) {
      res.status(404).type("html").send(buildPublicAgentPageNotFoundHtml());
      return;
    }
    try {
      const appOrigin = getRequestOrigin(req);
      const data = await getPublicAgentPageData(slug, appOrigin);
      if (!data) {
        res.status(404).type("html").send(buildPublicAgentPageNotFoundHtml());
        return;
      }
      const { agent: _agent, pageUrl: _pageUrl, ...renderInput } = data;
      res.type("html").send(buildPublicAgentPageHtml(renderInput));
    } catch (error) {
      console.error("[public-agent-page] render failed", {
        slug,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).type("text/plain").send("Page unavailable");
    }
  });

  app.post("/api/public/agents/:slug/analytics", requirePublicListingSchemaReady, async (req: Request, res: Response) => {
    try {
      const slug = req.params.slug?.trim() ?? "";
      const parsed = publicAgentAnalyticsBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body" });
      }
      const agent = await resolveAgentPageBySlug(slug);
      if (!agent) return res.status(404).json({ error: "Not found" });

      const eventMap = {
        listing_view: "listing_view",
        ask_about: "ask_about",
        schedule_showing: "schedule_showing",
        home_value: "home_value",
      } as const;
      await incrementAgentPageAnalytics(agent.userId, eventMap[parsed.data.event]);
      res.json({ ok: true });
    } catch (error) {
      console.error("[public-agent-page] analytics failed", error);
      res.status(500).json({ error: "Analytics failed" });
    }
  });

  app.post("/api/public/agents/:slug/leads", requirePublicListingSchemaReady, async (req: Request, res: Response) => {
    try {
      const slug = req.params.slug?.trim() ?? "";
      const parsed = publicAgentLeadBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      }
      const outcome = await processPublicAgentPageLead(slug, parsed.data);
      if (!outcome.ok) {
        return res.status(outcome.status).json({ error: outcome.error });
      }
      res.status(201).json({ ok: true, contactId: outcome.contactId });
    } catch (error) {
      console.error("[public-agent-page] lead failed", error);
      res.status(500).json({ error: "Lead submit failed" });
    }
  });
}

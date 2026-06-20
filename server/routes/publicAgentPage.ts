import type { Express, Request, Response } from "express";
import { publicAgentAnalyticsBodySchema, publicAgentBrowseQuerySchema, publicAgentLeadBodySchema } from "@shared/agent/agentPageSchema";
import {
  buildPublicAgentPageHtml,
  buildPublicAgentPageNotFoundHtml,
  renderAgentPageListingCards,
} from "@shared/agent/publicAgentPageHtml";
import { parseAgentPageEmbedQuery } from "@shared/agent/agentPageEmbed";
import { getRequestOrigin } from "../urlOrigins";
import { getPublicAgentPageData } from "../agentPage/agentPageService";
import { browseAgentPageListings, browseQueryToFilters } from "../agentPage/agentPageBrowseService";
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
      const { embedMode, initialListingType } = parseAgentPageEmbedQuery(
        (req.query ?? {}) as Record<string, unknown>,
      );
      const data = await getPublicAgentPageData(slug, appOrigin, {
        embedMode,
        initialListingType,
      });
      if (!data) {
        res.status(404).type("html").send(buildPublicAgentPageNotFoundHtml());
        return;
      }
      const { agent: _agent, pageUrl: _pageUrl, ...renderInput } = data;
      if (embedMode) {
        res.setHeader("Content-Security-Policy", "frame-ancestors *");
      }
      res.type("html").send(buildPublicAgentPageHtml(renderInput));
    } catch (error) {
      console.error("[public-agent-page] render failed", {
        slug,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).type("text/plain").send("Page unavailable");
    }
  });

  app.get("/api/public/agents/:slug/listings", requirePublicListingSchemaReady, async (req: Request, res: Response) => {
    try {
      const slug = req.params.slug?.trim() ?? "";
      const parsed = publicAgentBrowseQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      }
      const agent = await resolveAgentPageBySlug(slug);
      if (!agent) return res.status(404).json({ error: "Not found" });

      const appOrigin = getRequestOrigin(req);
      const filters = browseQueryToFilters(parsed.data);
      const result = await browseAgentPageListings({
        userId: agent.userId,
        appOrigin,
        filters,
        offset: parsed.data.offset,
        limit: parsed.data.limit,
        renderHtml: renderAgentPageListingCards,
      });
      res.json(result);
    } catch (error) {
      console.error("[public-agent-page] browse listings failed", error);
      res.status(500).json({ error: "Browse failed" });
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

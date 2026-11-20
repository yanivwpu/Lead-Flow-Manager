import type { Express, Request, Response } from "express";
import { publicAgentAnalyticsBodySchema, publicAgentBrowseQuerySchema, publicAgentLeadBodySchema } from "@shared/agent/agentPageSchema";
import {
  buildPublicAgentPageHtml,
  buildPublicAgentPageNotFoundHtml,
  renderAgentPageListingCards,
} from "@shared/agent/publicAgentPageHtml";
import { parseAgentPageEmbedQuery } from "@shared/agent/agentPageEmbed";
import { buildNeighborhoodUrl, neighborhoodTitle } from "@shared/agent/neighborhoodPages";
import { publishedNeighborhoods } from "../agentPage/neighborhoodPages";
import { getAppOrigin, getRequestOrigin } from "../urlOrigins";
import { getPublicAgentPageData } from "../agentPage/agentPageService";
import { browseAgentPageListings, browseQueryToFilters } from "../agentPage/agentPageBrowseService";
import { processPublicAgentPageLead } from "../agentPage/publicAgentPageLeadService";
import { incrementAgentPageAnalytics, resolveAgentPageBySlug } from "../agentPage/agentPageDb";
import { requirePublicListingSchemaReady } from "../middleware/requirePublicListingSchemaReady";

export function registerPublicAgentPageRoutes(app: Express): void {
  app.get(["/agents/:slug", "/agents/:slug/:neighborhood"], requirePublicListingSchemaReady, async (req: Request, res: Response) => {
    // Visibility can change when a slug, subscription or publication setting changes.
    res.setHeader("Cache-Control", "no-store");
    const slug = req.params.slug?.trim() ?? "";
    const neighborhoodSlug = req.params.neighborhood;
    const neighborhoodPath = neighborhoodSlug !== undefined;
    if (!slug || (neighborhoodPath && !/^[a-z0-9-]{1,80}$/.test(neighborhoodSlug))) {
      res.status(404).type("html").send(buildPublicAgentPageNotFoundHtml());
      return;
    }
    try {
      const appOrigin = getAppOrigin();
      const { embedMode, initialListingType, hideChat } = parseAgentPageEmbedQuery(
        (req.query ?? {}) as Record<string, unknown>,
      );
      if (neighborhoodPath && embedMode) {
        res.status(404).type("html").send(buildPublicAgentPageNotFoundHtml());
        return;
      }
      const data = await getPublicAgentPageData(slug, appOrigin, {
        profileOnly: neighborhoodPath,
        embedMode,
        hideChat,
        initialListingType,
      });
      if (!data) {
        res.status(404).type("html").send(buildPublicAgentPageNotFoundHtml());
        return;
      }
      const { agent, pageUrl, ...renderInput } = data;
      const pages = !embedMode ? await publishedNeighborhoods(agent.userId) : [];
      const neighborhood = neighborhoodPath ? pages.find((page) => page.slug === neighborhoodSlug) : undefined;
      if (neighborhoodPath && !neighborhood) {
        res.status(404).type("html").send(buildPublicAgentPageNotFoundHtml());
        return;
      }
      const canonicalUrl = neighborhood ? buildNeighborhoodUrl(renderInput.agentPageSlug, neighborhood.slug, appOrigin) : pageUrl;
      const allowSearchIndexing = !embedMode && `${getRequestOrigin(req)}${req.originalUrl}` === canonicalUrl;
      if (embedMode) {
        res.setHeader("Content-Security-Policy", "frame-ancestors *");
      }
      res.type("html").send(buildPublicAgentPageHtml({
        ...renderInput, canonicalUrl, allowSearchIndexing, agentPageUrl: pageUrl,
        neighborhood: neighborhood ? { ...neighborhood, parentUrl: pageUrl } : undefined,
        neighborhoodLinks: pages.map((page) => ({
          url: buildNeighborhoodUrl(renderInput.agentPageSlug, page.slug, appOrigin),
          title: neighborhoodTitle(page),
        })),
      }));
      if (req.method === "GET") {
        void incrementAgentPageAnalytics(agent.userId, "page_view").catch((error) => {
          console.warn("[public-agent-page] page view analytics failed", error);
        });
      }
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
      const embedMode = parsed.data.embed === true;
      const result = await browseAgentPageListings({
        userId: agent.userId,
        appOrigin,
        filters,
        offset: parsed.data.offset,
        limit: parsed.data.limit,
        renderHtml: (cards, startIndex) =>
          renderAgentPageListingCards(cards, startIndex, { embedMode }),
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

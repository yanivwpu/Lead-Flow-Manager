/**
 * Smoke-test public agent page render for a slug (requires DATABASE_URL).
 * Run: npx tsx scripts/smoke-agent-page-urls.ts [slug]
 */
import "dotenv/config";
import express from "express";
import { registerPublicAgentPageRoutes } from "../server/routes/publicAgentPage";
import { setPublicListingSchemaReady } from "../server/publicListingSchemaReady";
import { parseAgentPageEmbedQuery } from "../shared/agent/agentPageEmbed";
import { getPublicAgentPageData } from "../server/agentPage/agentPageService";
import { buildPublicAgentPageHtml } from "../shared/agent/publicAgentPageHtml";
import { getAppOrigin } from "../server/urlOrigins";

const slug = process.argv[2]?.trim() || "yaniv-haramatiy";

async function renderForQuery(query: Record<string, string>) {
  const appOrigin = getAppOrigin();
  const { embedMode, initialListingType, hideChat } = parseAgentPageEmbedQuery(query);
  const data = await getPublicAgentPageData(slug, appOrigin, { embedMode, hideChat, initialListingType });
  if (!data) return { status: 404, body: "NOT_FOUND" };
  const { agent: _a, pageUrl: _p, ...renderInput } = data;
  const html = buildPublicAgentPageHtml(renderInput);
  return {
    status: 200,
    embedMode,
    initialListingType,
    hasHeader: html.includes('<header class="agent-header"'),
    hasEmbedClass: html.includes('body class="embed-mode"') || html.includes('body class="embed-mode hide-chat"'),
    hideChat,
    hasHideChatCss: html.includes("body.embed-mode.hide-chat .chat-widget { display: none !important; }"),
    hasChatBubble: html.includes("chat-bubble"),
    hasChatEnabled: html.includes('class="chat-widget enabled"'),
    hasListings: html.includes("listings-grid"),
    length: html.length,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing — skipping live smoke test");
    process.exit(1);
  }

  setPublicListingSchemaReady(true);

  const cases = [
    { label: "normal", query: {} },
    { label: "embed", query: { embed: "1" } },
    { label: "embed rent", query: { embed: "1", listingType: "for_rent" } },
    { label: "embed hide chat", query: { embed: "1", listingType: "for_rent", hideChat: "1" } },
  ] as const;

  console.log(`Smoke agent page slug: ${slug}\n`);
  for (const c of cases) {
    try {
      const result = await renderForQuery(c.query);
      console.log(`[${c.label}]`, JSON.stringify(result, null, 2));
      if (result.status !== 200) {
        console.error(`FAIL: ${c.label} returned ${result.status}`);
        process.exit(1);
      }
      if (c.label === "normal" && !result.hasHeader) {
        console.error("FAIL: normal page missing header");
        process.exit(1);
      }
      if (c.label !== "normal" && !result.hasEmbedClass) {
        console.error(`FAIL: ${c.label} missing embed-mode body class`);
        process.exit(1);
      }
      if (c.label === "embed rent" && result.initialListingType !== "rent") {
        console.error("FAIL: embed rent initialListingType not rent");
        process.exit(1);
      }
      if (c.label === "embed" && !result.hasChatEnabled) {
        console.error("FAIL: embed should show chat widget");
        process.exit(1);
      }
      if (c.label === "embed hide chat") {
        if (!result.hideChat) {
          console.error("FAIL: embed hideChat query not parsed");
          process.exit(1);
        }
        if (!result.hasHideChatCss) {
          console.error("FAIL: embed hideChat missing hide-chat css");
          process.exit(1);
        }
      }
    } catch (error) {
      console.error(`FAIL: ${c.label}`, error);
      process.exit(1);
    }
  }

  // Express route wiring sanity (getRequestOrigin in handler)
  const app = express();
  registerPublicAgentPageRoutes(app);
  console.log("\nExpress routes registered OK");
  console.log("All smoke checks passed.");
}

main();

import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import express from "express";
import { chromium } from "playwright";
import { db } from "../drizzle/db";
import { channelService } from "../server/channelService";
import { setPublicListingSchemaReady } from "../server/publicListingSchemaReady";
import { registerAgentPageSettingsRoutes } from "../server/routes/agentPageSettings";
import { registerPublicAgentPageRoutes } from "../server/routes/publicAgentPage";
import { registerPublicListingSitemapRoutes } from "../server/routes/publicListingsSitemap";
import { storage } from "../server/storage";
import { subscriptionService, type UserLimits } from "../server/subscriptionService";

test("profile-only publication, indexing and withdrawal use the same entitlement", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(`
    CREATE TABLE users (id text PRIMARY KEY, avatar_url text);
    INSERT INTO users VALUES ('agent-user', NULL), ('legacy-live', NULL);
    CREATE TABLE ai_business_knowledge (
      user_id text PRIMARY KEY, publish_listings_publicly boolean DEFAULT false,
      agent_page_enabled boolean DEFAULT false, agent_page_slug text, agent_page_use_custom_bio boolean DEFAULT false,
      agent_page_bio text, agent_page_market_area text, agent_page_preferred_lead_capture text DEFAULT 'webchat',
      agent_page_show_home_value_cta boolean DEFAULT true, agent_page_analytics jsonb DEFAULT '{}',
      display_name text, business_name text, company_logo text, public_phone text, public_email text,
      public_website text, facebook_url text, instagram_url text, linkedin_url text, youtube_url text,
      about_text text, updated_at timestamp DEFAULT now()
    );
    CREATE TABLE inventory_listings (
      user_id text, provider_listing_id text, status text, publish_publicly boolean, listing_compliance jsonb
    );
    INSERT INTO ai_business_knowledge (user_id, agent_page_enabled, publish_listings_publicly, agent_page_slug, display_name, business_name, about_text)
      VALUES ('agent-user', true, false, 'jane-agent', 'Jane Agent', 'Summit Realty', 'Helping buyers and sellers.'),
             ('legacy-live', true, true, 'legacy-agent', 'Legacy Agent', NULL, NULL);
  `);
  const migration = await readFile("migrations/20261119_agent_page_profile_publication.sql", "utf8");
  await pg.exec(migration);

  const fixture = drizzle(pg);
  t.mock.method(db, "select", fixture.select.bind(fixture) as unknown as typeof db.select);
  t.mock.method(db, "update", fixture.update.bind(fixture) as unknown as typeof db.update);
  const user = { id: "agent-user", name: "Jane Agent", widgetSettings: { enabled: false } };
  t.mock.method(storage, "getUser", async () => user);
  t.mock.method(storage, "getTemplateEntitlement", async () => ({ status: "purchased" }));
  t.mock.method(storage, "getTemplateInstall", async () => undefined);
  t.mock.method(storage, "getIntegrationByUserAndType", async () => undefined);
  t.mock.method(storage, "getUserTemplateDataByKey", async () => undefined);
  const updateContact = t.mock.method(storage, "updateContact", async () => undefined);
  const incoming = t.mock.method(channelService, "processIncomingMessage", async (_input: Parameters<typeof channelService.processIncomingMessage>[0]) => ({
    contact: { id: "buyer-contact", customFields: {} },
  }));
  let eligible = true;
  t.mock.method(subscriptionService, "getUserLimits", async (userId: string, options?: { readOnly?: boolean }) => {
    assert.equal(options?.readOnly, true);
    return { plan: eligible || userId === "legacy-live" ? "pro" : "free", workflowsEnabled: true } as UserLimits;
  });

  const app = express();
  app.use(express.json());
  app.use("/api/agent-page", (req, _res, next) => {
    req.user = user as Express.User;
    next();
  });
  registerAgentPageSettingsRoutes(app);
  registerPublicAgentPageRoutes(app);
  registerPublicListingSitemapRoutes(app);
  setPublicListingSchemaReady(true);
  t.after(() => setPublicListingSchemaReady(false));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const listening = server.address();
  assert(listening && typeof listening === "object");
  const origin = `http://127.0.0.1:${listening.port}`;
  const oldAppUrl = process.env.APP_URL;
  process.env.APP_URL = origin;
  t.after(() => {
    if (oldAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = oldAppUrl;
  });

  const request = (path: string, init?: RequestInit) => fetch(origin + path, init);
  const update = (body: object) => request("/api/agent-page", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const sitemap = async () => (await request("/public-agents-sitemap-1.xml")).text();
  assert.equal((await request("/agents/jane-agent")).status, 404, "old profile-only drafts stay private");
  assert.match(await sitemap(), /\/agents\/legacy-agent/);
  assert.doesNotMatch(await sitemap(), /\/agents\/jane-agent/);

  const publish = await update({ agentPageEnabled: true });
  assert.equal(publish.status, 200, await publish.clone().text());
  const settings = await publish.json();
  assert.equal(settings.publicPageUrl, origin + "/agents/jane-agent");
  assert.equal(settings.publishListingsPublicly, false);
  await pg.exec(migration);

  const canonical = await request("/agents/jane-agent");
  assert.equal(canonical.status, 200);
  assert.equal(canonical.headers.get("Cache-Control"), "no-store");
  const html = await canonical.text();
  assert.match(html, /content="index, follow"/);
  assert.match(html, /<h1[^>]*>Jane Agent<\/h1>/);
  assert.match(html, /id="lead-form"/);
  assert.ok(html.includes(`<link rel="canonical" href="${origin}/agents/jane-agent"`));
  assert.match(await (await request("/robots.txt")).text(), /Allow: \/agents\//);
  assert.match(await (await request("/public-listings-sitemap.xml")).text(), /public-agents-sitemap-1\.xml/);
  assert.match(await sitemap(), /\/agents\/jane-agent/);

  for (const path of ["/agents/jane-agent?location=Miami", "/agents/JANE-AGENT", "/agents/jane-agent/"]) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /content="noindex, follow"/);
  }
  const embed = await (await request("/agents/jane-agent?embed=1&listingType=for_rent")).text();
  assert.match(embed, /content="noindex, nofollow"/);

  if (process.env.AGENT_PAGE_BROWSER_TEST === "1") {
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(origin + "/agents/jane-agent");
      await page.getByRole("heading", { name: "Jane Agent" }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await page.getByRole("button", { name: "Send a message" }).click();
      await page.locator("#lead-form").waitFor();
      await page.close();
    }
  }

  const lead = await request("/api/public/agents/jane-agent/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "message", name: "Buyer", email: "buyer@example.test" }),
  });
  assert.equal(lead.status, 201, await lead.clone().text());
  assert.equal(incoming.mock.calls[0].arguments[0].webchatLeadSource, "agent_page");
  assert.equal(updateContact.mock.calls.length, 1);

  assert.equal((await update({ agentPageSlug: "jane-new" })).status, 200);
  assert.equal((await request("/agents/jane-agent")).status, 404);
  assert.equal((await request("/agents/jane-new")).status, 200);
  assert.doesNotMatch(await sitemap(), /\/agents\/jane-agent/);
  assert.match(await sitemap(), /\/agents\/jane-new/);

  eligible = false;
  assert.equal((await request("/agents/jane-new")).status, 404);
  assert.equal((await request("/api/public/agents/jane-new/listings")).status, 404);
  assert.doesNotMatch(await sitemap(), /\/agents\/jane-new/);
  assert.equal((await update({ agentPageEnabled: true })).status, 403);
  assert.equal((await update({ agentPageEnabled: false })).status, 200);
  eligible = true;
  const disabled = await request("/agents/jane-new");
  assert.equal(disabled.status, 404);
  assert.match(await disabled.text(), /content="noindex, nofollow"/);
  assert.doesNotMatch(await sitemap(), /\/agents\/jane-new/);
});

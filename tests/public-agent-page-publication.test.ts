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
import { registerAgentNeighborhoodPagesRoutes } from "../server/routes/agentNeighborhoodPages";
import { verifiedNeighborhoodChatContext } from "../server/agentPage/neighborhoodPages";
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

  await pg.exec(await readFile("migrations/20261120_agent_neighborhood_pages.sql", "utf8"));
  await pg.exec(await readFile("migrations/20261120_agent_neighborhood_pages.sql", "utf8"));
  const fixture = drizzle(pg);
  t.mock.method(db, "delete", fixture.delete.bind(fixture) as unknown as typeof db.delete);
  t.mock.method(db, "insert", fixture.insert.bind(fixture) as unknown as typeof db.insert);
  t.mock.method(db, "select", fixture.select.bind(fixture) as unknown as typeof db.select);
  t.mock.method(db, "update", fixture.update.bind(fixture) as unknown as typeof db.update);
  const user = { id: "agent-user", name: "Jane Agent", widgetSettings: { enabled: false } };
  t.mock.method(storage, "getUser", async () => user);
  t.mock.method(storage, "getTemplateEntitlement", async () => ({ status: "purchased" }));
  t.mock.method(storage, "getTemplateInstall", async () => undefined);
  t.mock.method(storage, "getIntegrationByUserAndType", async () => undefined);
  t.mock.method(storage, "getUserTemplateDataByKey", async () => undefined);
  const updateContact = t.mock.method(storage, "updateContact", async (
    _id: string, _patch: Parameters<typeof storage.updateContact>[1],
  ) => undefined);
  const sellerIntake = t.mock.method(storage, "updateContactSellerPreferenceProfile", async () => undefined);
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
  let authenticatedUser = user.id;
  app.use("/api/agent-page", (req, _res, next) => {
    if (authenticatedUser) req.user = { ...user, id: authenticatedUser } as Express.User;
    next();
  });
  registerAgentPageSettingsRoutes(app);
  registerAgentNeighborhoodPagesRoutes(app);
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
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
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
  const endpoint = "/api/agent-page/neighborhoods";
  const parent = "/agents/yaniv-haramatiy";
  const pilot = parent + "/victoria-park";
  const draft = {
    name: "Victoria Park", city: "Fort Lauderdale", state: "Florida",
    content: "Victoria Park is in northeast Fort Lauderdale. Before touring a home, write down your parking, outdoor space, and maintenance requirements. Compare those requirements on the visit.\n\nAsk the agent about property-specific documents, disclosures and any planned work. If selling, prepare a list of your recent improvements and when they were done.",
  };
  const savePage = (method: "POST" | "PUT", values: object, path = endpoint) => request(path, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
  });
  const created = await savePage("POST", { ...draft, published: true });
  assert.equal(created.status, 201, await created.clone().text());
  const row = await created.json();
  assert.equal(row.published, false);
  const editUrl = endpoint + "/" + row.id;
  const previewUrl = editUrl + "/preview";
  const draftPreview = await request(previewUrl);
  assert.equal(draftPreview.status, 200, "owner can preview before parent is enabled");
  assert.equal(draftPreview.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.doesNotMatch(await draftPreview.text(), /id="agent-site-nav"/);
  const publishNeighborhood = (published: boolean, updateFields = {}) => savePage("PUT", { ...draft, ...updateFields, published }, editUrl);
  const neighborhoodSitemap = async () => (await request("/public-neighborhoods-sitemap-1.xml")).text();
  assert.equal((await publishNeighborhood(true)).status, 403, "a live parent is required to publish");
  assert.equal((await update({ agentPageEnabled: true, agentPageSlug: "yaniv-haramatiy" })).status, 200);
  assert.equal((await request(pilot)).status, 404);
  assert.doesNotMatch(await neighborhoodSitemap(), /victoria-park/);
  const parentWithDraft = await (await request(parent)).text();
  assert.doesNotMatch(parentWithDraft, /victoria-park|<summary>Neighborhoods<\/summary>/);
  assert.match(parentWithDraft, /aria-current="page">Home/);
  assert.equal((await publishNeighborhood(true, { content: "Coming soon" })).status, 400);
  assert.equal((await savePage("POST", { ...draft, name: "Victoria-Park" })).status, 409);
  authenticatedUser = "";
  assert.equal((await request(previewUrl)).status, 401);
  authenticatedUser = "legacy-live";
  assert.equal((await request(previewUrl)).status, 404);
  assert.equal((await publishNeighborhood(true)).status, 404);
  assert.equal((await request(editUrl, { method: "DELETE" })).status, 404);
  assert.deepEqual((await (await request(endpoint)).json()).pages, []);
  const secondAgentDraft = { ...draft, city: "Other City", state: "Georgia" };
  const secondAgent = await savePage("POST", secondAgentDraft);
  assert.equal(secondAgent.status, 201);
  const secondRow = await secondAgent.json();
  assert.equal((await savePage("PUT", { ...secondAgentDraft, published: true }, endpoint + "/" + secondRow.id)).status, 200);
  authenticatedUser = user.id;

  const another = await savePage("POST", { ...draft, name: "Las Olas", content: draft.content.replace("Victoria Park", "Las Olas") });
  assert.equal(another.status, 201);
  const anotherRow = await another.json();
  assert.equal((await savePage("PUT", { ...draft, name: "Las Olas", published: true }, endpoint + "/" + anotherRow.id)).status, 200);
  const firstPublish = await publishNeighborhood(true, { expectedUpdatedAt: row.updatedAt });
  assert.equal(firstPublish.status, 200);
  const publishedRow = await firstPublish.json();
  assert.notEqual(publishedRow.updatedAt, row.updatedAt);
  assert.equal((await publishNeighborhood(false, { expectedUpdatedAt: row.updatedAt })).status, 409);
  assert.equal((await request(editUrl + "?expectedUpdatedAt=" + encodeURIComponent(row.updatedAt), { method: "DELETE" })).status, 409);
  assert.equal((await (await request(endpoint)).json()).pages.length, 2);
  assert.match(await neighborhoodSitemap(), /legacy-agent\/victoria-park/);
  assert.match(await neighborhoodSitemap(), /yaniv-haramatiy\/las-olas/);
  assert.match(await (await request("/agents/legacy-agent/victoria-park")).text(), /Victoria Park, Other City, Georgia/);
  assert.match(await (await request("/public-listings-sitemap.xml")).text(), /public-neighborhoods-sitemap-1\.xml/);
  const pilotResponse = await request(pilot);
  assert.equal(pilotResponse.status, 200);
  const pilotHtml = await pilotResponse.text();
  assert.ok(pilotHtml.includes(`<link rel="canonical" href="${origin}${pilot}"`));
  assert.match(pilotHtml, /content="index, follow"/);
  assert.match(pilotHtml, /<title>Victoria Park, Fort Lauderdale, Florida \| Jane Agent<\/title>/);
  assert.match(pilotHtml, /content="Victoria Park is in northeast Fort Lauderdale/);
  assert.match(pilotHtml, /Back to the Agent Page/);
  assert.match(pilotHtml, /href="[^"]+\/agents\/yaniv-haramatiy\/las-olas"/);
  assert.doesNotMatch(pilotHtml, /legacy-agent|Other City/);
  assert.doesNotMatch(await (await request(parent + "?embed=1")).text(), /id="agent-site-nav"|<summary>Neighborhoods<\/summary>/);
  assert.doesNotMatch(pilotHtml, /id="listings-grid"/, "no unverified MLS inventory or browse UI");
  assert.match(await (await request(parent)).text(), /href="[^"]+\/agents\/yaniv-haramatiy\/victoria-park"/);
  assert.match(await neighborhoodSitemap(), /\/agents\/yaniv-haramatiy\/victoria-park<\/loc>/);
  assert.match(await (await request(pilot + "?utm_source=test")).text(), /content="noindex, follow"/);
  assert.equal((await request(pilot + "?embed=1")).status, 404);

  if (process.env.AGENT_PAGE_BROWSER_TEST === "1") {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
    t.after(() => browser.close());
    for (const width of [320, 390, 1280, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(origin + parent);
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      const drawer = page.getByRole("dialog", { name: "Navigation" });
      const nav = page.getByRole("navigation", { name: "Agent navigation" });
      const disclosure = nav.getByText("Neighborhoods", { exact: true });
      const mobile = width < 640;

      if (mobile) {
        await menu.focus();
        await page.keyboard.press("Enter");
        await drawer.waitFor();
        assert.equal(await menu.getAttribute("aria-expanded"), "true");
        assert.equal(await page.locator(":focus").innerText(), "Close menu");
        await page.keyboard.press("Tab");
        assert.equal(await page.locator(":focus").innerText(), "Home");
        await page.keyboard.press("Escape");
        await drawer.waitFor({ state: "hidden" });
        await page.waitForFunction(() => document.activeElement?.id === "agent-menu-toggle");
        assert.equal(await menu.getAttribute("aria-expanded"), "false");

        await menu.click();
        await drawer.waitFor();
        await page.mouse.click(width - 4, 24);
        await drawer.waitFor({ state: "hidden" });

        await menu.click();
        await drawer.waitFor();
      } else {
        assert.equal(await menu.isVisible(), false);
        assert.equal(await nav.isVisible(), true);
      }

      assert.equal(await nav.getByRole("link", { name: "Home" }).getAttribute("aria-current"), "page");
      await disclosure.focus();
      await page.keyboard.press("Enter");
      await nav.getByRole("link", { name: /Las Olas/ }).waitFor();
      if (!mobile) {
        await page.keyboard.press("Tab");
        assert.match(await page.locator(":focus").innerText(), /Las Olas/);
        await page.keyboard.press("Escape");
        assert.equal(await disclosure.locator("..").getAttribute("open"), null);
        assert.equal(await page.locator(":focus").innerText(), "Neighborhoods");
        await page.keyboard.press("Enter");
      }

      await nav.getByRole("link", { name: /Victoria Park/ }).click();
      await page.waitForURL(origin + pilot);
      await page.getByRole("heading", { name: "Victoria Park, Fort Lauderdale, Florida" }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      if (mobile) {
        assert.equal(await drawer.isVisible(), false);
        await menu.click();
        await drawer.waitFor();
      } else {
        await disclosure.click();
      }

      assert.equal(await nav.getByRole("link", { name: /Victoria Park/ }).getAttribute("aria-current"), "page");
      assert.equal(await nav.getByRole("link", { name: "Home" }).getAttribute("aria-current"), null);
      await nav.getByRole("link", { name: /Las Olas/ }).click();
      await page.waitForURL(origin + parent + "/las-olas");
      if (mobile) {
        await menu.click();
        await drawer.waitFor();
      }
      await nav.getByRole("link", { name: "Properties" }).click();
      await page.waitForURL(origin + parent + "#agent-properties");
      await page.locator("#agent-properties").waitFor();
      if (mobile) {
        await menu.click();
        await drawer.waitFor();
      }
      await nav.getByRole("link", { name: "Contact", exact: true }).click();
      await page.getByRole("dialog").getByRole("textbox", { name: "Name", exact: true }).waitFor();
      assert.equal(await page.locator(":focus").getAttribute("name"), "name");
      await page.getByRole("button", { name: "Cancel" }).click();

      if (mobile) {
        await menu.click();
        await drawer.waitFor();
        await nav.getByRole("link", { name: "Properties" }).click();
        await drawer.waitFor({ state: "hidden" });
      }
      await page.close();
    }
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(origin + pilot);
      await page.getByRole("heading", { name: "Victoria Park, Fort Lauderdale, Florida" }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      for (const label of ["Contact agent", "Schedule Showing", "What's My Home Worth?"]) {
        await page.getByRole("button", { name: label }).click();
        await page.locator("#lead-form").waitFor();
        await page.getByRole("button", { name: "Cancel" }).click();
      }
      await page.close();
    }
  }

  const inquiry = (intent: string) => request("/api/public/agents/yaniv-haramatiy/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent, name: "Visitor", email: "visitor@example.test", neighborhood: "victoria-park" }),
  });
  for (const intent of ["message", "schedule_showing", "home_worth"]) {
    const result = await inquiry(intent);
    assert.equal(result.status, 201, await result.clone().text());
    assert.equal(incoming.mock.calls.at(-1)?.arguments[0].webchatPageContext?.latestUrl, origin + pilot);
    assert.equal((updateContact.mock.calls.at(-1)?.arguments[1].customFields as Record<string, unknown>).leadSource, "Agent Page · Victoria Park");
  }
  assert.equal(sellerIntake.mock.calls.length, 1);
  assert.equal((await verifiedNeighborhoodChatContext(user.id, origin + pilot + "?utm_source=test"))?.agentNeighborhood, "victoria-park");
  assert.equal(await verifiedNeighborhoodChatContext("legacy-live", origin + pilot), undefined);
  assert.equal(await verifiedNeighborhoodChatContext(user.id, "https://other.example" + pilot), undefined);

  assert.equal((await publishNeighborhood(true, { name: "Victoria Park North" })).status, 200);
  assert.equal((await request(pilot)).status, 404);
  const renamed = parent + "/victoria-park-north";
  assert.equal((await request(renamed)).status, 200);
  assert.doesNotMatch(await neighborhoodSitemap(), /yaniv-haramatiy\/victoria-park<\/loc>/);
  assert.equal((await publishNeighborhood(true)).status, 200);
  assert.equal((await update({ agentPageSlug: "jane-realtor" })).status, 200);
  assert.equal((await request(pilot)).status, 404);
  const changedParent = "/agents/jane-realtor/victoria-park";
  assert.equal((await request(changedParent)).status, 200);
  assert.match(await neighborhoodSitemap(), /jane-realtor\/victoria-park/);

  eligible = false;
  assert.equal((await request(changedParent)).status, 404);
  assert.equal((await request(endpoint)).status, 403);
  assert.doesNotMatch(await neighborhoodSitemap(), /jane-realtor/);
  eligible = true;
  assert.equal((await update({ agentPageEnabled: false })).status, 200);
  assert.equal((await request(changedParent)).status, 404);
  assert.equal((await update({ agentPageEnabled: true })).status, 200);
  assert.equal((await publishNeighborhood(false)).status, 200);
  assert.equal((await request(changedParent)).status, 404);
  assert.equal(await verifiedNeighborhoodChatContext(user.id, origin + changedParent), undefined);
  assert.doesNotMatch(await neighborhoodSitemap(), /jane-realtor\/victoria-park/);
  assert.equal((await request(editUrl, { method: "DELETE" })).status, 204);
  assert.equal((await request(previewUrl)).status, 404);
  assert.equal((await (await request(endpoint)).json()).pages.length, 1);
});

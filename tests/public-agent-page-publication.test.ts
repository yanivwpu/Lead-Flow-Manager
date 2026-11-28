import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { SQL, eq } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import express from "express";
import { db } from "../drizzle/db";
import { channelService } from "../server/channelService";
import { setPublicListingSchemaReady } from "../server/publicListingSchemaReady";
import { registerAgentNeighborhoodPagesRoutes } from "../server/routes/agentNeighborhoodPages";
import { verifiedNeighborhoodChatContext } from "../server/agentPage/neighborhoodPages";
import { registerAgentPageSettingsRoutes } from "../server/routes/agentPageSettings";
import { registerPublicAgentPageRoutes } from "../server/routes/publicAgentPage";
import { registerPublicListingSitemapRoutes } from "../server/routes/publicListingsSitemap";
import { registerPublicListingRoutes } from "../server/routes/publicListings";
import { getBusinessProfileForUser } from "../server/businessProfileService";
import { storage } from "../server/storage";
import { subscriptionService, type UserLimits } from "../server/subscriptionService";
import { AGENT_PAGE_FORM_ACCOUNT, agentPageLeadCopilotContext } from "../shared/agent/agentPageSchema";
import { contacts, conversations, inventoryListings, messages, prospectIntelligence, prospectOutreachQueueItems, teamMembers, workflows, workflowExecutions } from "../shared/schema";
import { buildFollowUpItems, hasScheduledFollowUp } from "../shared/followUpTasks";
import { agentInquiryLabel, agentInquiryRecommendation, isAgentInquiryThread, validatedAgentInquiryPhone } from "../shared/agent/agentPageInquiry";
import { INBOUND_DEDUP_SCHEMA_SQL } from "../server/inboundDedupSchema";
import { isInventoryContactEligible } from "../server/inventory/inventoryContactEligibility";
import { inboxOnlyWebchatSourceDetails, promotedWebchatSourceDetails } from "../shared/webchatIdentityPromotion";
import { filterCrmListedContacts } from "../shared/contactCrmVisibility";
import { executeWorkflowActions } from "../server/workflowEngine";

test("inquiry phone formats normalize without dropping invalid input", () => {
  for (const form of ["(555) 123-4567", "555-123-4567", "+1 555 123 4567", "+1 (555) 123-4567"]) {
    assert.equal(validatedAgentInquiryPhone(form), "5551234567");
  }
  for (const form of ["+44 (20) 7946 0958", "0044 20 7946 0958"]) {
    assert.equal(validatedAgentInquiryPhone(form), "442079460958");
  }
  assert.equal(validatedAgentInquiryPhone("+972 54 123 4567"), "972541234567");
  for (const form of ["(555 123-4567", "555) 123-4567", "555-123-4567 ext 4", "1.......", "+0 555 1234567", "1".repeat(16)]) {
    assert.equal(validatedAgentInquiryPhone(form), undefined, form);
  }
});

test("profile publication, privacy, and inquiry identity retain their existing boundaries", async (t) => {
  const publicEmail = "jane-public@example.test";
  const publicPhone = "+1 (954) 555-0100";
  const listingId = "49431be3-1bb2-4758-89fd-22afccacd531";
  const flyerPath = `/share/listings/${listingId}`;
  const inquiryPath = `/api/public/listings/${listingId}/leads`;
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(`
    CREATE TABLE users (id varchar PRIMARY KEY, avatar_url text, email text, twilio_whatsapp_number text,
      meta_display_phone_number text, deletion_requested_at timestamp, inbox_new_activity_count integer DEFAULT 0);
    INSERT INTO users (id) VALUES ('agent-user'), ('legacy-live');
    CREATE TABLE ai_business_knowledge (
      user_id text PRIMARY KEY, publish_listings_publicly boolean DEFAULT false,
      agent_page_enabled boolean DEFAULT false, agent_page_slug text, agent_page_use_custom_bio boolean DEFAULT false,
      agent_page_bio text, agent_page_market_area text, agent_page_preferred_lead_capture text DEFAULT 'webchat',
      agent_page_show_home_value_cta boolean DEFAULT true, agent_page_analytics jsonb DEFAULT '{}',
      display_name text, business_name text, company_logo text, public_phone text, public_email text,
      public_website text, facebook_url text, instagram_url text, linkedin_url text, youtube_url text,
      about_text text, updated_at timestamp DEFAULT now()
    );
    INSERT INTO ai_business_knowledge (user_id, agent_page_enabled, publish_listings_publicly, agent_page_slug, display_name, business_name, about_text)
      VALUES ('agent-user', true, false, 'jane-agent', 'Jane Agent', 'Summit Realty', 'Helping buyers and sellers.'),
             ('legacy-live', true, true, 'legacy-agent', 'Legacy Agent', NULL, NULL);
  `);
  await pg.query(`UPDATE ai_business_knowledge SET public_email = $1, public_phone = $2,
    agent_page_preferred_lead_capture = 'email' WHERE user_id = 'agent-user'`, [publicEmail, publicPhone]);
  const migration = await readFile("migrations/20261119_agent_page_profile_publication.sql", "utf8");
  await pg.exec(migration);

  await pg.exec(await readFile("migrations/20261120_agent_neighborhood_pages.sql", "utf8"));
  await pg.exec(await readFile("migrations/20261120_agent_neighborhood_pages.sql", "utf8"));
  await pg.exec(await readFile("migrations/20261122_neighborhood_guide_photos.sql", "utf8"));
  await pg.exec(await readFile("migrations/20261122_neighborhood_guide_photos.sql", "utf8"));
  await pg.exec(await readFile("migrations/20261124_agent_neighborhood_country.sql", "utf8"));
  await pg.exec(await readFile("migrations/20261124_agent_neighborhood_country.sql", "utf8"));
  await pg.exec(await readFile("migrations/20261124_agent_neighborhood_custom_boundary.sql", "utf8"));
  await pg.exec(await readFile("migrations/20261124_agent_neighborhood_custom_boundary.sql", "utf8"));
  const publicLanguageMigration = await readFile("migrations/20261128_public_real_estate_languages.sql", "utf8");
  await pg.exec(publicLanguageMigration);
  await pg.exec(publicLanguageMigration);
  const dialect = new PgDialect();
  for (const table of [contacts, conversations, inventoryListings, messages, prospectIntelligence, prospectOutreachQueueItems, teamMembers, workflows, workflowExecutions]) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map((column) => {
      const value = column.default;
      const defaultSql = value instanceof SQL ? dialect.sqlToQuery(value).sql
        : typeof value === "string" ? `'${value.replaceAll("'", "''")}'` : value;
      return `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${column.notNull ? " NOT NULL" : ""}${defaultSql === undefined ? "" : ` DEFAULT ${defaultSql}`}`;
    });
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(", ")})`);
  }
  await pg.exec(INBOUND_DEDUP_SCHEMA_SQL);
  const fixture = drizzle(pg);
  t.mock.method(db, "delete", fixture.delete.bind(fixture) as unknown as typeof db.delete);
  t.mock.method(db, "insert", fixture.insert.bind(fixture) as unknown as typeof db.insert);
  t.mock.method(db, "select", fixture.select.bind(fixture) as unknown as typeof db.select);
  t.mock.method(db, "update", fixture.update.bind(fixture) as unknown as typeof db.update);
  t.mock.method(db, "execute", fixture.execute.bind(fixture) as unknown as typeof db.execute);
  t.mock.method(db, "transaction", fixture.transaction.bind(fixture) as unknown as typeof db.transaction);
  const user = { id: "agent-user", name: "Jane Agent", widgetSettings: { enabled: false } };
  t.mock.method(storage, "getUser", async () => user);
  t.mock.method(storage, "getTemplateEntitlement", async () => ({ status: "purchased" }));
  t.mock.method(storage, "getTemplateInstall", async () => undefined);
  t.mock.method(storage, "getAiBusinessKnowledge", async (userId: string) => userId === user.id ? {
    displayName: "Jane Agent", businessName: "Summit Realty", publicEmail, publicPhone,
    companyLogo: "https://cdn.example.test/brokerage.png",
  } : undefined);
  t.mock.method(storage, "getIntegrationByUserAndType", async () => undefined);
  t.mock.method(storage, "getUserTemplateDataByKey", async () => undefined);
  t.mock.method(storage, "getChannelSettings", async () => []);
  t.mock.method(storage, "getAppointmentsByContact", async () => []);
  const sellerIntake = t.mock.method(storage, "updateContactSellerPreferenceProfile", async (
    ..._args: Parameters<typeof storage.updateContactSellerPreferenceProfile>
  ) => undefined);
  t.mock.method(channelService, "logActivity", async () => undefined);
  const outbound = t.mock.method(channelService, "sendMessage", async () => { throw new Error("Unexpected outbound send"); });
  t.mock.method(subscriptionService, "incrementConversationUsage", async () => undefined);
  await fixture.insert(workflows).values({
    id: "w1", userId: user.id, name: "New Lead Auto-Reply + Create Lead", triggerType: "new_chat",
    triggerConditions: { templateId: "realtor-growth-engine", templateKey: "W1" },
    actions: [{ type: "send_message_template", templateKey: "intro_fast_reply" }, { type: "create_task", title: "Review new lead", dueDays: 1 }],
  });
  await fixture.insert(inventoryListings).values({
    id: listingId, userId: user.id, sourceId: "source", provider: "bridge_interactive", providerListingId: "RGE001",
    status: "active", addressLine1: "42 Private Street", city: "Fort Lauderdale", state: "FL", zip: "33301",
    publicSlug: "42-private-street-49431be3", squareFeet: 1000, yearBuilt: 1990,
    listingCompliance: { internetEntireListingDisplay: true, internetAddressDisplay: false,
      listOfficeName: "Summit Realty", mlsSourceName: "Example MLS", mlsListingId: "RGE001" },
  });
  let eligible = true;
  let expectReadOnly = true;
  t.mock.method(subscriptionService, "getUserLimits", async (userId: string, options?: { readOnly?: boolean }) => {
    if (expectReadOnly) assert.equal(options?.readOnly, true);
    return { plan: eligible || userId === "legacy-live" ? "pro" : "free", workflowsEnabled: true } as UserLimits;
  });

  const app = express();
  app.use(express.json());
  let authenticatedUser = user.id;
  app.use("/api/agent-page", (req, _res, next) => {
    if (authenticatedUser) req.user = { ...user, id: authenticatedUser } as Express.User;
    next();
  });
  app.use("/api/contacts", (req, _res, next) => {
    req.user = { ...user, emailVerifiedAt: new Date() } as Express.User;
    next();
  });
  // The contacts module initializes an AI client for unrelated routes. This fixture never calls it.
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture-unused";
  try {
    const { registerContactRoutes } = await import("../server/routes/contacts");
    registerContactRoutes(app);
  } finally {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  }
  registerAgentPageSettingsRoutes(app);
  registerAgentNeighborhoodPagesRoutes(app);
  registerPublicAgentPageRoutes(app);
  registerPublicListingRoutes(app);
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
  assert.match(html, /class="agent-heading"[^>]*>\s*<h1[^>]*>Jane Agent<\/h1><a[^>]*href="tel:\+19545550100"/);
  assert.doesNotMatch(html, /jane-public|mailto:|publicEmail/);
  assert.equal((await getBusinessProfileForUser(user.id)).publicEmail, publicEmail);
  assert.match(html, /id="lead-form"/);
  assert.ok(html.includes(`<link rel="canonical" href="${origin}/agents/jane-agent"`));
  assert.match(await (await request("/robots.txt")).text(), /Allow: \/agents\//);
  assert.match(await (await request("/public-listings-sitemap.xml")).text(), /public-agents-sitemap-1\.xml/);
  assert.match(await sitemap(), /\/agents\/jane-agent/);
  assert.match(html, /<html lang="en" dir="ltr">/);
  assert.equal((await update({ agentPageLanguage: "he" })).status, 200);
  const hebrew = await (await request("/agents/jane-agent", { headers: { "Accept-Language": "es" } })).text();
  assert.match(hebrew, /<html lang="he" dir="rtl">/);
  assert.ok(hebrew.includes(`<link rel="canonical" href="${origin}/agents/jane-agent"`));
  assert.doesNotMatch(hebrew, /jane-public|mailto:|publicEmail/);
  assert.equal((await update({ agentPageLanguage: "fr" })).status, 400);
  assert.equal((await update({ agentPageLanguage: "en" })).status, 200);


  for (const path of ["/agents/jane-agent?location=Miami", "/agents/JANE-AGENT", "/agents/jane-agent/"]) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /content="noindex, follow"/);
  }
  const embed = await (await request("/agents/jane-agent?embed=1&listingType=for_rent")).text();
  assert.match(embed, /content="noindex, nofollow"/);

  if (process.env.AGENT_PAGE_BROWSER_TEST === "1") {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
    t.after(() => browser.close());
    for (const width of [390, 1280, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route("https://cdn.example.test/**", (route) => route.abort());
      await page.goto(origin + "/agents/jane-agent");
      await page.getByRole("heading", { name: "Jane Agent" }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      assert.equal(await page.locator(".agent-heading").getByRole("link", { name: publicPhone }).getAttribute("href"), "tel:+19545550100");
      await page.getByRole("button", { name: "Contact Agent" }).click();
      await page.locator("#lead-form").waitFor();
      if (width === 390) {
        await page.locator("#lead-form").getByLabel("Name").fill("Jane Buyer");
        await page.locator("#lead-form").getByLabel("Email").fill("buyer@example.test");
        await page.getByRole("button", { name: "Submit" }).click();
        await page.getByRole("status").filter({ hasText: "Thanks" }).waitFor();
      }
      await page.goto(origin + flyerPath);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      const card = page.locator(".agent-card");
      assert.equal(await card.getByRole("link", { name: publicPhone }).getAttribute("href"), "tel:+19545550100");
      await card.getByRole("button", { name: "Contact Agent" }).click();
      const dialog = page.getByRole("dialog", { name: "Contact Agent" });
      await dialog.waitFor();
      if (width === 390 || width === 1280) {
        const first = width === 390;
        // browser.newPage creates an independent browser context for each viewport.
        await dialog.getByLabel("Name").fill(first ? "Listing Visitor" : "Independent Visitor");
        await dialog.getByLabel("Email").fill(first ? "flyer@example.test" : "independent-flyer@example.test");
        await dialog.getByLabel("Message").fill("Could you tell me more?");
        if (first) {
          await dialog.getByLabel("Phone").fill("555-12");
          await dialog.getByRole("button", { name: "Send inquiry" }).click();
          await dialog.getByRole("status").filter({ hasText: "Enter a valid phone number" }).waitFor();
          assert.equal(await dialog.getByLabel("Phone").evaluate((input) => input === document.activeElement), true);
        }
        await dialog.getByLabel("Phone").fill(first ? "(555) 123-4567" : "+44 (20) 7946 0958");
        await dialog.getByRole("button", { name: "Send inquiry" }).click();
        await dialog.getByRole("status").filter({ hasText: "Your inquiry was sent" }).waitFor();
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await page.goto(origin + "/agents/legacy-agent");
      assert.equal(await page.locator(".agent-heading a[href^='tel:']").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.close();
    }
  }

  const submit = (slug: string, body: Record<string, unknown>) => request(`/api/public/agents/${slug}/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "message", name: "Jane Buyer", ...body }),
  });
  const lead = await submit("jane-agent", { email: "Buyer@Example.test", message: "Checking lead capture" });
  assert.equal(lead.status, 201, await lead.clone().text());
  assert.deepEqual(await lead.json(), { ok: true }, "no CRM identity ID is returned publicly");
  const [emailLead] = await storage.getContacts(user.id);
  assert.equal(emailLead.name, "Jane Buyer");
  assert.equal(emailLead.email, "buyer@example.test");
  assert.equal(emailLead.pipelineStage, "New Lead");
  assert.equal(emailLead.followUp, null);
  assert.equal(emailLead.phone, null);
  assert.equal(emailLead.followUpDate, null);
  assert.equal(agentInquiryRecommendation(emailLead), "Review new lead");
  assert.equal(agentInquiryLabel(emailLead), "Agent Page Inquiry");
  assert.equal(await isInventoryContactEligible(emailLead), false, "a form does not qualify a buyer");
  const [defaultW1] = await fixture.select().from(workflows).where(eq(workflows.id, "w1"));
  await fixture.update(workflows).set({ actions: [{ type: "create_task", title: "Review new lead", dueDays: 1,
    autoScheduleAgentPageInquiries: true }] }).where(eq(workflows.id, "w1"));
  assert.equal((await submit("jane-agent", { name: "Phone Lead", phone: "+1 (954) 555-0158" })).status, 201);
  const [phoneLead] = (await storage.getContacts(user.id)).filter((contact) => contact.phone === "9545550158");
  assert.equal(phoneLead.name, "Phone Lead");
  assert.ok(Math.abs(phoneLead.followUpDate!.getTime() - Date.now() - 86_400_000) < 15_000);
  assert.equal((await submit("jane-agent", { phone: "+1 (954) 555-0158" })).status, 201);
  assert.deepEqual((await storage.getContact(phoneLead.id))?.followUpDate, phoneLead.followUpDate);
  await fixture.update(workflows).set({ actions: defaultW1.actions }).where(eq(workflows.id, "w1"));
  for (const invalid of [{}, { phone: "12-3" }, { phone: "1......." }, { email: "bad address" }]) {
    assert.equal((await submit("jane-agent", invalid)).status, 400);
  }
  const invalidPhone = await submit("jane-agent", { name: "Invalid Visitor", email: "invalid-phone@example.test", phone: "(555) wrong" });
  assert.equal(invalidPhone.status, 400);
  assert.equal((await invalidPhone.json()).field, "phone");
  assert.equal((await storage.getContacts(user.id)).filter((contact) => !contact.email?.endsWith("flyer@example.test")).length, 2);
  assert.equal((await submit("jane-agent", { name: "Returning Buyer", email: "buyer@example.test", phone: "(954) 555-0159" })).status, 201);
  assert.equal((await storage.getContact(emailLead.id))?.phone, "9545550159", "an unassigned phone can be added to the matched contact");
  assert.equal((await storage.getContact(emailLead.id))?.name, "Jane Buyer");

  const flyer = await request(flyerPath);
  assert.equal(flyer.status, 200, await flyer.clone().text());
  const flyerHtml = await flyer.text();
  assert.doesNotMatch(flyerHtml, /jane-public|mailto:|"email"\s*:|42 Private Street|42-private-street/);
  assert.match(flyerHtml, /"telephone":"\+1 \(954\) 555-0100"/);
  assert.ok(flyerHtml.includes(`action="${inquiryPath}"`));
  assert.match(flyerHtml, /brokerage\.png|Summit Realty/);
  const postFlyer = (body: Record<string, unknown>, path = inquiryPath) => request(path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await postFlyer({ name: "Listing Visitor" })).status, 400);
  assert.equal((await postFlyer({ email: "flyer@example.test" }, "/api/public/listings/42-private-street-49431be3/leads")).status, 404);
  const flyerLead = await postFlyer({ name: "Listing Visitor", email: "flyer@example.test", phone: "(555) 123-4567", message: "Could you tell me more?",
    listingUrl: "https://untrusted.example/42-private-street", propertyAddress: "42 Private Street" });
  assert.equal(flyerLead.status, 201, await flyerLead.clone().text());
  const listingLead = (await storage.getContacts(user.id)).find((contact) => contact.email === "flyer@example.test")!;
  assert.equal(listingLead.phone, "5551234567");
  const returning = await postFlyer({ name: "Newly Submitted Name", email: "FLYER@example.test", phone: "+1 555-123-4567" });
  assert.equal(returning.status, 201, await returning.clone().text());
  assert.equal((await storage.getContact(listingLead.id))?.name, "Listing Visitor");
  assert.equal((await storage.getContacts(user.id)).filter((contact) => contact.email === "flyer@example.test").length, 1);

  if (process.env.AGENT_PAGE_BROWSER_TEST !== "1") {
    assert.equal((await postFlyer({ name: "Independent Visitor", email: "independent-flyer@example.test", phone: "+44 (20) 7946 0958" })).status, 201);
  }
  const independent = (await storage.getContacts(user.id)).find((contact) => contact.email === "independent-flyer@example.test")!;
  assert.notEqual(independent.id, listingLead.id);
  assert.equal(independent.phone, "442079460958");
  const fields = listingLead.customFields as Record<string, unknown>;
  assert.equal(fields.agentPageListingId, listingId);
  assert.equal(fields.agentPageListingUrl, origin + flyerPath);
  assert.equal(fields.listingReference, "Fort Lauderdale, FL");
  assert.equal(fields.sourcePage, "listing_flyer");
  assert.equal(fields.leadSource, "MLS Property Listing");
  assert.equal(listingLead.followUp, null);
  assert.equal(agentInquiryRecommendation(listingLead), "Review new lead");
  assert.equal(agentInquiryLabel(listingLead), "MLS Property Inquiry");
  const [listingThread] = (await storage.getContactWithConversations(listingLead.id))!.conversations;
  const [independentThread] = (await storage.getContactWithConversations(independent.id))!.conversations;
  assert.notEqual(independentThread.id, listingThread.id);
  const messageCount = (await storage.getMessages(listingThread.id)).length;
  for (const conflict of [
    { email: "different@example.test", phone: "555-123-4567" },
    { email: "flyer@example.test", phone: "555-555-0127" },
    { email: "flyer@example.test", phone: independent.phone },
  ]) {
    const rejected = await submit("jane-agent", { ...conflict, name: "Conflicting Visitor" });
    assert.equal(rejected.status, 409, await rejected.clone().text());
  }
  assert.equal((await storage.getMessages(listingThread.id)).length, messageCount);
  assert.equal((await storage.getContact(listingLead.id))?.phone, "5551234567");
  assert.ok(!(await storage.getContacts(user.id)).some((contact) => contact.email === "different@example.test" || contact.phone === "5555550127"));
  assert.ok(isAgentInquiryThread(listingThread));
  const sendAttempt = await request(`/api/contacts/${listingLead.id}/send`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: "webchat", conversationId: listingThread.id, content: "A drafted reply",
      sendAttemptId: listingId, replyRevision: "fixture" }),
  });
  assert.equal(sendAttempt.status, 400, await sendAttempt.clone().text());
  assert.equal((await sendAttempt.json()).code, "webchat_session_inactive");
  for (const msg of await storage.getMessages(listingThread.id)) {
    assert.match(msg.content, /Fort Lauderdale, FL/);
    assert.doesNotMatch(msg.content, /42 Private Street|42-private-street|untrusted\.example/);
  }
  assert.ok((await storage.getMessages(listingThread.id)).some((msg) =>
    (msg.templateVariables as { agentInquirySubmittedName?: string }).agentInquirySubmittedName === "Newly Submitted Name"));
  eligible = false;
  const fallback = await request(flyerPath);
  assert.equal(fallback.status, 200);
  assert.match(await fallback.text(), /href="tel:\+19545550100">Contact Agent<\/a>/);
  assert.equal((await postFlyer({ email: "flyer@example.test" })).status, 404);
  eligible = true;
  const limited = await Promise.all(Array.from({ length: 11 }, () => postFlyer({ email: "invalid" })));
  assert.ok(limited.some((response) => response.status === 429));

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
  const draftPreviewHtml = await draftPreview.text();
  assert.doesNotMatch(draftPreviewHtml, /id="agent-site-nav"/);
  assert.match(draftPreviewHtml, /Private preview — not published/, "draft preview clearly labeled private");
  assert.match(draftPreviewHtml, /NEIGHBORHOOD LOCAL GUIDE/);
  assert.match(draftPreviewHtml, /id="local-guide-title">Discover Victoria Park/);
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
  assert.match(pilotHtml, /NEIGHBORHOOD LOCAL GUIDE/);
  assert.match(pilotHtml, /Living in Victoria Park/);
  assert.match(pilotHtml, /class="neighborhood-agent-sidebar" id="agent-contact"/);
  assert.match(pilotHtml, /id="btn-message">Contact Agent/);
  assert.doesNotMatch(pilotHtml, /<header class="agent-header">/);
  assert.match(pilotHtml, /<h1 id="local-guide-title">Discover Victoria Park<\/h1>/);
  assert.match(pilotHtml, /class="neighborhood-guide"/);
  assert.match(pilotHtml, /<title>Victoria Park, Fort Lauderdale, Florida \| Jane Agent<\/title>/);
  assert.match(pilotHtml, /class="neighborhood-agent-person"[\s\S]*?<h2>Jane Agent<\/h2>\s*<a[^>]*href="tel:\+19545550100"/);
  assert.doesNotMatch(pilotHtml, /jane-public|mailto:|publicEmail/);
  assert.match(pilotHtml, /content="Victoria Park is in northeast Fort Lauderdale/);
  assert.match(pilotHtml, /Back to the Agent Page/);
  assert.match(pilotHtml, /href="[^"]+\/agents\/yaniv-haramatiy\/las-olas"/);
  assert.doesNotMatch(pilotHtml, /legacy-agent|Other City/);
  assert.doesNotMatch(await (await request(parent + "?embed=1")).text(), /id="agent-site-nav"|<summary>Neighborhoods<\/summary>/);
  assert.match(pilotHtml, /id="neighborhood-properties"/, "local sale/rent sections are available");
  assert.doesNotMatch(pilotHtml, /<article class="listing-card/, "no property cards without verified neighborhood matching");
  assert.match(await (await request(parent)).text(), /href="[^"]+\/agents\/yaniv-haramatiy\/victoria-park"/);
  assert.match(await neighborhoodSitemap(), /\/agents\/yaniv-haramatiy\/victoria-park<\/loc>/);
  assert.match(await (await request(pilot + "?utm_source=test")).text(), /content="noindex, follow"/);
  assert.equal((await request(pilot + "?embed=1")).status, 404);

  if (process.env.AGENT_PAGE_BROWSER_TEST === "1") {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE,
      ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--disable-features=OverlayScrollbar"] });
    t.after(() => browser.close());
    for (const width of [320, 390, 1280, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1050 } });
      await page.goto(origin + parent);
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      const drawer = page.getByRole("dialog", { name: "Navigation" });
      const nav = page.getByRole("navigation", { name: "Agent navigation" });
      const disclosure = nav.getByText("Neighborhoods", { exact: true });
      const mobile = width < 640;
      const stablePosition = await page.evaluate(() => {
        document.body.style.minHeight = "200vh";
        return document.querySelector(".wrap")!.getBoundingClientRect().x;
      });

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
        await page.mouse.click(width - 24, 24);
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
      await page.getByRole("heading", { name: "Discover Victoria Park" }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      assert.equal(await page.locator(".wrap").evaluate((node) => node.getBoundingClientRect().x), stablePosition);
      if (!mobile) {
        const withoutStableGutter = await page.evaluate(() => {
          // The new guide itself scrolls; hide it temporarily to reproduce the old short-page case.
          const guide = document.querySelector<HTMLElement>(".neighborhood-guide");
          const originalGuideDisplay = guide?.style.display ?? "";
          if (guide) guide.style.display = "none";
          document.documentElement.style.scrollbarGutter = "auto";
          const wrap = document.querySelector(".wrap")!;
          const shortPosition = wrap.getBoundingClientRect().x;
          document.body.style.minHeight = "200vh";
          const tallPosition = wrap.getBoundingClientRect().x;
          document.body.style.minHeight = "";
          document.documentElement.style.scrollbarGutter = "";
          if (guide) guide.style.display = originalGuideDisplay;
          return { shortPosition, tallPosition };
        });
        assert.notEqual(withoutStableGutter.shortPosition, withoutStableGutter.tallPosition, "classic scrollbar reproduces the old layout shift");
      }
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
      await page.waitForURL(origin + parent + "/las-olas#neighborhood-properties");
      await page.locator("#neighborhood-properties").waitFor();
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
      await page.getByRole("heading", { name: "Discover Victoria Park" }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      assert.equal(await page.locator(".neighborhood-agent-card").getByRole("link", { name: publicPhone }).getAttribute("href"), "tel:+19545550100");
      assert.equal(await page.locator(".agent-header").count(), 0);
      assert.equal(await page.locator("#local-guide-title").count(), 1);
      const guideFollowsNavigation = await page.evaluate(() =>
        document.querySelector(".neighborhood-guide-hero")!.getBoundingClientRect().top >=
        document.querySelector(".agent-site-nav")!.getBoundingClientRect().bottom);
      assert(guideFollowsNavigation, "hero follows navigation without a repeated agent header");
      for (const label of ["Contact Agent", "Schedule Showing", "What's My Home Worth?"]) {
        await page.getByRole("button", { name: label }).click();
        await page.locator("#lead-form").waitFor();
        await page.getByRole("button", { name: "Cancel" }).click();
      }
      await page.close();
    }
  }

  const neighborhoodIdentity = { name: "Test 2", email: "visitor@example.test", phone: "(954) 555-0164" };
  await fixture.insert(contacts).values([
    { id: "prior-lead", userId: user.id, name: "Checking lead capture", source: "webchat", primaryChannel: "webchat",
      pipelineStage: "New Lead", email: neighborhoodIdentity.email,
      webchatId: neighborhoodIdentity.email, sourceDetails: promotedWebchatSourceDetails({}, { agentPageForm: true, identifiedFrom: "agent_page_form" }),
      customFields: { email: neighborhoodIdentity.email, phone: neighborhoodIdentity.phone, sourcePage: "listing_flyer" } },
    { id: "other-tenant", userId: "legacy-live", name: "Other Tenant", email: neighborhoodIdentity.email },
    { id: "anonymous", userId: user.id, name: "Website Visitor", source: "webchat", sourceDetails: inboxOnlyWebchatSourceDetails() },
    { id: "saved-lead", userId: user.id, name: "Saved Lead", phone: "+1 (954) 555-0165", pipelineStage: "Qualified",
      webchatId: "5451e8ea-00dc-4f66-a9fe-789abdef0123" },
  ]);
  await fixture.insert(conversations).values([
    { id: "old-inquiry", userId: user.id, contactId: "prior-lead", channel: "webchat" },
    { id: "widget-thread", userId: user.id, contactId: "saved-lead", channel: "webchat" },
  ]);
  await fixture.insert(messages).values({ userId: user.id, conversationId: "old-inquiry", contactId: "prior-lead",
    direction: "inbound", content: "Checking lead capture", externalMessageId: "agent_page_1763679600000_legacy001" });
  const legacyConflict = await submit("yaniv-haramatiy", { name: "Another Visitor", email: "new-email@example.test",
    phone: neighborhoodIdentity.phone, neighborhood: "victoria-park" });
  assert.equal(legacyConflict.status, 409, await legacyConflict.clone().text());
  assert.equal((await storage.getContact("prior-lead"))?.phone, null);
  assert.equal((await storage.getMessages("old-inquiry")).length, 1);
  const inquiry = (intent: string) => submit("yaniv-haramatiy", { name: neighborhoodIdentity.name, email: neighborhoodIdentity.email, intent, neighborhood: "victoria-park" });
  for (const intent of ["message", "schedule_showing", "home_worth"]) {
    const result = await inquiry(intent);
    assert.equal(result.status, 201, await result.clone().text());
  }
  const converted = (await storage.getContacts(user.id)).find((contact) => contact.email === neighborhoodIdentity.email)!;
  assert.equal(converted.id, "prior-lead");
  assert.equal(converted.name, neighborhoodIdentity.name);
  assert.equal(converted.phone, "9545550164");
  assert.equal(agentInquiryLabel(converted), "Neighborhood Inquiry · Victoria Park");
  assert.deepEqual(agentPageLeadCopilotContext(converted), {
    name: neighborhoodIdentity.name, email: neighborhoodIdentity.email, phone: "9545550164",
    leadSource: "Agent Page · Victoria Park", referralNeighborhood: "Victoria Park",
  });
  assert.equal((converted.webchatContext as { latestUrl: string }).latestUrl, origin + pilot);
  assert.equal(((await storage.getConversation("old-inquiry"))?.channelAccountId), AGENT_PAGE_FORM_ACCOUNT);
  const inquiryMessages = await storage.getMessages("old-inquiry");
  assert.equal(inquiryMessages.length, 4);
  assert.equal(inquiryMessages[0].content, "Checking lead capture", "the original message stays in the thread");
  const inbox = await storage.getUnifiedInbox(user.id);
  assert.equal(inbox.find((row) => row.conversation?.id === "old-inquiry")?.contact.name, neighborhoodIdentity.name);
  assert.ok(buildFollowUpItems(inbox).find((item) => item.id === converted.id && item.reviewRecommended && !hasScheduledFollowUp(item)));
  assert.equal(inbox.find((row) => row.contact.id === "anonymous")?.contact.name, "Website Visitor");
  assert.ok(!filterCrmListedContacts(await storage.getContacts(user.id)).some((contact) => contact.id === "anonymous"));
  assert.equal((await storage.getContact("other-tenant"))?.name, "Other Tenant");
  assert.equal((await storage.getWorkflowExecutions("w1")).filter((row) => row.conversationId === "old-inquiry").length, 1);
  const patchContact = (id: string, body: object) => request(`/api/contacts/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const reminderDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const scheduled = await patchContact(converted.id, { followUp: "Review new lead", followUpDate: reminderDate });
  assert.equal(scheduled.status, 200, await scheduled.clone().text());
  assert.equal((await storage.getContact(converted.id))?.followUpDate?.toISOString(), reminderDate);
  assert.equal(agentInquiryRecommendation((await storage.getContact(converted.id))!), undefined);
  assert.equal((await patchContact(converted.id, { followUp: null, followUpDate: null, phone: null })).status, 200);
  assert.equal((await submit("yaniv-haramatiy", { ...neighborhoodIdentity, name: "Another Name", neighborhood: "victoria-park" })).status, 409,
    "a new submission cannot silently override a staff-cleared phone");
  assert.equal((await submit("yaniv-haramatiy", { name: "Another Name", email: neighborhoodIdentity.email, neighborhood: "victoria-park" })).status, 201);
  assert.equal((await storage.getContact(converted.id))?.followUp, null, "completed review cannot be recreated by retries");
  assert.equal((await storage.getContact(converted.id))?.name, "Test 2", "repeat submissions preserve the captured name");
  assert.equal((await storage.getContact(converted.id))?.phone, null, "an agent's explicit phone removal stays cleared");
  assert.equal((await patchContact(converted.id, { name: "Staff Edited Name" })).status, 200);
  assert.equal((await inquiry("message")).status, 201);
  assert.equal((await storage.getContact(converted.id))?.name, "Staff Edited Name");

  const existing = await submit("yaniv-haramatiy", { phone: "9545550165", name: "Submitted Name", email: "saved@example.test" });
  assert.equal(existing.status, 201, await existing.clone().text());
  assert.equal((await storage.getContact("saved-lead"))?.email, "saved@example.test");
  assert.equal((await storage.getContact("saved-lead"))?.name, "Saved Lead", "an established CRM name is preserved");
  assert.equal((await storage.getContact("saved-lead"))?.phone, "+1 (954) 555-0165");
  assert.equal((await storage.getContact("saved-lead"))?.pipelineStage, "Qualified");
  assert.equal((await storage.getConversationByContactAndChannel("saved-lead", "webchat"))?.id, "widget-thread");
  assert.equal((await storage.getMessages("widget-thread")).length, 0, "private inquiry is not exposed to public widget polling");
  assert.equal(isAgentInquiryThread(await storage.getConversation("widget-thread")), false);
  assert.equal((await submit("yaniv-haramatiy", { email: "saved@example.test", phone: "9545550164" })).status, 409);
  assert.equal(outbound.mock.calls.length, 0);

  for (const [id, phone, proven] of [
    ["no-legacy-message", "9545550167", false],
    ["invalid-legacy-phone", "1.......", true],
    ["duplicate-legacy-phone", "9545550165", true],
  ] as const) {
    const email = `${id}@example.test`;
    await fixture.insert(contacts).values({ id, userId: user.id, name: "Legacy Lead", source: "webchat",
      webchatId: email, customFields: { email, phone, sourcePage: "agent_page" } });
    if (proven) {
      const [thread] = await fixture.insert(conversations).values({ userId: user.id, contactId: id, channel: "webchat" }).returning();
      await fixture.insert(messages).values({ userId: user.id, contactId: id, conversationId: thread.id,
        direction: "inbound", content: "Legacy inquiry", externalMessageId: `agent_page_1763679600000_${id === 'invalid-legacy-phone' ? 'invalid' : 'duplicate'}` });
    }
    assert.equal((await submit("yaniv-haramatiy", { name: "Legacy Lead", email })).status, 201);
    assert.equal((await storage.getContact(id))?.phone, null, id);
    assert.equal((await storage.getContacts(user.id)).filter((contact) => contact.email === email).length, 1);
  }

  const repeated = await Promise.all([1, 2].map(() => submit("yaniv-haramatiy", {
    name: "Concurrent Lead", email: "concurrent@example.test", neighborhood: "victoria-park",
  })));
  for (const response of repeated) assert.equal(response.status, 201, await response.clone().text());
  const matching = (await storage.getContacts(user.id)).filter((contact) => contact.email === "concurrent@example.test");
  assert.equal(matching.length, 1);
  const concurrent = await storage.getContactWithConversations(matching[0].id);
  assert.equal(concurrent?.conversations.length, 1);
  assert.equal(concurrent?.conversations[0].unreadCount, 2);
  assert.equal((await storage.getWorkflowExecutions("w1")).filter((row) => row.conversationId === concurrent?.conversations[0].id).length, 1);

  const [manualWorkflow] = await fixture.insert(workflows).values({
    id: "manual-task-workflow", userId: user.id, name: "Internal task", triggerType: "keyword",
    actions: [{ type: "create_task", title: "Call tomorrow", dueDays: 1 }],
  }).returning();
  expectReadOnly = false;
  const occupied = await executeWorkflowActions(manualWorkflow, null, {}, phoneLead);
  assert.deepEqual(occupied.actionsExecuted, [], "an existing task is preserved without a false task_created entry");
  assert.equal((await storage.getContact(phoneLead.id))?.followUp, "Review new lead");
  const taskExecution = await executeWorkflowActions(manualWorkflow, null, {}, converted);
  assert.deepEqual(taskExecution.actionsExecuted, [{ type: "task_created", value: "Call tomorrow" }]);
  assert.equal((await storage.getContact(converted.id))?.followUp, "Call tomorrow");
  expectReadOnly = true;
  assert.ok(sellerIntake.mock.calls.some(({ arguments: [id, profile] }) =>
    id === converted.id && profile.lastSellerIntent === "seller_valuation"));
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

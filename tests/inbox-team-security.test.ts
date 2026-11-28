import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import { csrfProtection } from "../server/csrfProtection";
import session from "express-session";
import { createServer } from "node:http";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { eq, inArray } from "drizzle-orm";
import { WebSocket } from "ws";
import { rateLimit } from "express-rate-limit";
import * as schema from "../shared/schema";
import { defaultPipelineLayout } from "../shared/pipelineLayout";
import { isSalesOpportunity } from "../shared/followUpTasks";
import { inboxPipelineChoices } from "../client/src/lib/data";

// All database calls below use isolated in-memory PostgreSQL. No provider is invoked.
process.env.DATABASE_URL ||= "postgresql://fixture:fixture@127.0.0.1:1/unused";
process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "synthetic-test-key";
process.env.SESSION_SECRET = "inbox-security-test-session-secret";
process.env.EMAIL_IMAGE_PROXY_SECRET = "synthetic-inbox-email-image-secret-00000";
process.env.STRIPE_SECRET_KEY = "sk_test_synthetic";
process.env.NODE_ENV = "test";
process.env.EMAIL_ENCRYPTION_KEY = "synthetic-mail-key-0000000000000000000";
process.env.RESEND_API_KEY = "synthetic-team-mail-key";

async function fixture() {
  const pg = new PGlite();
  const database = drizzle(pg);
  const dialect = new PgDialect();
  const quote = (x: string) => '"' + x.replaceAll('"', '""') + '"';
  for (const table of [schema.users, schema.teamMembers, schema.contacts, schema.conversations,
    schema.messages, schema.activityEvents, schema.channelSettings, schema.chats, schema.contactNotes,
    schema.prospectIntelligence, schema.prospectOutreachQueueItems, schema.campaignEnrollments,
    schema.appointments, schema.workspacePipelineLayouts, schema.integrations, schema.emailMailboxes, schema.emailMessageDetails, schema.marketingSuppressions, schema.messageTemplates, schema.templateCarouselMediaDefaults, schema.inboxSendAttempts, schema.inboxPresenceSessions]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      let value = quote(column.name) + " " + column.getSQLType();
      if (column.primary) value += " PRIMARY KEY";
      if (column.default !== undefined) {
        const def = column.default;
        value += " DEFAULT " + (def && typeof def === "object" && "getSQL" in def
          ? dialect.sqlToQuery((def as any).getSQL()).sql
          : typeof def === "string" ? "'" + def.replaceAll("'", "''") + "'" : String(def));
      }
      return value;
    });
    await pg.exec(`CREATE TABLE ${quote(config.name)} (${columns.join(",")})`);
  }
  // Exercise the actual additive migration, including the canonical-transition trigger.
  await pg.exec(readFileSync("migrations/20261126_custom_pipeline_stages.sql", "utf8"));
  const { db } = await import("../drizzle/db");
  const original = new Map<string, any>();
  for (const method of ["select", "selectDistinct", "insert", "update", "delete", "execute", "transaction"]) {
    original.set(method, (db as any)[method]);
    (db as any)[method] = (database as any)[method].bind(database);
  }
  const { inboxSendRuntime }=await import("../server/inboxDispatchFence");
  const originalFence=inboxSendRuntime.withFence;
  inboxSendRuntime.withFence=async(_key,work)=>work();
  const { storage } = await import("../server/storage");
  const { setupAuth, authenticatePresenceRequest } = await import("../server/auth");
  const { setupPresenceServer, notifyUser } = await import("../server/presence");
  const { registerRoutes } = await import("../server/routes");
  for (const id of ["owner-a", "owner-b", "agent", "admin", "pending", "inactive", "unlinked", "multi"]) {
    await database.insert(schema.users).values({ id, name: `Name ${id}`, email: `${id}@example.com`, password: "unused", emailVerifiedAt: new Date() });
  }
  for (const [id, role, status, memberId] of [
    ["agent", "member", "active", "agent"], ["admin", "admin", "active", "admin"],
    ["pending", "member", "pending", "pending"], ["inactive", "member", "inactive", "inactive"],
    ["unlinked", "member", "active", null], ["multi-a", "member", "active", "multi"],
  ]) await database.insert(schema.teamMembers).values({ id: String(id), ownerId: "owner-a", memberId, role: String(role), status: String(status), email: `${id}@example.com` });
  await database.insert(schema.teamMembers).values({ id: "multi-b", ownerId: "owner-b", memberId: "multi", role: "member", status: "active", email: "multi@example.com" });
  for (const suffix of ["a", "b"]) {
    await database.insert(schema.contacts).values({ id: `contact-${suffix}`, userId: `owner-${suffix}`, name: `Customer ${suffix}`, primaryChannel: "sms", notes: "", assignedTo: null });
    await database.insert(schema.conversations).values({ id: `conv-${suffix}`, contactId: `contact-${suffix}`, userId: `owner-${suffix}`, channel: "sms", lastMessageAt: new Date() });
    await database.insert(schema.messages).values({ id: `message-${suffix}`, conversationId: `conv-${suffix}`, contactId: `contact-${suffix}`, userId: `owner-${suffix}`, direction: "inbound", content: `Private ${suffix}` });
    await database.insert(schema.emailMessageDetails).values({messageId:`message-${suffix}`,subject:"Private email",textBody:`Email ${suffix}`,fromAddress:"customer@example.com"});
  }
  const app = express(); app.use(express.json()); app.use(cookieParser());
  // Match production middleware ordering; do not bypass CSRF in the fixture.
  app.use(csrfProtection);
  const sessions = new session.MemoryStore();
  setupAuth(app, { store: sessions });
  // Test-only login creates genuine signed cookies and uses the production serializer/deserializer.
  app.post("/__login", rateLimit({ windowMs: 60_000, limit: 30, legacyHeaders: false }), async (req, res, next) => {
    const user = await storage.getUserForSession(req.body.id);
    if (!user) return res.sendStatus(401);
    req.logIn(user, error => error ? next(error) : req.session.save(error => error ? next(error) : res.json({ ok: true })));
  });
  app.post("/__logout", (req, res) => req.session.destroy(() => res.sendStatus(204)));
  app.post("/__forget-user", (req, res) => {
    delete (req.session as any).passport;
    req.session.save(() => res.sendStatus(204));
  });
  const heldRead = { started: false, release: () => {} };
  app.get("/__hold-session", rateLimit({windowMs:60_000,limit:10,legacyHeaders:false}), (_req,res) => {
    heldRead.started=true;heldRead.release=()=>res.json({ok:true});
  });
  const server = createServer(app);
  await registerRoutes(server, app);
  const wss = setupPresenceServer(server, authenticatePresenceRequest);
  app.use((error: Error, _req: any, res: any, _next: any) => { console.error(error); res.status(500).json({ error: error.message }); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const cookies = new Map<string, string>(); const sockets: WebSocket[] = [];
  const login = async (id: string) => {
    const response = await fetch(origin + "/__login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0]; cookies.set(id, cookie); return cookie;
  };
  const request = async (actor: string, path: string, method = "GET", body?: any, extra: Record<string, string> = {}) => {
    const cookie = cookies.get(actor) ?? await login(actor);
    if(method==="POST"&&body&&!body.sendAttemptId&&(path.match(/^\/api\/contacts\/[^/]+\/send$/)||path==="/api/inbox/templates/send")){
      const id=path.startsWith("/api/contacts/")?path.split("/")[3]:body.contactId;
      let state:any={revision:"0/-",aiEpoch:0};
      if(id){const response=await fetch(origin+`/api/contacts/${id}/reply-state`,{method:"POST",headers:{Cookie:cookie,Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({channel:body.channel||"whatsapp"})});if(response.ok)state=await response.json();}
      body={...body,sendAttemptId:randomUUID(),replyRevision:state.revision,aiEpoch:state.aiEpoch,...(body.channel!=="email"&&state.conversationId?{conversationId:state.conversationId}:{})};
    }
    return fetch(origin + path, { method, headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  async function socket(actor?: string, extra: Record<string, string> = {}) {
    const cookie = actor ? cookies.get(actor) ?? await login(actor) : undefined;
    const ws = new WebSocket(origin.replace("http", "ws") + "/ws/presence", { headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...extra } });
    sockets.push(ws); const messages: any[] = [];
    ws.on("message", data => messages.push(JSON.parse(data.toString())));
    await once(ws, "open");
    return { ws, messages, send: (x: any) => ws.send(JSON.stringify(x)) };
  }
  return { database, storage, request, login, cookies, socket, origin, notifyUser, heldRead,
    async close() {
      sockets.forEach(ws => ws.terminate());
      await new Promise<void>(resolve => wss.close(() => resolve()));
      await new Promise<void>(resolve => server.close(() => resolve()));
      inboxSendRuntime.withFence=originalFence;
      for (const [method, value] of original) (db as any)[method] = value;
      await pg.close();
    },
  };
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error("Timed out waiting for server result"); await new Promise(r => setTimeout(r, 5)); }
}

test("Inbox team security through real session-backed HTTP, WebSockets and SQL", { timeout: 120_000 }, async t => {
  const f = await fixture();
  try {
    await t.test("owner access and a linked active teammate share the Inbox without foreign tenant rows", async () => {
      assert.equal((await fetch(f.origin + "/api/inbox", {headers:{"x-user-id":"owner-a","x-workspace-id":"owner-a"}})).status,401);
      for (const actor of ["owner-a", "agent", "admin"]) {
        const response = await f.request(actor, "/api/inbox"); assert.equal(response.status, 200);
        const inbox = await response.json(); assert.deepEqual(inbox.map((row: any) => row.contact.id), ["contact-a"]);
        assert.equal((await f.request(actor, "/api/conversations/conv-a/messages")).status, 200);
        assert.equal((await f.request(actor, "/api/contacts/contact-a")).status, 200);
        assert.equal((await f.request(actor, "/api/conversations/conv-b/messages")).status, 404);
        assert.equal((await f.request(actor, "/api/contacts/contact-b")).status, 404);
      }
      assert.equal((await f.request("owner-a", "/api/contacts/contact-a/details")).status, 200);
      assert.equal((await f.request("agent", "/api/contacts/contact-a/details")).status, 200);
    });
    await t.test("shared CSRF guard rejects foreign and missing browser provenance before contact writes", async () => {
      const path = "/api/contacts/contact-a";
      const cookie = f.cookies.get("owner-a") ?? await f.login("owner-a");
      const before = await f.storage.getContact("contact-a");
      for (const headers of [
        { Origin: "https://foreign.example" },
        { "Sec-Fetch-Site": "cross-site", Origin: f.origin },
        {},
      ] as Record<string, string>[]) {
        const response = await fetch(f.origin + path, {
          method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ notes: "Must not be persisted" }),
        });
        assert.equal(response.status, 403);
        assert.equal((await response.json()).code, "CSRF_INVALID");
      }
      const after = await f.storage.getContact("contact-a");
      assert.equal(after?.notes, before?.notes);
    });
    await t.test("pipeline configuration is workspace scoped, admin-only, CSRF protected and revision guarded", async () => {
      const path = "/api/inbox/pipeline-layout";
      assert.equal((await fetch(f.origin + path)).status, 401);
      async function editor(actor: string) {
        const result = await f.request(actor, path);
        assert.equal(result.status, 200);
        const cookie = result.headers.get("set-cookie")?.match(/(?:^|,\s*)(pipelineCsrfToken=[a-f0-9]{64})/)?.[1];
        const layout = await result.json();
        assert.match(layout.csrfToken, /^[a-f0-9]{64}$/);
        assert.ok(cookie);
        return { layout, headers: { Cookie: f.cookies.get(actor) + "; " + cookie, "X-CSRF-Token": layout.csrfToken } };
      }
      const owner = await editor("owner-a");
      const initial = owner.layout;
      assert.equal(initial.workspaceId, "owner-a");
      assert.equal(initial.revision, 0);
      assert.deepEqual(initial.stages, defaultPipelineLayout());
      const contactPath = "/api/contacts/contact-a";
      const defaultAdmission = { pipelineLayoutMove: { workspaceId: "owner-a", revision: 0, columnId: "Lead", admit: true } };
      const initialContact = (await f.storage.getContact("contact-a"))!;
      assert.equal(isSalesOpportunity(initialContact), false);
      const admittedToDefault = await f.request("agent", contactPath, "PATCH", defaultAdmission);
      assert.equal(admittedToDefault.status, 200);
      assert.equal(isSalesOpportunity(await admittedToDefault.json()), true);
      await f.database.update(schema.contacts).set({ sourceDetails: initialContact.sourceDetails })
        .where(eq(schema.contacts.id, initialContact.id));
      const admin = await editor("admin");
      assert.notEqual(admin.layout.csrfToken, owner.layout.csrfToken);
      const stages = defaultPipelineLayout();
      stages[2].label = "Estimate sent";
      const payload = { workspaceId: "owner-a", revision: 0, stages };
      assert.equal((await f.request("agent", path, "PATCH", payload)).status, 403);
      assert.equal((await f.request("admin", path, "PATCH", payload)).status, 403);
      assert.equal((await f.request("admin", path, "PATCH", payload, { ...admin.headers, "X-CSRF-Token": "0".repeat(64) })).status, 403);
      const stolen = { Cookie: f.cookies.get("admin") + "; pipelineCsrfToken=" + owner.layout.csrfToken, "X-CSRF-Token": owner.layout.csrfToken };
      assert.equal((await f.request("admin", path, "PATCH", payload, stolen)).status, 403);
      assert.equal((await f.request("admin", path, "GET", undefined, { Origin: "https://foreign.example" })).status, 403);
      assert.equal((await f.request("admin", path, "PATCH", payload, { ...admin.headers, Origin: "https://foreign.example" })).status, 403);
      assert.equal((await f.request("admin", path, "PATCH", payload, { ...admin.headers, "Sec-Fetch-Site": "cross-site" })).status, 403);
      assert.equal((await f.request("admin", path, "PATCH", { ...payload, workspaceId: "owner-b" }, admin.headers)).status, 409);
      assert.equal((await f.request("admin", path, "PATCH", { ...payload, stages: stages.slice(1) }, admin.headers)).status, 400);
      const saved = await f.request("admin", path, "PATCH", payload, admin.headers);
      assert.equal(saved.status, 200);
      assert.equal((await saved.json()).revision, 1);
      const shared = await (await f.request("agent", path)).json();
      assert.equal(shared.canEdit, false);
      assert.equal(shared.csrfToken, undefined);
      assert.equal(shared.stages[2].label, "Estimate sent");
      assert.equal((await f.request("owner-a", path, "PATCH", payload, owner.headers)).status, 409);
      const foreign = await editor("owner-b");
      assert.equal(foreign.layout.revision, 0);
      assert.deepEqual(foreign.layout.stages, defaultPipelineLayout());
      const reset = await f.request("owner-a", path, "PATCH", { ...payload, revision: 1, stages: defaultPipelineLayout() }, owner.headers);
      assert.equal(reset.status, 200);
      assert.equal((await reset.json()).revision, 2);
      const draftId = "custom:" + randomUUID();
      const draft = [...defaultPipelineLayout(), { id: draftId, label: "Design & Measurements", canonicalStage: "Proposal" }];
      const configured = await f.request("owner-a", path, "PATCH", { ...payload, revision: 2, stages: draft }, owner.headers);
      assert.equal(configured.status, 200);
      const configuration = await configured.json();
      const id = configuration.stages[5].id;
      assert.notEqual(id, draftId);
      assert.equal(configuration.revision, 3);
      assert.equal((await f.request("agent", contactPath, "PATCH", defaultAdmission)).status, 409);
      const move = { pipelineLayoutMove: { workspaceId: "owner-a", revision: 3, columnId: id } };
      assert.equal((await f.request("agent", contactPath, "PATCH", move)).status, 409, "only existing opportunities are board-movable");
      const admission = { pipelineLayoutMove: { ...move.pipelineLayoutMove, admit: true } };
      assert.equal((await f.request("owner-b", contactPath, "PATCH", admission)).status, 404);
      assert.equal((await f.request("agent", contactPath, "PATCH", admission, { Origin: "https://foreign.example" })).status, 403);
      assert.equal((await f.request("agent", contactPath, "PATCH", { pipelineLayoutMove: { ...admission.pipelineLayoutMove, revision: 2 } })).status, 409);
      await f.database.update(schema.contacts).set({ tag: "Do Not Contact" }).where(eq(schema.contacts.id, initialContact.id));
      assert.equal((await f.request("agent", contactPath, "PATCH", admission)).status, 409);
      await f.database.update(schema.contacts).set({ tag: initialContact.tag }).where(eq(schema.contacts.id, initialContact.id));
      const admittedToCustom = await f.request("agent", contactPath, "PATCH", admission);
      assert.equal(admittedToCustom.status, 200);
      const admitted = await admittedToCustom.json();
      assert.equal(isSalesOpportunity(admitted), true);
      assert.equal(admitted.pipelineStage, "Proposal");
      assert.equal(admitted.pipelineCustomStageId, id);
      assert.deepEqual(admitted.sourceDetails, { ...initialContact.sourceDetails as object, pipelineManuallyAdded: true });
      assert.equal((await f.request("owner-b", contactPath, "PATCH", move)).status, 404);
      assert.equal((await f.request("agent", contactPath, "PATCH", { pipelineLayoutMove: { ...move.pipelineLayoutMove, workspaceId: "owner-b" } })).status, 409);
      assert.equal((await f.request("agent", contactPath, "PATCH", { pipelineLayoutMove: { ...move.pipelineLayoutMove, revision: 2 } })).status, 409);
      assert.equal((await f.request("agent", contactPath, "PATCH", { pipelineLayoutMove: { ...move.pipelineLayoutMove, columnId: "custom:" + randomUUID() } })).status, 409);
      assert.equal((await f.request("agent", contactPath, "PATCH", { pipelineCustomStageId: id })).status, 400);
      assert.equal((await f.request("agent", contactPath, "PATCH", { pipelineStage: id })).status, 400);
      const moved = await f.request("agent", contactPath, "PATCH", move);
      assert.equal(moved.status, 200);
      const movedContact = await moved.json();
      assert.equal(movedContact.pipelineStage, "Proposal");
      assert.equal(movedContact.pipelineCustomStageId, id);
      const inbox = await (await f.request("agent", "/api/inbox")).json();
      assert.equal(inbox.find((row: any) => row.contact.id === "contact-a").contact.pipelineCustomStageId, id);
      const reopened = (await (await f.request("agent", contactPath)).json()).contact;
      assert.equal(inboxPipelineChoices(configuration.stages, reopened.pipelineStage, reopened.pipelineCustomStageId, false).value, id);
      // A board move to the mapped canonical column must clear the custom assignment.
      assert.equal((await f.request("agent", contactPath, "PATCH", { pipelineStage: "Proposal" })).status, 200);
      const movedBack = (await (await f.request("agent", contactPath)).json()).contact;
      assert.equal(movedBack.pipelineCustomStageId, null);
      assert.equal(inboxPipelineChoices(configuration.stages, movedBack.pipelineStage, movedBack.pipelineCustomStageId, false).value, "Proposal");
      assert.equal((await f.request("agent", contactPath, "PATCH", move)).status, 200);
      // A direct workflow/provider stage update clears a stale custom assignment.
      await f.database.update(schema.contacts).set({ pipelineStage: "Negotiation" }).where(eq(schema.contacts.id, "contact-a"));
      assert.equal((await f.storage.getContact("contact-a"))?.pipelineCustomStageId, null);
      assert.equal((await f.request("agent", contactPath, "PATCH", move)).status, 200);
      const remapped = configuration.stages.map((stage: any) => stage.id === id ? { ...stage, canonicalStage: "Closed" } : stage);
      assert.equal((await f.request("owner-a", path, "PATCH", { ...payload, revision: 3, stages: remapped }, owner.headers)).status, 400);
      // Removing the custom column preserves the contact's canonical stage. Old IDs cannot be reused.
      const removed = await f.request("owner-a", path, "PATCH", { ...payload, revision: 3, stages: defaultPipelineLayout() }, owner.headers);
      assert.equal(removed.status, 200);
      assert.equal((await f.storage.getContact("contact-a"))?.pipelineStage, "Proposal");
      assert.equal((await f.request("agent", contactPath, "PATCH", move)).status, 409);
      const recreated = await f.request("owner-a", path, "PATCH", { ...payload, revision: 4, stages: configuration.stages }, owner.headers);
      assert.equal(recreated.status, 200);
      assert.notEqual((await recreated.json()).stages[5].id, id);
      assert.equal((await f.request("owner-a", path, "PATCH", { ...payload, revision: 5, stages: defaultPipelineLayout() }, owner.headers)).status, 200);
      assert.equal((await f.request("owner-a", contactPath, "PATCH", { pipelineStage: "Lead" })).status, 200);
      const contact = await (await f.request("owner-a", contactPath)).json();
      assert.equal(contact.contact.pipelineStage, "Lead");
      assert.equal(contact.contact.pipelineCustomStageId, null);
    });
    await t.test("reply recommendation actions preserve Inbox data and reject foreign or stale writes", async () => {
      const id = "conv-recommendation";
      const path = "/api/conversations/" + id + "/reply-recommendation";
      const at = new Date("2026-11-26T12:00:00.000Z");
      await f.database.insert(schema.conversations).values({ id, userId: "owner-a", contactId: "contact-a", channel: "email", status: "open", unreadCount: 3, lastMessageDirection: "inbound", lastMessageAt: at, lastMessagePreview: "Can you send a quote?" });
      try {
        const payload = { action: "dismiss", messageAt: at.toISOString() };
        assert.equal((await fetch(f.origin + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })).status, 401);
        assert.equal((await f.request("owner-b", path, "POST", payload)).status, 404);
        assert.equal((await f.request("agent", path, "POST", { ...payload, action: "delete" })).status, 400);
        assert.equal((await f.request("agent", path, "POST", payload, { Origin: "https://foreign.example" })).status, 403);
        assert.equal((await f.request("agent", path, "POST", payload)).status, 200);
        const dismissed = await f.storage.getConversation(id);
        assert.equal(dismissed?.dismissedReplyMessageAt, at.toISOString());
        assert.equal(dismissed?.status, "open");
        assert.equal(dismissed?.unreadCount, 3);
        const next = new Date(at.getTime() + 1000);
        await f.database.update(schema.conversations).set({ lastMessageAt: next }).where(eq(schema.conversations.id, id));
        assert.equal((await f.request("agent", path, "POST", { ...payload, action: "resolve" })).status, 409);
        assert.equal((await f.storage.getConversation(id))?.status, "open");
        assert.equal((await f.request("agent", path, "POST", { action: "resolve", messageAt: next.toISOString() })).status, 200);
        assert.equal((await f.storage.getConversation(id))?.status, "resolved");
        assert.equal((await f.storage.getConversation(id))?.unreadCount, 3);
        assert.ok(await f.storage.getContact("contact-a"));
      } finally {
        await f.database.delete(schema.conversations).where(eq(schema.conversations.id, id));
      }
    });
    await t.test("passive email pipeline admission requires explicit authenticated stage edit", async () => {
      const path = "/api/contacts/contact-a";
      const before = await f.storage.getContact("contact-a");
      assert.ok(before);
      await f.database.update(schema.contacts).set({
        source: "email_inbox", sourceDetails: { inboxIdentity: true, contactLifecycle: "inbox_only" },
        pipelineStage: "Lead", tag: "New",
      }).where(eq(schema.contacts.id, "contact-a"));
      try {
        assert.equal((await f.request("owner-a", path, "PATCH", { sourceDetails: { pipelineManuallyAdded: true } })).status, 400);
        assert.equal((await f.request("owner-b", path, "PATCH", { pipelineStage: "Contacted" })).status, 404);
        assert.equal((await f.request("owner-a", path, "PATCH", { tag: "Warm" })).status, 200);
        const passive = (await f.storage.getContact("contact-a"))!;
        assert.equal((passive.sourceDetails as any)?.pipelineManuallyAdded, undefined);
        assert.equal(isSalesOpportunity(passive), false);
        assert.equal((await f.request("owner-a", path, "PATCH", { pipelineStage: "Contacted" })).status, 200);
        const updated = await f.storage.getContact("contact-a");
        assert.equal(updated?.pipelineStage, "Contacted");
        assert.equal((updated?.sourceDetails as any)?.pipelineManuallyAdded, true);
        assert.equal((updated?.sourceDetails as any)?.contactLifecycle, "inbox_only");
        assert.equal(updated?.source, "email_inbox");
      } finally {
        await f.database.update(schema.contacts).set({
          source: before.source, sourceDetails: before.sourceDetails, pipelineStage: before.pipelineStage, tag: before.tag,
        }).where(eq(schema.contacts.id, "contact-a"));
      }
    });
    await t.test("Owner assigns Support, Mine uses actor identity before recent limit, reassignment reaches both sessions", async () => {
      const ownerSocket=await f.socket("owner-a"), agentSocket=await f.socket("agent");
      assert.deepEqual(await (await f.request("agent","/api/inbox?mine=true")).json(),[]);
      assert.equal((await f.request("owner-a","/api/contacts/contact-a","PATCH",{assignedTo:"agent"})).status,200);
      await until(()=>ownerSocket.messages.some(m=>m.type==="contact_updated"&&m.contactId==="contact-a")&&agentSocket.messages.some(m=>m.type==="contact_updated"&&m.contactId==="contact-a"));
      assert.equal((await (await f.request("agent","/api/inbox?mine=true&assignedTo=owner-b")).json())[0].contact.id,"contact-a");
      assert.deepEqual(await (await f.request("owner-a","/api/inbox?mine=true")).json(),[]);
      assert.equal((await f.request("agent","/api/conversations/conv-a/messages")).status,200);
      // A newer unassigned contact cannot hide an older assignment under the recent limit.
      await f.database.insert(schema.contacts).values({id:"newer-unassigned",userId:"owner-a",name:"Newer",primaryChannel:"sms",updatedAt:new Date(Date.now()+86400000)});
      assert.equal((await (await f.request("agent","/api/inbox?mine=true&limit=1")).json())[0].contact.id,"contact-a");
      assert.equal((await (await f.request("agent","/api/inbox?mine=true&q=Customer")).json())[0].contact.id,"contact-a");
      assert.equal((await f.request("owner-a","/api/contacts/contact-a","PATCH",{assignedTo:"admin"})).status,200);
      assert.deepEqual(await (await f.request("agent","/api/inbox?mine=true")).json(),[]);
      assert.equal((await (await f.request("admin","/api/inbox?mine=true")).json())[0].contact.id,"contact-a");
      assert.equal((await f.request("owner-a","/api/contacts/contact-a","PATCH",{assignedTo:null})).status,200);
      await f.database.delete(schema.contacts).where(eq(schema.contacts.id,"newer-unassigned"));
      ownerSocket.ws.terminate();agentSocket.ws.terminate();
    });
    await t.test("shared channel status uses owner's connections and never returns credentials", async () => {
      await f.database.insert(schema.channelSettings).values({userId:"owner-a",channel:"sms",isEnabled:true,isConnected:true,config:{authToken:"SECRET_OWNER_TOKEN"}});
      await f.database.insert(schema.channelSettings).values({userId:"owner-b",channel:"telegram",isEnabled:true,isConnected:true,config:{botToken:"SECRET_FOREIGN_TOKEN"}});
      const status=await (await f.request("agent","/api/inbox/channel-status")).json();
      assert.equal(status.workspaceId,"owner-a");assert.equal(status.hasAnyMessagingChannel,true);
      assert.ok(!JSON.stringify(status).includes("TOKEN"));
      const health=await (await f.request("agent","/api/inbox/channel-health")).json();
      assert.equal(health.find((r:any)=>r.channel==="sms").isConnected,true);
      assert.ok(!health.some((r:any)=>r.channel==="telegram"&&r.isConnected));
      assert.ok(!JSON.stringify(health).includes("SECRET_"));
      const originalSettings=f.storage.getChannelSettings;
      f.storage.getChannelSettings=async()=>{throw new Error("SECRET_PROVIDER_FAILURE");};
      try {
        const failed=await f.request("agent","/api/inbox/channel-health");
        assert.equal(failed.status,500);assert.ok(!(await failed.text()).includes("SECRET_"));
      } finally {f.storage.getChannelSettings=originalSettings;}
      await f.database.update(schema.users).set({twilioConnected:true}).where(eq(schema.users.id,"owner-a"));
      assert.equal((await (await f.request("agent","/api/inbox/whatsapp-availability")).json()).available,true);
      await f.database.update(schema.users).set({twilioConnected:false}).where(eq(schema.users.id,"owner-a"));
      // Returning to personal context replaces channel and assignment data.
      assert.equal((await f.request("agent","/api/inbox/workspace","POST",{workspaceId:"agent"})).status,200);
      assert.equal((await (await f.request("agent","/api/inbox/channel-status")).json()).hasAnyMessagingChannel,false);
      assert.deepEqual(await (await f.request("agent","/api/inbox?mine=true")).json(),[]);
      assert.equal((await f.request("agent","/api/inbox/workspace","POST",{workspaceId:"owner-a"})).status,200);
    });
    await t.test("reply profiles require recorded actor and same-workspace membership evidence", async () => {
      await f.database.update(schema.users).set({avatarUrl:"/avatars/support.png"}).where(eq(schema.users.id,"agent"));
      const team=await (await f.request("agent","/api/team")).json();
      assert.equal(team.find((m:any)=>m.memberId==="agent").avatarUrl,"/avatars/support.png");
      for(const [id,actor,origin] of [["known-human","agent","human"],["known-ai",null,"ai_brain"],["historical",null,null],["foreign-actor","owner-b","human"]]) {
        await f.database.insert(schema.messages).values({id:String(id),conversationId:"conv-a",contactId:"contact-a",userId:"owner-a",direction:"outbound",content:"Unchanged customer content",sentByUserId:actor,generatedBy:origin});
      }
      const replies=await (await f.request("agent","/api/conversations/conv-a/messages")).json();
      assert.equal(replies.find((m:any)=>m.id==="known-human").sender.id,"agent");
      assert.equal(replies.find((m:any)=>m.id==="known-human").sender.avatarUrl,"/avatars/support.png");
      for(const id of ["known-ai","historical","foreign-actor"]) assert.equal(replies.find((m:any)=>m.id===id).sender,null);
      assert.equal((await f.request("owner-b","/api/conversations/conv-a/messages")).status,404);
      await f.database.delete(schema.messages).where(inArray(schema.messages.id,["known-human","known-ai","historical","foreign-actor"]));
    });
    await t.test("HTTP sends require a draft revision and reject stale or foreign reply context", async () => {
      const cookie=await f.login("agent");
      const send=async(body:any)=>fetch(f.origin+"/api/contacts/contact-a/send",{method:"POST",headers:{Cookie:cookie,Origin:f.origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
      const missing=await send({content:"Unsynchronized reply",channel:"sms"});assert.equal(missing.status,428);assert.equal((await missing.json()).code,"reply_context_required");
      const stale=await send({content:"Preserved draft",channel:"sms",sendAttemptId:randomUUID(),replyRevision:"stale",conversationId:"conv-a"});assert.equal(stale.status,409);assert.equal((await stale.json()).code,"reply_conflict");
      const foreign=await send({content:"Wrong room",channel:"sms",sendAttemptId:randomUUID(),replyRevision:"0/-",conversationId:"conv-b"});assert.equal(foreign.status,404);
      assert.equal((await f.request("owner-b","/api/contacts/contact-a/reply-state","POST",{channel:"sms",conversationId:"conv-a"})).status,404);
    });
    await t.test("actual persistence keeps teammate/AI metadata across all seven channel paths", async () => {
      const { channelService }=await import("../server/channelService");
      const { gmailEmailProvider }=await import("../server/emailChannel/gmailProvider");
      const { encryptEmailCredential }=await import("../server/emailChannel/credentials");
      const service=channelService as any;
      const originalDispatch=service.dispatchMessage;
      const originalGmail=gmailEmailProvider.sendNewEmail;
      const deliveries:any[]=[];
      service.dispatchMessage=async(workspace:string,channel:string,params:any)=>{deliveries.push({workspace,channel,params});return {success:true,externalMessageId:`fixture-${channel}-${Date.now()}`};};
      gmailEmailProvider.sendNewEmail=async params=>{deliveries.push({workspace:"owner-a",channel:"email",params});return {success:true,providerMessageId:`fixture-email-${Date.now()}`,providerThreadId:`fixture-thread-${Date.now()}`};};
      await f.database.insert(schema.contacts).values({id:"send-target",userId:"owner-a",name:"Send target",email:"customer@example.com",phone:"+15555550101",whatsappId:"15555550101",instagramId:"ig",facebookId:"fb",telegramId:"tg",webchatId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",primaryChannel:"sms"});
      await f.database.insert(schema.emailMailboxes).values({id:"shared-mailbox",workspaceUserId:"owner-a",connectedByUserId:"owner-a",emailAddress:"owner@example.com",provider:"gmail",accessTokenEncrypted:encryptEmailCredential("fixture-access-token"),tokenExpiresAt:new Date(Date.now()+3600000),syncStatus:"connected",isPrimary:true});
      try {
        // Actual registered route supplies actor; owner connection is used without personal setup.
        const response=await f.request("agent","/api/contacts/send-target/send","POST",{content:"SMS via shared workspace",channel:"sms",sentByUserId:"owner-b",generatedBy:"ai_brain"});
        assert.equal(response.status,200);
        const sms=await f.database.select().from(schema.messages).where(eq(schema.messages.contactId,"send-target"));
        assert.equal(sms[0].sentByUserId,"agent");assert.equal(sms[0].generatedBy,"human");
        assert.equal(deliveries[0].workspace,"owner-a");
        for(const channel of ["whatsapp","sms","instagram","facebook","telegram","webchat","email"] as const) {
          const result=await channelService.sendMessage({userId:"owner-a",contactId:"send-target",content:`Human reply ${channel}`,forceChannel:channel,sentByUserId:"agent",...(channel==="email"?{emailRich:{mailboxId:"shared-mailbox",replyMode:"new" as const,subject:"Team reply"}}:{})});
          assert.equal(result.success,true,`${channel}: ${result.error}`);
          const [row]=await f.database.select().from(schema.messages).where(eq(schema.messages.id,result.messageId!));
          assert.equal(row.userId,"owner-a");assert.equal(row.sentByUserId,"agent",channel);assert.equal(row.generatedBy,"human",channel);
          const payload=await (await f.request("agent",`/api/conversations/${row.conversationId}/messages`)).json();
          assert.equal(payload.find((m:any)=>m.id===row.id).sender.id,"agent");
        }
        // Native email automation must not invent the workspace owner as the human sender.
        const emailConv=await f.storage.getConversationByContactAndChannel("send-target","email");
        if(emailConv)await f.storage.updateConversation(emailConv.id,{aiControl:{paused:false,generationEpoch:100,generationLease:null}});
        const ai=await channelService.sendMessage({userId:"owner-a",contactId:"send-target",forceChannel:"email",content:"AI email",generatedBy:"ai_brain",emailRich:{mailboxId:"shared-mailbox",replyMode:"new",subject:"AI reply"}});
        assert.equal(ai.success,true,ai.error);
        const [row]=await f.database.select().from(schema.messages).where(eq(schema.messages.id,ai.messageId!));
        assert.equal(row.sentByUserId,null);assert.equal(row.generatedBy,"ai_brain");
      } finally {
        service.dispatchMessage=originalDispatch;gmailEmailProvider.sendNewEmail=originalGmail;
        const convs=await f.database.select().from(schema.conversations).where(eq(schema.conversations.contactId,"send-target"));
        const ids=convs.map(c=>c.id);
        const msgs=await f.database.select().from(schema.messages).where(eq(schema.messages.contactId,"send-target"));
        if(msgs.length) await f.database.delete(schema.emailMessageDetails).where(inArray(schema.emailMessageDetails.messageId,msgs.map(m=>m.id)));
        await f.database.delete(schema.activityEvents).where(eq(schema.activityEvents.contactId,"send-target"));
        await f.database.delete(schema.messages).where(eq(schema.messages.contactId,"send-target"));
        if(ids.length) await f.database.delete(schema.conversations).where(inArray(schema.conversations.id,ids));
        await f.database.delete(schema.contacts).where(eq(schema.contacts.id,"send-target"));
        await f.database.delete(schema.emailMailboxes).where(eq(schema.emailMailboxes.id,"shared-mailbox"));
      }
    });
    await t.test("shared WhatsApp template picker uses workspace library and rejects foreign contacts/templates", async () => {
      const { subscriptionService }=await import("../server/subscriptionService");
      const original=subscriptionService.getUserLimits;
      const checked:string[]=[];
      subscriptionService.getUserLimits=async id=>{checked.push(id);return {templatesEnabled:true} as any;};
      try {
        for(const owner of ["owner-a","owner-b"]) await f.database.insert(schema.messageTemplates).values({id:`template-${owner}`,userId:owner,twilioSid:`HX-${owner}`,name:`Template ${owner}`,bodyText:"Hello",category:"utility",status:"approved"});
        const templates=await (await f.request("agent","/api/inbox/templates")).json();
        assert.deepEqual(templates.map((t:any)=>t.id),["template-owner-a"]);
        assert.equal(checked.at(-1),"owner-a");
        assert.equal((await f.request("agent","/api/inbox/templates/send","POST",{templateId:"template-owner-a",contactId:"contact-b"})).status,404);
        assert.equal((await f.request("agent","/api/inbox/templates/send","POST",{templateId:"template-owner-a",chatId:"legacy-foreign",phone:"+15555550101"})).status,400);
        assert.equal((await f.request("agent","/api/inbox/templates/send","POST",{templateId:"template-owner-b",contactId:"contact-a"})).status,404);
        // Existing owner template management stays on the account's own library.
        assert.deepEqual(await (await f.request("agent","/api/templates")).json(),[]);
      } finally {subscriptionService.getUserLimits=original;}
    });
    await t.test("a stale read response cannot overwrite a newer workspace selection", async () => {
      assert.equal((await f.request("agent","/api/inbox/workspace","POST",{workspaceId:"agent"})).status,200);
      const slowRead=f.request("agent","/__hold-session");
      await until(()=>f.heldRead.started);
      try {
        assert.equal((await f.request("agent","/api/inbox/workspace","POST",{workspaceId:"owner-a"})).status,200);
      } finally {f.heldRead.release();await slowRead;}
      assert.equal((await (await f.request("agent","/api/inbox/workspaces")).json()).currentWorkspaceId,"owner-a");
    });
    await t.test("pending, inactive, unlinked email matches and outsiders confer no access", async () => {
      for (const actor of ["pending", "inactive", "unlinked", "owner-b"]) {
        assert.equal((await f.request(actor, "/api/conversations/conv-a/messages")).status, 404);
        assert.equal((await f.request(actor, "/api/contacts/contact-a/notes")).status, 404);
        assert.equal((await f.request(actor, "/api/inbox/workspace", "POST", { workspaceId: "owner-a" })).status, 403);
      }
      const pending = (await f.database.select().from(schema.teamMembers).where(eq(schema.teamMembers.id, "pending")))[0];
      assert.equal(pending.status, "pending"); // Reading/logging in never accepts invitations.
    });
    await t.test("native email details use the same authorized workspace without exposing integration credentials", async () => {
      assert.equal((await f.request("agent","/api/messages/message-a/email-details")).status,200);
      assert.equal((await f.request("agent","/api/messages/message-b/email-details")).status,403);
      assert.equal((await f.request("owner-b","/api/messages/message-a/email-details")).status,403);
      const memberStatus=await (await f.request("agent","/api/integrations/email/status")).json();
      assert.ok(!JSON.stringify(memberStatus).includes("owner-a"));
    });
    await t.test("invitation creation remains pending and cannot accept client-supplied ownership or membership links", async () => {
      const { subscriptionService } = await import("../server/subscriptionService");
      const original = subscriptionService.getUserLimits;
      subscriptionService.getUserLimits = async () => ({ maxUsers: -1 } as any);
      try {
        const response = await f.request("owner-a", "/api/team", "POST", { email: "owner-b@example.com", ownerId: "owner-b", memberId: "owner-b", status: "active" });
        assert.equal(response.status,200);
        const invitation = await response.json();
        assert.equal(invitation.ownerId,"owner-a"); assert.equal(invitation.memberId,null); assert.equal(invitation.status,"pending");
        assert.equal((await f.request("owner-b","/api/conversations/conv-a/messages")).status,404);
        assert.equal((await f.request("agent","/api/team/admin","PATCH",{role:"admin"})).status,403);
        assert.equal((await f.request("owner-a","/api/team/admin","PATCH",{role:"owner"})).status,400);
        assert.equal((await f.request("owner-a","/api/team/admin","PATCH",{status:"unexpected"})).status,400);
      } finally { subscriptionService.getUserLimits=original; }
    });
    await t.test("explicit session selection validates access; ambiguous and established owners retain personal access", async () => {
      assert.deepEqual(await (await f.request("multi", "/api/inbox")).json(), []);
      assert.equal((await f.request("multi", "/api/inbox/workspace", "POST", { workspaceId: "owner-a" })).status, 200);
      assert.equal((await f.request("multi", "/api/conversations/conv-a/messages")).status, 200);
      assert.equal((await f.request("multi", "/api/conversations/conv-b/messages")).status, 404);
      assert.equal((await f.request("owner-b", "/api/inbox/workspace", "POST", { workspaceId: "owner-a" })).status, 403);
      assert.equal((await f.request("agent", "/api/inbox/workspace", "POST", { workspaceId: "owner-a" }, { Origin: "https://evil.example" })).status, 403);
      await f.database.insert(schema.teamMembers).values({id:"owner-a-team",ownerId:"owner-b",memberId:"owner-a",email:"owner-a@example.com",status:"active",role:"member"});
      const own = await (await f.request("owner-a", "/api/inbox")).json(); assert.equal(own[0].contact.id, "contact-a");
    });
    await t.test("contact PATCH rejects ownership/provenance/actor changes and unrelated/inactive assignees", async () => {
      for (const body of [{userId:"owner-b"},{id:"other"},{source:"shopify"},{webchatId:"other"},{automationsPausedByUserId:"owner-b"}]) {
        assert.equal((await f.request("owner-a", "/api/contacts/contact-a", "PATCH", body)).status, 400);
      }
      for (const assignedTo of ["owner-b", "pending", "inactive", "unlinked", "nonexistent"]) {
        assert.equal((await f.request("owner-a", "/api/contacts/contact-a", "PATCH", {assignedTo})).status, 400);
      }
      assert.equal((await f.request("agent", "/api/contacts/contact-b", "PATCH", {notes:"foreign"})).status, 404);
      const contact = await f.storage.getContact("contact-a"); assert.equal(contact!.userId, "owner-a");
    });
    await t.test("shared read responses exclude inconsistent foreign child rows", async () => {
      await f.database.insert(schema.conversations).values({id:"foreign-child",userId:"owner-b",contactId:"contact-a",channel:"sms"});
      await f.database.insert(schema.messages).values({id:"foreign-message",userId:"owner-b",contactId:"contact-a",conversationId:"conv-a",direction:"inbound",content:"Must stay private"});
      const contact=await (await f.request("agent","/api/contacts/contact-a")).json();
      assert.ok(!contact.conversations.some((c: any)=>c.id==="foreign-child"));
      const messages=await (await f.request("agent","/api/conversations/conv-a/messages")).json();
      assert.ok(!messages.some((m: any)=>m.id==="foreign-message"));
      await f.database.insert(schema.messages).values({id:"foreign-outbound",userId:"owner-b",contactId:"contact-a",conversationId:"conv-a",direction:"outbound",content:"Private foreign reply"});
      const state=await (await f.request("agent","/api/contacts/contact-a/reply-state","POST",{channel:"sms",conversationId:"conv-a"})).json();
      assert.ok(!JSON.stringify(state).includes("Private foreign reply"));
      assert.notEqual(state.latestMessageId,"foreign-outbound");
      assert.equal((await f.request("agent","/api/media/proxy?messageId=foreign-message")).status,404);
      const inbox=await (await f.request("agent","/api/inbox")).json();
      assert.ok(!JSON.stringify(inbox).includes("foreign-child"));
    });
    await t.test("owners/admins can assign; members can only claim/release unassigned or their own work", async () => {
      assert.equal((await f.request("agent", "/api/contacts/contact-a", "PATCH", {assignedTo:"admin"})).status, 403);
      assert.equal((await f.request("agent", "/api/contacts/contact-a", "PATCH", {assignedTo:"agent"})).status, 200);
      assert.equal((await f.request("agent", "/api/contacts/contact-a", "PATCH", {assignedTo:null})).status, 200);
      assert.equal((await f.request("owner-a", "/api/contacts/contact-a", "PATCH", {assignedTo:"admin"})).status, 200);
      assert.equal((await f.request("agent", "/api/contacts/contact-a", "PATCH", {assignedTo:"agent"})).status, 403);
      assert.equal((await f.request("admin", "/api/contacts/contact-a", "PATCH", {assignedTo:"agent"})).status, 200);
      // SQL rechecks membership even if revocation happened after request authorization.
      await f.database.update(schema.teamMembers).set({status:"inactive"}).where(eq(schema.teamMembers.id,"admin"));
      assert.equal(await f.storage.updateContact("contact-a",{assignedTo:null},{expectedWorkspaceUserId:"owner-a",expectedActorUserId:"admin",skipAutomationHooks:true}),undefined);
      assert.equal(await f.storage.updateContact("contact-a",{assignedTo:"inactive"},{expectedWorkspaceUserId:"owner-a",expectedActorUserId:"owner-a",skipAutomationHooks:true}),undefined);
      await f.database.update(schema.teamMembers).set({status:"active"}).where(eq(schema.teamMembers.id,"admin"));
    });
    await t.test("SQL prevents a stale member claim from replacing another member's assignment", async () => {
      await f.storage.updateContact("contact-a",{assignedTo:null},{expectedWorkspaceUserId:"owner-a",expectedActorUserId:"owner-a",skipAutomationHooks:true});
      const claims=await Promise.all(["agent","multi"].map(actor=>f.storage.updateContact("contact-a",{assignedTo:actor},{expectedWorkspaceUserId:"owner-a",expectedActorUserId:actor,skipAutomationHooks:true})));
      assert.equal(claims.filter(Boolean).length,1);
    });
    await t.test("shared send authorization preserves workspace credentials and the authenticated actor", async () => {
      const { channelService }=await import("../server/channelService"); const original=channelService.sendMessage;
      const calls: any[]=[];
      channelService.sendMessage=async params=>{calls.push(params);return {success:true,channel:"sms"};};
      try {
        assert.equal((await f.request("agent","/api/contacts/contact-a/send","POST",{content:"Reply",channel:"sms",userId:"owner-b",sentByUserId:"owner-b"})).status,200);
        assert.equal(calls[0].userId,"owner-a");assert.equal(calls[0].sentByUserId,"agent");
      } finally {channelService.sendMessage=original;}
    });
    let noteId: string;
    await t.test("notes preserve actual actor and require workspace, contact binding and edit permissions", async () => {
      const response = await f.request("agent", "/api/contacts/contact-a/notes", "POST", {content:"Team note",createdByUserId:"owner-b"});
      assert.equal(response.status,200);
      const note = await response.json(); noteId=note.id; assert.equal(note.createdByUserId,"agent"); assert.equal(note.workspaceId,"owner-a");
      assert.equal((await f.request("owner-a",`/api/contacts/contact-a/notes/${noteId}`,"PATCH",{content:"Owner edit"})).status,200);
      assert.equal((await f.request("owner-b",`/api/contacts/contact-a/notes/${noteId}`,"PATCH",{content:"foreign"})).status,404);
      assert.equal((await f.request("owner-a",`/api/contacts/contact-b/notes/${noteId}`,"DELETE")).status,404);
      assert.equal((await f.request("admin","/api/contacts/contact-a/notes")).status,200);
    });
    await t.test("all four actual content routes enforce the actor budget before resource access", async () => {
      const { INBOX_CONTENT_READ_LIMIT, INBOX_CONTENT_WINDOW_MS } = await import("../server/inboxContentRateLimit");
      const { consumeRateLimit, __resetRateLimitMemoryForTests } = await import("../server/rateLimitMiddleware");
      const realNow = Date.now;
      const now = realNow(); Date.now = () => now;
      __resetRateLimitMemoryForTests();
      try {
        // Set up an exhausted real counter; requests still traverse actual session/route middleware.
        const key = `ratelimit:inbox-content-read:user:agent:${Math.floor(now / INBOX_CONTENT_WINDOW_MS)}`;
        for (let i = 0; i < INBOX_CONTENT_READ_LIMIT; i++) await consumeRateLimit(key, INBOX_CONTENT_READ_LIMIT, INBOX_CONTENT_WINDOW_MS);
        for (const path of ["/api/media/proxy?messageId=message-a", "/api/messages/message-a/email-inline?cid=image",
          "/api/messages/message-a/email-attachment?attachmentId=file", "/api/messages/message-a/email-details"]) {
          const response = await f.request("agent", path);
          assert.equal(response.status, 429, path);
          assert.ok(Number(response.headers.get("retry-after")) > 0);
          assert.equal((await response.json()).limiter, "inbox-content-read");
        }
        assert.equal((await f.request("owner-a", "/api/messages/message-a/email-details")).status, 200);
      } finally { Date.now = realNow; __resetRateLimitMemoryForTests(); }
    });
    await t.test("socket upgrade rejects absent/tampered sessions and cross-origin requests", async () => {
      await assert.rejects(f.socket(), /401/);
      await assert.rejects(f.socket("owner-a",{Origin:"https://evil.example"}), /403/);
      await assert.rejects(f.socket("owner-a",{Cookie:"connect.sid=s%3Aforged.bad-signature"}), /401/);
    });
    await t.test("socket identity is server-derived and unauthorized join/typing cannot subscribe", async () => {
      const agent = await f.socket("agent");
      agent.send({type:"auth",userId:"agent",userName:"Forged Display"}); await until(()=>agent.messages.some(x=>x.type==="auth_success"));
      agent.send({type:"join_chat",chatId:"conv-b"}); await until(()=>agent.messages.some(x=>x.code==="forbidden_room"));
      agent.send({type:"typing",chatId:"conv-b"});
      agent.send({type:"join_chat",chatId:"conv-a"}); await until(()=>agent.messages.some(x=>x.type==="presence_update"));
      const viewers=agent.messages.find(x=>x.type==="presence_update").viewers; assert.equal(viewers[0].userId,"agent"); assert.equal(viewers[0].userName,"Name agent");
      const forged = await f.socket("agent"); const closed=once(forged.ws,"close");
      forged.send({type:"auth",userId:"owner-b"}); assert.equal((await closed)[0],1008);
      const workspaceForgery=await f.socket("agent");const workspaceClosed=once(workspaceForgery.ws,"close");
      workspaceForgery.send({type:"auth",workspaceId:"owner-b"});assert.equal((await workspaceClosed)[0],1008);
    });
    await t.test("presence aggregates tabs and typing expires without a stop frame", async () => {
      await f.database.insert(schema.conversations).values({id:"conv-presence",userId:"owner-a",contactId:"contact-a",channel:"sms"});
      const owner=await f.socket("owner-a"), first=await f.socket("agent"),second=await f.socket("agent");
      for(const socket of [owner,first,second])socket.send({type:"join_chat",chatId:"conv-presence"});
      const viewers=()=>owner.messages.filter(m=>m.type==="presence_update"&&m.chatId==="conv-presence").at(-1)?.viewers||[];
      await until(()=>viewers().length===2);
      assert.equal(viewers().filter((v:any)=>v.userId==="agent").length,1);
      first.send({type:"typing",chatId:"conv-presence"});second.send({type:"typing",chatId:"conv-presence"});
      await until(()=>viewers().find((v:any)=>v.userId==="agent")?.isTyping===true);
      first.send({type:"stop_typing",chatId:"conv-presence"});first.send({type:"heartbeat"});await until(()=>first.messages.some(m=>m.type==="heartbeat_ack"));
      assert.equal(viewers().find((v:any)=>v.userId==="agent")?.isTyping,true);
      await new Promise(resolve=>setTimeout(resolve,5700));
      await until(()=>viewers().find((v:any)=>v.userId==="agent")?.isTyping===false);
      first.ws.close();await once(first.ws,"close");
      assert.equal(viewers().filter((v:any)=>v.userId==="agent").length,1);
      second.ws.close();await once(second.ws,"close");await until(()=>!viewers().some((v:any)=>v.userId==="agent"));
      owner.ws.close();await once(owner.ws,"close");
    });
    await t.test("socket sessions cannot retain the old user after Passport identity is removed", async () => {
      const socket=await f.socket("admin");const closed=once(socket.ws,"close");
      await f.request("admin","/__forget-user","POST");
      socket.send({type:"heartbeat"});assert.equal((await closed)[0],1008);
    });
    await t.test("email invitation to separate existing/new logins, acceptance, reuse, resend and revocation", async () => {
      const { subscriptionService } = await import("../server/subscriptionService");
      const { invitationToken } = await import("../server/teamInvitations");
      const originalLimits = subscriptionService.getUserLimits;
      const originalFetch = globalThis.fetch;
      const sent: any[] = [];
      let mailFails = false;
      globalThis.fetch = async (input, init) => {
        if (String(input) === "https://api.resend.com/emails") {
          sent.push(JSON.parse(String(init?.body)));
          return new Response(mailFails ? "failed" : JSON.stringify({id:"fixture"}), {status:mailFails ? 503 : 200});
        }
        return originalFetch(input, init);
      };
      subscriptionService.getUserLimits = async () => ({maxUsers:-1} as any);
      const tokenFromMail = () => sent.at(-1).text.match(/team-invitation#([a-zA-Z0-9_.-]+)/)[1];
      const accept = (actor: string, token: string, extra: any = {}) => f.request(actor,"/api/team/invitations/accept","POST",{token,...extra});
      try {
        assert.equal((await fetch(f.origin+"/api/team/invitations/accept", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:"invalid"})})).status,401);
        assert.equal((await f.request("owner-a","/api/team","POST",{email:"csrf@example.com"},{Origin:"https://foreign.example"})).status,403);
        const beforeContacts = await f.database.select().from(schema.contacts);
        const beforeMessages = await f.database.select().from(schema.messages);
        const beforeNotes = await f.database.select().from(schema.contactNotes);
        assert.equal((await f.request("owner-a","/api/team","POST",{email:"not an email"})).status,400);
        assert.equal((await f.request("owner-a","/api/team","POST",{email:" OWNER-A@example.com "})).status,409);
        const issued = await f.request("owner-a","/api/team","POST",{email:" Employee@example.com ",role:"member",ownerId:"owner-b",memberId:"owner-b",status:"active"});
        const invite = await issued.json(); assert.equal(issued.status,200); assert.equal(invite.deliveryStatus,"sent");
        assert.equal(invite.ownerId,"owner-a"); assert.equal(invite.memberId,null);
        const token = tokenFromMail();
        // The same signature cannot be transplanted to another membership row/workspace.
        const [foreignInvite] = await f.database.insert(schema.teamMembers).values({ownerId:"owner-b",email:"employee@example.com",status:"pending",role:"member"}).returning();
        assert.equal((await accept("owner-b",`${foreignInvite.id}.${token.split(".")[1]}`)).status,410);
        assert.ok(sent.at(-1).html.includes("/team-invitation#"));
        assert.ok(!JSON.stringify(invite).includes(token));
        assert.equal((await f.request("owner-a",`/api/team/${invite.id}`,"PATCH",{status:"active"})).status,409);
        assert.equal((await f.request("owner-a","/api/team","POST",{email:"employee@EXAMPLE.com"})).status,409);
        assert.equal((await accept("owner-b",token)).status,403);
        assert.equal((await accept("owner-a",token)).status,403);
        assert.equal((await accept("agent",token.slice(0,-1)+"!")).status,410);
        assert.equal((await f.request("owner-b",`/api/team/${invite.id}/resend`,"POST")).status,404);
        // New registration uses the existing auth/verification system. No workspace or data is created here.
        await f.database.insert(schema.users).values({id:"employee",name:"Employee",email:"employee@example.com",password:"unused",emailVerifiedAt:null});
        assert.equal((await accept("employee",token)).status,403);
        await f.database.update(schema.users).set({emailVerifiedAt:new Date()}).where(eq(schema.users.id,"employee"));
        const preview = await f.request("employee","/api/team/invitations/preview","POST",{token});
        assert.equal(preview.status,200); assert.equal((await preview.json()).workspaceName,"Name owner-a");
        assert.equal((await f.request("employee","/api/conversations/conv-a/messages")).status,404);
        assert.equal((await accept("employee",token,{workspaceId:"owner-b",role:"admin"})).status,200);
        assert.equal((await accept("employee",token)).status,410);
        const rows = await (await f.request("employee","/api/inbox")).json();
        assert.deepEqual(rows.map((r:any)=>r.contact.id),["contact-a"]);
        assert.equal((await f.request("employee","/api/contacts/contact-a/notes")).status,200);
        assert.equal((await f.request("employee","/api/conversations/conv-b/messages")).status,404);
        const createdNote = await (await f.request("employee","/api/contacts/contact-a/notes","POST",{content:"Separate login note"})).json();
        assert.equal(createdNote.createdByUserId,"employee"); assert.equal(createdNote.workspaceId,"owner-a");
        assert.equal((await f.request("employee",`/api/contacts/contact-a/notes/${createdNote.id}`,"DELETE")).status,200);
        assert.equal((await f.request("employee","/api/contacts/contact-a","PATCH",{assignedTo:"owner-b"})).status,400);
        const { channelService } = await import("../server/channelService");
        const originalSend = channelService.sendMessage;
        const sends: any[] = [];
        channelService.sendMessage=async params=>{sends.push(params);return {success:true,channel:params.forceChannel||"sms"};};
        try {
          for (const channel of ["whatsapp","sms","instagram","facebook","telegram","webchat","email"]) {
            const response = await f.request("employee","/api/contacts/contact-a/send","POST",{content:"Team reply",channel});
            assert.equal(response.status,200,channel);
            assert.equal(sends.at(-1).userId,"owner-a"); assert.equal(sends.at(-1).sentByUserId,"employee");
            assert.equal(sends.at(-1).forceChannel,channel);
          }
        } finally { channelService.sendMessage=originalSend; }
        assert.equal((await f.request("employee",`/api/team/${invite.id}`,"DELETE")).status,403);
        assert.equal((await f.request("employee","/api/inbox/workspace","POST",{workspaceId:"owner-b"})).status,403);
        const workspaceList = await (await f.request("employee","/api/inbox/workspaces")).json();
        assert.equal(workspaceList.currentWorkspaceId,"owner-a");
        assert.equal(workspaceList.workspaces.find((w:any)=>w.id==="owner-a").role,"member");
        assert.equal((await f.request("owner-a",`/api/team/${invite.id}`,"DELETE")).status,200);
        assert.equal((await f.request("employee","/api/inbox")).status,403);
        assert.equal((await accept("employee",token)).status,410);
        assert.equal((await f.request("employee","/api/inbox/workspace","POST",{workspaceId:"employee"})).status,200);
        // Existing account accepts a second invitation; resend invalidates the first email.
        mailFails = true;
        const reissued = await (await f.request("owner-a","/api/team","POST",{email:"employee@example.com",role:"admin"})).json();
        assert.equal(reissued.deliveryStatus,"failed"); const oldToken = tokenFromMail();
        mailFails = false;
        assert.equal((await f.request("owner-a",`/api/team/${reissued.id}/resend`,"POST")).status,200);
        const newToken = tokenFromMail(); assert.notEqual(newToken,oldToken);
        assert.equal((await accept("employee",oldToken)).status,410);
        // A legacy conflicting linked row must not be silently overridden.
        await f.database.insert(schema.teamMembers).values({id:"legacy-conflict",ownerId:"owner-a",memberId:"employee",email:"old-identity@example.com",status:"inactive",role:"member"});
        assert.equal((await accept("employee",newToken)).status,409);
        await f.database.delete(schema.teamMembers).where(eq(schema.teamMembers.id,"legacy-conflict"));
        const results = await Promise.all([accept("employee",newToken),accept("employee",newToken)]);
        assert.deepEqual(results.map(r=>r.status).sort(),[200,410]);
        assert.equal((await (await f.request("employee","/api/inbox/workspaces")).json()).currentWorkspaceId,"owner-a");
        assert.equal((await f.request("owner-a",`/api/team/${reissued.id}`,"PATCH",{status:"pending"})).status,409);
        assert.equal((await f.request("owner-a",`/api/team/${reissued.id}`,"PATCH",{status:"inactive"})).status,200);
        assert.equal((await f.request("employee","/api/inbox")).status,403);
        assert.equal((await accept("employee",newToken)).status,410);
        // Nothing is reparented, copied or rewritten by invitation/acceptance/revocation.
        assert.deepEqual(await f.database.select().from(schema.contacts),beforeContacts);
        assert.deepEqual(await f.database.select().from(schema.messages),beforeMessages);
        assert.deepEqual(await f.database.select().from(schema.contactNotes),beforeNotes);
        // Creation serializes concurrent email/seat checks under the existing owner row lock.
        const { issueTeamInvitation } = await import("../server/teamInvitations");
        const duplicate = await Promise.allSettled([issueTeamInvitation("owner-a",{email:"race@example.com"}),issueTeamInvitation("owner-a",{email:" RACE@example.com "})]);
        assert.equal(duplicate.filter(r=>r.status==="fulfilled").length,1);
        const current = await f.storage.getTeamMemberCount("owner-a");
        subscriptionService.getUserLimits=async()=>({maxUsers:current+1,plan:"starter"} as any);
        const seats=await Promise.allSettled([issueTeamInvitation("owner-a",{email:"seat-one@example.com"}),issueTeamInvitation("owner-a",{email:"seat-two@example.com"})]);
        assert.equal(seats.filter(r=>r.status==="fulfilled").length,1);
        // An expired capability fails even when correctly signed for the current row.
        await f.database.insert(schema.teamMembers).values({id:"expired-invite",ownerId:"owner-a",email:"employee@example.com",role:"member",status:"pending",invitedAt:new Date(Date.now()-8*86400000)});
        const [expired] = await f.database.select().from(schema.teamMembers).where(eq(schema.teamMembers.id,"expired-invite"));
        assert.equal((await accept("employee",invitationToken(expired))).status,410);
      } finally { subscriptionService.getUserLimits=originalLimits; globalThis.fetch=originalFetch; }
    });
    await t.test("invitation attempts are actually throttled and budgets are separate for each login", async () => {
      let response: Response | undefined;
      for (let i=0;i<31;i++) {
        response = await f.request("employee","/api/team/invitations/accept","POST",{token:"invalid"});
        if (response.status===429) break;
      }
      assert.equal(response?.status,429);
      assert.ok(Number(response?.headers.get("retry-after"))>0);
      assert.notEqual((await f.request("owner-b","/api/team/invitations/accept","POST",{token:"invalid"})).status,429);
    });
    await t.test("notifications reach only current authorized sessions; revocation and logout remove access", async () => {
      const agent=await f.socket("agent"), owner=await f.socket("owner-a"), foreign=await f.socket("owner-b");
      f.notifyUser("owner-a",{type:"new_message",conversationId:"conv-a",marker:"allowed"});
      await until(()=>agent.messages.some(x=>x.marker==="allowed")&&owner.messages.some(x=>x.marker==="allowed"));
      f.notifyUser("owner-b",{type:"new_message",marker:"private-b"});
      await until(()=>foreign.messages.some(x=>x.marker==="private-b"));assert.ok(!agent.messages.some(x=>x.marker==="private-b"));
      f.notifyUser("owner-a",{type:"billing_private",marker:"account-only"});await until(()=>owner.messages.some(x=>x.marker==="account-only"));assert.ok(!agent.messages.some(x=>x.marker==="account-only"));
      const closed=once(agent.ws,"close");
      assert.equal((await f.request("owner-a","/api/team/agent","PATCH",{status:"inactive"})).status,200);
      await closed;
      assert.equal((await f.request("agent","/api/conversations/conv-a/messages")).status,403);
      assert.equal((await f.request("agent",`/api/contacts/contact-a/notes/${noteId}`,"PATCH",{content:"revoked"})).status,403);
      // A previously selected workspace cannot fall back into access after membership is removed.
      await f.database.delete(schema.teamMembers).where(eq(schema.teamMembers.id,"multi-a"));
      assert.equal((await f.request("multi","/api/inbox")).status,403);
      const logout=once(foreign.ws,"close"); await f.request("owner-b","/__logout","POST");
      f.notifyUser("owner-b",{type:"new_message",marker:"after-logout"}); await logout;
      assert.ok(!foreign.messages.some(x=>x.marker==="after-logout"));
    });
  } finally { await f.close(); }
});

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import session from "express-session";
import { createServer } from "node:http";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { WebSocket } from "ws";
import { rateLimit } from "express-rate-limit";
import * as schema from "../shared/schema";

// All database calls below use isolated in-memory PostgreSQL. No provider is invoked.
process.env.DATABASE_URL ||= "postgresql://fixture:fixture@127.0.0.1:1/unused";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "synthetic-test-key";
process.env.SESSION_SECRET = "inbox-security-test-session-secret";
process.env.EMAIL_IMAGE_PROXY_SECRET = "synthetic-inbox-email-image-secret-00000";
process.env.STRIPE_SECRET_KEY = "sk_test_synthetic";
process.env.NODE_ENV = "test";
process.env.RESEND_API_KEY = "synthetic-team-mail-key";

async function fixture() {
  const pg = new PGlite();
  const database = drizzle(pg);
  const dialect = new PgDialect();
  const quote = (x: string) => '"' + x.replaceAll('"', '""') + '"';
  for (const table of [schema.users, schema.teamMembers, schema.contacts, schema.conversations,
    schema.messages, schema.activityEvents, schema.channelSettings, schema.chats, schema.contactNotes,
    schema.prospectIntelligence, schema.prospectOutreachQueueItems, schema.campaignEnrollments,
    schema.appointments, schema.integrations, schema.emailMailboxes, schema.emailMessageDetails]) {
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
  const { db } = await import("../drizzle/db");
  const original = new Map<string, any>();
  for (const method of ["select", "selectDistinct", "insert", "update", "delete", "execute", "transaction"]) {
    original.set(method, (db as any)[method]);
    (db as any)[method] = (database as any)[method].bind(database);
  }
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
  const app = express(); app.use(express.json());
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
  return { database, storage, request, login, cookies, socket, origin, notifyUser,
    async close() {
      sockets.forEach(ws => ws.terminate());
      await new Promise<void>(resolve => wss.close(() => resolve()));
      await new Promise<void>(resolve => server.close(() => resolve()));
      for (const [method, value] of original) (db as any)[method] = value;
      await pg.close();
    },
  };
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error("Timed out waiting for server result"); await new Promise(r => setTimeout(r, 5)); }
}

test("Inbox team security through real session-backed HTTP, WebSockets and SQL", { timeout: 60_000 }, async t => {
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

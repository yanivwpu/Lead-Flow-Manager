import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { once } from "node:events";
import { WebSocket } from "ws";
import { Pool } from "pg";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import * as tables from "../shared/schema";
import { prepareDbTestEnvironment } from "./helpers/dbTestGuard";

// Actual independent PostgreSQL sessions/processes. Never silently use DATABASE_URL.
test(
  "PostgreSQL send claims, provider uncertainty, tenant scope and cross-process events",
  { skip: !process.env.TEST_DATABASE_URL, timeout: 120000 },
  async (t) => {
    const configured = prepareDbTestEnvironment("Inbox PostgreSQL concurrency");
    const admin = new Pool({ connectionString: configured.databaseUrl });
    const schemaName = `codex_inbox_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
    const url = new URL(configured.databaseUrl);
    url.searchParams.set("options", `-c search_path=${schemaName},public`);
    process.env.DATABASE_URL = url.toString();
    process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "synthetic-test-key";
    process.env.SESSION_SECRET = "synthetic-pg-presence-session-secret";
    process.env.STRIPE_SECRET_KEY = "sk_test_synthetic";
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const children: Array<ReturnType<typeof fork>> = [];
    const workers: Array<{
      child: ReturnType<typeof fork>;
      request: (data: any) => Promise<any>;
      events: any[];
      wait: (kind: string) => Promise<any>;
    }> = [];
    const waitUntil = async (predicate: () => boolean, timeoutMs = 10000) => {
      const deadline = Date.now() + timeoutMs;
      while (!predicate()) {
        if (Date.now() > deadline) throw new Error("test barrier timeout");
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    try {
      const dialect = new PgDialect();
      const quote = (v: string) => '"' + v.replaceAll('"', '""') + '"';
      for (const table of [
        tables.users,
        tables.contacts,
        tables.conversations,
        tables.messages,
        tables.teamMembers,
        tables.chats,
        tables.integrations,
        tables.channelSettings,
      ]) {
        const config = getTableConfig(table);
        const cols = config.columns.map((c) => {
          let text = quote(c.name) + " " + c.getSQLType();
          if (c.primary) text += " PRIMARY KEY";
          if (c.default !== undefined) {
            const v = c.default;
            text +=
              " DEFAULT " +
              (v && typeof v === "object" && "getSQL" in v
                ? dialect.sqlToQuery((v as any).getSQL()).sql
                : typeof v === "string"
                  ? "'" + v.replaceAll("'", "''") + "'"
                  : String(v));
          }
          return text;
        });
        await pool.query(
          `CREATE TABLE ${quote(config.name)} (${cols.join(",")})`,
        );
      }
      const { ensureInboxCollaborationSchema } =
        await import("../server/inboxCollaborationSchema");
      await ensureInboxCollaborationSchema();
      await ensureInboxCollaborationSchema();
      await pool.query(
        "CREATE TABLE codex_provider_deliveries(attempt_id text NOT NULL)",
      );
      await pool.query(
        "INSERT INTO users(id,name,email,email_verified_at) VALUES ('owner','Owner','owner@example.com',now()),('support','Support','support@example.com',now()),('outsider','Other','other@example.com',now())",
      );
      await pool.query(
        "INSERT INTO team_members(id,owner_id,member_id,email,role,status) VALUES ('member','owner','support','support@example.com','member','active')",
      );
      await pool.query(
        "INSERT INTO contacts(id,user_id,name,primary_channel) VALUES ('customer','owner','Customer','sms')",
      );
      await pool.query(
        "INSERT INTO conversations(id,user_id,contact_id,channel) VALUES ('sms','owner','customer','sms'),('mail-a','owner','customer','email'),('mail-b','owner','customer','email'),('ai','owner','customer','webchat')",
      );
      async function worker() {
        const child = fork(
          new URL("./helpers/inboxCollaborationProcess.ts", import.meta.url),
          [],
          {
            execArgv: ["--import", "tsx"],
            env: {
              ...process.env,
              TEST_DATABASE_URL: process.env.DATABASE_URL,
              NODE_ENV: "test",
            },
            stdio: ["ignore", "ignore", "pipe", "ipc"],
          },
        );
        children.push(child);
        const events: any[] = [];
        const pending = new Map<string, (v: any) => void>();
        child.on("message", (message: any) => {
          events.push(message);
          if (message.id && pending.has(message.id) && !message.event) {
            pending.get(message.id)!(message);
            pending.delete(message.id);
          }
        });
        child.stderr?.on("data", (data) => process.stderr.write(data));
        await waitUntil(() => events.some((e) => e.event === "ready"), 30000);
        const w = {
          child,
          events,
          request: (data: any) =>
            new Promise<any>((resolve) => {
              const id = randomUUID();
              pending.set(id, resolve);
              child.send({ ...data, id });
            }),
          wait: async (kind: string) => {
            await waitUntil(() => events.some((e) => e.event === kind));
            return events.find((e) => e.event === kind);
          },
        };
        workers.push(w);
        return w;
      }
      const a = await worker(),
        b = await worker();
      const { replyState } = await import("../server/inboxSendCoordination");
      const target = {
        workspaceId: "owner",
        contactId: "customer",
        channel: "sms",
        conversationId: "sms",
      };
      const initial = (await replyState(target)).revision;
      const request = (
        actorId: string,
        content: string,
        revision: string,
        attemptId = randomUUID(),
        extra = {},
      ) => ({
        ...target,
        actorId,
        payload: { content },
        revision,
        attemptId,
        ...extra,
      });
      let sent: any, first: any;
      await t.test('historical Web Chat reply and teammate typing do not collide; missing baseline is identified separately', async()=>{
        await pool.query("INSERT INTO contacts(id,user_id,name,primary_channel) VALUES ('history-customer','owner','History fixture','webchat')");
        await pool.query("INSERT INTO conversations(id,user_id,contact_id,channel) VALUES ('history-chat','owner','history-customer','webchat')");
        await pool.query("INSERT INTO messages(id,user_id,contact_id,conversation_id,direction,status,content,generated_by,created_at) VALUES ('historical-reply','owner','history-customer','history-chat','outbound','sent','Historical fixture','human',now()-interval '1 day')");
        const history={workspaceId:'owner',contactId:'history-customer',channel:'webchat',conversationId:'history-chat'};
        const baseline=await replyState(history);
        assert.equal(baseline.revision,'0/historical-reply');
        await pool.query("INSERT INTO inbox_presence_sessions(id,workspace_id,actor_id,room_id,expires_at,typing_until) VALUES ('view-owner','owner','owner','history-chat',now()+interval '45 seconds',null),('typing-support','owner','support','history-chat',now()+interval '45 seconds',now()+interval '5 seconds')");
        assert.deepEqual(await replyState(history),baseline);
        const {coordinatedSend}=await import('../server/inboxSendCoordination');
        let dispatches=0;
        await assert.rejects(coordinatedSend({...history,actorId:'support',attemptId:randomUUID(),revision:'unobserved',payload:{content:'Retained draft'}},async()=>{dispatches++;return {success:true};}), (error:any)=>{
          assert.equal(error.code,'reply_state_unavailable');assert.equal(error.details.latestReply.id,'historical-reply');return true;
        });
        assert.equal(dispatches,0);
        await coordinatedSend({...history,actorId:'support',attemptId:randomUUID(),revision:baseline.revision,payload:{content:'Retained draft'}},async()=>{dispatches++;return {success:true};});
        assert.equal(dispatches,1);
      });
      await t.test(
        "PostgreSQL transactions enforce one active claim even without the application fence",
        async () => {
          const left = await pool.connect(),
            right = await pool.connect();
          try {
            await left.query("BEGIN");
            await right.query("BEGIN");
            const insert =
              "INSERT INTO inbox_send_attempts(id,workspace_id,contact_id,scope,fingerprint) VALUES ($1,'owner','customer','unique-transaction-guard','fixture')";
            await left.query(insert, [randomUUID()]);
            const blocked = right.query(insert, [randomUUID()]).then(
              () => null,
              (error: any) => error,
            );
            await left.query("COMMIT");
            const error = await blocked;
            assert.equal(error?.code, "23505");
            assert.equal(error?.constraint, "inbox_send_active_scope_idx");
            await right.query("ROLLBACK");
            await pool.query(
              "DELETE FROM inbox_send_attempts WHERE scope='unique-transaction-guard'",
            );
          } finally {
            await left.query("ROLLBACK");
            await right.query("ROLLBACK");
            left.release();
            right.release();
          }
        },
      );
      await t.test(
        "two processes cannot dispatch simultaneous replies; retry returns the first result",
        async () => {
          first = request("owner", "Owner reply", initial);
          const pending = a.request({
            action: "send",
            input: first,
            hold: true,
          });
          await a.wait("provider_started");
          const blocked = await b.request({
            action: "send",
            input: request("support", "Support reply", initial),
          });
          assert.equal(blocked.code, "send_in_progress");
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM codex_provider_deliveries",
              )
            ).rows[0].count,
            1,
          );
          a.child.send({ action: "release" });
          sent = await pending;
          assert.equal(sent.ok, true);
          const repeat = await b.request({ action: "send", input: first });
          assert.deepEqual(repeat.result, sent.result);
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM codex_provider_deliveries",
              )
            ).rows[0].count,
            1,
          );
        },
      );
      await t.test(
        "newer reply conflicts with an existing draft; fresh review permits deliberate send",
        async () => {
          const stale = await b.request({
            action: "send",
            input: request("support", "Preserved draft", initial),
          });
          assert.equal(stale.code, "reply_conflict");
          const reviewed = (await replyState(target)).revision;
          const result = await b.request({
            action: "send",
            input: request("support", "Preserved draft", reviewed),
          });
          assert.equal(result.ok, true);
        },
      );
      await t.test(
        "a provider-accepted crash is never dispatched again, even with a new nonce",
        async () => {
          const c = await worker();
          const uncertain = request(
            "owner",
            "Uncertain delivery",
            (await replyState(target)).revision,
          );
          c.child.send({
            action: "send",
            id: "crash",
            input: uncertain,
            crash: true,
          });
          await c.wait("provider_started");
          await once(c.child, "exit");
          await pool.query(
            "UPDATE inbox_send_attempts SET updated_at=now()-interval '2 minutes' WHERE id=$1",
            [uncertain.attemptId],
          );
          const before = (
            await pool.query(
              "SELECT count(*)::int AS count FROM codex_provider_deliveries",
            )
          ).rows[0].count;
          assert.equal(
            (await b.request({ action: "send", input: uncertain })).code,
            "delivery_unknown",
          );
          assert.equal(
            (
              await b.request({
                action: "send",
                input: {
                  ...uncertain,
                  attemptId: randomUUID(),
                  revision: (await replyState(target)).revision,
                },
              })
            ).code,
            "delivery_unknown",
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM codex_provider_deliveries",
              )
            ).rows[0].count,
            before,
          );
          // No permanent conversation lock: a different, explicitly reviewed reply remains possible.
          assert.equal(
            (
              await b.request({
                action: "send",
                input: {
                  ...request(
                    "support",
                    "Different reviewed message",
                    (await replyState(target)).revision,
                  ),
                  reviewedRevision: (await replyState(target)).revision,
                },
              })
            ).ok,
            true,
          );
        },
      );
      await t.test(
        "provider timeout preserves the claim and never blindly retries delivery",
        async () => {
          const input = request(
            "owner",
            "Timeout accepted",
            (await replyState(target)).revision,
            randomUUID(),
            { reviewedRevision: (await replyState(target)).revision },
          );
          const result = await a.request({
            action: "send",
            input,
            timeout: true,
          });
          assert.equal(result.ok, false);
          const before = (
            await pool.query(
              "SELECT count(*)::int AS count FROM codex_provider_deliveries",
            )
          ).rows[0].count;
          assert.equal(
            (await b.request({ action: "send", input })).code,
            "delivery_unknown",
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM codex_provider_deliveries",
              )
            ).rows[0].count,
            before,
          );
        },
      );
      await t.test(
        "independent email threads can dispatch concurrently",
        async () => {
          const mail = (id: string) => ({
            ...target,
            channel: "email",
            conversationId: id,
          });
          const x = {
            ...request(
              "owner",
              "Thread A",
              (await replyState(mail("mail-a"))).revision,
            ),
            ...mail("mail-a"),
          };
          const y = {
            ...request(
              "support",
              "Thread B",
              (await replyState(mail("mail-b"))).revision,
            ),
            ...mail("mail-b"),
          };
          const n = a.events.length;
          const pending = a.request({ action: "send", input: x, hold: true });
          await waitUntil(() =>
            a.events.slice(n).some((e) => e.event === "provider_started"),
          );
          assert.equal(
            (await b.request({ action: "send", input: y })).ok,
            true,
          );
          a.child.send({ action: "release" });
          assert.equal((await pending).ok, true);
        },
      );
      await t.test(
        "revoked/foreign actors and mutated retries are rejected",
        async () => {
          assert.equal(
            (
              await b.request({
                action: "send",
                input: request(
                  "outsider",
                  "Forbidden",
                  (await replyState(target)).revision,
                ),
              })
            ).code,
            "workspace_access_revoked",
          );
          assert.equal(
            (
              await b.request({
                action: "send",
                input: { ...first, payload: { content: "Changed retry" } },
              })
            ).code,
            "idempotency_mismatch",
          );
          await pool.query(
            "UPDATE team_members SET status='inactive' WHERE id='member'",
          );
          assert.equal(
            (
              await b.request({
                action: "send",
                input: request(
                  "support",
                  "Revoked",
                  (await replyState(target)).revision,
                ),
              })
            ).code,
            "workspace_access_revoked",
          );
          await pool.query(
            "UPDATE team_members SET status='active' WHERE id='member'",
          );
        },
      );
      await t.test(
        "durable takeover cancels an AI lease across processes and stale writes cannot restore it",
        async () => {
          const { storage } = await import("../server/storage");
          const { pauseAiControl } = await import("../shared/webchatAiPolicy");
          const lease = {
            paused: false,
            generationEpoch: 1,
            generationLease: {
              leaseId: "lease-1",
              epoch: 1,
              status: "pending",
              inboundMessageId: "inbound",
            },
          };
          await storage.updateConversation("ai", { aiControl: lease });
          const aiTarget = {
            ...target,
            channel: "webchat",
            conversationId: "ai",
          };
          const human = await a.request({
            action: "send",
            input: {
              ...aiTarget,
              actorId: "owner",
              attemptId: randomUUID(),
              revision: (await replyState(aiTarget)).revision,
              payload: { content: "Human takes over during generation" },
            },
          });
          assert.equal(human.ok, true);
          assert.equal(
            await storage.updateConversation("ai", { aiControl: lease }),
            undefined,
          );
          const result = await b.request({
            action: "send",
            input: {
              ...aiTarget,
              ai: true,
              leaseId: "lease-1",
              payload: { content: "Stale AI" },
              attemptId: randomUUID(),
            },
          });
          assert.equal(result.code, "ai_superseded");
          const { resumeAiControl } = await import("../shared/webchatAiPolicy");
          const paused = await storage.getConversation("ai");
          await storage.updateConversation("ai", {
            aiControl: resumeAiControl(paused?.aiControl),
          });
          const staleBrowserAi = await b.request({
            action: "send",
            input: {
              ...aiTarget,
              ai: true,
              aiEpoch: 1,
              payload: { content: "AI generated before takeover and resume" },
              attemptId: randomUUID(),
            },
          });
          assert.equal(staleBrowserAi.code, "ai_superseded");
          assert.equal(
            (
              await pool.query(
                "SELECT automations_paused FROM contacts WHERE id='customer'",
              )
            ).rows[0].automations_paused,
            false,
          );
        },
      );
      await t.test(
        "authenticated sockets on separate instances share authorized room activity",
        async () => {
          const sa = await a.request({ action: "serve" }),
            sb = await b.request({ action: "serve" });
          assert.equal(sa.ok, true);
          assert.equal(sb.ok, true);
          async function socket(port: number, actor: string) {
            const origin = `http://127.0.0.1:${port}`;
            const login = await fetch(origin + "/__login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: actor }),
            });
            assert.equal(login.status, 200);
            const ws = new WebSocket(
              origin.replace("http", "ws") + "/ws/presence",
              {
                headers: {
                  Origin: origin,
                  Cookie: login.headers.get("set-cookie")!.split(";")[0],
                },
              },
            );
            const frames: any[] = [];
            ws.on("message", (data) =>
              frames.push(JSON.parse(data.toString())),
            );
            ws.on("close", (code, reason) =>
              frames.push({ closed: code, reason: reason.toString() }),
            );
            await once(ws, "open");
            return { ws, frames };
          }
          const owner = await socket(sa.port, "owner"),
            support = await socket(sb.port, "support"),
            outsider = await socket(sb.port, "outsider");
          const presenceBaseline = await replyState(target);
          try {
            owner.ws.send(JSON.stringify({ type: "join_chat", chatId: "sms" }));
            support.ws.send(
              JSON.stringify({ type: "join_chat", chatId: "sms" }),
            );
            try {
              await waitUntil(() =>
                owner.frames.some(
                  (f) =>
                    f.type === "presence_update" &&
                    f.viewers.some((v: any) => v.userId === "support"),
                ),
              );
            } catch (error) {
              console.error(
                "Presence diagnostics",
                owner.frames,
                support.frames,
              );
              throw error;
            }
            support.ws.send(JSON.stringify({ type: "typing", chatId: "sms" }));
            try {
              await waitUntil(() =>
                owner.frames.some(
                  (f) =>
                    f.type === "presence_update" &&
                    f.viewers.some(
                      (v: any) => v.userId === "support" && v.isTyping,
                    ),
                ),
              );
            } catch (error) {
              console.error(
                "Typing diagnostics",
                JSON.stringify(owner.frames),
                JSON.stringify(support.frames),
              );
              throw error;
            }
            assert.deepEqual(await replyState(target), presenceBaseline);
            outsider.ws.send(
              JSON.stringify({ type: "join_chat", chatId: "sms" }),
            );
            await waitUntil(() =>
              outsider.frames.some((f) => f.code === "forbidden_room"),
            );
            assert.ok(
              !outsider.frames.some((f) => f.type === "presence_update"),
            );
            support.ws.close();
            await once(support.ws, "close");
            await waitUntil(() => {
              const latest = owner.frames
                .filter((f) => f.type === "presence_update")
                .at(-1);
              return (
                latest &&
                !latest.viewers.some((v: any) => v.userId === "support")
              );
            });
          } finally {
            owner.ws.terminate();
            support.ws.terminate();
            outsider.ws.terminate();
          }
        },
      );
      await t.test(
        "events and remote AI abort notifications cross process boundaries without drafts",
        async () => {
          assert.equal((await b.request({ action: "subscribe" })).ok, true);
          await b.request({ action: "watch_abort", conversationId: "sms" });
          for (const type of [
            "new_message",
            "contact_updated",
            "note_changed",
            "ai_control_changed",
          ]) {
            await a.request({
              action: "publish",
              workspaceId: "owner",
              payload: {
                type,
                conversationId: "sms",
                contactId: "customer",
                draftText: "NEVER_TRANSMIT",
              },
            });
            await waitUntil(() =>
              b.events.some(
                (e) => e.event === "bus" && e.payload.type === type,
              ),
            );
            const event = b.events.find(
              (e) => e.event === "bus" && e.payload.type === type,
            );
            assert.equal(event.workspaceId, "owner");
            assert.equal(event.payload.draftText, undefined);
            if (type === "ai_control_changed")
              await waitUntil(() =>
                b.events.some(
                  (e) =>
                    e.event === "generation_aborted" &&
                    e.conversationId === "sms",
                ),
              );
          }
        },
      );
    } finally {
      await Promise.all(
        children.map(async (c) => {
          if (c.exitCode === null) {
            const exited = once(c, "exit");
            c.kill();
            await exited;
          }
        }),
      );
      await (
        await import("../server/inboxDispatchFence")
      ).closeInboxDispatchPool();
      await ((await import("../drizzle/db")).db.$client as Pool).end();
      await pool.end();
      await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await admin.end();
    }
  },
);

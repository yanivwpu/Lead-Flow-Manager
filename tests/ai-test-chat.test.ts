import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import { shoppingSettings } from "../shared/shoppingAssistant";
import { catalogFixture } from "./shopify-catalog-fixture";
import {
  fixtureInventoryRequest,
  inventoryDue,
} from "./shopify-inventory-fixture";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { createTestChatSessions } from "../server/aiTestChat/sessions";
import { createTestChatGenerator } from "../server/aiTestChat/generate";
import { registerTestChatRoutes } from "../server/aiTestChat/routes";
import { AI_TEST_CHAT_SCHEMA_SQL } from "../server/aiTestChat/schemaSql";
import { aiService } from "../server/aiService";
const auth = { workspaceUserId: "tenant-a", actorUserId: "tenant-a" },
  other = { workspaceUserId: "tenant-b", actorUserId: "tenant-b" };
async function fixture() {
  const f = await catalogFixture(),
    db = f.database;
  await f.pg.exec(AI_TEST_CHAT_SCHEMA_SQL);
  await f.pg.exec(
    readFileSync("migrations/0109_private_ai_test_chat.sql", "utf8"),
  );
  // These ordinary CRM and worker tables remain empty throughout the real shopping execution.
  for (const table of [
    schema.contacts,
    schema.conversations,
    schema.messages,
    schema.activityEvents,
    schema.dripEnrollments,
    schema.flowJobs,
    schema.noReplyJobs,
    schema.automationTimerJobs,
  ]) {
    const c = getTableConfig(table);
    await f.pg.exec(
      `CREATE TABLE "${c.name}" (${c.columns.map((col) => `"${col.name}" ${col.enumValues?.length ? "text" : col.getSQLType()}`).join(",")})`,
    );
  }
  const source = (await ensureCatalogSource(db, "tenant-a"))!;
  await db
    .update(schema.catalogSources)
    .set({
      status: "ready",
      currency: "USD",
      allowedHosts: ["fixture-a.myshopify.com"],
      initialSyncCompletedAt: new Date(),
      grantedScopes: ["read_products", "read_inventory"],
    })
    .where(eq(schema.catalogSources.id, source.id));
  await db.insert(schema.catalogProducts).values({
    id: "product-a",
    userId: "tenant-a",
    sourceId: source.id,
    externalId: "gid://shopify/Product/1",
    title: "Snowboard",
    searchText: "snowboard",
    status: "ACTIVE",
    published: true,
    complete: true,
    variantCount: 2,
    providerUpdatedAt: new Date(),
  });
  await db.insert(schema.catalogVariants).values(
    ["Ice", "Fire"].map((title, i) => ({
      id: `variant-${i}`,
      userId: "tenant-a",
      sourceId: source.id,
      productId: "product-a",
      externalId: `gid://shopify/ProductVariant/${i + 1}`,
      inventoryItemId: `gid://shopify/InventoryItem/${i + 1}`,
      title,
      options: [{ name: "Color", value: title }],
      price: "699.95",
      currency: "USD",
      tracked: true,
      quantity: 5,
      inventoryPolicy: "DENY",
      availableForSale: true,
      requiresComponents: false,
      verifiedAt: new Date(0),
      providerUpdatedAt: new Date(),
      generation: "fixture",
    })),
  );
  return { ...f, db, source };
}
test("private transport executes real AI Brain shopping, live verification, multi-turn pending/retry, confirmation and no CRM/worker side effects", async () => {
  const f = await fixture();
  try {
    let time = Date.now(),
      calls = 0,
      meter = 0;
    const sessions = createTestChatSessions(f.db, () => time);
    const request = fixtureInventoryRequest(f.db);
    const commerce = createCommerceStore(
      f.db,
      (shop, token) => async (q, v) => {
        calls++;
        return request(shop, token)(q, v);
      },
    );
    const generate = createTestChatGenerator({
      ai: aiService,
      commerce,
      settings: async () => shoppingSettings({ enabled: true }),
      entitled: async () => true,
      knowledge: async () => undefined,
      aiSettings: async () => undefined,
      meter: async () => {
        meter++;
      },
    });
    const chat = await sessions.create(auth);
    assert.equal((await sessions.create(auth)).id, chat.id);
    let eventId = "",
      text = "";
    async function send(value: string, due = false) {
      text = value;
      eventId = randomUUID();
      time += 1100;
      if (due) await inventoryDue(f.db, f.source.id);
      return sessions.turn(
        auth,
        chat.id,
        eventId,
        text,
        ({ history, sessions: adapter }) =>
          generate({
            userId: auth.workspaceUserId,
            sessionId: chat.id,
            history,
            sessions: adapter,
          }),
      );
    }
    // Natural production-shaped request, not a catalog-specific test command.
    let result = await send("I'm looking for a snowboard under $750.", true);
    assert.equal(result.state.step, "selecting");
    assert.equal(result.state.choices?.length, 2);
    assert.equal(calls, 1);
    const duplicate = await sessions.turn(
      auth,
      chat.id,
      eventId,
      text,
      async () => {
        throw Error("duplicate must not execute");
      },
    );
    assert.deepEqual(duplicate.transcript, result.transcript);
    assert.equal(calls, 1);
    result = await send("I'll take the Ice version.");
    assert.equal(result.state.step, "pending");
    assert.equal(result.state.selected?.variantId, "variant-0");
    assert.equal(calls, 1);
    result = await send("Retry.", true);
    assert.equal(result.state.step, "confirming");
    assert.equal(calls, 2);
    result = await send("quantity 2", true);
    assert.equal(result.state.quantity, 2);
    // Real price change requires another confirmation, including in this internal transport.
    await f.db
      .update(schema.catalogVariants)
      .set({ price: "710.00" })
      .where(eq(schema.catalogVariants.id, "variant-0"));
    result = await send("Yes, confirm.", true);
    assert.equal(result.state.step, "confirming");
    assert.match(result.transcript.at(-1)!.content, /changed/i);
    result = await send("Yes, confirm.", true);
    assert.equal(result.state.step, "confirmed");
    assert.match(result.transcript.at(-1)!.content, /not available yet/i);
    assert.equal(result.state.selected?.price, "710.00");
    assert.equal(meter, 0, "deterministic shopping is not model usage");
    assert.equal((result.state as any).consumedEventIds, undefined);
    assert.equal((result.state as any).reply, undefined);
    await assert.rejects(sessions.read(other, chat.id), /session_expired/);
    await assert.rejects(sessions.reset(other, chat.id), /session_expired/);
    await assert.rejects(
      sessions.read({ ...auth, actorUserId: "tenant-b" }, chat.id),
      /session_expired/,
    );
    result = await send("human please");
    assert.equal(result.state.step, "handoff");
    for (const table of [
      schema.contacts,
      schema.conversations,
      schema.messages,
      schema.activityEvents,
      schema.dripEnrollments,
      schema.flowJobs,
      schema.noReplyJobs,
      schema.automationTimerJobs,
    ])
      assert.equal(
        (await f.db.select().from(table)).length,
        0,
        getTableConfig(table).name,
      );
    await sessions.reset(auth, chat.id);
    await assert.rejects(sessions.read(auth, chat.id), /session_expired/);
    const reset = await sessions.create(auth);
    assert.notEqual(reset.id, chat.id);
    assert.deepEqual(reset.transcript, []);
    assert.equal(reset.state.version, undefined);
    time += 31 * 60_000;
    await assert.rejects(sessions.read(auth, reset.id), /session_expired/);
    const renewed = await sessions.create(auth);
    assert.notEqual(renewed.id, reset.id);
    // No second catalog, carts, order mutations or API calls other than VerifyInventoryBatch exist in this fixture.
    assert.equal((await f.db.select().from(schema.catalogProducts)).length, 1);
  } finally {
    await f.cleanup();
  }
});
test("leased test turns serialize replicas; reset and expiry fence an in-flight completion", async () => {
  const f = await fixture();
  try {
    let time = Date.now();
    const sessions = createTestChatSessions(f.db, () => time),
      chat = await sessions.create(auth);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => {
        enter = r;
      }),
      waiting = new Promise<void>((r) => {
        release = r;
      });
    const pending = sessions.turn(
      auth,
      chat.id,
      randomUUID(),
      "hello",
      async () => {
        enter();
        await waiting;
        return "test reply";
      },
    );
    await entered;
    await assert.rejects(
      sessions.turn(auth, chat.id, randomUUID(), "again", async () => "bad"),
      /turn_processing/,
    );
    await sessions.reset(auth, chat.id);
    release();
    await assert.rejects(pending, /session_changed/);
    const next = await sessions.create(auth);
    assert.deepEqual(next.transcript, []);
    await assert.rejects(
      sessions.turn(auth, next.id, randomUUID(), "expire", async () => {
        time += 31 * 60_000;
        return "late";
      }),
      /session_changed/,
    );
  } finally {
    await f.cleanup();
  }
});
test("all HTTP operations require admin+Brain access and server-owned tenancy; strict input cannot enable checkout or delivery", async () => {
  const f = await fixture();
  try {
    const handlers = new Map<string, Function>();
    let allowed = false,
      actor: typeof auth | null = null,
      generated = 0;
    const app: any = Object.fromEntries(
      ["get", "post", "delete"].map((method) => [
        method,
        (path: string, handler: Function) =>
          handlers.set(method + " " + path, handler),
      ]),
    );
    registerTestChatRoutes(app, {
      db: f.db,
      authorize: async (_req, res) => {
        if (!actor) {
          res.status(401).json({ error: "Unauthorized" });
          return null;
        }
        return actor;
      },
      access: async () => ({ allowed }),
      generate: async () => {
        generated++;
        return "safe";
      },
      diagnostics: async () => ({ checkoutEnabled: false }),
    });
    async function request(key: string, body: unknown = {}, id = "missing") {
      let status = 200,
        data: any;
      const res: any = {
        set: () => res,
        status: (n: number) => {
          status = n;
          return res;
        },
        json: (d: any) => {
          data = d;
          return res;
        },
        sendStatus: (n: number) => {
          status = n;
          return res;
        },
      };
      await handlers.get(key)!(
        { body, params: { id }, user: { id: "untrusted" } },
        res,
      );
      return { status, data };
    }
    for (const key of handlers.keys())
      assert.equal((await request(key)).status, 401);
    actor = auth;
    for (const key of handlers.keys())
      assert.equal((await request(key)).status, 403);
    allowed = true;
    const chat = (await request("post /api/ai/test-chat")).data;
    assert.equal(
      (
        await request(
          "post /api/ai/test-chat/:id/turn",
          {
            text: "hi",
            eventId: randomUUID(),
            userId: "tenant-b",
            checkoutEnabled: true,
          },
          chat.id,
        )
      ).status,
      400,
    );
    actor = other;
    assert.equal(
      (await request("get /api/ai/test-chat/:id", {}, chat.id)).status,
      404,
    );
    assert.equal(
      (await request("delete /api/ai/test-chat/:id", {}, chat.id)).status,
      404,
    );
    assert.equal(generated, 0);
  } finally {
    await f.cleanup();
  }
});
test("AI Brain generator uses shared routing, language, Web Chat and meters a successful ordinary model reply once", async () => {
  let metered = 0,
    observed: any[] = [];
  const generate = createTestChatGenerator({
    ai: {
      suggestReply: async (...args: any[]) => {
        observed = args;
        return {
          suggestion: "Hola",
          confidence: 1,
          modelGenerationSucceeded: true,
        };
      },
    },
    commerce: {} as any,
    settings: async () => shoppingSettings(),
    entitled: async () => true,
    knowledge: async () => undefined,
    aiSettings: async () => undefined,
    meter: async () => {
      metered++;
    },
  });
  assert.equal(
    await generate({
      userId: "tenant-a",
      sessionId: "test",
      history: [
        {
          id: randomUUID(),
          role: "user",
          content: "Hola, quiero información",
          at: new Date().toISOString(),
        },
      ],
      sessions: { withTurn: async () => null },
    }),
    "Hola",
  );
  assert.equal(observed[0], "tenant-a");
  assert.equal(observed[6], "es");
  assert.equal(observed[9], "webchat");
  assert.ok(observed[8].decision);
  assert.equal(metered, 1);
});

test("ordinary Test Chat invokes the real AI Brain reply model path and meters successful generation once", async () => {
  const { aiProvider } = await import("../server/aiProvider");
  const original = aiProvider.complete;
  let calls = 0,
    meter = 0;
  try {
    aiProvider.complete = async (task, history) => {
      calls++;
      assert.equal(task, "reply");
      assert.ok(history.some((m) => m.role === "user" && m.content === "Hi"));
      return JSON.stringify({
        reply: "Hello! How can I help you today?",
        confidence: 0.95,
      });
    };
    const generate = createTestChatGenerator({
      ai: aiService,
      commerce: {} as any,
      settings: async () => shoppingSettings(),
      entitled: async () => true,
      knowledge: async () => undefined,
      aiSettings: async () => undefined,
      meter: async () => {
        meter++;
      },
    });
    const reply = await generate({
      userId: "tenant-a",
      sessionId: "private-test",
      history: [
        {
          id: randomUUID(),
          role: "user",
          content: "Hi",
          at: new Date().toISOString(),
        },
      ],
      sessions: { withTurn: async () => null },
    });
    assert.ok(reply.trim());
    assert.equal(calls, 1);
    assert.equal(meter, 1);
  } finally {
    aiProvider.complete = original;
  }
});

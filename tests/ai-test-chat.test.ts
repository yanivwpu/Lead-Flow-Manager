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
import { privateTestShoppingAllowed, privateTestShoppingSettings } from "../server/aiTestChat/shoppingAllowance";
import { createShoppingService } from "../server/shopping/service";
import { aiService } from "../server/aiService";
const auth = { workspaceUserId: "tenant-a", actorUserId: "tenant-a" },
  other = { workspaceUserId: "tenant-b", actorUserId: "tenant-b" };

test("private Shopping allowance requires the exact database owner and production pilot configuration", () => {
  const id = "6868785e-e8af-4152-8e2d-8d031c2e97d0";
  const owner = { id, email: "marketing@whachatcrm.com" };
  const env = { ECOMMERCE_PILOT_ENABLED: "true", RAILWAY_ENVIRONMENT_NAME: "production",
    APP_URL: "https://app.whachatcrm.com", ECOMMERCE_PILOT_WORKSPACE_ID: id,
    ECOMMERCE_PILOT_OWNER_EMAIL: owner.email };
  assert.equal(privateTestShoppingAllowed(owner, env), true);
  for (const denied of [undefined, { ...owner, id: "another-workspace" }, { ...owner, email: "other@example.invalid" }])
    assert.equal(privateTestShoppingAllowed(denied, env), false);
  for (const patch of [{ ECOMMERCE_PILOT_ENABLED: "false" }, { RAILWAY_ENVIRONMENT_NAME: "staging" },
    { APP_URL: "https://staging.whachatcrm.com" }, { ECOMMERCE_PILOT_WORKSPACE_ID: "another-workspace" },
    { ECOMMERCE_PILOT_OWNER_EMAIL: "other@example.invalid" }])
    assert.equal(privateTestShoppingAllowed(owner, { ...env, ...patch }), false);
  const reassigned = "271c48f9-3515-4682-b391-2fead371593d";
  assert.equal(privateTestShoppingAllowed({ ...owner, id: reassigned }, { ...env, ECOMMERCE_PILOT_WORKSPACE_ID: reassigned }), false);
  const saved = shoppingSettings({ enabled: false, allowedChannels: ["sms"], checkoutEnabled: true, handoffOnFailure: true });
  const snapshot = structuredClone(saved);
  const privateSettings = privateTestShoppingSettings(saved, true);
  assert.equal(privateSettings.enabled, true);
  assert.deepEqual(privateSettings.allowedChannels, ["webchat"]);
  assert.equal(privateSettings.checkoutEnabled, false);
  assert.equal(privateSettings.handoffOnFailure, false);
  assert.deepEqual(saved, snapshot);
  assert.strictEqual(privateTestShoppingSettings(saved, false), saved);
});
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
    assert.match(result.transcript.at(-1)!.content, /Private preview:.*No Shopify cart/i);
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

test("reported numbered selection sequence retains the original under-$750 recommendations through real private-session cooldown and retry", async () => {
  const f = await fixture();
  try {
    await f.db.delete(schema.catalogVariants);
    await f.db.delete(schema.catalogProducts);
    const products = [
      ["a-hydrogen", "Hydrogen Snowboard", "600.00", "snowboard"],
      ["c-liquid", "Liquid Snowboard", "749.95", "snowboard"],
      ["d-multi", "Multi-location Snowboard", "729.95", "snowboard"],
      ["b-expensive", "Collective Snowboard", "2629.95", "snowboard"],
      ["0-wax", "Ski wax", "9.95", "ski wax"],
    ];
    for (const [i, [id, title, price, searchText]] of products.entries()) {
      await f.db
        .insert(schema.catalogProducts)
        .values({
          id,
          userId: "tenant-a",
          sourceId: f.source.id,
          externalId: `gid://shopify/Product/${i + 10}`,
          title,
          searchText,
          status: "ACTIVE",
          published: true,
          complete: true,
          variantCount: 1,
          providerUpdatedAt: new Date(),
        });
      await f.db
        .insert(schema.catalogVariants)
        .values({
          id: `${id}-variant`,
          userId: "tenant-a",
          sourceId: f.source.id,
          productId: id,
          externalId: `gid://shopify/ProductVariant/${i + 10}`,
          inventoryItemId: `gid://shopify/InventoryItem/${i + 10}`,
          title: "Default Title",
          options: [{ name: "Title", value: "Default Title" }],
          price,
          currency: "USD",
          tracked: true,
          quantity: 5,
          inventoryPolicy: "DENY",
          availableForSale: true,
          requiresComponents: false,
          verifiedAt: new Date(0),
          providerUpdatedAt: new Date(),
          generation: "fixture",
        });
    }
    let clock = Date.now(),
      searches = 0;
    const requestedIds: string[][] = [];
    const sessions = createTestChatSessions(f.db, () => clock),
      request = fixtureInventoryRequest(f.db);
    const real = createCommerceStore(f.db, (shop, token) => async (q, v) => {
      requestedIds.push(v!.ids as string[]);
      return request(shop, token)(q, v);
    });
    const commerce = {
      ...real,
      purchaseCandidates: async (
        ...args: Parameters<typeof real.purchaseCandidates>
      ) => {
        searches++;
        return real.purchaseCandidates(...args);
      },
    };
    const generate = createTestChatGenerator({
      ai: aiService,
      commerce,
      settings: async () => shoppingSettings({ enabled: true }),
      entitled: async () => true,
      knowledge: async () => undefined,
      aiSettings: async () => undefined,
      meter: async () => {
        throw Error("shopping must not use the model");
      },
    });
    const chat = await sessions.create(auth);
    async function send(text: string, due = false) {
      clock += 1100;
      if (due) await inventoryDue(f.db, f.source.id);
      return sessions.turn(
        auth,
        chat.id,
        randomUUID(),
        text,
        ({ history, sessions: adapter }) =>
          generate({
            userId: "tenant-a",
            sessionId: chat.id,
            history,
            sessions: adapter,
          }),
      );
    }
    async function fullState() {
      return (
        await f.db
          .select()
          .from(schema.aiTestSessions)
          .where(eq(schema.aiTestSessions.id, chat.id))
      )[0].shoppingState as import("../shared/shoppingAssistant").ShoppingState;
    }
    let result = await send(
      "I'm looking for a snowboard under $750. What do you recommend?",
      true,
    );
    assert.equal(result.state.step, "selecting");
    assert.equal(result.state.choices?.length, 3);
    const offered = await fullState();
    assert.equal(offered.maxPrice, "750");
    assert.equal(offered.choices[0].productId, "a-hydrogen");
    const first = offered.choices[0];
    result = await send("I'll take option 1");
    assert.equal(result.state.step, "pending");
    assert.equal(result.state.selected?.variantId, first.variantId);
    result = await send("1");
    assert.equal(result.state.step, "pending");
    assert.equal(result.state.selected?.variantId, first.variantId);
    result = await send("quantity 2");
    assert.equal(result.state.quantity, 2);
    const pending = await fullState();
    assert.equal(pending.maxPrice, "750");
    assert.equal(pending.query, offered.query);
    assert.deepEqual(pending.choices, offered.choices);
    assert.equal(searches, 1);
    assert.equal(requestedIds.length, 1);
    result = await send("Retry.", true);
    assert.equal(result.state.step, "confirming");
    assert.equal(result.state.quantity, 2);
    assert.equal(result.state.selected?.variantId, first.variantId);
    assert.deepEqual(requestedIds.at(-1), ["gid://shopify/ProductVariant/10"]);
    assert.equal((await fullState()).maxPrice, "750");
    assert.equal(searches, 1);
    result = await send("Yes, confirm.", true);
    assert.equal(result.state.step, "confirmed");
    for (const message of result.transcript.filter(
      (m) => m.role === "assistant",
    ))
      assert.doesNotMatch(message.content, /2629|2,629|wax|https?:/i);
    // Explicit new searches may replace preferences/budgets; list replies may not.
    result = await send("show snowboard under 3000", true);
    assert.equal((await fullState()).maxPrice, "3000");
    assert.ok(result.state.choices?.some((c) => c.productId === "b-expensive"));
    result = await send("show ski wax under 20", true);
    assert.equal((await fullState()).maxPrice, "20");
    assert.deepEqual(
      result.state.choices?.map((c) => c.productId),
      ["0-wax"],
    );
    // A genuinely stale shopping state cannot bind a number to a new search/list.
    const expired = {
      ...(await fullState()),
      updatedAt: new Date(Date.now() - 31 * 60_000).toISOString(),
    };
    await f.db
      .update(schema.aiTestSessions)
      .set({ shoppingState: expired })
      .where(eq(schema.aiTestSessions.id, chat.id));
    const beforeSearches = searches,
      beforeRequests = requestedIds.length;
    result = await send("1");
    assert.match(
      result.transcript.at(-1)!.content,
      /repeat your product search/,
    );
    assert.equal(searches, beforeSearches);
    assert.equal(requestedIds.length, beforeRequests);
    assert.equal(result.state.selected, undefined);
    assert.deepEqual(result.state.choices, []);
    await sessions.reset(auth, chat.id);
    const fresh = await sessions.create(auth);
    result = await sessions.turn(
      auth,
      fresh.id,
      randomUUID(),
      "option 1",
      ({ history, sessions: adapter }) =>
        generate({
          userId: "tenant-a",
          sessionId: fresh.id,
          history,
          sessions: adapter,
        }),
    );
    assert.match(
      result.transcript.at(-1)!.content,
      /repeat your product search/,
    );
    assert.equal(searches, beforeSearches);
    assert.equal(requestedIds.length, beforeRequests);
  } finally {
    await f.cleanup();
  }
});

test("private allowance discovers, selects and reverifies while live Web Chat and all other channels remain disabled", async () => {
  const f = await fixture();
  try {
    const saved = shoppingSettings({ enabled: false });
    const original = structuredClone(saved);
    let calls = 0, price = "699.95", stock = 5;
    const request = fixtureInventoryRequest(f.db, node => ({ ...node, price, inventoryQuantity: stock }));
    const commerce = createCommerceStore(f.db, (shop, token) => async (query, variables) => {
      calls++;
      assert.match(query, /query VerifyInventoryBatch/);
      assert.doesNotMatch(query, /mutation|cartCreate|checkoutCreate/);
      return request(shop, token)(query, variables);
    });
    let clock = Date.now();
    const sessions = createTestChatSessions(f.db, () => clock);
    const chat = await sessions.create(auth);
    const generate = createTestChatGenerator({
      ai: aiService, commerce, settings: async () => saved, entitled: async () => true,
      privateShoppingAllowed: async id => id === auth.workspaceUserId,
      knowledge: async () => undefined, aiSettings: async () => undefined,
      meter: async () => { throw new Error("Shopping must not invoke the reply model"); },
    });
    async function send(text: string) {
      clock += 1100;
      await inventoryDue(f.db, f.source.id);
      return sessions.turn(auth, chat.id, randomUUID(), text, ({ history, sessions: adapter }) =>
        generate({ userId: auth.workspaceUserId, sessionId: chat.id, history, sessions: adapter }));
    }
    let result = await send("show snowboard under 750");
    assert.equal(result.state.step, "selecting");
    assert.equal(result.state.choices?.length, 2);
    assert.equal(calls, 1);
    const choice = result.state.choices![0];
    result = await send("option 1");
    assert.equal(result.state.selected?.variantId, choice.variantId);
    assert.equal(result.state.step, "confirming");
    assert.equal(calls, 2, "selection rechecks the exact variant with Shopify");
    price = "710.00";
    stock = 3;
    result = await send("yes confirm");
    assert.equal(result.state.selected?.price, price);
    assert.equal(result.state.step, "confirming", "changed provider price must be reviewed");
    result = await send("yes confirm");
    assert.equal(result.state.step, "confirmed");
    assert.equal(result.state.checkout, undefined);
    assert.match(result.transcript.at(-1)!.content, /checkout assistance is not available/);
    assert.doesNotMatch(result.transcript.at(-1)!.content, /https?:|Private preview/);
    stock = 0;
    result = await send("option 1");
    assert.equal(result.state.selected, undefined, "new provider stock cannot be replaced by prior selection");
    const beforeLive = calls;
    const live = createShoppingService({ commerce, settings: async () => saved, entitled: async () => true,
      sessions: { withTurn: async () => { throw new Error("disabled live Shopping must never touch conversation state"); } } });
    for (const userId of [auth.workspaceUserId, other.workspaceUserId])
      for (const channel of ["webchat", "whatsapp", "sms", "instagram", "facebook", "telegram"])
        assert.equal(await live.turn({ userId, conversationId: "live", eventId: randomUUID(), text: "show snowboard", channel }), null);
    assert.equal(calls, beforeLive);
    assert.deepEqual(saved, original);
    // The allowance cannot waive normal paid Shopping eligibility.
    const noEntitlement = createTestChatGenerator({
      ai: { suggestReply: async (...args: Parameters<typeof aiService.suggestReply>) => {
        const suggestion = await args[10]!.shoppingSuggestion({ userId: auth.workspaceUserId, conversationId: chat.id, text: args[2].at(-1)!.content, channel: "webchat" });
        assert.equal(suggestion, null);
        return { suggestion: "ordinary test reply", modelGenerationSucceeded: false } as any;
      } },
      commerce, settings: async () => saved, entitled: async () => false,
      privateShoppingAllowed: async () => true, knowledge: async () => undefined,
      aiSettings: async () => undefined, meter: async () => {},
    });
    clock += 1100;
    await sessions.turn(auth, chat.id, randomUUID(), "show snowboard", ({ history, sessions: adapter }) =>
      noEntitlement({ userId: auth.workspaceUserId, sessionId: chat.id, history, sessions: adapter }));
    assert.equal(calls, beforeLive);
    for (const table of [schema.contacts, schema.conversations, schema.messages, schema.activityEvents,
      schema.dripEnrollments, schema.flowJobs, schema.noReplyJobs, schema.automationTimerJobs])
      assert.equal((await f.db.select().from(table)).length, 0, getTableConfig(table).name);
  } finally {
    await f.cleanup();
  }
});

test("production Liquid availability question discovers before live verification despite stale inventory and trailing questions", async () => {
  const f = await fixture();
  try {
    const prompt = "I'm looking for The Collection Snowboard: Liquid. Is it available right now? What's its current price and how many units are in stock? Please verify using Shopify.";
    await f.db.update(schema.catalogProducts).set({title:"The Collection Snowboard: Liquid",searchText:"The Collection Snowboard: Liquid snowboard Default Title",variantCount:1}).where(eq(schema.catalogProducts.id,"product-a"));
    await f.db.delete(schema.catalogVariants).where(eq(schema.catalogVariants.id,"variant-1"));
    await f.db.update(schema.catalogVariants).set({title:"Default Title",options:[{name:"Title",value:"Default Title"}],price:"749.95",quantity:50,verifiedAt:new Date(Date.now()-25*60_000)}).where(eq(schema.catalogVariants.id,"variant-0"));
    const saved = shoppingSettings({enabled:false});
    let calls=0, clock=Date.now(), stock=50;
    const request=fixtureInventoryRequest(f.db,node=>({...node,inventoryQuantity:stock}));
    const commerce=createCommerceStore(f.db,(shop,token)=>async(query,variables)=>{
      calls++;
      assert.match(query,/query VerifyInventoryBatch/);
      assert.deepEqual(variables?.ids,["gid://shopify/ProductVariant/1"]);
      return request(shop,token)(query,variables);
    });
    const sessions=createTestChatSessions(f.db,()=>clock),chat=await sessions.create(auth);
    const generate=createTestChatGenerator({ai:aiService,commerce,settings:async()=>saved,entitled:async()=>true,
      privateShoppingAllowed:async id=>id===auth.workspaceUserId,knowledge:async()=>undefined,aiSettings:async()=>undefined,
      meter:async()=>{throw Error("deterministic Shopping must not invoke the reply model");}});
    async function send(text:string,due=true){
      clock+=1100;
      if(due) await inventoryDue(f.db,f.source.id);
      return sessions.turn(auth,chat.id,randomUUID(),text,({history,sessions:adapter})=>
        generate({userId:auth.workspaceUserId,sessionId:chat.id,history,sessions:adapter}));
    }
    let result=await send(prompt);
    assert.equal(result.state.step,"selecting");
    assert.equal(calls,1,"discovery must reach live Shopify verification, not return the early no-candidate fallback");
    assert.equal(result.state.choices?.length,1);
    assert.equal(result.state.choices![0].productId,"product-a");
    assert.equal(result.state.choices![0].variantId,"variant-0");
    assert.equal(result.state.choices![0].price,"749.95");
    assert.equal(result.state.choices![0].inventoryQuantity,50);
    assert.match(result.transcript.at(-1)!.content,/The Collection Snowboard: Liquid.*USD 749\.95/);
    assert.match(result.transcript.at(-1)!.content,/Tracked stock checked: 50 units/);
    result=await send("Verify the current price and available inventory for that exact variant.",false);
    assert.equal(result.state.step,"selecting");
    assert.equal(calls,1);
    assert.match(result.transcript.at(-1)!.content,/Choose an option by name or number first/);
    const [source]=await f.db.select().from(schema.catalogSources).where(eq(schema.catalogSources.id,f.source.id));
    const deadline=Date.now()+60_000;
    await f.db.update(schema.catalogSources).set({checkpoint:{...(source.checkpoint as any),inventory:{...(source.checkpoint as any).inventory,apiAfter:deadline}}}).where(eq(schema.catalogSources.id,f.source.id));
    result=await send("option 1",false);
    assert.equal(result.state.step,"pending");
    assert.equal(result.state.selected?.variantId,"variant-0");
    assert.equal(calls,1,"provider cooldown cannot be bypassed by selecting an option");
    assert.doesNotMatch(result.transcript.at(-1)!.content,/Tracked stock|50 units/);
    const [blocked]=await f.db.select().from(schema.catalogSources).where(eq(schema.catalogSources.id,f.source.id));
    assert.equal((blocked.checkpoint as any).inventory.apiAfter,deadline);
    result=await send("retry");
    assert.equal(result.state.step,"confirming");
    assert.equal(result.state.selected?.variantId,"variant-0");
    assert.equal(calls,2);
    stock=3;
    result=await send("Verify the current price and available inventory for that exact variant.");
    assert.equal(result.state.step,"confirming");
    assert.equal(result.state.selected?.variantId,"variant-0");
    assert.equal(result.state.selected?.inventoryQuantity,3);
    assert.match(result.transcript.at(-1)!.content,/Tracked stock checked: 3 units/);
    assert.equal(calls,3);
    result=await send("yes confirm");
    assert.equal(result.state.step,"confirmed");
    assert.equal(result.state.checkout,undefined);
    assert.equal(calls,4);
    assert.equal(saved.enabled,false);
    for(const table of [schema.contacts,schema.conversations,schema.messages,schema.activityEvents,schema.flowJobs,schema.dripEnrollments])
      assert.equal((await f.db.select().from(table)).length,0,getTableConfig(table).name);
  } finally {await f.cleanup();}
});

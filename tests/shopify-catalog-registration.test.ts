import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import { catalogSources, catalogEvents, users } from "../shared/schema";
import {
  ensureCatalogSource,
  resolveCatalogInstallation,
} from "../server/salesCatalog/shopify/installation";
import {
  createCatalogWebhookRegistrar,
  CATALOG_APP_MANAGED_TOPICS,
  CATALOG_SHOP_WEBHOOK_SPECS,
} from "../server/salesCatalog/shopify/registration";
import { createShopifyCatalogSync } from "../server/salesCatalog/shopify/sync";
import { registerVerifiedShopWebhooks } from "../server/shopifyWebhookRegistration";
import { catalogReadiness } from "../server/salesCatalog/shopify/readiness";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
test("catalog ownership manifest matches production TOML and all existing signed handlers", () => {
  const toml = readFileSync("shopify.app.whachatcrm.toml", "utf8");
  const topics = [
    ...toml.matchAll(/(?:compliance_)?topics\s*=\s*\[\s*"([^"]+)"\s*\]/g),
  ].map((m) => m[1]);
  assert.deepEqual([...CATALOG_APP_MANAGED_TOPICS].sort(), topics.sort());
  const handlers = readFileSync(
    "server/salesCatalog/shopify/webhooks.ts",
    "utf8",
  );
  for (const spec of CATALOG_SHOP_WEBHOOK_SPECS) {
    assert.ok(!CATALOG_APP_MANAGED_TOPICS.includes(spec.restTopic));
    assert.ok(handlers.includes(`"${spec.restTopic}"`));
    assert.equal(
      spec.pathSuffix,
      `/api/shopify/catalog-webhooks/${spec.restTopic.replaceAll("/", "-")}`,
    );
    assert.equal(spec.topic, spec.restTopic.toUpperCase().replaceAll("/", "_"));
  }
  assert.equal(CATALOG_SHOP_WEBHOOK_SPECS.length, 10);
});
function provider() {
  const p = {
    grants: ["read_products"],
    existing: [] as Array<{ id: string; topic: string; callbackUrl: string }>,
    mutations: [] as string[],
    requests: [] as string[],
    onList: undefined as undefined | (() => Promise<void>),
    failReadback: false,
    pages: false,
    throttled: false,
  };
  let page = 0;
  const client = {
    request: async (query: string, opts?: any) => {
      p.requests.push(query);
      if (p.throttled) throw { response: { code: 429 } };
      if (query.includes("shopifyAppInstallationScopes"))
        return {
          data: {
            currentAppInstallation: {
              accessScopes: p.grants.map((handle) => ({ handle })),
            },
          },
        };
      if (query.includes("listWebhookSubscriptions")) {
        await p.onList?.();
        if (p.failReadback && p.mutations.length) {
          p.failReadback = false;
          throw Error("readback outage");
        }
        return {
          data: {
            webhookSubscriptions: {
              edges: p.existing.map((n) => ({
                node: { ...n, endpoint: { callbackUrl: n.callbackUrl } },
              })),
              pageInfo: {
                hasNextPage: p.pages,
                endCursor: p.pages ? `page-${++page}` : null,
              },
            },
          },
        };
      }
      assert.ok(query.includes("webhookSubscriptionCreate"));
      const topic = opts.variables.topic;
      p.mutations.push(topic);
      p.existing.push({
        id: `hook-${p.existing.length + 1}`,
        topic,
        callbackUrl: opts.variables.webhookSubscription.callbackUrl,
      });
      return {
        data: {
          webhookSubscriptionCreate: {
            webhookSubscription: { id: p.existing.at(-1)!.id },
            userErrors: [],
          },
        },
      };
    },
  };
  return { p, client };
}
test("leased worker registers only granted catalog topics, preserves checkpoints and repairs missing subscriptions without full imports", async () => {
  const f = await catalogFixture(),
    db = f.database;
  const { p, client } = provider();
  let imports = 0;
  let targeted = 0;
  try {
    const source = (await ensureCatalogSource(db, "tenant-a"))!;
    const register = createCatalogWebhookRegistrar(
      db,
      (shop, token) => {
        assert.equal(shop, "fixture-a.myshopify.com");
        assert.equal(token, "fixture-token-a");
        return client;
      },
      "https://fixture.example.invalid",
    );
    const sync = createShopifyCatalogSync(
      db,
      () => async (query) => {
        if (query.includes("CatalogMeta"))
          return {
            currentAppInstallation: {
              accessScopes: p.grants.map((handle) => ({ handle })),
            },
            shop: {
              currencyCode: "USD",
              myshopifyDomain: "fixture-a.myshopify.com",
              primaryDomain: { host: "fixture-a.myshopify.com" },
            },
          };
        if (query.includes("CatalogProduct")) {
          targeted++;
          return { product: null };
        }
        assert.match(query, /CatalogIds/);
        imports++;
        return {
          products: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        };
      },
      register,
    );
    async function settle() {
      for (let i = 0; i < 14; i++) {
        await sync.tick();
        const row = (
          await db
            .select()
            .from(catalogSources)
            .where(eq(catalogSources.id, source.id))
        )[0];
        if (
          row.initialSyncCompletedAt &&
          row.status === "ready" &&
          (row.checkpoint as any).webhooks?.completedAt &&
          (row.checkpoint as any).webhooks?.cursor === 0
        )
          return row;
      }
      throw Error("registration did not settle");
    }
    let row = await settle();
    assert.equal(imports, 1);
    assert.equal(p.mutations.length, 7);
    assert.ok(!p.mutations.some((t) => t.startsWith("INVENTORY_LEVELS")));
    assert.ok(!p.mutations.includes("APP_SCOPES_UPDATE"));
    const status = await catalogReadiness(
      db,
      createCommerceStore(db),
      "tenant-a",
    );
    assert.equal(status.catalogWebhooks.status, "partial");
    assert.equal(status.catalogWebhooks.registeredCount, 7);
    const fullAt = row.lastSyncAt!.getTime();
    async function wakeCycle() {
      await db
        .update(catalogSources)
        .set({
          nextAttemptAt: new Date(),
          checkpoint: {
            ...(row.checkpoint as object),
            webhooks: {
              ...(row.checkpoint as any).webhooks,
              nextCheckAt: new Date(0).toISOString(),
            },
          },
        })
        .where(eq(catalogSources.id, source.id));
    }
    p.existing = p.existing.filter((h) => h.topic !== "PRODUCTS_UPDATE");
    await wakeCycle();
    row = await settle();
    assert.equal(p.mutations.length, 8);
    assert.equal(imports, 1);
    assert.equal(row.lastSyncAt!.getTime(), fullAt);
    // Additional actual grants reset the cycle; existing topics are read back, not duplicated.
    p.grants.push("read_inventory");
    await db
      .update(catalogSources)
      .set({ nextAttemptAt: new Date() })
      .where(eq(catalogSources.id, source.id));
    row = await settle();
    assert.equal(p.mutations.length, 11);
    assert.equal(p.existing.length, 10);
    assert.ok(
      Date.parse((row.checkpoint as any).webhooks.nextCheckAt) - Date.now() >=
        24 * 60 * 60_000 - 10000,
    );
    assert.equal(imports, 1);
    assert.equal(
      (await catalogReadiness(db, createCommerceStore(db), "tenant-a"))
        .catalogWebhooks.status,
      "verified",
    );
    await sync.tick(); // Release the final registration chunk and schedule the next due recovery.
    const before = p.requests.length;
    assert.equal(await sync.tick(), false);
    assert.equal(p.requests.length, before);
    const hooksBeforeEvent = (row.checkpoint as any).webhooks;
    await db.insert(catalogEvents).values({
      userId: "tenant-a",
      sourceId: source.id,
      eventId: "product-update-after-consent",
      topic: "products/update",
      resourceId: "1",
    });
    await db
      .update(catalogSources)
      .set({ nextAttemptAt: new Date() })
      .where(eq(catalogSources.id, source.id));
    await sync.tick();
    const [afterEvent] = await db
      .select()
      .from(catalogSources)
      .where(eq(catalogSources.id, source.id));
    assert.equal(targeted, 1);
    assert.equal(imports, 1);
    assert.equal(afterEvent.lastSyncAt!.getTime(), fullAt);
    assert.deepEqual((afterEvent.checkpoint as any).webhooks, hooksBeforeEvent);
    assert.ok((await db.select().from(catalogEvents))[0].processedAt);
    assert.equal(p.mutations.length, 11);
  } finally {
    await f.cleanup();
  }
});
test("registration is tenant/lease fenced, handles lost readbacks idempotently and stops mutations on uninstall", async () => {
  const f = await catalogFixture(),
    db = f.database;
  const { p, client } = provider();
  try {
    const a = (await ensureCatalogSource(db, "tenant-a"))!,
      b = (await ensureCatalogSource(db, "tenant-b"))!;
    const install = (await resolveCatalogInstallation(db, "tenant-a"))!;
    await db
      .update(catalogSources)
      .set({
        leaseToken: "lease",
        leaseExpiresAt: new Date(Date.now() + 120000),
      })
      .where(eq(catalogSources.id, a.id));
    const reg = createCatalogWebhookRegistrar(
      db,
      () => client,
      "https://fixture.example.invalid",
    );
    const input = {
      install,
      sourceId: a.id,
      leaseToken: "lease",
      scopes: p.grants,
    };
    await assert.rejects(reg({ ...input, sourceId: b.id }), /lease_lost/);
    assert.equal(p.requests.length, 0);
    await assert.rejects(reg({ ...input, leaseToken: "wrong" }), /lease_lost/);
    assert.equal(p.requests.length, 0);
    p.failReadback = true;
    let result = await reg(input);
    assert.equal(result.state.cursor, 0);
    assert.equal(p.mutations.length, 1);
    assert.equal(result.state.statuses["products/create"], "failed");
    assert.ok(Date.parse(result.state.nextCheckAt) - Date.now() >= 299000);
    const requestsBeforeBackoff = p.requests.length;
    assert.equal((await reg({ ...input, state: result.state })).didWork, false);
    assert.equal(p.requests.length, requestsBeforeBackoff);
    result = await reg({
      ...input,
      state: { ...result.state, nextCheckAt: new Date(0).toISOString() },
    });
    assert.equal(result.state.cursor, 1);
    assert.equal(p.mutations.length, 1);
    assert.equal(
      result.state.statuses["products/create"],
      "already_registered",
    );
    p.onList = async () => {
      await db
        .update(users)
        .set({
          shopifySubscriptionStatus: "uninstalled",
          shopifyAccessToken: null,
        })
        .where(eq(users.id, "tenant-a"));
    };
    result = await reg({ ...input, state: result.state });
    assert.equal(result.state.statuses["products/update"], "failed");
    assert.equal(p.mutations.length, 1);
    await assert.rejects(reg(input), /installation_changed/);
    assert.equal(p.mutations.length, 1);
  } finally {
    await f.cleanup();
  }
});
test("registration never duplicates app-managed topics and fails closed on conflicts, pagination limits, missing grants and quota", async () => {
  const { p, client } = provider();
  const app = await registerVerifiedShopWebhooks({
    getClient: () => client,
    host: "https://fixture.example.invalid",
    requestedScopes: [],
    specs: [
      {
        topic: "APP_SCOPES_UPDATE",
        restTopic: "app/scopes_update",
        pathSuffix: "/api/shopify/catalog-webhooks/app-scopes_update",
        label: "Scopes",
        required: false,
      },
    ],
    appManagedTopics: CATALOG_APP_MANAGED_TOPICS,
  });
  assert.equal(app[0].status, "skipped_verification");
  assert.equal(p.mutations.length, 0);
  const f = await catalogFixture(),
    db = f.database;
  try {
    const a = (await ensureCatalogSource(db, "tenant-a"))!,
      install = (await resolveCatalogInstallation(db, "tenant-a"))!;
    await db
      .update(catalogSources)
      .set({
        leaseToken: "lease",
        leaseExpiresAt: new Date(Date.now() + 120000),
      })
      .where(eq(catalogSources.id, a.id));
    const reg = createCatalogWebhookRegistrar(
        db,
        () => client,
        "https://fixture.example.invalid",
      ),
      input = {
        install,
        sourceId: a.id,
        leaseToken: "lease",
        scopes: p.grants,
      };
    p.existing = [
      {
        id: "wrong",
        topic: "PRODUCTS_CREATE",
        callbackUrl: "https://wrong.invalid/hook",
      },
    ];
    let r = await reg(input);
    assert.equal(r.state.statuses["products/create"], "failed");
    assert.equal(p.mutations.length, 0);
    p.existing = [];
    p.pages = true;
    r = await reg(input);
    assert.equal(r.state.statuses["products/create"], "skipped_verification");
    assert.equal(p.mutations.length, 0);
    p.pages = false;
    p.grants = [];
    r = await reg(input);
    assert.equal(r.state.statuses["products/create"], "skipped_verification");
    assert.equal(p.mutations.length, 0);
    p.grants = ["read_orders"];
    r = await reg({ ...input, scopes: p.grants });
    assert.equal(r.state.statuses["products/create"], "skipped_scope");
    assert.equal(p.mutations.length, 0);
    p.throttled = true;
    const before = p.requests.length;
    r = await reg({ ...input, scopes: ["read_products"] });
    assert.ok(r.delayMs >= 60000);
    assert.equal(p.requests.length, before + 1);
    assert.equal(p.mutations.length, 0);
  } finally {
    await f.cleanup();
  }
});

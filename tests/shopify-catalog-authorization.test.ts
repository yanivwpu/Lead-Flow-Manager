import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import express from "express";
import session from "express-session";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import {
  users,
  integrations,
  catalogSources,
  catalogEvents,
} from "../shared/schema";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { registerCatalogWebhooks } from "../server/salesCatalog/shopify/webhooks";
import { registerShopifyWebhookBodyParser } from "../server/shopifyWebhookBodyParser";
import {
  createCatalogAuthorizationIntent,
  catalogAuthorizationReturnPath,
} from "../server/salesCatalog/shopify/authorization";
process.env.DATABASE_URL ||=
  "postgres://fixture:fixture@127.0.0.1:1/catalog_fixture";
process.env.SHOPIFY_API_KEY = "fixture-client";
process.env.SHOPIFY_API_SECRET = "fixture-signing-secret";

async function fixture() {
  const { registerShopifyCatalogRoutes } =
    await import("../server/salesCatalog/shopify/routes");
  const f = await catalogFixture(),
    db = f.database;
  await db
    .update(users)
    .set({
      shopifySubscriptionStatus: "pending",
      subscriptionPlan: "free",
      trialStartedAt: new Date("2025-01-01"),
      trialEndsAt: new Date("2025-01-15"),
    })
    .where(eq(users.id, "tenant-a"));
  const source = (await ensureCatalogSource(db, "tenant-a"))!;
  await db
    .update(catalogSources)
    .set({
      status: "permission_required",
      errorCode: "read_products_required",
      grantedScopes: ["read_customers", "read_orders"],
      nextAttemptAt: new Date(Date.now() + 600000),
    })
    .where(eq(catalogSources.id, source.id));
  const app = express();
  app.use(
    session({
      secret: "fixture-session-secret",
      resave: false,
      saveUninitialized: false,
    }),
  );
  app.use((req, _res, next) => {
    const id = req.get("x-fixture-user");
    if (id)
      req.user = {
        id,
        shopifyShop:
          id === "tenant-a"
            ? "fixture-a.myshopify.com"
            : "fixture-b.myshopify.com",
        shopifyAccessToken: "fixture-token",
      } as Express.User;
    next();
  });
  let scopes = ["read_customers", "read_orders"],
    calls = 0,
    fail = false,
    mismatch = false;
  registerShopifyCatalogRoutes(
    app,
    db,
    createCommerceStore(db),
    async (req, res) => {
      if (!req.user) {
        res.status(401).end();
        return null;
      }
      return { workspaceUserId: req.user.id, actorUserId: req.user.id };
    },
    (shop, token) => async (query) => {
      calls++;
      assert.equal(shop, "fixture-a.myshopify.com");
      assert.equal(token, "fixture-token-a");
      assert.match(query, /^query CatalogAccess/);
      assert.doesNotMatch(query, /mutation|billing|subscription/);
      if (fail) throw Error("provider outage");
      return {
        currentAppInstallation: {
          accessScopes: scopes.map((handle) => ({ handle })),
        },
        shop: { myshopifyDomain: mismatch ? "fixture-b.myshopify.com" : shop },
      };
    },
  );
  const { default: router } = await import("../server/shopifyRoutes");
  app.use("/api/shopify", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  let cookie = "";
  const call = async (path: string, actor = "tenant-a") => {
    const r = await fetch(origin + path, {
      redirect: "manual",
      headers: {
        ...(actor ? { "x-fixture-user": actor } : {}),
        ...(cookie ? { cookie } : {}),
        "sec-fetch-dest": "document",
      },
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return r;
  };
  return {
    db,
    source,
    call,
    get calls() {
      return calls;
    },
    grant() {
      scopes = [...scopes, "read_products", "read_inventory"];
    },
    fail() {
      fail = true;
    },
    mismatch(value = true) {
      mismatch = value;
    },
    row: async () =>
      (
        await db
          .select()
          .from(catalogSources)
          .where(eq(catalogSources.id, source.id))
      )[0],
    cleanup: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await f.cleanup();
    },
  };
}

test("expired-trial optional approval returns through real install routing to catalog, verifies grants and queues without billing or provisioning", async () => {
  process.env.SHOPIFY_CATALOG_AUTH_ENABLED = "true";
  const f = await fixture();
  try {
    const beforeUsers = await f.db.select().from(users),
      beforeIntegrations = await f.db.select().from(integrations);
    const response = await f.call("/api/shopify/catalog/authorize");
    assert.equal(response.status, 302);
    const url = new URL(response.headers.get("location")!);
    assert.equal(url.origin, "https://admin.shopify.com");
    assert.equal(
      url.searchParams.get("optional_scopes"),
      "read_products,read_inventory",
    );
    assert.equal(
      url.searchParams.has("redirect_uri"),
      false,
      "optional approval is not installation OAuth",
    );
    f.grant();
    const launch = await f.call(
      "/api/shopify/install?shop=fixture-a.myshopify.com",
    );
    assert.equal(launch.status, 200);
    const html = await launch.text();
    assert.match(html, /\/api\/shopify\/catalog\/return/);
    assert.doesNotMatch(html, /shopify\/start|oauth\/authorize|pricing/);
    const returned = await f.call(
      "/api/shopify/catalog/return?scopes=forged&redirect=https://evil.invalid",
    );
    assert.equal(returned.status, 302);
    assert.equal(
      returned.headers.get("location"),
      "/app/sales-catalog?source=shopify",
    );
    const row = await f.row();
    assert.deepEqual(row.grantedScopes, [
      "read_customers",
      "read_orders",
      "read_products",
      "read_inventory",
    ]);
    assert.equal(row.errorCode, null);
    assert.equal(row.status, "syncing");
    assert.ok(row.nextAttemptAt.getTime() <= Date.now());
    assert.equal(
      row.initialSyncCompletedAt,
      null,
      "approval does not claim imported products",
    );
    assert.deepEqual(await f.db.select().from(users), beforeUsers);
    assert.deepEqual(
      await f.db.select().from(integrations),
      beforeIntegrations,
    );
    assert.equal(f.calls, 2);
    assert.equal(
      (await f.call("/api/shopify/catalog/return")).status,
      409,
      "intent consumed",
    );
    const normal = await (
      await f.call("/api/shopify/install?shop=fixture-a.myshopify.com")
    ).text();
    assert.match(normal, /shopify\/start/);
  } finally {
    await f.cleanup();
    delete process.env.SHOPIFY_CATALOG_AUTH_ENABLED;
  }
});

test("already-granted scopes repair stale metadata without repeat consent and preserve quota delays/checkpoints", async () => {
  process.env.SHOPIFY_CATALOG_AUTH_ENABLED = "true";
  const f = await fixture();
  try {
    const backoff = new Date(Date.now() + 3600000),
      checkpoint = {
        mode: "full",
        after: "durable",
        pending: [],
        webhooks: { cursor: 3 },
      };
    await f.db
      .update(catalogSources)
      .set({
        status: "error",
        errorCode: "throttled",
        nextAttemptAt: backoff,
        checkpoint,
        generation: "original",
        leaseToken: "another-worker",
        leaseExpiresAt: backoff,
      })
      .where(eq(catalogSources.id, f.source.id));
    f.grant();
    const r = await f.call("/api/shopify/catalog/authorize");
    assert.equal(r.status, 302);
    assert.equal(
      r.headers.get("location"),
      "/app/sales-catalog?source=shopify",
    );
    const row = await f.row();
    assert.equal(row.nextAttemptAt.getTime(), backoff.getTime());
    assert.equal(row.errorCode, "throttled");
    assert.deepEqual(row.checkpoint, checkpoint);
    assert.equal(row.generation, "original");
    assert.equal(row.leaseToken, "another-worker");
    assert.equal(f.calls, 1);
  } finally {
    await f.cleanup();
    delete process.env.SHOPIFY_CATALOG_AUTH_ENABLED;
  }
});

test("optional return fails closed for missing session, another tenant, changed tokens, provider failures and declined permissions", async () => {
  process.env.SHOPIFY_CATALOG_AUTH_ENABLED = "true";
  const f = await fixture();
  try {
    assert.equal((await f.call("/api/shopify/catalog/return", "")).status, 401);
    assert.equal((await f.call("/api/shopify/catalog/return")).status, 409);
    assert.equal(f.calls, 0);
    await f.call("/api/shopify/catalog/authorize");
    assert.equal(
      (await f.call("/api/shopify/catalog/return", "tenant-b")).status,
      409,
    );
    assert.equal(f.calls, 1);
    const declined = await f.call(
      "/api/shopify/catalog/return?scopes=read_products,read_inventory",
    );
    assert.equal(declined.status, 302);
    assert.equal((await f.row()).status, "permission_required");
    assert.deepEqual((await f.row()).grantedScopes, [
      "read_customers",
      "read_orders",
    ]);
    await f.call("/api/shopify/catalog/authorize");
    const before = await f.row();
    f.mismatch();
    assert.equal((await f.call("/api/shopify/catalog/return")).status, 503);
    assert.deepEqual(await f.row(), before);
    f.mismatch(false);
    f.fail();
    assert.equal((await f.call("/api/shopify/catalog/return")).status, 503);
    assert.deepEqual(await f.row(), before);
    await f.db
      .update(users)
      .set({ shopifyAccessToken: "replacement-token" })
      .where(eq(users.id, "tenant-a"));
    const n = f.calls;
    assert.equal((await f.call("/api/shopify/catalog/return")).status, 409);
    assert.equal(f.calls, n);
  } finally {
    await f.cleanup();
    delete process.env.SHOPIFY_CATALOG_AUTH_ENABLED;
  }
});

test("catalog return intent has a fixed destination, actor/shop binding and finite lifetime", () => {
  const install = {
    userId: "workspace",
    integrationId: "integration",
    shop: "fixture-a.myshopify.com",
    token: "fixture-token",
  };
  const intent = createCatalogAuthorizationIntent(install, "actor");
  const req = {
    user: { id: "actor" },
    session: { catalogAuthorization: intent },
  };
  assert.equal(
    catalogAuthorizationReturnPath(req, install.shop),
    "/api/shopify/catalog/return",
  );
  assert.equal(
    catalogAuthorizationReturnPath(req, "fixture-b.myshopify.com"),
    null,
  );
  assert.equal(
    catalogAuthorizationReturnPath(
      { ...req, user: { id: "other" } },
      install.shop,
    ),
    null,
  );
  assert.equal(
    catalogAuthorizationReturnPath({ session: req.session }, install.shop),
    null,
  );
  intent.expiresAt = Date.now() - 1;
  assert.equal(
    catalogAuthorizationReturnPath(req, install.shop),
    "/app/sales-catalog?source=shopify",
  );
  assert.equal(req.session.catalogAuthorization, undefined);
  assert.doesNotMatch(JSON.stringify(intent), /fixture-token/);
});

test("production body parser preserves signed scope-update bytes before global JSON and existing Shopify handlers", async () => {
  const f = await catalogFixture(),
    db = f.database;
  const { verifyWebhookHmac } =
    await import("../server/shopifyWebhookSignature");
  const app = express();
  registerShopifyWebhookBodyParser(app);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  registerCatalogWebhooks(app, db, verifyWebhookHmac);
  app.post("/api/shopify/webhooks/customers-update", (req, res) =>
    res.sendStatus(
      verifyWebhookHmac((req as any).rawBody, req.get("x-shopify-hmac-sha256")!)
        ? 200
        : 401,
    ),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const raw =
    '{ "current": ["read_products", "read_inventory"], "previous": ["read_orders"] }\n';
  const sign = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
    .update(raw)
    .digest("base64");
  const post = (path: string, signature = sign) =>
    fetch(origin + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-hmac-sha256": signature,
        "x-shopify-shop-domain": "fixture-a.myshopify.com",
        "x-shopify-topic": "app/scopes_update",
        "x-shopify-event-id": "scope-event",
      },
      body: raw,
    });
  try {
    const source = (await ensureCatalogSource(db, "tenant-a"))!;
    const before = new Date(Date.now() + 3600000);
    await db
      .update(catalogSources)
      .set({ status: "error", errorCode: "throttled", nextAttemptAt: before })
      .where(eq(catalogSources.id, source.id));
    assert.equal(
      (await post("/api/shopify/catalog-webhooks/app-scopes_update", "invalid"))
        .status,
      401,
    );
    assert.equal(
      (await post("/api/shopify/catalog-webhooks/app-scopes_update")).status,
      200,
    );
    assert.equal(
      (await post("/api/shopify/catalog-webhooks/app-scopes_update")).status,
      200,
    );
    const events = await db.select().from(catalogEvents);
    assert.equal(events.length, 1);
    assert.equal(events[0].userId, "tenant-a");
    const [row] = await db
      .select()
      .from(catalogSources)
      .where(eq(catalogSources.id, source.id));
    assert.equal(row.nextAttemptAt.getTime(), before.getTime());
    assert.deepEqual(
      row.grantedScopes,
      [],
      "webhook payload is not grant authority",
    );
    assert.equal(
      (await post("/api/shopify/webhooks/customers-update")).status,
      200,
    );
    assert.match(
      readFileSync("server/index.ts", "utf8"),
      /registerShopifyWebhookBodyParser\(app\)/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await f.cleanup();
  }
});

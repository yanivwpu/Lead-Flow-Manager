import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import {
  catalogSources,
  catalogEvents,
  users,
  integrations,
} from "../shared/schema";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createShopifyCatalogSync } from "../server/salesCatalog/shopify/sync";
import {
  registerCatalogWebhooks,
  cleanupShopifyCatalog,
} from "../server/salesCatalog/shopify/webhooks";

test("signed raw events are deduplicated, routed to one installation and stopped/erased on uninstall", async () => {
  const f = await catalogFixture();
  const db = f.database;
  let server: ReturnType<typeof express.prototype.listen> | undefined;
  try {
    const a = (await ensureCatalogSource(db, "tenant-a"))!;
    const b = (await ensureCatalogSource(db, "tenant-b"))!;
    const app = express();
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as any).rawBody = buf;
        },
      }),
    );
    const secret = "fixture-webhook-secret";
    registerCatalogWebhooks(app, db, (raw, hmac) => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(hmac),
          Buffer.from(
            crypto.createHmac("sha256", secret).update(raw).digest("base64"),
          ),
        );
      } catch {
        return false;
      }
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const send = (
      shop: string,
      id: string,
      topic = "products/update",
      valid = true,
    ) => {
      const body = JSON.stringify(
        topic.startsWith("inventory_levels/")
          ? { inventory_item_id: 1 }
          : { id: 1 },
      );
      return fetch(
        origin + "/api/shopify/catalog-webhooks/" + topic.replaceAll("/", "-"),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-shopify-hmac-sha256": valid
              ? crypto
                  .createHmac("sha256", secret)
                  .update(body)
                  .digest("base64")
              : "invalid",
            "x-shopify-shop-domain": shop,
            "x-shopify-topic": topic,
            "x-shopify-event-id": id,
          },
          body,
        },
      );
    };
    assert.equal(
      (await send("fixture-a.myshopify.com", "bad", "products/update", false))
        .status,
      401,
    );
    assert.equal((await send("evil.example.invalid", "bad")).status, 400);
    assert.equal(
      (await send("fixture-a.myshopify.com", "event-1")).status,
      200,
    );
    assert.equal(
      (await send("fixture-a.myshopify.com", "event-1")).status,
      200,
    );
    const events = await db.select().from(catalogEvents);
    assert.equal(events.length, 1);
    assert.equal(events[0].sourceId, a.id);
    assert.equal(events[0].userId, "tenant-a");
    assert.equal(
      (
        await send(
          "fixture-b.myshopify.com",
          "event-1",
          "inventory_levels/update",
        )
      ).status,
      200,
    );
    assert.equal((await db.select().from(catalogEvents)).length, 2);
    await db.transaction(async (tx: any) => {
      await cleanupShopifyCatalog(tx, "fixture-a.myshopify.com", false);
      await tx
        .update(users)
        .set({
          shopifyAccessToken: null,
          shopifySubscriptionStatus: "uninstalled",
        })
        .where(eq(users.id, "tenant-a"));
      await tx
        .update(integrations)
        .set({ isActive: false })
        .where(eq(integrations.id, "integration-a"));
    });
    assert.equal((await send("fixture-a.myshopify.com", "late")).status, 200);
    assert.equal((await db.select().from(catalogEvents)).length, 2);
    let calls = 0;
    const sync = createShopifyCatalogSync(db, () => async () => {
      calls++;
      return {};
    });
    await db
      .update(catalogSources)
      .set({ nextAttemptAt: new Date(Date.now() + 60_000) })
      .where(eq(catalogSources.id, b.id));
    await sync.tick();
    assert.equal(calls, 0);
    await db.transaction((tx: any) =>
      cleanupShopifyCatalog(tx, "fixture-a.myshopify.com", true),
    );
    assert.equal((await db.select().from(catalogSources)).length, 1);
    assert.equal((await db.select().from(catalogEvents)).length, 1);
  } finally {
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await f.cleanup();
  }
});

test("distributed source lease allows only one worker to request a source at a time", async () => {
  const f = await catalogFixture();
  try {
    await ensureCatalogSource(f.database, "tenant-a");
    let calls = 0;
    let unblock!: () => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => (started = resolve));
    const pause = new Promise<void>((resolve) => (unblock = resolve));
    const sync = createShopifyCatalogSync(f.database, () => async () => {
      calls++;
      started();
      await pause;
      return {
        currentAppInstallation: { accessScopes: [{ handle: "read_orders" }] },
        shop: {
          currencyCode: "USD",
          myshopifyDomain: "fixture-a.myshopify.com",
          primaryDomain: { host: "fixture-a.myshopify.com" },
        },
      };
    });
    const first = sync.tick();
    await began;
    await sync.tick();
    assert.equal(calls, 1);
    unblock();
    await first;
  } finally {
    await f.cleanup();
  }
});

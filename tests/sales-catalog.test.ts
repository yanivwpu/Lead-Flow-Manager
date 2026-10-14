import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import express from "express";
import { workspaceOffers } from "../shared/schema";
import { createSalesCatalogService } from "../server/salesCatalog/service";
import { registerSalesCatalogRoutes } from "../server/salesCatalog/routes";
import {
  salesCatalogSearchSchema,
  shopifyCatalogReadiness,
} from "../shared/salesCatalog";
import {
  selectRelevantOffers,
  draftContainsCheckoutUrl,
} from "../shared/workspaceOffers";

test("bounded catalog reads preserve records, rank across pages, isolate tenants and filter recommendation eligibility", async () => {
  const pg = new PGlite();
  const database = drizzle(pg);
  const service = createSalesCatalogService(
    database as unknown as Parameters<typeof createSalesCatalogService>[0],
  );
  try {
    const config = getTableConfig(workspaceOffers);
    await pg.exec(
      `CREATE TABLE workspace_offers (${config.columns.map((c) => `"${c.name}" ${c.getSQLType()}`).join(",")})`,
    );
    const rows = Array.from({ length: 125 }, (_, i) => ({
      id: `item-${String(i).padStart(3, "0")}`,
      userId: "tenant-a",
      internalName: `Package ${i}`,
      displayName: i === 124 ? "Special Gold" : `Package ${i}`,
      description: i === 0 ? "Literal 50%_ discount" : "Service",
      benefits: ["Support"],
      priceDisplay: "$49/month",
      billingCadence: "month",
      checkoutUrl: "https://checkout.example.invalid/authoritative",
      followUpUrl: null,
      availability: "available",
      active: true,
      sortOrder: i,
      category: "Services",
      tags: ["vip"],
      aiGuidance: null,
      archivedAt: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }));
    await database
      .insert(workspaceOffers)
      .values([
        ...rows,
        {
          ...rows[0],
          id: "other-tenant",
          userId: "tenant-b",
          displayName: "Special Gold",
        },
        { ...rows[0], id: "inactive", active: false },
        { ...rows[0], id: "archived", archivedAt: new Date() },
        { ...rows[0], id: "unavailable", availability: "unavailable" },
        { ...rows[0], id: "waitlist", availability: "waitlist" },
        { ...rows[0], id: "limited", availability: "limited" },
      ]);
    const before = await database.select().from(workspaceOffers);
    const seen: string[] = [];
    let offset: number | null = 0;
    do {
      const page = await service.search("tenant-a", { limit: 17, offset });
      assert.ok(page.items.length <= 17);
      seen.push(...page.items.map((item) => item.id));
      offset = page.nextOffset;
    } while (offset !== null);
    assert.equal(new Set(seen).size, 129);
    assert.equal(seen.length, 129);
    assert.ok(!seen.includes("archived") && !seen.includes("other-tenant"));
    assert.equal(
      (await service.search("tenant-a", { query: "special gold" })).items[0].id,
      "item-124",
    );
    assert.ok(
      (await service.search("tenant-a", { query: "50%_" })).items.some(
        (item) => item.id === "item-000",
      ),
    );
    assert.equal(
      (await service.search("tenant-a", { query: "50%_x" })).items.length,
      0,
    );
    assert.equal(
      (await service.search("tenant-a", { query: "' OR true --" })).items
        .length,
      0,
    );
    assert.equal(
      (await service.search("tenant-a", { category: "Other" })).items.length,
      0,
    );
    assert.equal(
      (await service.search("tenant-a", { tag: "unknown" })).items.length,
      0,
    );
    assert.equal(
      (await service.search("tenant-a", { tag: "vip", status: "inactive" }))
        .items[0].id,
      "inactive",
    );
    assert.equal(
      (await service.search("tenant-a", { status: "archived" })).items[0].id,
      "archived",
    );
    assert.equal(
      (await service.search("tenant-a", { availability: "waitlist" })).items[0]
        .id,
      "waitlist",
    );
    assert.equal(
      (await service.search("tenant-a", { offset: 1000 })).nextOffset,
      null,
    );
    assert.equal(await service.lookup("tenant-a", "other-tenant"), null);
    assert.equal(await service.lookup("tenant-a", "archived"), null);
    assert.ok(await service.lookup("tenant-a", "inactive"));
    assert.equal(
      await service.lookup("tenant-a", "inactive", { purchasableOnly: true }),
      null,
    );
    assert.ok(
      await service.lookup("tenant-a", "limited", { purchasableOnly: true }),
    );
    const eligible = (
      await service.search("tenant-a", { status: "purchasable", limit: 100 })
    ).items;
    for (const item of eligible)
      assert.ok(
        item.active &&
          !item.archivedAt &&
          ["available", "limited"].includes(item.availability),
      );
    for (const message of [
      "What packages do you offer?",
      "I want to buy Special Gold",
      "Tell me about Special Gold",
    ]) {
      const result = await service.recommend("tenant-a", { message, limit: 5 });
      const all: typeof result = [];
      let next: number | null = 0;
      do {
        const page = await service.search("tenant-a", {
          status: "purchasable",
          limit: 100,
          offset: next,
        });
        all.push(...page.items);
        next = page.nextOffset;
      } while (next !== null);
      assert.deepEqual(result, selectRelevantOffers(all, message, null, 5));
      for (const item of result) {
        assert.equal(item.checkoutUrl, rows[0].checkoutUrl);
        assert.ok(
          draftContainsCheckoutUrl(item.checkoutUrl!, [item.checkoutUrl!]),
        );
      }
    }
    await assert.rejects(service.search("", {}));
    await assert.rejects(service.search("tenant-a", { limit: 101 }));
    assert.deepEqual(
      await database.select().from(workspaceOffers),
      before,
      "Read APIs must never modify offers",
    );

    const app = express();
    app.use((req, _res, next) => {
      if (req.get("x-test-session"))
        (req as any).user = { id: req.get("x-test-session") };
      next();
    });
    registerSalesCatalogRoutes(app, service);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/sales-catalog`;
    try {
      assert.equal((await fetch(url)).status, 401);
      const headers = { "x-test-session": "tenant-a" };
      assert.equal((await fetch(url + "?limit=101", { headers })).status, 400);
      assert.equal(
        (await fetch(url + "/other-tenant", { headers })).status,
        404,
      );
      const response = await fetch(url + "?userId=tenant-b&limit=2", {
        headers,
      });
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const body = await response.json();
      assert.equal(body.items.length, 2);
      assert.ok(
        body.items.every(
          (item: { userId: string }) => item.userId === "tenant-a",
        ),
      );
      assert.equal((await fetch(url, { method: "POST", headers })).status, 404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    assert.deepEqual(await database.select().from(workspaceOffers), before);
  } finally {
    await pg.close();
  }
});

test("query validation and Shopify readiness never imply product availability", () => {
  for (const bad of [
    { limit: 0 },
    { offset: -1 },
    { limit: "NaN" },
    { status: "invalid" },
    { query: "x".repeat(201) },
  ])
    assert.equal(salesCatalogSearchSchema.safeParse(bad).success, false);
  assert.deepEqual(shopifyCatalogReadiness(true), {
    connection: "connected",
    catalog: "not_implemented",
  });
  assert.deepEqual(shopifyCatalogReadiness(false), {
    connection: "disconnected",
    catalog: "not_implemented",
  });
});

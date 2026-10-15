import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { drizzle as nativeDrizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getTableConfig } from "drizzle-orm/pg-core";
import { readFileSync } from "node:fs";
import * as schema from "../shared/schema";
import type { CatalogDb } from "../server/salesCatalog/commerceStore";
export async function catalogFixture() {
  let pg: any, database: CatalogDb, cleanup: () => Promise<void>;
  const target = process.env.CATALOG_TEST_DATABASE_URL;
  if (target) {
    const url = new URL(target);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/whachat_catalog_test"
    )
      throw Error("Disposable local database required");
    const name = "catalog_" + crypto.randomUUID().replaceAll("-", "");
    const admin = new Pool({ connectionString: target });
    await admin.query(`CREATE SCHEMA ${name}`);
    url.searchParams.set("options", `-c search_path=${name}`);
    const pool = new Pool({ connectionString: url.toString() });
    pg = { exec: (query: string) => pool.query(query) };
    database = nativeDrizzle(pool, { schema });
    cleanup = async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA ${name} CASCADE`);
      await admin.end();
    };
  } else {
    pg = new PGlite();
    database = drizzle(pg, { schema }) as unknown as CatalogDb;
    cleanup = () => pg.close();
  }
  for (const table of [schema.users, schema.integrations]) {
    const config = getTableConfig(table);
    await pg.exec(
      `CREATE TABLE "${config.name}" (${config.columns.map((c) => `"${c.name}" ${c.enumValues?.length ? "text" : c.getSQLType()}${c.name === "id" ? " PRIMARY KEY" : ""}`).join(",")})`,
    );
  }
  await pg.exec(
    readFileSync("migrations/0107_shared_commerce_catalog.sql", "utf8"),
  );
  await pg.exec(
    readFileSync("migrations/0107_shared_commerce_catalog.sql", "utf8"),
  );
  await database.insert(schema.users).values([
    {
      id: "tenant-a",
      name: "Fixture A",
      email: "a@example.invalid",
      password: "fixture",
      shopifyShop: "fixture-a.myshopify.com",
      shopifyAccessToken: "fixture-token-a",
      shopifyInstalledAt: new Date(),
      shopifySubscriptionStatus: "active",
    },
    {
      id: "tenant-b",
      name: "Fixture B",
      email: "b@example.invalid",
      password: "fixture",
      shopifyShop: "fixture-b.myshopify.com",
      shopifyAccessToken: "fixture-token-b",
      shopifyInstalledAt: new Date(),
      shopifySubscriptionStatus: "active",
    },
  ]);
  await database.insert(schema.integrations).values([
    {
      id: "integration-a",
      userId: "tenant-a",
      type: "shopify",
      name: "Shopify",
      isActive: true,
      config: { shopUrl: "fixture-a.myshopify.com" },
    },
    {
      id: "integration-b",
      userId: "tenant-b",
      type: "shopify",
      name: "Shopify",
      isActive: true,
      config: { shopUrl: "fixture-b.myshopify.com" },
    },
  ]);
  return { database, pg, cleanup };
}

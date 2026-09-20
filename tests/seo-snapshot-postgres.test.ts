/**
 * Real migration/index/upsert coverage. Run only against an explicitly disposable
 * database: SEO_TEST_DATABASE_URL=... npx tsx tests/seo-snapshot-postgres.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { snapshotNaturalKeyHash } from "../server/seo/snapshotBatches";

const connectionString = process.env.SEO_TEST_DATABASE_URL;
if (!connectionString) {
  console.log("seo-snapshot-postgres.test.ts: skipped (SEO_TEST_DATABASE_URL is not set)");
} else {
  const client = new pg.Client({ connectionString });
  const schema = `seo_hotfix_${process.pid}_${Date.now()}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query(`CREATE TABLE seo_search_snapshots (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(), property_id text NOT NULL,
      reporting_date date NOT NULL, query text NOT NULL, page text NOT NULL,
      clicks double precision NOT NULL DEFAULT 0, impressions double precision NOT NULL DEFAULT 0,
      ctr double precision NOT NULL DEFAULT 0, position double precision NOT NULL DEFAULT 0,
      imported_at timestamp NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE UNIQUE INDEX seo_search_snapshots_property_date_query_page_uidx
      ON seo_search_snapshots(property_id, reporting_date, query, page)`);
    await client.query(`INSERT INTO seo_search_snapshots(property_id, reporting_date, query, page)
      VALUES ('property-a', '2026-09-20', '', ''), ('property-a', '2026-09-20', 'こんにちは🌍', 'https://例え.テスト/道')`);

    await client.query("BEGIN");
    await client.query(readFileSync("migrations/0094_seo_snapshot_bounded_key.sql", "utf8"));
    await client.query("COMMIT");

    const vectors = [
      ["", ""],
      ["こんにちは🌍", "https://例え.テスト/道"],
      ["delimiter|::?&=", "https://example.test/a|::?x=1&y=2"],
      ["long-query-".repeat(10_000), `https://example.test/${"long-path-".repeat(10_000)}`],
    ] as const;
    for (const [query, page] of vectors) {
      const result = await client.query<{ hash: string }>(
        `SELECT encode(digest(convert_to($1::text, 'UTF8') || decode('00', 'hex') || convert_to($2::text, 'UTF8'), 'sha256'), 'hex') AS hash`,
        [query, page],
      );
      assert.equal(result.rows[0].hash, snapshotNaturalKeyHash(query, page), "application and PostgreSQL hashes must match");
    }

    const insert = `INSERT INTO seo_search_snapshots(property_id, reporting_date, query, page, natural_key_hash, clicks)
      VALUES ($1, '2026-09-20', $2, $3, $4, $5)
      ON CONFLICT (property_id, reporting_date, natural_key_hash) DO UPDATE SET clicks = excluded.clicks`;
    const longQuery = "query-".repeat(20_000), longPage = `https://example.test/${"path-".repeat(20_000)}`;
    await client.query(insert, ["property-a", longQuery, longPage, snapshotNaturalKeyHash(longQuery, longPage), 1]);
    await client.query(insert, ["property-a", longQuery, longPage, snapshotNaturalKeyHash(longQuery, longPage), 2]);
    await client.query(insert, ["property-a", `${longQuery}different`, longPage, snapshotNaturalKeyHash(`${longQuery}different`, longPage), 3]);
    await client.query(insert, ["property-b", longQuery, longPage, snapshotNaturalKeyHash(longQuery, longPage), 4]);
    const counts = await client.query<{ property_id: string; count: string; max: number }>(
      `SELECT property_id, count(*)::text, max(clicks) AS max FROM seo_search_snapshots
       WHERE length(query) > 10000 GROUP BY property_id ORDER BY property_id`,
    );
    assert.deepEqual(counts.rows, [
      { property_id: "property-a", count: "2", max: 3 },
      { property_id: "property-b", count: "1", max: 4 },
    ], "identical values conflict, different full values remain distinct, and properties stay isolated");
    const oldIndex = await client.query(`SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = 'seo_search_snapshots_property_date_query_page_uidx'`, [schema]);
    assert.equal(oldIndex.rowCount, 0, "the unbounded composite index is removed only after migration succeeds");
    console.log("seo-snapshot-postgres.test.ts: all assertions passed");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
}

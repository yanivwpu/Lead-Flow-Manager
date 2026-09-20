/** Run: npx tsx tests/seo-execution-lease-concurrency.test.ts */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.log("seo-execution-lease-concurrency.test.ts: skipped (DATABASE_URL unavailable)");
} else {
  const table = `seo_lease_race_${crypto.randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const first = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const second = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await Promise.all([admin.connect(), first.connect(), second.connect()]);
  const claim = (client: pg.Client, property: string, token: string) => client.query(`
    INSERT INTO ${table} (property_id, lease_token, trigger, lease_expires_at)
    VALUES ($1, $2, 'manual', NOW() + INTERVAL '30 minutes')
    ON CONFLICT (property_id) DO UPDATE SET lease_token = EXCLUDED.lease_token,
      trigger = EXCLUDED.trigger, lease_expires_at = EXCLUDED.lease_expires_at
    WHERE ${table}.lease_expires_at IS NULL OR ${table}.lease_expires_at <= NOW()
    RETURNING property_id, lease_token
  `, [property, token]);
  try {
    await admin.query(`CREATE TABLE ${table} (property_id text PRIMARY KEY, lease_token text NOT NULL, trigger text NOT NULL, lease_expires_at timestamp)`);
    const tokenA = crypto.randomUUID(), tokenB = crypto.randomUUID();
    const [claimA, claimB] = await Promise.all([
      claim(first, "sc-domain:race.example", tokenA),
      claim(second, "sc-domain:race.example", tokenB),
    ]);
    assert.equal(claimA.rowCount! + claimB.rowCount!, 1, "concurrent missing-row claims produce exactly one owner");
    const winner = (claimA.rows[0] ?? claimB.rows[0]).lease_token as string;
    const loser = winner === tokenA ? tokenB : tokenA;
    assert.equal((await claim(first, "sc-domain:race.example", loser)).rowCount, 0, "an unexpired lease cannot be replaced");
    assert.equal((await first.query(`UPDATE ${table} SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE property_id = $1`, ["sc-domain:race.example"])).rowCount, 1);
    assert.equal((await claim(second, "sc-domain:race.example", loser)).rows[0].lease_token, loser, "an expired lease is reclaimable");
    assert.equal((await first.query(`UPDATE ${table} SET lease_expires_at = NOW() + INTERVAL '30 minutes' WHERE property_id = $1 AND lease_token = $2`, ["sc-domain:race.example", winner])).rowCount, 0, "former owner cannot heartbeat after reclamation");
    assert.equal((await first.query(`DELETE FROM ${table} WHERE property_id = $1 AND lease_token = $2`, ["sc-domain:race.example", winner])).rowCount, 0, "former owner cannot release after reclamation");
    const [one, two] = await Promise.all([claim(first, "sc-domain:one.example", crypto.randomUUID()), claim(second, "sc-domain:two.example", crypto.randomUUID())]);
    assert.equal(one.rowCount, 1); assert.equal(two.rowCount, 1, "different properties claim independently");
    console.log("seo-execution-lease-concurrency.test.ts: all assertions passed");
  } finally {
    await admin.query(`DROP TABLE IF EXISTS ${table}`);
    await Promise.all([admin.end(), first.end(), second.end()]);
  }
}

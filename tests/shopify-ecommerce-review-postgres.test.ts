import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { parseReviewEventId, parseReviewEventRequest } from "../server/ecommerce/reviewIntent";
import { pendingEventReviewQuery, markEventReviewedQuery } from "../server/ecommerce/reviewQueue";

test("review request accepts only a bounded exact BIGINT and explicit action", () => {
  assert.deepEqual(parseReviewEventRequest({ action: "mark_reviewed", eventId: "123" }), {eventId:"123"});
  for (const input of [0, 123, "", "0", "-1", "01", "1;DELETE", "9223372036854775808", "12345678901234567890"]) {
    assert.equal(parseReviewEventId(input), null);
  }
  for (const input of [null, [], {eventId:"1"}, {action:"send",eventId:"1"},
    {action:"mark_reviewed",eventId:1}, {action:"mark_reviewed",eventId:"1",userId:"foreign"}])
    assert.equal(parseReviewEventRequest(input), null);
});

test("real PostgreSQL: tenant/store review is atomic, idempotent and does not touch other events", async () => {
  const target = process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target, "This test requires isolated SHOPIFY_TEST_DATABASE_URL; never production DATABASE_URL");
  const url = new URL(target);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname, "/whachat_shopify_test");
  const schema = "ecommerce_review_test";
  const admin = new Pool({ connectionString: target });
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_event_inbox (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      account_id VARCHAR(128) NOT NULL, shop VARCHAR(255) NOT NULL,
      topic VARCHAR(64) NOT NULL, delivery_id VARCHAR(256) NOT NULL,
      journey VARCHAR(32) NOT NULL, state VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'reviewed', 'ignored')),
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(account_id,shop,topic,delivery_id)
    )`);
    url.searchParams.set("options", `-c search_path=${schema}`);
    pool = new Pool({ connectionString: url.toString(), max: 12 });
    const db = drizzle(pool);
    async function insert(account: string, shop: string, delivery: string) {
      const r = await pool!.query(
        "INSERT INTO ecommerce_growth_event_inbox (account_id,shop,topic,delivery_id,journey) VALUES ($1,$2,'orders/create',$3,'order_support') RETURNING id::text AS id",
        [account,shop,delivery]);
      return r.rows[0].id as string;
    }
    const aliceId = await insert("alice","one.myshopify.com","a");
    const bobId = await insert("bob","one.myshopify.com","b");
    const otherStoreId = await insert("alice","two.myshopify.com","c");
    const onlyAlice = await db.execute(pendingEventReviewQuery("alice","one.myshopify.com"));
    assert.deepEqual(onlyAlice.rows.map(r => r.id), [aliceId]);
    assert.equal((await db.execute(markEventReviewedQuery(bobId,"alice","one.myshopify.com"))).rows.length,0);
    assert.equal((await db.execute(markEventReviewedQuery(otherStoreId,"alice","one.myshopify.com"))).rows.length,0);
    const results = await Promise.all(Array.from({length: 8}, () =>
      db.execute(markEventReviewedQuery(aliceId,"alice","one.myshopify.com"))));
    assert.equal(results.reduce((n,r)=>n+r.rows.length,0),1,"only one concurrent review changes state");
    assert.equal((await db.execute(markEventReviewedQuery(aliceId,"alice","one.myshopify.com"))).rows.length,0);
    assert.equal((await db.execute(pendingEventReviewQuery("alice","one.myshopify.com"))).rows.length,0);
    assert.equal((await db.execute(pendingEventReviewQuery("bob","one.myshopify.com"))).rows.length,1);
    assert.equal((await db.execute(pendingEventReviewQuery("alice","two.myshopify.com"))).rows.length,1);
    const states = await pool.query("SELECT account_id, shop, state FROM ecommerce_growth_event_inbox ORDER BY id");
    assert.deepEqual(states.rows.map(x=>x.state),["reviewed","pending","pending"]);
  } finally {
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});
    await admin.end();
  }
});

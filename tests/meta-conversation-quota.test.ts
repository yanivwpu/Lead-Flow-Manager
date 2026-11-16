/**
 * Real SQL regression for WhachatCRM's subscription definition.
 * Run: npx tsx tests/meta-conversation-quota.test.ts
 *
 * PGlite fixtures only: never touches production data or a provider.
 */
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  META_CUSTOMER_SERVICE_CHANNELS,
  metaCustomerServiceWindowCountQuery,
} from "../shared/metaConversationQuota";

const db = new PGlite();
const dialect = new PgDialect();

async function add(
  id: string, conv: string, user: string, direction: string, at: string,
) {
  await db.query(
    "INSERT INTO messages(id, conversation_id, user_id, direction, created_at) VALUES($1,$2,$3,$4,$5::timestamp)",
    [id, conv, user, direction, at],
  );
}

async function usage(user: string, start: string, end: string): Promise<number> {
  const built = dialect.sqlToQuery(metaCustomerServiceWindowCountQuery(user, new Date(start), new Date(end)));
  const result = await db.query(built.sql, built.params);
  return Number(result.rows[0]?.session_count || 0);
}

try {
  await db.exec(`
    CREATE TABLE conversations (id text PRIMARY KEY, user_id text NOT NULL, channel text NOT NULL);
    CREATE TABLE messages (
      id text PRIMARY KEY, conversation_id text NOT NULL, user_id text NOT NULL,
      direction text NOT NULL, created_at timestamp NOT NULL
    );
    INSERT INTO conversations (id,user_id,channel) VALUES
      ('wa','u1','whatsapp'), ('wa-template','u1','whatsapp'),
      ('fb','u1','facebook'), ('ig','u1','instagram'),
      ('widget','u1','webchat'), ('email','u1','email'),
      ('shop','u1','shopify'), ('sms','u1','sms'),
      ('boundary','u1','whatsapp'), ('other-wa','u2','whatsapp');
  `);
  assert.deepEqual(META_CUSTOMER_SERVICE_CHANNELS, ["whatsapp","facebook","instagram"]);

  await add("1","wa","u1","inbound","2026-11-01T09:00:00Z"); // +1
  await add("2","wa","u1","inbound","2026-11-01T10:00:00Z"); // +0 extends window
  await add("3","wa","u1","outbound","2026-11-02T09:00:00Z"); // +0 template/manual
  await add("4","wa","u1","inbound","2026-11-02T09:59:00Z"); // +0 (23h59 gap)
  await add("5","wa","u1","inbound","2026-11-03T10:00:00Z"); // +1 (24h01 gap)
  await add("6","wa","u1","outbound","2026-11-04T10:00:00Z"); // +0
  await add("7","wa","u1","inbound","2026-11-04T10:00:00Z"); // +1 exact 24h
  await add("8","fb","u1","inbound","2026-11-05T10:00:00Z"); // +1
  await add("9","ig","u1","inbound","2026-11-05T11:00:00Z"); // +1
  await add("10","widget","u1","inbound","2026-11-05T12:00:00Z"); // +0
  await add("11","email","u1","inbound","2026-11-05T13:00:00Z"); // +0
  await add("12","shop","u1","inbound","2026-11-05T14:00:00Z"); // +0
  await add("13","sms","u1","inbound","2026-11-05T15:00:00Z"); // +0
  await add("14","wa-template","u1","outbound","2026-11-05T11:00:00Z"); // +0 standalone template
  await add("15","wa-template","u1","inbound","2026-11-07T11:00:00Z"); // +1 customer reply
  await add("16","wa-template","u1","inbound","2026-11-07T11:05:00Z"); // +0
  await add("17","other-wa","u2","inbound","2026-11-06T10:00:00Z"); // another tenant
  await add("18","boundary","u1","inbound","2026-10-31T23:00:00Z"); // Oct +1
  await add("19","boundary","u1","inbound","2026-11-01T01:00:00Z"); // Nov +0
  await add("20","boundary","u1","inbound","2026-11-02T02:00:00Z"); // Nov +1
  assert.equal(await usage("u1","2026-11-01T00:00:00Z","2026-12-01T00:00:00Z"),7);
  assert.equal(await usage("u1","2026-10-01T00:00:00Z","2026-11-01T00:00:00Z"),1);
  assert.equal(await usage("u2","2026-11-01T00:00:00Z","2026-12-01T00:00:00Z"),1);
  assert.equal(await usage("u1","2026-12-01T00:00:00Z","2027-01-01T00:00:00Z"),0);
  await assert.rejects(
    add("15","wa-template","u1","inbound","2026-11-07T11:00:00Z"),
    /duplicate|unique/i,
  );
  assert.equal(await usage("u1","2026-11-01T00:00:00Z","2026-12-01T00:00:00Z"),7);
  console.log("✓ Meta 24-hour subscription quota: sessions, rolling windows, reply to template, exclusions, period boundary, tenant isolation, duplicates");
} finally {
  await db.close();
}

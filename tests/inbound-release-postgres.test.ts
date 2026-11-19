import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import * as tables from '../shared/schema';
import { prepareDbTestEnvironment } from './helpers/dbTestGuard';

// Independent PostgreSQL transactions, including lease takeover, not a simulated SQL engine.
test('inbound receipts preserve legacy duplicates and fence concurrent/recovered deliveries', { skip: !process.env.TEST_DATABASE_URL, timeout: 60000 }, async t => {
  const { databaseUrl } = prepareDbTestEnvironment('inbound release preparation');
  const admin = new Pool({ connectionString: databaseUrl });
  const schema = 'prep_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(databaseUrl); url.searchParams.set('options', `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const pool = new Pool({ connectionString: url.toString() });
  try {
    const dialect = new PgDialect();
    for (const table of [tables.users, tables.contacts, tables.conversations, tables.messages]) {
      const config = getTableConfig(table);
      const columns = config.columns.map(c => {
        let out = '"' + c.name + '" ' + c.getSQLType() + (c.primary ? ' PRIMARY KEY' : '');
        if (c.default !== undefined) {
          const d = c.default as any;
          out += ' DEFAULT ' + (d && typeof d === 'object' && 'getSQL' in d ? dialect.sqlToQuery(d.getSQL()).sql : typeof d === 'string' ? "'" + d.replaceAll("'", "''") + "'" : String(d));
        }
        return out;
      });
      await pool.query(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
    }
    await pool.query("INSERT INTO users(id) VALUES ('owner'),('other')");
    await pool.query("INSERT INTO contacts(id,user_id) VALUES ('contact','owner'),('other-contact','other')");
    await pool.query("INSERT INTO conversations(id,user_id,contact_id,channel) VALUES ('fb','owner','contact','facebook'),('sms','owner','contact','sms'),('other-fb','other','other-contact','facebook')");
    await pool.query("INSERT INTO messages(id,user_id,contact_id,conversation_id,direction,external_message_id,content,created_at) VALUES ('legacy-a','owner','contact','fb','inbound','historic','Original customer text','2026-06-14T18:30:00Z'),('legacy-b','owner','contact','fb','inbound','historic','Original customer text','2026-06-14T18:55:00Z')");
    const before = (await pool.query('SELECT * FROM messages ORDER BY id')).rows;
    const migration = await readFile(new URL('../migrations/0113_inbound_receipt_keys.sql', import.meta.url), 'utf8');
    const oldMigration = await readFile(new URL('../migrations/0028_messages_external_message_id_unique.sql', import.meta.url), 'utf8');
    await pool.query(oldMigration); await pool.query(migration); await pool.query(migration);
    assert.deepEqual((await pool.query('SELECT * FROM messages ORDER BY id')).rows, before);
    const { withInboundEvent, persistClaimedInbound, InboundRetryError } = await import('../server/inboundDedup');
    let deliveries = 0;
    const once = (id: string, userId = 'owner', channel = 'facebook', delay?: () => Promise<void>) => withInboundEvent(userId, channel, id, async () => {
      const { rows } = await pool.query("SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.user_id=$1 AND m.external_message_id=$2 AND c.channel=$3 AND m.direction='inbound' ORDER BY m.created_at,m.id LIMIT 1", [userId, id, channel]);
      if (rows[0]) return { id: rows[0].id, deduped: true };
      await delay?.();
      const message = await persistClaimedInbound({userId, externalMessageId:id, direction:'inbound', contactId:userId==='owner'?'contact':'other-contact', conversationId:userId==='other'?'other-fb':channel==='sms'?'sms':'fb', content:'New customer message'});
      assert.ok(message); deliveries++;
      return { id: message.id, deduped: false };
    });
    await t.test('historical replay chooses oldest without deleting, reparenting or changing content', async () => {
      assert.deepEqual(await once('historic'), {id:'legacy-a',deduped:true});
      assert.deepEqual((await pool.query("SELECT * FROM messages WHERE external_message_id='historic' ORDER BY id")).rows, before);
    });
    await t.test('concurrent duplicate deliveries produce one message and one downstream execution', async () => {
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>(r => enter=r), held = new Promise<void>(r => release=r);
      const first = once('race', 'owner', 'facebook', async()=>{enter();await held;});
      await entered;
      const losers = await Promise.allSettled(Array.from({length:12},()=>once('race')));
      assert.ok(losers.every(r=>r.status==='rejected' && r.reason instanceof InboundRetryError));
      release(); const winner = await first;
      const retries = await Promise.all(Array.from({length:12},()=>once('race')));
      assert.ok(retries.every(r=>r.deduped && r.id===winner.id));
      assert.equal(deliveries,1);
      assert.equal((await pool.query("SELECT count(*)::int n FROM messages WHERE external_message_id='race'")).rows[0].n,1);
    });
    await t.test('expired owner cannot insert after another session recovers the receipt', async () => {
      let enter!: () => void, release!: () => void;
      const entered=new Promise<void>(r=>enter=r), held=new Promise<void>(r=>release=r);
      const first=once('recovery','owner','facebook',async()=>{enter();await held;});
      const failure=assert.rejects(first, e=>(e as any).code==='23505');
      await entered;
      await pool.query("UPDATE inbound_message_receipts SET lease_until=now()-interval '1 second' WHERE external_message_id='recovery'");
      await once('recovery'); release(); await failure;
      assert.equal((await pool.query("SELECT count(*)::int n FROM messages WHERE external_message_id='recovery'")).rows[0].n,1);
    });
    await t.test('failed pre-persist work can retry; distinct workspaces/channels remain independent', async () => {
      await assert.rejects(withInboundEvent('owner','facebook','failed',async()=>{throw Error('temporary');}));
      assert.equal((await once('failed')).deduped,false);
      assert.equal((await once('race','other')).deduped,false);
      assert.equal((await once('race','owner','sms')).deduped,false);
    });
    await t.test('Telegram numeric IDs are chat scoped and historical IDs remain compatible', async () => {
      const { inboundMessageIdPredicate, telegramInboundExternalId } = await import('../server/inboundDedup');
      const { db } = await import('../drizzle/db'); const { sql } = await import('drizzle-orm');
      await pool.query("UPDATE contacts SET telegram_id='chat-a' WHERE id='contact'");
      await pool.query("INSERT INTO contacts(id,user_id,telegram_id) VALUES('contact-b','owner','chat-b')");
      await pool.query("INSERT INTO conversations(id,user_id,contact_id,channel) VALUES('tg-a','owner','contact','telegram'),('tg-b','owner','contact-b','telegram')");
      await pool.query("INSERT INTO messages(id,user_id,contact_id,conversation_id,direction,external_message_id) VALUES('old-telegram','owner','contact','tg-a','inbound','7')");
      const first=telegramInboundExternalId('chat-a','7'),second=telegramInboundExternalId('chat-b','7');
      assert.notEqual(first,second);
      await withInboundEvent('owner','telegram',first,async()=>{
        const result=await db.execute(sql`SELECT id FROM messages WHERE ${inboundMessageIdPredicate('owner',first,'telegram')}`);
        assert.equal(result.rows[0].id,'old-telegram');
      });
      await withInboundEvent('owner','telegram',second,async()=>{
        const result=await db.execute(sql`SELECT id FROM messages WHERE ${inboundMessageIdPredicate('owner',second,'telegram')}`);
        assert.equal(result.rows.length,0);
        await persistClaimedInbound({userId:'owner',externalMessageId:second,direction:'inbound',contactId:'contact-b',conversationId:'tg-b',content:'Different customer'});
      });
      assert.equal((await pool.query("SELECT count(*)::int n FROM messages WHERE id='old-telegram'")).rows[0].n,1);
    });
    await t.test('post-persist uncertainty does not replay downstream work', async () => {
      await assert.rejects(withInboundEvent('owner','facebook','accepted',async()=>{
        await persistClaimedInbound({userId:'owner',externalMessageId:'accepted',direction:'inbound',contactId:'contact',conversationId:'fb',content:'Already persisted'});
        throw Error('response lost');
      }));
      const n=deliveries;assert.equal((await once('accepted')).deduped,true);assert.equal(deliveries,n);
    });
  } finally {
    await pool.end();
    const { db } = await import('../drizzle/db'); await (db as any).$client.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
  }
});

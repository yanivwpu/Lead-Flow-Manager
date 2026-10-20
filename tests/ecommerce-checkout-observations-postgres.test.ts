import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {dueCheckoutObservationsQuery,upsertCheckoutObservationQuery} from '../server/ecommerce/checkoutObservationQueries';

test('native PostgreSQL: one tenant-scoped checkout row, purchases terminal under concurrent replay', async () => {
  const url=process.env.ECOMMERCE_TEST_DATABASE_URL || process.env.SHOPIFY_TEST_DATABASE_URL;
  if(!url) throw Error('ECOMMERCE_TEST_DATABASE_URL_required');
  const admin=new Client({connectionString:url}),first=new Client({connectionString:url}),second=new Client({connectionString:url});
  await admin.connect();await first.connect();await second.connect();
  const schema='ecommerce_checkout_observation_test';
  try {
    await admin.query('BEGIN');
    await admin.query('CREATE SCHEMA '+schema);
    await admin.query('SET LOCAL search_path='+schema);
    await admin.query(await readFile('migrations/20261020_ecommerce_abandoned_checkout_observations.sql','utf8'));
    await admin.query('COMMIT');
    await first.query('SET search_path='+schema);
    await second.query('SET search_path='+schema);
    const a=drizzle(first),b=drizzle(second);
    const input={accountId:'acct-a',shop:'store.myshopify.com',snapshot:{
      checkoutId:'gid://shopify/AbandonedCheckout/123',lastActivityAt:'2026-10-20T10:00:00Z',
      completed:false,hasRecoveryUrl:true,
    }};
    await Promise.all([a.execute(upsertCheckoutObservationQuery(input)),b.execute(upsertCheckoutObservationQuery(input))]);
    const rows=await admin.query('SELECT * FROM '+schema+'.ecommerce_abandoned_checkout_observations');
    assert.equal(rows.rowCount,1);
    assert.equal(rows.rows[0].completed,false);
    assert.ok(rows.rows[0].next_review_at !== null);
    await a.execute(upsertCheckoutObservationQuery({...input,snapshot:{
      ...input.snapshot,lastActivityAt:'2026-10-20T11:00:00Z',completed:true,
    }}));
    await b.execute(upsertCheckoutObservationQuery(input));
    const done=await admin.query('SELECT completed,next_review_at FROM '+schema+'.ecommerce_abandoned_checkout_observations');
    assert.equal(done.rows[0].completed,true);
    assert.equal(done.rows[0].next_review_at,null);
    const due=await a.execute(dueCheckoutObservationsQuery('acct-a','store.myshopify.com'));
    assert.equal(due.rows.length,0);
    await a.execute(upsertCheckoutObservationQuery({...input,accountId:'acct-b'}));
    const different=await admin.query('SELECT count(*)::int AS n FROM '+schema+'.ecommerce_abandoned_checkout_observations');
    assert.equal(different.rows[0].n,2);
    await assert.rejects(async()=>a.execute(upsertCheckoutObservationQuery({...input,shop:'evil.com'})));
  } finally {
    await first.end();await second.end();
    await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
    await admin.end();
  }
});

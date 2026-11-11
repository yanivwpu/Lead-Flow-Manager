import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { migrateAuthorizedLegacyInstallation } from '../server/shopifyOfflineMigration';
import { maintainOfflineTokens } from '../server/shopifyOfflineTokenMaintenance';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { persistOfflineInstallation, resolveOfflineAccessToken, assertOfflineTokenStorage } from '../server/shopifyOfflineTokens';
import { parseOfflinePair, openOfflinePair, ShopifyTokenError } from '../server/shopifyOfflineGrant';

// Native PostgreSQL only. Never fall back to the application DATABASE_URL.
test('durable offline lifecycle: concurrency, rotation, rollback, isolation and erasure', async t => {
  const target=process.env.SHOPIFY_TEST_DATABASE_URL;assert.ok(target,'isolated SHOPIFY_TEST_DATABASE_URL required');
  const url=new URL(target);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  assert.equal(url.pathname,'/whachat_shopify_test');
  const admin=new Pool({connectionString:target});
  const schema='offline_'+randomUUID().replaceAll('-','');
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options',`-c search_path=${schema}`);
  const pool=new Pool({connectionString:url.toString(),max:12});const database=drizzle(pool) as any;
  process.env.SHOPIFY_OFFLINE_TOKEN_KEY='34'.repeat(32);
  process.env.SHOPIFY_API_KEY='fixture-client';
  const shop='fixture.myshopify.com',otherShop='other.myshopify.com';let now=Date.now();let grants=0;
  const pair=(n:number,ttl=3600)=>parseOfflinePair({access_token:`fixture-access-${n}`,refresh_token:`fixture-refresh-${n}`,
    scope:'read_orders',expires_in:ttl,refresh_token_expires_in:7776000},now);
  const grant=async(_shop:string,g:any)=>{assert.equal(g.refresh_token,`fixture-refresh-${grants}`);grants++;
    await new Promise(r=>setTimeout(r,30));return pair(grants);};
  const resolve=(s:string,r:string,extra:any={})=>resolveOfflineAccessToken(s,r,{database,now:()=>now,grant,...extra});
  let ref='';
  try {
    await pool.query(`CREATE TABLE users(id varchar PRIMARY KEY,shopify_shop text,shopify_access_token text,
      shopify_subscription_status text,deletion_requested_at timestamptz,billing_plan text);
      CREATE TABLE integrations(user_id varchar,type text,is_active boolean,config jsonb);
      INSERT INTO users VALUES ('owner','${shop}','legacy-fixture','active',NULL,'pro'),('other','${otherShop}','other-legacy','active',NULL,'free');
      INSERT INTO integrations VALUES ('owner','shopify',true,'{}'),('other','shopify',true,'{}');`);
    const migration=await readFile('migrations/0119_shopify_offline_tokens.sql','utf8');
    await t.test('legacy installs work without new table/key; preflight rejects missing storage',async()=>{
      assert.equal(await resolve(shop,'legacy-fixture'),'legacy-fixture');assert.equal(grants,0);
      await assert.rejects(assertOfflineTokenStorage(database));
    });
    await pool.query(migration);await pool.query(migration);
    await t.test('acquisition atomically installs encrypted pair and opaque compatibility reference',async()=>{
      ref=await persistOfflineInstallation('owner',shop,pair(0,30),{billingPlan:'pro'},database);
      const rows=await pool.query('SELECT * FROM shopify_offline_tokens');assert.equal(rows.rowCount,1);
      assert.ok(!JSON.stringify(rows.rows).includes('fixture-access'));assert.ok(!JSON.stringify(rows.rows).includes('fixture-refresh'));
      assert.equal((await pool.query("SELECT billing_plan FROM users WHERE id='owner'")).rows[0].billing_plan,'pro');
      await assert.rejects(resolve(shop,'legacy-fixture'),/installation_changed/);
    });
    await t.test('maintenance selects only migrated due pairs; legacy shops are never exchanged',async()=>{
      const seen:string[]=[];
      const result=await maintainOfflineTokens({database,resolve:async(domain,reference)=>{
        assert.equal(domain,shop);seen.push(reference);return 'fixture';
      }});
      assert.deepEqual(seen,[ref]);assert.deepEqual(result,{checked:1,failed:0});assert.equal(grants,0);
    });
    await t.test('wrong runtime app identity cannot refresh a stored installation',async()=>{
      process.env.SHOPIFY_API_KEY='wrong-app';
      await assert.rejects(resolve(shop,ref),/configuration/);assert.equal(grants,0);
      process.env.SHOPIFY_API_KEY='fixture-client';
    });
    await t.test('concurrent workers issue one refresh; later calls use committed pair',async()=>{
      const tokens=await Promise.all(Array.from({length:8},()=>resolve(shop,ref)));
      assert.deepEqual(new Set(tokens),new Set(['fixture-access-1']));assert.equal(grants,1);
      assert.equal(await resolve(shop,ref),'fixture-access-1');assert.equal(grants,1);
    });
    await t.test('multiple consecutive rotations use replacement refresh token and provider TTL',async()=>{
      now+=3600_000;assert.equal(await resolve(shop,ref),'fixture-access-2');
      now+=3600_000;assert.equal(await resolve(shop,ref),'fixture-access-3');assert.equal(grants,3);
      const row=(await pool.query('SELECT * FROM shopify_offline_tokens')).rows[0];
      assert.equal(new Date(row.access_expires_at).getTime(),now+3600_000);
      assert.equal(openOfflinePair(row.encrypted_pair,'owner',shop,ref).refreshToken,'fixture-refresh-3');
    });
    await t.test('transport failure retains durable pair and next invocation recovers',async()=>{
      now+=3600_000;const before=(await pool.query('SELECT encrypted_pair FROM shopify_offline_tokens')).rows[0].encrypted_pair;
      await assert.rejects(resolve(shop,ref,{grant:async()=>{throw new ShopifyTokenError('retry_later');}}),/retry_later/);
      assert.equal((await pool.query('SELECT encrypted_pair FROM shopify_offline_tokens')).rows[0].encrypted_pair,before);
      assert.equal(await resolve(shop,ref),'fixture-access-4');
    });
    await t.test('DB failure after successful provider rotation rolls back; old refresh can recover lost response',async()=>{
      now+=3600_000;
      await pool.query(`CREATE FUNCTION reject_pair() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture_write_failure'; END $$;
        CREATE TRIGGER reject_pair BEFORE UPDATE ON shopify_offline_tokens FOR EACH ROW EXECUTE FUNCTION reject_pair()`);
      let attempts=0;const ambiguous=async(_s:string,g:any)=>{assert.equal(g.refresh_token,'fixture-refresh-4');attempts++;return pair(5);};
      await assert.rejects(resolve(shop,ref,{grant:ambiguous}));
      await pool.query('DROP TRIGGER reject_pair ON shopify_offline_tokens');
      assert.equal(await resolve(shop,ref,{grant:ambiguous}),'fixture-access-5');assert.equal(attempts,2);
    });
    await t.test('failed installation transaction preserves previous good credential and billing',async()=>{
      await assert.rejects(persistOfflineInstallation('owner',otherShop,pair(6),{billingPlan:'free'},database));
      assert.equal(await resolve(shop,ref),'fixture-access-5');
      const user=(await pool.query("SELECT * FROM users WHERE id='owner'")).rows[0];
      assert.equal(user.shopify_access_token,ref);assert.equal(user.billing_plan,'pro');
    });
    await t.test('failed pair INSERT rolls back user replacement and entitlements together',async()=>{
      await pool.query(`CREATE TRIGGER reject_pair BEFORE INSERT ON shopify_offline_tokens FOR EACH ROW EXECUTE FUNCTION reject_pair()`);
      await assert.rejects(persistOfflineInstallation('owner',shop,pair(7),{billingPlan:'free'},database));
      await pool.query('DROP TRIGGER reject_pair ON shopify_offline_tokens');
      assert.equal(await resolve(shop,ref),'fixture-access-5');
      assert.equal((await pool.query("SELECT billing_plan FROM users WHERE id='owner'")).rows[0].billing_plan,'pro');
    });
    await t.test('uninstall waits for refresh, erases its committed pair and leaves other tenants independent',async()=>{
      const racer='racer.myshopify.com';
      await pool.query("INSERT INTO users VALUES ('racer',$1,'racer-legacy','active',NULL,'pro');",[racer]);
      await pool.query("INSERT INTO integrations VALUES ('racer','shopify',true,'{}')");
      const racerRef=await persistOfflineInstallation('racer',racer,pair(20,30),{},database);
      let release!:()=>void,started!:()=>void;
      const barrier=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{started=r;});
      const refreshing=resolve(racer,racerRef,{grant:async()=>{started();await barrier;return pair(21);}});
      await ready;
      assert.equal(await resolve(otherShop,'other-legacy'),'other-legacy');
      let erased=false;
      const uninstall=pool.query("UPDATE users SET shopify_access_token=NULL,shopify_subscription_status='uninstalled' WHERE id='racer'").then(()=>{erased=true;});
      await new Promise(r=>setTimeout(r,30));assert.equal(erased,false);
      release();assert.equal(await refreshing,'fixture-access-21');await uninstall;
      assert.equal((await pool.query("SELECT * FROM shopify_offline_tokens WHERE user_id='racer'")).rowCount,0);
      await assert.rejects(resolve(racer,racerRef),/installation_changed/);
    });
    await t.test('tenant/shop isolation, inactive integration and deleted user fail closed',async()=>{
      await assert.rejects(resolve(otherShop,ref),/installation_changed/);
      await assert.rejects(resolve(shop,'other-legacy'),/installation_changed/);
      await pool.query("UPDATE integrations SET is_active=false WHERE user_id='owner'");
      await assert.rejects(resolve(shop,ref),/installation_changed/);
      await pool.query("UPDATE integrations SET is_active=true WHERE user_id='owner';UPDATE users SET deletion_requested_at=now() WHERE id='owner'");
      await assert.rejects(resolve(shop,ref),/installation_changed/);
      await pool.query("UPDATE users SET deletion_requested_at=NULL WHERE id='owner'");
    });
    await t.test('terminal refresh is durable without deleting credentials, billing or forcing reconnect',async()=>{
      now+=3600_000;let calls=0;
      await assert.rejects(resolve(shop,ref,{grant:async()=>{calls++;throw new ShopifyTokenError('reauthorization_required');}}),/reauthorization_required/);
      await assert.rejects(resolve(shop,ref,{grant:async()=>{calls++;return pair(7);}}),/reauthorization_required/);assert.equal(calls,1);
      assert.equal((await pool.query("SELECT billing_plan FROM users WHERE id='owner'")).rows[0].billing_plan,'pro');
    });
    await t.test('reauthorization replaces terminal pair; old workers cannot revive it; uninstall purges secrets',async()=>{
      const newRef=await persistOfflineInstallation('owner',shop,pair(8),{},database);
      await assert.rejects(resolve(shop,ref),/installation_changed/);assert.equal(await resolve(shop,newRef),'fixture-access-8');
      await pool.query("UPDATE users SET shopify_access_token=NULL,shopify_subscription_status='uninstalled' WHERE id='owner'");
      assert.equal((await pool.query('SELECT * FROM shopify_offline_tokens')).rowCount,0);
      await assert.rejects(resolve(shop,newRef),/installation_changed/);
    });
    await t.test('account deletion cascades and shop reassignment purges encrypted pair',async()=>{
      await persistOfflineInstallation('other',otherShop,pair(9),{},database);
      await pool.query("UPDATE users SET shopify_shop='changed.myshopify.com' WHERE id='other'");
      assert.equal((await pool.query('SELECT * FROM shopify_offline_tokens')).rowCount,0);
      await persistOfflineInstallation('other',otherShop,pair(10),{},database);
      await pool.query("DELETE FROM users WHERE id='other'");
      assert.equal((await pool.query('SELECT * FROM shopify_offline_tokens')).rowCount,0);
    });
    await t.test('explicit one-shop migration fences a lost response and recovers only the original grant',async()=>{
      const pilot='pilot.myshopify.com';
      await pool.query("INSERT INTO users VALUES ('pilot',$1,'pilot-legacy','active',NULL,'pro')",[pilot]);
      await pool.query("INSERT INTO integrations VALUES ('pilot','shopify',true,'{}')");
      const input={userId:'pilot',shop:pilot,expectedAppClientId:'fixture-client',
        acknowledgement:'invalidate-only-this-authorized-store-legacy-token' as const};
      let attempts=0;
      const lost=async(s:string,g:any)=>{assert.equal(s,pilot);assert.equal(g.legacy_token,'pilot-legacy');attempts++;
        throw new ShopifyTokenError('retry_later');};
      await assert.rejects(migrateAuthorizedLegacyInstallation({...input,expectedAppClientId:'wrong'},{database,grant:lost}),/configuration/);
      assert.equal(attempts,0);
      await assert.rejects(migrateAuthorizedLegacyInstallation(input,{database,grant:lost}),/retry_later/);
      assert.equal((await pool.query("SELECT * FROM shopify_offline_migration_attempts WHERE user_id='pilot'")).rowCount,1);
      await assert.rejects(resolve(pilot,'pilot-legacy'),/retry_later/);
      const grant=async(s:string,g:any)=>{assert.equal(s,pilot);assert.equal(g.legacy_token,'pilot-legacy');attempts++;return pair(30);};
      const results=await Promise.all(Array.from({length:2},()=>migrateAuthorizedLegacyInstallation(input,{database,grant})));
      assert.deepEqual(new Set(results.map(r=>r.status)),new Set(['migrated','already_migrated']));assert.equal(attempts,2);
      const user=(await pool.query("SELECT * FROM users WHERE id='pilot'")).rows[0];assert.equal(user.billing_plan,'pro');
      assert.equal(await resolve(pilot,user.shopify_access_token),'fixture-access-30');
      await assert.rejects(resolve(pilot,'pilot-legacy'),/installation_changed/);
      assert.equal((await pool.query('SELECT * FROM shopify_offline_migration_attempts')).rowCount,0);
      assert.ok(!JSON.stringify(results).includes('fixture-access'));
    });
    await t.test('expired migration recovery window stops before another provider request',async()=>{
      const expired='expired.myshopify.com';
      await pool.query("INSERT INTO users VALUES ('expired',$1,'expired-legacy','active',NULL,'pro')",[expired]);
      await pool.query("INSERT INTO integrations VALUES ('expired','shopify',true,'{}'); INSERT INTO shopify_offline_migration_attempts VALUES ('expired','expired.myshopify.com',now()-interval '8 days')");
      await assert.rejects(migrateAuthorizedLegacyInstallation({userId:'expired',shop:expired,expectedAppClientId:'fixture-client',
        acknowledgement:'invalidate-only-this-authorized-store-legacy-token'},{database,grant:async()=>{throw Error('provider_must_not_be_called');}}),/reauthorization_required/);
    });
  } finally {await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});

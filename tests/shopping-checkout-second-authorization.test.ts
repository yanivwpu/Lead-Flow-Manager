import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzle as liteDrizzle } from 'drizzle-orm/pglite';
import type { CatalogDb } from '../server/salesCatalog/commerceStore';
import { secondCartAuthorization,privateCartReceiptCodec } from '../server/aiTestChat/secondCartAuthorization';
import { createExecutionDiagnostics } from '../server/shopping/checkout/executionDiagnostics';
import { cleanupCheckout } from '../server/shopping/checkout/cleanup';

async function fixture(expired=false){
 const target=process.env.CATALOG_TEST_DATABASE_URL;let pg:any,db:CatalogDb,cleanup:()=>Promise<void>;
 if(target){
  const url=new URL(target);
  if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/whachat_catalog_test')throw Error('Disposable local PostgreSQL only');
  const admin=new Pool({connectionString:target});const name='cart_second_'+randomUUID().replaceAll('-','');
  await admin.query(`CREATE DATABASE "${name}"`);url.pathname='/'+name;
  const pool=new Pool({connectionString:url.toString()});pg=pool;db=drizzle(pool) as unknown as CatalogDb;
  cleanup=async()=>{await pool.end();await admin.query(`DROP DATABASE "${name}"`);await admin.end();};
 }else{pg=new PGlite();db=liteDrizzle(pg) as unknown as CatalogDb;cleanup=()=>pg.close();}
 try{
  await pg.query('CREATE TABLE users (id varchar PRIMARY KEY)');await pg.query("INSERT INTO users VALUES ('pilot-fixture'),('other-fixture')");
  for(const path of ['migrations/0112_shopify_checkout_admin_tests.sql','migrations/0115_private_cart_second_authorization.sql'])await (pg.exec?pg.exec(readFileSync(path,'utf8')):pg.query(readFileSync(path,'utf8')));
  const binding={workspaceId:'pilot-fixture',operatorId:'pilot-fixture',shop:'whachatcrm.myshopify.com',integrationId:'synthetic-install',installationDigest:'synthetic-digest'};
  const original=randomUUID(),authorization=randomUUID(),a=randomUUID(),b=randomUUID();
  for(const id of [original,a,b])await pg.query(`INSERT INTO shopify_checkout_admin_tests
   (request_id,workspace_id,operator_id,session_digest,shop,integration_id,installation_digest,selection,selection_digest,expires_at,claimed_at)
   VALUES ($1,'pilot-fixture','pilot-fixture','session','whachatcrm.myshopify.com','synthetic-install','synthetic-digest',$2,'selection',now()+interval '5 minutes',$3)`,
   [id,JSON.stringify({kind:'private_liquid_v1',authorizationId:authorization}),id===original?new Date():null]);
  await pg.query(`INSERT INTO shopify_private_cart_second_authorization
   (attempt_number,authorization_id,original_request_id,workspace_id,operator_id,shop,integration_id,installation_digest,approved_by,approval_reference,authorized_at,expires_at)
   VALUES (2,$1,$2,'pilot-fixture','pilot-fixture','whachatcrm.myshopify.com','synthetic-install','synthetic-digest','pilot-fixture','synthetic-reviewed-approval',now()-interval '2 hours',CASE WHEN $3 THEN now()-interval '1 hour' ELSE now()+interval '1 hour' END)`,[authorization,original,expired]);
  return {pg,db,cleanup,binding,original,authorization,a,b,journal:secondCartAuthorization(db,binding)};
 }catch(error){await cleanup();throw error;}
}
test('PostgreSQL second-authorization race: one durable winner across requests; original fence remains unchanged',async()=>{
 const f=await fixture();try{
  const original=(await f.pg.query('SELECT * FROM shopify_checkout_admin_tests WHERE request_id=$1',[f.original])).rows[0];
  let mutations=0;
  const results=await Promise.allSettled([f.a,f.b].map(async request=>{
   await secondCartAuthorization(f.db,f.binding).claim(f.authorization,request,'a'.repeat(64));
   // A separate query observes the committed claim before the fake provider operation.
   const row=(await f.pg.query('SELECT request_id,claimed_at FROM shopify_private_cart_second_authorization')).rows[0];
   assert.equal(row.request_id,request);assert.ok(row.claimed_at);mutations++;
  }));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(mutations,1);
  await assert.rejects(f.pg.query('DELETE FROM shopify_private_cart_second_authorization'));
  await assert.rejects(f.pg.query('UPDATE shopify_private_cart_second_authorization SET claimed_at=NULL,request_id=NULL,scope_digest=NULL'));
  await assert.rejects(f.journal.claim(f.authorization,f.a,'a'.repeat(64)));await assert.rejects(f.journal.available());
  assert.deepEqual((await f.pg.query('SELECT * FROM shopify_checkout_admin_tests WHERE request_id=$1',[f.original])).rows[0],original);
  await assert.rejects(f.pg.query('UPDATE shopify_checkout_admin_tests SET claimed_at=now() WHERE request_id=$1',[f.a]));
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM shopify_checkout_admin_tests WHERE claimed_at IS NOT NULL')).rows[0].n,1);
 }finally{await f.cleanup();}
});
test('authorization is fail-closed for foreign owner, installation, credential, disabled trigger and invalid durable index',async()=>{
 const f=await fixture();try{
  for(const patch of [{workspaceId:'other-fixture'},{operatorId:'other-fixture'},{integrationId:'changed'},{installationDigest:'changed'}]){
   const journal=secondCartAuthorization(f.db,{...f.binding,...patch});await assert.rejects(journal.available());await assert.rejects(journal.claim(f.authorization,f.a,'b'.repeat(64)));
  }
  await f.pg.query('ALTER TABLE shopify_private_cart_second_authorization DISABLE TRIGGER preserve_private_cart_second_authorization');
  await assert.rejects(f.journal.available());
  await f.pg.query('ALTER TABLE shopify_private_cart_second_authorization ENABLE TRIGGER preserve_private_cart_second_authorization');
  await f.pg.query('ALTER TABLE shopify_private_cart_second_authorization DROP CONSTRAINT shopify_private_cart_second_authorization_pkey');
  await assert.rejects(f.journal.available());await assert.rejects(f.journal.claim(f.authorization,f.a,'b'.repeat(64)));
  assert.equal((await f.pg.query('SELECT claimed_at FROM shopify_private_cart_second_authorization')).rows[0].claimed_at,null);
 }finally{await f.cleanup();}
});
test('secure receipt and safe diagnostic survive status failure; uninstall erases receipt and revokes without clearing either fence',async()=>{
 const f=await fixture();try{
  await f.journal.claim(f.authorization,f.a,'c'.repeat(64));
  let last:any;const diagnostic=createExecutionDiagnostics(randomUUID(),e=>{last=e;});diagnostic.bind(f.a);diagnostic.claimStarted();diagnostic.claimed();diagnostic.dispatch();
  await f.journal.persist(f.authorization,f.a,last);
  const env={SHOPPING_CHECKOUT_RECEIPT_KEY:Buffer.alloc(32,7).toString('base64')};
  const receipt={checkoutUrl:'https://whachatcrm.myshopify.com/cart/c/synthetic?key=private',providerCartId:'gid://shopify/Cart/synthetic?key=private',paymentStatus:'unknown' as const};
  diagnostic.provider({operation:'create',event:'receipt_validated'});
  await f.journal.persist(f.authorization,f.a,last,{env,value:receipt});
  diagnostic.stage('status_verification');diagnostic.failed(Error('provider-secret-never-log'));
  await f.journal.persist(f.authorization,f.a,last);
  const row=(await f.pg.query('SELECT * FROM shopify_private_cart_second_authorization')).rows[0];
  assert.ok(row.claimed_at);assert.ok(row.receipt_at);assert.equal(row.verified_at,null);
  assert.deepEqual(privateCartReceiptCodec(env).open(row.encrypted_receipt,`${f.authorization}:${f.a}`),receipt);
  assert.throws(()=>privateCartReceiptCodec(env).open(row.encrypted_receipt,`${f.authorization}:${f.b}`));
  assert.doesNotMatch(JSON.stringify(row),/provider-secret|checkoutUrl|providerCartId|key=private/);
  await cleanupCheckout(f.db,f.binding.shop);
  const erased=(await f.pg.query('SELECT * FROM shopify_private_cart_second_authorization')).rows[0];
  assert.equal(erased.encrypted_receipt,null);assert.equal(erased.diagnostic,null);assert.ok(erased.revoked_at);assert.ok(erased.claimed_at);
  await assert.rejects(f.journal.available(f.authorization,f.a));
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM shopify_checkout_admin_tests WHERE claimed_at IS NOT NULL')).rows[0].n,1);
 }finally{await f.cleanup();}
});

test('expired second authorization cannot prepare or claim even when the original remains consumed',async()=>{
 const f=await fixture(true);try{await assert.rejects(f.journal.available());await assert.rejects(f.journal.claim(f.authorization,f.a,'d'.repeat(64)));
 assert.equal((await f.pg.query('SELECT claimed_at FROM shopify_private_cart_second_authorization')).rows[0].claimed_at,null);
 }finally{await f.cleanup();}
});

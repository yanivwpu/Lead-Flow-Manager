import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import * as schema from '../shared/schema';
import { preview, reconcile, contactChanges, PILOT_ACCOUNT, PILOT_SHOP, type Client } from '../scripts/shopify-pilot/reconcileIdentity';
import { scrubShopifyContactMetadata } from '../shared/shopifyPrivacyRedaction';
import { createPostPurchasePreparation } from '../server/ecommerce/postPurchasePreparation';
import { commerceConnectionFingerprint } from '../server/ecommerce/checkoutRecoveryProductionRelease';

const s = { account: PILOT_ACCOUNT, shop: PILOT_SHOP, canonical: 'fixture-A', source: 'fixture-B' };
const phone = '972501234567', secret = 'fixture-only-privacy-key';
const clock = Math.floor(Date.now()/1000)*1000;
async function fixture() {
  const pg = new PGlite();
  const config = getTableConfig(schema.contacts);
  await pg.exec(`CREATE TABLE contacts(${config.columns.map(c => '"'+c.name+'" '+c.getSQLType()+(c.name === 'id' ? ' PRIMARY KEY' : '')).join(',')});
    CREATE TABLE users(id varchar PRIMARY KEY,email text,shopify_shop text,shopify_installed_at timestamptz,meta_connected boolean,
    meta_business_account_id text,meta_phone_number_id text,deletion_requested_at timestamptz,shopify_subscription_status text,shopify_access_token text);
    CREATE TABLE integrations(id varchar PRIMARY KEY,user_id varchar,type text,is_active boolean,config jsonb);
    CREATE TABLE conversations(id varchar PRIMARY KEY,user_id varchar,contact_id varchar REFERENCES contacts(id) ON DELETE CASCADE,channel text,external_thread_id text,shopping_state jsonb);
    CREATE TABLE messages(id varchar PRIMARY KEY,user_id varchar,contact_id varchar REFERENCES contacts(id) ON DELETE CASCADE,conversation_id varchar REFERENCES conversations(id),content text,external_message_id text);
    CREATE TABLE activity_events(id varchar PRIMARY KEY,user_id varchar,contact_id varchar REFERENCES contacts(id) ON DELETE CASCADE,event_data jsonb);
    CREATE TABLE no_reply_jobs(id varchar PRIMARY KEY,user_id varchar,contact_id varchar REFERENCES contacts(id) ON DELETE CASCADE,status text,idempotency_key text);
    CREATE TABLE automation_send_dedup(dedup_key text PRIMARY KEY,user_id varchar,contact_id varchar,status text,created_at timestamptz DEFAULT now());
    CREATE TABLE marketing_suppressions(workspace_user_id varchar,email_normalized text,scope text,reason text);
    CREATE TABLE shopify_privacy_customer_locks(identity_hash text PRIMARY KEY);
    CREATE TABLE ecommerce_growth_event_inbox(id bigint PRIMARY KEY,delivery_id text);
    CREATE TABLE message_templates(id varchar PRIMARY KEY);`);
  await pg.query(`INSERT INTO users VALUES($1,'fixture@example.invalid',$2,$3,true,'111111','111112',NULL,'active','fixture-token')`,[s.account,s.shop,new Date(clock-86400000)]);
  await pg.query(`INSERT INTO integrations VALUES('install',$1,'shopify',true,'{}')`,[s.account]);
  await pg.query(`INSERT INTO contacts(id,user_id,name,phone,whatsapp_id,source,custom_fields,source_details,automations_paused,tag,pipeline_stage,created_at)
    VALUES($1,$3,'Shopify fixture',$4,NULL,'shopify',$5,'{}',false,'New','Lead',now()),
    ($2,$3,'WhatsApp fixture',$4,$4,'whatsapp','{}','{}',false,'New','Lead',now())`,
  [s.canonical,s.source,s.account,phone,JSON.stringify({shopifyCustomerId:'123',shopifyShop:s.shop})]);
  await pg.query(`INSERT INTO conversations VALUES('quiet',$1,$2,'shopify',NULL,'{}'),('wa',$1,$3,'whatsapp','fixture-thread','{}')`,[s.account,s.canonical,s.source]);
  await pg.query(`INSERT INTO messages VALUES('msg',$1,$2,'wa','history preserved','wamid.fixture_history')`,[s.account,s.source]);
  await pg.query(`INSERT INTO activity_events VALUES('event',$1,$2,'{}');`,[s.account,s.source]);
  await pg.query(`INSERT INTO no_reply_jobs VALUES('job',$1,$2,'completed','original-budget')`,[s.account,s.source]);
  await pg.query(`INSERT INTO automation_send_dedup(dedup_key,user_id,contact_id,status) VALUES($1,$2,$3,'completed')`,['wf_msg_tpl:workflow:template:'+s.source+':fixture-history',s.account,s.source]);
  await pg.exec(await readFile('migrations/20261030_ecommerce_post_purchase_intents.sql','utf8'));
  await pg.exec(await readFile('migrations/20261030_ecommerce_post_purchase_delivery_fence.sql','utf8'));
  const client = pg as unknown as Client;
  return {pg,client};
}
const approval = (digest: string) => ({digest,exactPairApproved:true,writersDrained:true});

test('exact pair rehearsal preserves history, restrictions, fences, source row and consent authority', async () => {
  const {pg,client} = await fixture();
  try {
    const before = await preview(client,s,secret);
    assert.deepEqual(before.blocked,[]);
    assert.equal((await pg.query('SELECT phone FROM contacts WHERE id=$1',[s.canonical])).rows[0].phone,phone,'preview performs no writes');
    await reconcile(client,s,secret,approval(before.digest));
    const a: any = (await pg.query('SELECT * FROM contacts WHERE id=$1',[s.canonical])).rows[0];
    const b: any = (await pg.query('SELECT * FROM contacts WHERE id=$1',[s.source])).rows[0];
    assert.equal(a.phone,'+'+phone); assert.equal(a.whatsapp_id,phone);
    assert.equal(a.custom_fields.shopifyCustomerId,'123');
    assert.equal(a.source_details.identityReconciliation.originalSource.name,'WhatsApp fixture');
    assert.equal(b.phone,null); assert.equal(b.whatsapp_id,null); assert.equal(b.email,null); assert.equal(b.automations_paused,true);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM contacts')).rows[0].n,2,'no deletion or creation');
    for(const table of ['conversations','messages','activity_events','no_reply_jobs'])
      assert.equal((await pg.query(`SELECT count(*)::int AS n FROM ${table} WHERE contact_id=$1`,[s.source])).rows[0].n,0);
    assert.equal((await pg.query('SELECT content FROM messages')).rows[0].content,'history preserved');
    assert.equal((await pg.query('SELECT status,idempotency_key FROM no_reply_jobs')).rows[0].status,'completed');
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM automation_send_dedup WHERE contact_id=$1',[s.canonical])).rows[0].n,2,'old and canonical budgets survive');
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM ecommerce_post_purchase_consents')).rows[0].n,0);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM ecommerce_post_purchase_outbox')).rows[0].n,0);
    // Store-redaction scrub cannot retain the original snapshots as independent PII.
    assert.equal(scrubShopifyContactMetadata(a.source_details,s.shop).identityReconciliation,undefined);
    const matches = (await pg.query(`SELECT id FROM contacts WHERE user_id=$1 AND (whatsapp_id=$2 OR phone=$3)`,[s.account,phone,'+'+phone])).rows;
    assert.deepEqual(matches.map((r:any)=>r.id),[s.canonical]);
    await assert.rejects(reconcile(client,s,secret,approval(before.digest)),/phone_identity/,'replay cannot recycle reconciliation');
    // Real signed-consent writer: no grant until an independently supplied signed inbound.
    const env = {RAILWAY_ENVIRONMENT_NAME:'production',APP_URL:'https://app.whachatcrm.com',
      ECOMMERCE_CONSENT_CAPTURE_PRODUCTION_APPROVED:'true',ECOMMERCE_CONSENT_CAPTURE_ACCOUNT_ID:s.account,
      ECOMMERCE_CONSENT_CAPTURE_SHOP:s.shop,ECOMMERCE_CONSENT_CAPTURE_CONNECTION_SHA256:commerceConnectionFingerprint({
        accountId:s.account,shop:s.shop,installationId:'install',wabaId:'111111',phoneId:'111112',installedAt:new Date(clock-86400000)}),
      ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY:'fixture-only-consent-key'.repeat(3)};
    const prep = createPostPurchasePreparation({ database:drizzle(pg,{schema}) as any,env,secret:()=>env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY,
      now:()=>clock,privacyLocked:async()=>false,templates:async()=>assert.fail('no provider calls') });
    const inbound = {signatureValid:true,hasRawBody:true,type:'text',phoneNumberId:'111112',from:phone,
      messageId:'wamid.fixture_consent_12345',timestamp:String(clock/1000),text:'YES WHATSAPP ORDER CONFIRMATIONS'};
    assert.equal(await prep.captureConsent(s.account,s.source,inbound),'ignored','neutral source cannot grant');
    assert.equal(await prep.captureConsent(s.account,s.canonical,{...inbound,signatureValid:false}),'ignored');
    assert.equal(await prep.captureConsent(s.account,s.canonical,inbound),'granted');
    assert.equal((await pg.query('SELECT purpose,contact_id FROM ecommerce_post_purchase_consents')).rows[0].contact_id,s.canonical);
    assert.equal(await prep.captureConsent(s.account,s.canonical,{...inbound,text:'STOP',timestamp:String(clock/1000+1),messageId:'wamid.fixture_stop_12345'}),'revoked');
    // Use the actual privacy deletion service on the reconciled fixture. Source
    // shell remains, but neither source snapshots nor original/alias fence text leak.
    await pg.exec(`CREATE TABLE contact_notes(contact_id varchar); CREATE TABLE appointments(contact_id varchar);
      CREATE TABLE flow_jobs(contact_id varchar); CREATE TABLE calendly_canceled_event_tombstones(contact_id varchar);`);
    process.env.DATABASE_URL ||= 'postgres://fixture:fixture@127.0.0.1:1/fixture';
    const {deleteContactRecords} = await import('../server/contactDeleteService');
    await deleteContactRecords([s.canonical],drizzle(pg,{schema}) as any);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM automation_send_dedup')).rows[0].n,0);
    const remaining:any=(await pg.query('SELECT * FROM contacts')).rows[0];
    assert.equal(remaining.id,s.source); assert.equal(remaining.phone,null); assert.equal(remaining.name,'Reconciled contact');
    assert.deepEqual(remaining.custom_fields,{}); assert.deepEqual(remaining.source_details,{contactLifecycle:'inbox_only'});
  } finally { await pg.close(); }
});

test('tenant, drift, privacy, active jobs and unknown references fail closed without partial changes',async t=>{
  for(const kind of ['tenant','stale','privacy','activeJob','unknown','snapshot','array','third','outbox','consent','foreignHistory'] as const) await t.test(kind,async()=>{
    const {pg,client}=await fixture();
    try {
      const plan=await preview(client,s,secret);
      if(kind==='tenant') {
        await assert.rejects(preview(client,{...s,account:'other'},secret),/scope/); return;
      }
      if(kind==='stale') await pg.query("UPDATE contacts SET notes='changed after review' WHERE id=$1",[s.canonical]);
      if(kind==='privacy') {
        const h=createHmac('sha256',secret).update('shopify-privacy-v1:'+JSON.stringify([s.shop,'id:123'])).digest('hex');
        await pg.query('INSERT INTO shopify_privacy_customer_locks VALUES($1)',[h]);
      }
      if(kind==='activeJob') await pg.exec("UPDATE no_reply_jobs SET status='pending'");
      if(kind==='unknown') {await pg.exec('CREATE TABLE new_contact_reference(contact_id varchar REFERENCES contacts(id))');await pg.query('INSERT INTO new_contact_reference VALUES($1)',[s.source]);}
      if(kind==='snapshot') {await pg.exec('CREATE TABLE future_jobs(payload jsonb)');await pg.query('INSERT INTO future_jobs VALUES($1)',[JSON.stringify({contactId:s.source})]);}
      if(kind==='array') {await pg.exec('CREATE TABLE future_contact_batch(contact_ids text[])');await pg.query('INSERT INTO future_contact_batch VALUES($1)',[[s.source]]);}
      if(kind==='third') await pg.query(`INSERT INTO contacts(id,user_id,name,phone) VALUES('third',$1,'third',$2)`,[s.account,'+'+phone]);
      if(kind==='outbox') {
        await pg.exec("INSERT INTO message_templates VALUES('template'); INSERT INTO ecommerce_growth_event_inbox VALUES(1,'fixture-delivery')");
        await pg.query(`INSERT INTO ecommerce_post_purchase_orders VALUES($1,'install',$2,'gid://shopify/Order/1','gid://shopify/Customer/123','open',now())`,[s.account,s.shop]);
        await pg.query(`INSERT INTO ecommerce_post_purchase_intents(account_id,installation_id,shop,order_gid,customer_gid,contact_id,event_id,topic,occurred_at,journey,due_at,state)
          VALUES($1,'install',$2,'gid://shopify/Order/1','gid://shopify/Customer/123',$3,1,'orders/create',now(),'orderConfirmation',now(),'preview_ready')`,[s.account,s.shop,s.source]);
        await pg.query(`INSERT INTO ecommerce_post_purchase_outbox(intent_id,account_id,installation_id,shop,order_gid,journey,contact_id,template_id)
          SELECT id,account_id,installation_id,shop,order_gid,journey,contact_id,'template' FROM ecommerce_post_purchase_intents`);
      }
      if(kind==='consent') await pg.query(`INSERT INTO ecommerce_post_purchase_consents(account_id,shop,recipient_hmac,purpose,contact_id,customer_gid,granted_at,last_inbound_at,last_wamid)
        VALUES($1,$2,$3,'orderConfirmation',$4,'gid://shopify/Customer/123',now(),now(),'wamid.fixture_old_12345')`,[s.account,s.shop,'a'.repeat(64),s.source]);
      if(kind==='foreignHistory') await pg.exec("UPDATE messages SET user_id='other-tenant'");
      const fresh = ['activeJob','unknown','snapshot','array','outbox','consent','foreignHistory'].includes(kind) ? await preview(client,s,secret) : null;
      if(fresh) assert.ok(fresh.blocked.length);
      await assert.rejects(reconcile(client,s,secret,approval(fresh?.digest??plan.digest)),/pilot_reconciliation_/);
      assert.equal((await pg.query('SELECT whatsapp_id FROM contacts WHERE id=$1',[s.source])).rows[0].whatsapp_id,phone);
      assert.equal((await pg.query('SELECT contact_id FROM messages')).rows[0].contact_id,s.source);
    } finally {await pg.close();}
  });
});

test('failure after a reference move rolls back the entire operation and sanitizes database errors',async()=>{
  const {pg,client}=await fixture();
  try {
    const plan=await preview(client,s,secret);
    const failing:Client={query:async(sql,values)=>{
      if(sql.startsWith('UPDATE "messages"')) throw Error('private-provider-phone-and-content');
      return client.query(sql,values);
    }};
    await assert.rejects(reconcile(failing,s,secret,approval(plan.digest)),{message:'pilot_reconciliation_transaction_failed'});
    assert.equal((await pg.query("SELECT contact_id FROM conversations WHERE id='wa'")).rows[0].contact_id,s.source);
    assert.equal((await pg.query('SELECT whatsapp_id FROM contacts WHERE id=$1',[s.source])).rows[0].whatsapp_id,phone);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM automation_send_dedup')).rows[0].n,1);
  } finally {await pg.close();}
});

test('restriction union never turns STOP, DNC, pause or marketing refusal into opt-in',async()=>{
  const {pg}=await fixture();
  try {
    const a:any=(await pg.query('SELECT * FROM contacts WHERE id=$1',[s.canonical])).rows[0];
    const b:any=(await pg.query('SELECT * FROM contacts WHERE id=$1',[s.source])).rows[0];
    for(const patch of [{tag:'STOP'},{pipeline_stage:'Do not contact'},{custom_fields:{marketingOptIn:false}},{custom_fields:{dnc:true}}]) {
      const plan=contactChanges(a,{...b,...patch},s,false);
      assert.equal(plan.canonical.custom_fields.doNotContact,true);
      assert.equal(plan.restricted,true);
    }
    const paused=contactChanges(a,{...b,automations_paused:true,automations_paused_at:new Date(clock)},s,false);
    assert.equal(paused.canonical.automations_paused,true);
    assert.equal(paused.canonical.automations_paused_at.valueOf(),clock);
    assert.notEqual(paused.canonical.custom_fields.doNotContact,true,'operational pause is not fabricated DNC');
    assert.equal(contactChanges(a,b,s,true).canonical.custom_fields.doNotContact,true);
    await assert.rejects(reconcile(pg as any,s,secret,{digest:'a'.repeat(64),exactPairApproved:false,writersDrained:true}),/approval_required/);
  } finally {await pg.close();}
});

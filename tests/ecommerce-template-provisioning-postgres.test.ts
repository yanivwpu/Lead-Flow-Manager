import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {build} from 'esbuild';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';
import express from 'express';
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {sql} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import { createShopifyTemplateProvisioner, shopifyTemplateSetupAllowed, packageTemplateCompatible,
  dueShopifyTemplateSetupsQuery,type TemplateDatabase, type TemplateProvider } from "../server/ecommerce/shopifyTemplateProvisioning";
import { SHOPIFY_GROWTH_TEMPLATES, parseShopifyTemplateSetupAuthorization,stripShopifyGrowthManagedConfig } from "../shared/shopifyGrowthTemplates";
import {savePostPurchaseTemplateBindingQuery,preserveShopifyGrowthManagedConfig} from '../server/ecommerce/postPurchaseTemplateBinding';

const account = "10000000-0000-4000-8000-000000000001", other = "20000000-0000-4000-8000-000000000002";
const env = { ECOMMERCE_TEMPLATE_PROVISIONING_ENABLED: "true", ECOMMERCE_TEMPLATE_PROVISIONING_STAGE: "internal_pilot",
  ECOMMERCE_TEMPLATE_PROVISIONING_ACCOUNT_IDS: account + "," + other };
const liveTemplate = (index: number, status = "APPROVED") => ({
  id: String(1000 + index), name: SHOPIFY_GROWTH_TEMPLATES[index].name, language: "en", status,
  category: SHOPIFY_GROWTH_TEMPLATES[index].category,
  components: [{ type: "BODY", text: SHOPIFY_GROWTH_TEMPLATES[index].bodyText }],
});

async function fixture(maxConnections = 8) {
  const url = process.env.ECOMMERCE_TEST_DATABASE_URL ?? process.env.SHOPIFY_TEST_DATABASE_URL;
  if (!url) throw Error("isolated_postgres_required");
  const schema = "template_setup_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: maxConnections,
    connectionTimeoutMillis: 2000 });
  await pool.query(`
    CREATE TABLE users(id text PRIMARY KEY,shopify_shop text,shopify_access_token text DEFAULT 'fixture-shopify',
      shopify_subscription_status text DEFAULT 'active',shopify_installed_at timestamptz DEFAULT NOW(),deletion_requested_at timestamptz,
      meta_connected boolean DEFAULT true,meta_access_token text DEFAULT 'fixture-meta',meta_business_account_id text,
      meta_phone_number_id text,meta_token_expires_at timestamptz,whatsapp_provider text DEFAULT 'meta',
      billing_plan text DEFAULT 'pro',subscription_status text DEFAULT 'active',plan_override_enabled boolean DEFAULT false,
      plan_override text,trial_ends_at timestamptz,trial_status text,trial_plan text);
    CREATE TABLE integrations(id text PRIMARY KEY,user_id text,type text DEFAULT 'shopify',is_active boolean DEFAULT true,config jsonb DEFAULT '{}');
    CREATE TABLE ecommerce_shopify_workspace_activations(account_id text,installation_id text,shop text);
    CREATE TABLE message_templates(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,user_id text,twilio_sid text,
      name text,language text,category text,status text,template_type text,body_text text,footer_text text,header_type text,
      header_format text,header_content text,approved_sample_media_url text,approved_sample_media_type text,
      media_runtime_required boolean,created_at timestamptz DEFAULT NOW(),
      buttons jsonb DEFAULT '[]',carousel_cards jsonb DEFAULT '[]',variables jsonb DEFAULT '[]',last_synced_at timestamptz DEFAULT NOW());
  `);
  for (const [id, shop, wabaId, phone] of [[account, "first.myshopify.com", "11111", "11112"], [other, "second.myshopify.com", "22221", "22222"]]) {
    await pool.query("INSERT INTO users(id,shopify_shop,meta_business_account_id,meta_phone_number_id) VALUES($1,$2,$3,$4)", [id, shop, wabaId, phone]);
    await pool.query("INSERT INTO integrations(id,user_id,config) VALUES($1,$2,$3)", ["install-" + id, id, { shop, unrelated: { preserved: true } }]);
    await pool.query("INSERT INTO ecommerce_shopify_workspace_activations VALUES($1,$2,$3)", [id, "install-" + id, shop]);
  }
  let clock = Date.now(), nextId = 3000;
  const inventory = new Map<string, any[]>([["11111", []], ["22221", []]]);
  const creates: Array<{ accountId: string; waba: string; name: string }> = [];
  const reads: string[] = [];
  const provider: TemplateProvider = {
    list: async merchant => { reads.push(merchant.wabaId); return structuredClone(inventory.get(merchant.wabaId) ?? []); },
    create: async (merchant, template) => {
      creates.push({ accountId: merchant.accountId, waba: merchant.wabaId, name: template.name });
      const row = { id: String(nextId++), name: template.name, language: "en", category: template.category,
        status: "PENDING", components: [{ type: "BODY", text: template.bodyText }] };
      inventory.get(merchant.wabaId)!.push(row); return { id: row.id };
    },
  };
  const db = drizzle(pool);
  const service = (database: TemplateDatabase = db,configuration:Record<string,string|undefined>=env) =>
    createShopifyTemplateProvisioner({ database, provider, env:configuration, now: () => clock });
  const config = async (id = account) => (await pool.query("SELECT config FROM integrations WHERE user_id=$1", [id])).rows[0].config;
  const tick = async (id = account) => { clock += 16 * 60_000; return service().reconcile(id); };
  return { pool, db, service, config, tick, provider, inventory, creates, reads,
    advance: (amount = 16 * 60_000) => { clock += amount; },
    close: async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); } };
}

test("template management release is scoped and default-off; authorization cannot inject WABA, tenant or sends", () => {
  assert.equal(shopifyTemplateSetupAllowed({}, account), false);
  assert.equal(shopifyTemplateSetupAllowed(env, account), true);
  assert.equal(shopifyTemplateSetupAllowed(env, "foreign"), false);
  for (const ids of ["*", "all", account + ",", " " + account])
    assert.equal(shopifyTemplateSetupAllowed({ ...env, ECOMMERCE_TEMPLATE_PROVISIONING_ACCOUNT_IDS: ids }, account), false);
  assert.equal(shopifyTemplateSetupAllowed({ ...env, ECOMMERCE_TEMPLATE_PROVISIONING_STAGE: "general" }, account), false);
  assert.equal(parseShopifyTemplateSetupAuthorization({ action: "authorize_template_setup", packageVersion: 1 }), true);
  for (const extra of [{ wabaId: "22221" }, { accountId: other }, { enabled: true }, { consent: true }, { language: "he" }])
    assert.equal(parseShopifyTemplateSetupAuthorization({ action: "authorize_template_setup", packageVersion: 1, ...extra }), false);
});

test("empty merchant WABA: authorized setup submits exactly four English templates, reconciles approval, syncs and binds", async () => {
  const f = await fixture();
  try {
    assert.equal(await f.service().reconcile(account), "busy");
    assert.equal(f.creates.length, 0);
    assert.equal(await f.service().authorize(account), true);
    for (let i = 0; i < 4; i++) { await f.tick(); assert.equal(f.creates.length, i + 1); }
    assert.deepEqual(f.creates.map(c => c.name), SHOPIFY_GROWTH_TEMPLATES.map(t => t.name));
    assert.ok((await f.service().view(account)).rows.every(r => r.status === "awaiting_approval"));
    assert.equal((await f.pool.query("SELECT * FROM message_templates")).rowCount, 0);
    for (const row of f.inventory.get("11111")!) row.status = "APPROVED";
    await f.tick();
    const result = await f.service().view(account), config = await f.config();
    assert.ok(result.rows.every(r => r.status === "ready" && r.templateId));
    assert.equal(Object.keys(config.ecommercePostPurchaseTemplates).length, 3);
    assert.ok(config.ecommerceCheckoutRecoveryTemplateId);
    assert.deepEqual(config.unrelated, { preserved: true });
    assert.equal(config.ecommercePostPurchaseDeliveryEnabled, undefined);
    assert.equal(config.ecommerceCheckoutRecoveryDeliveryEnabled, undefined);
    assert.equal(config.ecommercePostPurchasePlans, undefined);
    assert.equal((await f.pool.query("SELECT * FROM message_templates WHERE user_id=$1", [account])).rowCount, 4);
    // Fresh service (restart/refresh) and same-WABA credential renewal keep IDs and fences.
    await f.pool.query("UPDATE users SET meta_access_token='fixture-renewed' WHERE id=$1", [account]);
    await f.service().authorize(account); await f.tick();
    assert.deepEqual((await f.config()).ecommercePostPurchaseTemplates, config.ecommercePostPurchaseTemplates);
    assert.equal(f.creates.length, 4);
    assert.doesNotMatch(JSON.stringify(result), /11111|leaseId|authorizedFor|providerId|fixture-meta/);
  } finally { await f.close(); }
});

test("existing approved pilot selections are reused without replacements; competing workers submit only once", async () => {
  const f = await fixture();
  try {
    f.inventory.set("11111", [0, 1, 2].map(i => liveTemplate(i)));
    const saved: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      const template = SHOPIFY_GROWTH_TEMPLATES[i], id = "accepted-pilot-" + i;
      saved[template.journey] = id;
      await f.pool.query("INSERT INTO message_templates(id,user_id,twilio_sid,name,language,category,status,template_type,body_text) VALUES($1,$2,$3,$4,'en','utility','approved','text',$5)",
        [id, account, `meta_${1000 + i}_en`, template.name, template.bodyText]);
    }
    await f.pool.query("UPDATE integrations SET config=config || $1::jsonb WHERE user_id=$2", [{ ecommercePostPurchaseTemplates: saved }, account]);
    await f.service().authorize(account);
    const results = await Promise.all([f.service().reconcile(account), f.service().reconcile(account), f.service().reconcile(account)]);
    assert.equal(results.filter(s => s === "reconciled").length, 1);
    assert.equal(f.creates.length, 1); assert.equal(f.creates[0].name, "shopify_checkout_reminder");
    assert.deepEqual((await f.config()).ecommercePostPurchaseTemplates, saved);
    assert.equal((await f.pool.query("SELECT * FROM message_templates")).rowCount, 3);
  } finally { await f.close(); }
});

test("paused, rejected, recategorized, edited, disabled and ambiguous templates never get replaced or marked ready", async () => {
  const f = await fixture();
  try {
    f.inventory.set("11111", SHOPIFY_GROWTH_TEMPLATES.map((_, i) => liveTemplate(i)));
    await f.service().authorize(account); await f.tick();
    const bindings = (await f.config()).ecommercePostPurchaseTemplates;
    for (const [index, change, expected] of [
      [0, { status: "PAUSED" }, "paused"], [1, { status: "REJECTED" }, "action_required"],
      [2, { category: "MARKETING" }, "action_required"], [3, { status: "DISABLED" }, "paused"],
    ] as const) Object.assign(f.inventory.get("11111")![index], change);
    await f.tick();
    assert.deepEqual((await f.service().view(account)).rows.map(r => r.status), ["paused", "action_required", "action_required", "paused"]);
    assert.deepEqual((await f.config()).ecommercePostPurchaseTemplates, bindings);
    assert.equal(f.creates.length, 0);
    f.inventory.set("11111", SHOPIFY_GROWTH_TEMPLATES.map((_, i) => liveTemplate(i)));
    await f.tick();
    assert.ok((await f.service().view(account)).rows.every(r => r.status === "ready"), "live reapproval repairs stale library status");
    f.inventory.get("11111")![0].components[0].text = "Changed content {{1}}";
    await f.tick();
    assert.equal((await f.service().view(account)).rows[0].status, "action_required");
    assert.equal(f.creates.length, 0);
  } finally { await f.close(); }
});

test("tenant/WABA isolation, changed connection, revoked engine, expired tokens and management denial fail closed", async () => {
  const f = await fixture();
  try {
    f.inventory.set("22221", SHOPIFY_GROWTH_TEMPLATES.map((_, i) => liveTemplate(i)));
    await f.service().authorize(account); await f.service().authorize(other);
    await f.tick(other);
    await f.tick(account);
    assert.ok(f.creates.every(c => c.accountId === account && c.waba === "11111"));
    const b = await f.config(other);
    assert.ok(b.ecommercePostPurchaseTemplates.orderConfirmation);
    // Foreign local IDs cannot be used to obtain or replace another tenant's template.
    await f.pool.query("UPDATE integrations SET config=jsonb_set(config,'{ecommercePostPurchaseTemplates}', $1::jsonb) WHERE user_id=$2", [b.ecommercePostPurchaseTemplates, account]);
    await f.tick();
    assert.equal((await f.service().view(account)).rows[0].reason, "selected_template_requires_attention");
    await f.pool.query("UPDATE users SET meta_business_account_id='33331' WHERE id=$1", [account]);
    assert.equal((await f.service().view(account)).authorized, false);
    const count = f.reads.length; await f.tick(); assert.equal(f.reads.length, count);
    await f.pool.query("UPDATE users SET meta_business_account_id='11111',meta_token_expires_at=NOW()-INTERVAL '1 day' WHERE id=$1", [account]);
    assert.equal((await f.service().view(account)).rows[0].reason, "meta_credentials_expired");
    await f.pool.query("UPDATE users SET meta_token_expires_at=NULL WHERE id=$1", [account]);
    f.provider.list = async () => { throw Error("meta_management_permission_required"); };
    await f.tick();
    assert.ok((await f.service().view(account)).rows.every(r => r.reason === "meta_management_permission_required"));
    const before = f.creates.length;
    await f.pool.query("UPDATE integrations SET is_active=false WHERE user_id=$1", [account]);
    await f.tick(); assert.equal(f.creates.length, before);
    assert.equal((await f.service().view(account)).connected, false);
  } finally { await f.close(); }
});

test("provider acceptance followed by transaction rollback, crash and restart never resubmits the fenced template", async () => {
  const f = await fixture();
  try {
    await f.service().authorize(account);
    let failAfterProvider = true;
    const database: TemplateDatabase = { execute: q => f.db.execute(q), transaction: fn => f.db.transaction(async tx => {
      const result = await fn(tx);
      if (failAfterProvider && f.creates.length) { failAfterProvider = false; throw Error("simulated_commit_failure_after_meta_acceptance"); }
      return result;
    }) };
    await f.service(database).reconcile(account);
    assert.equal(f.creates.length, 1);
    // Meta accepted but its response/template is temporarily invisible.
    f.inventory.set("11111", []);
    for (let i = 0; i < 4; i++) { await f.service().authorize(account); await f.tick(); }
    assert.equal(f.creates.filter(c => c.name === SHOPIFY_GROWTH_TEMPLATES[0].name).length, 1);
    assert.ok((await f.service().view(account)).rows[0].reason === "submission_uncertain");
  } finally { await f.close(); }
});

test("package supports exactly the existing numeric order/full recovery URL parameters and strict live categories", () => {
  assert.equal(SHOPIFY_GROWTH_TEMPLATES.length, 4);
  for (let i = 0; i < 4; i++) {
    const t = SHOPIFY_GROWTH_TEMPLATES[i];
    assert.equal((t.bodyText.match(/\{\{1\}\}/g) ?? []).length, 1);
    assert.equal(packageTemplateCompatible(t, liveTemplate(i)), true);
    for (const change of [{ language: "he" }, { status: "PENDING" }, { category: "AUTHENTICATION" },
      { components: [...liveTemplate(i).components, { type: "BUTTONS", buttons: [] }] },
      { components: [{ type: "BODY", text: "Wrong {{2}}" }] }])
      assert.equal(packageTemplateCompatible(t, { ...liveTemplate(i), ...change }), false);
  }
});

test('a merchant-cleared binding stays paused across automatic reconciliation and reauthorization',async()=>{
  const f=await fixture();
  try{
    f.inventory.set('11111',SHOPIFY_GROWTH_TEMPLATES.map((_,i)=>liveTemplate(i)));
    await f.service().authorize(account);await f.tick();
    const id=(await f.config()).ecommercePostPurchaseTemplates.orderConfirmation;
    await f.db.execute(savePostPurchaseTemplateBindingQuery({integrationId:'install-'+account,accountId:account,
      shop:'first.myshopify.com',journey:'orderConfirmation',templateId:null}));
    await f.service().authorize(account);await f.tick();
    assert.equal((await f.config()).ecommercePostPurchaseTemplates.orderConfirmation,undefined);
    assert.equal((await f.service().view(account)).rows[0].reason,'merchant_template_paused');
    assert.equal(f.creates.length,0);
    await f.db.execute(savePostPurchaseTemplateBindingQuery({integrationId:'install-'+account,accountId:account,
      shop:'first.myshopify.com',journey:'orderConfirmation',templateId:id}));
    await f.tick();assert.equal((await f.service().view(account)).rows[0].status,'ready');
  }finally{await f.close();}
});

test('a compatible approved merchant-named English message is reused without creating a canonical duplicate',async()=>{
  const f=await fixture();
  try{
    const row={...liveTemplate(0),name:'merchant_order_notice'};
    f.inventory.set('11111',[row]);
    await f.service().authorize(account);
    for(let i=0;i<4;i++)await f.tick();
    assert.equal(f.creates.length,3);
    assert.ok(!f.creates.some(c=>c.name==='shopify_order_confirmation_v1'));
    const id=(await f.config()).ecommercePostPurchaseTemplates.orderConfirmation;
    assert.equal((await f.pool.query('SELECT name FROM message_templates WHERE id=$1',[id])).rows[0].name,'merchant_order_notice');
    assert.equal((await f.service().view(account)).rows[0].status,'ready');
  }finally{await f.close();}
});

test('bounded worker selection excludes expired, reconnected, unentitled and ambiguous merchants before LIMIT',async()=>{
  const f=await fixture();
  try{
    await f.service().authorize(account);await f.service().authorize(other);
    const due=async()=> (await f.db.execute(dueShopifyTemplateSetupsQuery(Date.now()+1000,[account,other],false))).rows.map(r=>r.user_id);
    assert.deepEqual((await due()).sort(),[account,other].sort());
    await f.pool.query("UPDATE users SET meta_token_expires_at=NOW()-INTERVAL '1 day' WHERE id=$1",[other]);
    assert.deepEqual(await due(),[account]);
    await f.pool.query("UPDATE users SET meta_phone_number_id='55555' WHERE id=$1",[account]);
    assert.deepEqual(await due(),[]);
    await f.pool.query("UPDATE users SET meta_phone_number_id='11112',billing_plan='free',shopify_subscription_status='none',subscription_status='none' WHERE id=$1",[account]);
    assert.deepEqual(await due(),[]);
    await f.pool.query("UPDATE users SET billing_plan='pro',shopify_subscription_status='active' WHERE id=$1",[account]);
    await f.pool.query("INSERT INTO integrations(id,user_id) VALUES('ambiguous',$1)",[account]);
    assert.deepEqual(await due(),[]);
    assert.equal(f.creates.length,0);
  }finally{await f.close();}
});

test('existing manual library sync and automatic provisioning share a native WABA lock and keep one local ID',async()=>{
  const f=await fixture();await mkdir('work',{recursive:true});const dir=await mkdtemp(resolve('work/template-lock-'));
  (globalThis as any).__templateLibraryDb=f.db;
  try{
    await build({entryPoints:['server/userMeta.ts'],outfile:join(dir,'meta.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',
      plugins:[{name:'native-fixture-db',setup(b){
        b.onLoad({filter:/[/\\]drizzle[/\\]db\.ts$/},()=>({loader:'js',contents:'export const db=globalThis.__templateLibraryDb;'}));
        b.onLoad({filter:/[/\\]server[/\\]storage\.ts$/},()=>({loader:'js',contents:'export const storage={};'}));
      }}]});
    const {withMetaTemplateManagementLock}=await import(pathToFileURL(join(dir,'meta.mjs')).href);
    f.inventory.set('11111',SHOPIFY_GROWTH_TEMPLATES.map((_,i)=>liveTemplate(i)));
    await f.service().authorize(account);
    let entered!:()=>void,release!:()=>void;
    const started=new Promise<void>(r=>{entered=r;}),wait=new Promise<void>(r=>{release=r;});
    const manual=withMetaTemplateManagementLock(account,'11111',async(tx:TemplateDatabase)=>{
      entered();await wait;
      const t=SHOPIFY_GROWTH_TEMPLATES[0];
      await tx.execute(sql`INSERT INTO message_templates(id,user_id,twilio_sid,name,language,category,status,template_type,body_text)
        VALUES('manual-winner',${account},'meta_1000_en',${t.name},'en','utility','approved','text',${t.bodyText})`);
    });
    await started;
    const automatic=f.service().reconcile(account);
    release();await Promise.all([manual,automatic]);
    assert.equal((await f.config()).ecommercePostPurchaseTemplates.orderConfirmation,'manual-winner');
    assert.equal((await f.pool.query("SELECT id FROM message_templates WHERE twilio_sid='meta_1000_en'")).rowCount,1);
    assert.equal(f.creates.length,0);
    await assert.rejects(()=>withMetaTemplateManagementLock(account,'22221',async()=>{throw Error('must_not_enter');}),/meta_connection_changed/);
  }finally{delete (globalThis as any).__templateLibraryDb;await rm(dir,{recursive:true,force:true});await f.close();}
});

test('explicit activation persists only with independent release and live approval; changed approval and connection block it',async()=>{
  const f=await fixture();
  try{
    f.inventory.set('11111',SHOPIFY_GROWTH_TEMPLATES.map((_,i)=>liveTemplate(i)));
    await f.service().authorize(account);await f.tick();
    await f.service().savePlan(account,'orderConfirmation',{selected:true,delayMinutes:0});
    assert.equal(await f.service().setDelivery(account,'postPurchase',true),false,'default-off release cannot be enabled by merchant config');
    // Schema/migration behavior is covered by the existing native migration tests.
    // Simulate that independently verified prerequisite here while all owner,
    // installation/config locks, approval checks and persistence use real PG.
    const dialect=new PgDialect();
    const ready:TemplateDatabase={execute:q=>f.db.execute(q),transaction:fn=>f.db.transaction(tx=>fn({execute:async q=>
      dialect.sqlToQuery(q).sql.includes('to_regclass')?{rows:[{outbox:true,intents:true,consents:true,ready:true}]}:tx.execute(q)}))};
    const staging={...env,RAILWAY_ENVIRONMENT_NAME:'staging',APP_URL:'https://whachatcrm-staging-app-staging.up.railway.app',
      ECOMMERCE_POST_PURCHASE_PREP_ENABLED:'true',ECOMMERCE_POST_PURCHASE_ACCOUNT_ID:account,
      ECOMMERCE_POST_PURCHASE_DELIVERY_ENABLED:'true',ECOMMERCE_POST_PURCHASE_DELIVERY_ACCOUNT_ID:account,
      ECOMMERCE_POST_PURCHASE_RECEIPTS_ENABLED:'true',ECOMMERCE_POST_PURCHASE_WEBHOOKS_VERIFIED:'true',
      ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY:'synthetic-fixture-key-'.repeat(3)};
    const allowed=f.service(ready,staging);
    assert.equal((await allowed.view(account)).delivery?.postPurchase.canActivate,true);
    assert.equal(await allowed.setDelivery(account,'postPurchase',true),true);
    assert.equal((await f.config()).ecommercePostPurchaseDeliveryEnabled,true);
    assert.match((await f.config()).ecommercePostPurchaseDeliveryConnection,/^[a-f0-9]{64}$/);
    assert.equal(await allowed.savePlan(account,'fulfillmentUpdate',{selected:true,delayMinutes:0}),false,'a new purpose needs a separate explicit activation');
    assert.equal(await allowed.setDelivery(account,'postPurchase',false),true);
    f.inventory.get('11111')![0].status='PAUSED';
    assert.equal(await allowed.setDelivery(account,'postPurchase',true),false,'activation checks fresh Meta approval, not cached IDs');
    f.inventory.get('11111')![0].status='APPROVED';
    const production={...staging,RAILWAY_ENVIRONMENT_NAME:'production',APP_URL:'https://app.whachatcrm.com',
      ECOMMERCE_RECOVERY_PRODUCTION_DELIVERY_APPROVED:'true',ECOMMERCE_RECOVERY_WORKER_MODE:'production-controlled-one-checkout',
      ECOMMERCE_RECOVERY_WORKER_ENABLED:'true',ECOMMERCE_RECOVERY_SEND_ENABLED:'true',ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:'true',
      ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:'true',ECOMMERCE_RECOVERY_RECEIPTS_ENABLED:'true',ECOMMERCE_RECOVERY_WEBHOOKS_VERIFIED:'true',
      ECOMMERCE_RECOVERY_PRODUCTION_RECEIPTS_APPROVED:'true',ECOMMERCE_RECOVERY_PRODUCTION_CONSENT_APPROVED:'true',ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED:'true',
      ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID:account,ECOMMERCE_RECOVERY_WORKER_ALLOWED_SHOP:'first.myshopify.com',
      ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID:'gid://shopify/AbandonedCheckout/12',ECOMMERCE_RECOVERY_CONTROLLED_RECIPIENT_HMAC:'a'.repeat(64),
      ECOMMERCE_RECOVERY_CONTROLLED_EXPIRES_AT:new Date(Date.now()+10*60_000).toISOString()};
    assert.equal(await f.service(ready,production).setDelivery(account,'checkoutRecovery',true),true);
    assert.match((await f.config()).ecommerceCheckoutRecoveryDeliveryConnection,/^[a-f0-9]{64}$/);
    await f.pool.query("UPDATE users SET meta_phone_number_id='55555' WHERE id=$1",[account]);
    assert.equal(await f.service(ready,production).setDelivery(account,'checkoutRecovery',true),false,'changed connection needs fresh authorization');
    assert.equal(f.creates.length,0,'activation never submits or sends a message');
  }finally{await f.close();}
});

test('concurrent manual sync completes with a saturated two-connection pool and retains one library row',{timeout:15_000},async t=>{
  const f=await fixture(2);await mkdir('work',{recursive:true});const dir=await mkdtemp(resolve('work/template-sync-pool-'));
  (globalThis as any).__templateSyncDb=f.db;
  let server:ReturnType<ReturnType<typeof express>['listen']>|undefined;
  let release!:()=>void;
  const held=new Promise<void>(r=>{release=r;});
  const httpFetch=globalThis.fetch;
  let inventory=[liveTemplate(0)];
  const fetchMock=t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({data:inventory})));
  try{
    await build({stdin:{contents:`export {registerTemplateRoutes} from './server/routes/templates'; export {storage} from './server/storage';`,
      resolveDir:process.cwd(),loader:'ts'},outfile:join(dir,'sync.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',
      plugins:[{name:'native-sync-dependencies',setup(b){
        b.onResolve({filter:/.*/},args=>args.kind==='dynamic-import'?{path:args.path,external:true}:undefined);
        b.onLoad({filter:/[/\\]drizzle[/\\]db\.ts$/},()=>({loader:'js',contents:'export const db=globalThis.__templateSyncDb;'}));
        b.onLoad({filter:/[/\\]server[/\\]subscriptionService\.ts$/},()=>({loader:'js',contents:'export const subscriptionService={getUserLimits:async()=>({templatesEnabled:true})};'}));
        b.onLoad({filter:/[/\\]server[/\\]whatsappService\.ts$/},()=>({loader:'js',contents:'export const getWhatsAppAvailability=async()=>({available:true,provider:"meta"});'}));
        b.onLoad({filter:/[/\\]server[/\\]userTwilio\.ts$/},()=>({loader:'js',contents:'export const getUserTwilioClient=async()=>null;'}));
      }}]});
    const {registerTemplateRoutes,storage}=await import(pathToFileURL(join(dir,'sync.mjs')).href);
    storage.getUserForSession=async()=>({id:account,whatsappProvider:'meta',metaConnected:true,
      metaAccessToken:'fixture-meta',metaBusinessAccountId:'11111'});
    let entered!:()=>void;
    const started=new Promise<void>(r=>{entered=r;});
    const get=storage.getMessageTemplateByTwilioSid.bind(storage);
    let reads=0;
    storage.getMessageTemplateByTwilioSid=async(...args:any[])=>{
      if(++reads===1){entered();await held;}
      return get(...args);
    };
    const app=express();app.use((req,_res,next)=>{req.user={id:account} as any;next();});registerTemplateRoutes(app);
    server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const endpoint=`http://127.0.0.1:${(server.address() as any).port}/api/templates/sync`;
    // The real HTTP route, Meta adapter, storage methods and WABA lock all run.
    // Only the provider response/session/plan availability are synthetic.
    const first=httpFetch(endpoint,{method:'POST'}).then(async r=>({status:r.status,body:await r.json()}));
    await started;
    const second=httpFetch(endpoint,{method:'POST'}).then(async r=>({status:r.status,body:await r.json()}));
    const deadline=Date.now()+1500;
    while((f.pool.totalCount!==2||f.pool.idleCount!==0)&&Date.now()<deadline)
      await new Promise(r=>setTimeout(r,5));
    assert.equal(f.pool.totalCount,2);assert.equal(f.pool.idleCount,0,'lock holder and waiter occupy the entire pool');
    const unrelated=f.pool.query('SELECT 1 AS healthy');
    release();
    const [one,two,healthy]=await Promise.all([first,second,unrelated]);
    const results=[one,two];
    assert.ok(results.every(r=>r.status===200&&r.body.skipped===0),JSON.stringify(results));
    assert.equal(healthy.rows[0].healthy,1,'unrelated database work resumes');
    assert.equal((await f.pool.query('SELECT * FROM message_templates WHERE user_id=$1',[account])).rowCount,1);
    assert.equal(results.reduce((sum,r)=>sum+r.body.inserted,0),1);
    assert.equal(results.reduce((sum,r)=>sum+r.body.updated,0),1);
    // Preserve the existing per-row skip behavior after moving writes into the
    // lock transaction: one failed row must not undo or block the good rows.
    await f.pool.query("ALTER TABLE message_templates ADD CONSTRAINT valid_name CHECK (name <> 'invalid_fixture')");
    inventory=[liveTemplate(0),{...liveTemplate(1),name:'invalid_fixture'},liveTemplate(2)];
    const retry=await httpFetch(endpoint,{method:'POST'}),body=await retry.json();
    assert.equal(retry.status,200);
    assert.deepEqual([body.inserted,body.updated,body.skipped],[1,1,1]);
    assert.deepEqual((await f.pool.query('SELECT name FROM message_templates ORDER BY name')).rows.map(r=>r.name),
      [SHOPIFY_GROWTH_TEMPLATES[2].name,SHOPIFY_GROWTH_TEMPLATES[0].name].sort());
  }finally{
    release();fetchMock.mock.restore();
    if(server)await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));
    delete (globalThis as any).__templateSyncDb;await rm(dir,{recursive:true,force:true});await f.close();
  }
});

test('pauses persist without Meta credentials, entitlement or provider access and remain paused after renewal',async()=>{
  const f=await fixture();
  try{
    const active={ecommercePostPurchaseDeliveryEnabled:true,ecommerceCheckoutRecoveryDeliveryEnabled:true};
    for(const connection of [
      {meta_connected:true,meta_access_token:'fixture-expired',meta_token_expires_at:new Date(0)},
      {meta_connected:false,meta_access_token:null,meta_token_expires_at:null},
    ]){
      await f.pool.query('UPDATE integrations SET config=config || $1::jsonb WHERE user_id=$2',[active,account]);
      await f.pool.query(`UPDATE users SET meta_connected=$1,meta_access_token=$2,meta_token_expires_at=$3,
        meta_business_account_id=CASE WHEN $1 THEN '11111' ELSE NULL END,
        meta_phone_number_id=CASE WHEN $1 THEN '11112' ELSE NULL END WHERE id=$4`,
        [connection.meta_connected,connection.meta_access_token,connection.meta_token_expires_at,account]);
      f.provider.list=async()=>{throw Error('pause_must_not_contact_meta');};
      const unavailable=await f.service().view(account);
      for(const kind of ['postPurchase','checkoutRecovery'] as const){
        assert.deepEqual(unavailable.delivery?.[kind],{canActivate:false,merchantEnabled:true,deliveryEnabled:false,
          reason:connection.meta_connected?'meta_credentials_expired':'connect_whatsapp'});
        if(connection.meta_connected)await assert.rejects(()=>f.service().setDelivery(account,kind,true),/meta_credentials_expired/);
        else assert.equal(await f.service().setDelivery(account,kind,true),false);
        assert.equal(await f.service().setDelivery(account,kind,false),true);
      }
      await f.pool.query("UPDATE users SET meta_connected=true,meta_access_token='fixture-renewed',meta_token_expires_at=NULL,meta_business_account_id='11111',meta_phone_number_id='11112' WHERE id=$1",[account]);
      const renewed=await f.service().view(account);
      assert.equal(renewed.delivery?.postPurchase.merchantEnabled,false);
      assert.equal(renewed.delivery?.checkoutRecovery.merchantEnabled,false);
      assert.equal((await f.config(other)).ecommerceCheckoutRecoveryDeliveryEnabled,undefined);
    }
    await f.pool.query('UPDATE integrations SET config=config || $1::jsonb WHERE user_id=$2',[active,account]);
    await f.pool.query("UPDATE users SET billing_plan='free',subscription_status='none',shopify_subscription_status='none',meta_connected=false WHERE id=$1",[account]);
    assert.equal(await f.service().setDelivery(account,'postPurchase',false),true);
    assert.equal(await f.service().setDelivery(account,'checkoutRecovery',false),true);
    assert.equal(f.reads.length,0);assert.equal(f.creates.length,0);
    await f.pool.query('UPDATE users SET deletion_requested_at=NOW() WHERE id=$1',[account]);
    assert.equal(await f.service().setDelivery(account,'checkoutRecovery',false),false,'privacy rejection is retained');
    assert.equal(await f.service().setDelivery('foreign','checkoutRecovery',false),false);
  }finally{await f.close();}
});

test('generic settings/reconnect writes preserve committed fences and cannot fabricate activation or bindings',async()=>{
  const f=await fixture();
  try{
    await f.service().authorize(account);
    const stale=await f.config();
    await f.tick();assert.equal(f.creates.length,1);
    const committed=(await f.config()).ecommerceTemplateSetup;
    const supplied={...stale,syncOptions:['new_orders'],ecommerceTemplateSetup:{version:1,wabas:{}},
      ecommercePostPurchaseDeliveryEnabled:true,ecommercePostPurchaseTemplates:{orderConfirmation:'foreign-id'},
      ecommerceCheckoutRecoveryDeliveryEnabled:true};
    await f.db.execute(sql`UPDATE integrations SET config=${preserveShopifyGrowthManagedConfig(supplied,sql`config`,sql`type`)} WHERE user_id=${account}`);
    const saved=await f.config();
    assert.deepEqual(saved.ecommerceTemplateSetup,committed);
    assert.deepEqual(saved.syncOptions,['new_orders']);
    assert.equal(saved.ecommercePostPurchaseDeliveryEnabled,undefined);
    assert.equal(saved.ecommercePostPurchaseTemplates,undefined);
    assert.equal(saved.ecommerceCheckoutRecoveryDeliveryEnabled,undefined);
    f.inventory.set('11111',[]);await f.tick();
    assert.equal(f.creates.filter(t=>t.name==='shopify_order_confirmation_v1').length,1,'lost provider acknowledgement plus a stale settings save cannot resubmit');
    assert.deepEqual(stripShopifyGrowthManagedConfig(supplied),{shop:'first.myshopify.com',unrelated:{preserved:true},syncOptions:['new_orders']});
    await f.pool.query("UPDATE integrations SET type='woocommerce' WHERE user_id=$1",[other]);
    await f.db.execute(sql`UPDATE integrations SET config=${preserveShopifyGrowthManagedConfig(supplied,sql`config`,sql`type`)} WHERE user_id=${other}`);
    assert.deepEqual(await f.config(other),supplied,'other providers keep their existing config replacement behavior');
  }finally{await f.close();}
});

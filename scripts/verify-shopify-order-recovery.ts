/** Staging PostgreSQL fixture harness. Never calls a merchant webhook or provider.
 * Production handler, order mapper, fence and commerce functions run unchanged;
 * SQL-backed storage adapters and activity fault are isolated to a random schema.
 * This is not live Railway HTTP/provider acceptance evidence.
 */
import assert from 'node:assert/strict';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect, getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { and, eq, sql } from 'drizzle-orm';
import { transform } from 'esbuild';
import * as schema from '../shared/schema';
import { normalizeShopifyShopDomain } from '../shared/shopifyBilling';
import { isShopifyContactInstallationActive } from '../shared/shopifyContactPrivacy';
import { isCommerceSourcedContact } from '../shared/contactChannelDisplay';
import { isEmailInboxIdentitySource } from '../shared/contactCrmVisibility';
import { createShopifyOrderWebhookHandler } from '../server/shopifyOrderWebhookHandler';

const expectedProject = '1d22ff35-a259-4977-9375-377dda1cdd2b';
const expectedEnvironment = '43e4c163-6da9-4be5-ad93-0a3534234613';
const localValidation = process.argv.includes('--local-validation');
const pinnedStagingSystemId = '7695281403431092283'; // independently pinned staging DB identity
const sourceSha = localValidation ? execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
  : process.env.RAILWAY_GIT_COMMIT_SHA;
assert.ok(sourceSha && /^[a-f0-9]{40}$/.test(sourceSha), 'Verified source commit metadata required');
if (!localValidation) {
  assert.equal(process.env.RAILWAY_PROJECT_ID, expectedProject, 'Staging project only');
  assert.equal(process.env.RAILWAY_ENVIRONMENT_ID, expectedEnvironment, 'Staging environment only');
}
assert.equal(process.env.SHOPIFY_RECOVERY_FIXTURE_ACK, 'isolated-staging-schema');
assert.ok(process.env.SHOPIFY_RECOVERY_DATABASE_URL, 'Provide staging DB URL privately');
const url = new URL(process.env.SHOPIFY_RECOVERY_DATABASE_URL!);
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
if (localValidation) {
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
  assert.equal(url.pathname,'/whachat_shopify_test');
} else {
  assert.equal(url.hostname,'postgres.railway.internal','Private staging PostgreSQL only');
  assert.equal(url.pathname,'/railway');
  assert.ok(!url.port || url.port==='5432');
}
const namespace = 'shopify_recovery_' + randomBytes(8).toString('hex');
const admin = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 10000 });
url.searchParams.set('options', '-c search_path=' + namespace);
const pool = new Pool({ connectionString: url.toString(), max: 16,connectionTimeoutMillis:10000,statement_timeout:15000 });
const db = drizzle(pool, { schema });
const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
let createdSchema = false;
let verifiedResults: Record<string,unknown> | undefined;
async function load(source: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as any };
  const compiled = await transform(source.replace(/^import[\s\S]*?;\r?\n/gm, ''),
    { loader: 'ts', format: 'cjs', target: 'es2022' });
  new Function(...Object.keys(dependencies), 'module', 'exports', compiled.code)(
    ...Object.values(dependencies), module, module.exports);
  return module.exports;
}
try {
  if (!localValidation) {
    const client=await admin.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout='15s'");
      const identity=(await client.query(`SELECT current_database() database,
        system_identifier::text system_id FROM pg_control_system()`)).rows[0];
      assert.equal(identity.database,'railway');assert.equal(identity.system_id,pinnedStagingSystemId);
      const marker=(await client.query('SELECT version,baseline_sha256 FROM public.whachat_staging_schema_bootstrap')).rows;
      assert.equal(marker.length,1);assert.equal(marker[0].version,1);
      assert.match(marker[0].baseline_sha256,/^[a-f0-9]{64}$/);
    } finally {try {await client.query('ROLLBACK');} finally {client.release();}}
  }
  await admin.query('CREATE SCHEMA ' + namespace); createdSchema = true;
  console.log(JSON.stringify({event:'recovery_fixture_schema_created',schema:namespace,sourceSha}));
  const dialect = new PgDialect();
  for (const table of [schema.users,schema.integrations,schema.contacts,schema.conversations,
    schema.messages,schema.activityEvents,schema.workflowExecutions,schema.shopifyPrivacyCustomerLocks]) {
    const cfg = getTableConfig(table as PgTable);
    const columns = cfg.columns.map(c => quote(c.name) + ' ' + (c.enumValues?.length ? 'text' : c.getSQLType()) +
      (c.name === 'id' ? ' PRIMARY KEY DEFAULT gen_random_uuid()::text' : c.default !== undefined ?
        ' DEFAULT ' + (typeof c.default === 'object' && c.default !== null && 'getSQL' in c.default ?
          dialect.sqlToQuery(c.default as any).sql : typeof c.default === 'string' ? "'" + c.default.replaceAll("'", "''") + "'" : String(c.default)) : ''));
    await pool.query('CREATE TABLE ' + quote(cfg.name) + '(' + columns.join(',') + ')');
  }
  const shop = 'disposable-recovery.myshopify.com';
  await db.insert(schema.users).values({ id:'fixture-owner',email:'recovery@example.invalid',
    shopifyShop:shop,shopifyAccessToken:'fixture-not-a-token',shopifyInstalledAt:new Date() } as any);
  await db.insert(schema.integrations).values({ id:'fixture-integration',userId:'fixture-owner',
    type:'shopify',isActive:true,config:{shop,syncOptions:['new_orders']} } as any);
  let effects = 0, fault = true;
  const forbidden = async () => { effects++; throw Error('forbidden fixture side effect'); };
  const storage = {
    getMessageByUserExternalId: async (userId: string,id: string) => (await db.select().from(schema.messages)
      .where(and(eq(schema.messages.userId,userId),eq(schema.messages.externalMessageId,id))))[0],
    getContactByChannelId: async () => undefined,
    getContacts: async (userId: string) => db.select().from(schema.contacts).where(eq(schema.contacts.userId,userId)),
    createContact: async (v: any) => (await db.insert(schema.contacts).values(v).returning())[0],
    updateContact: async (id: string,v: any,options: any) => {
      assert.equal(options.skipAutomationHooks,true);
      return (await db.update(schema.contacts).set(v).where(and(eq(schema.contacts.id,id),
        eq(schema.contacts.userId,options.expectedWorkspaceUserId))).returning())[0];
    },
    getConversationByContactAndChannel: async (id: string,channel: any) => (await db.select().from(schema.conversations)
      .where(and(eq(schema.conversations.contactId,id),eq(schema.conversations.channel,channel))))[0],
    createConversation: async (v: any) => (await db.insert(schema.conversations).values(v).returning())[0],
    updateConversation: async (id: string,v: any) => db.update(schema.conversations).set(v).where(eq(schema.conversations.id,id)),
    createMessage: async (v: any) => { assert.equal(v.direction,'inbound');
      return (await db.insert(schema.messages).values(v).returning())[0]; },
    getIntegrationByUserAndType: async (id: string,type: any) => (await db.select().from(schema.integrations)
      .where(and(eq(schema.integrations.userId,id),eq(schema.integrations.type,type))))[0],
  };
  const fixtureChannelService = { logActivity: async (userId: string,contactId: string,conversationId: string,eventType: string,eventData: any) => {
    if (fault) throw Error('controlled fixture interruption after durable card');
    await db.insert(schema.activityEvents).values({userId,contactId,conversationId,eventType,eventData});
  } };
  const quietConsole = { log() {}, info() {}, error() {} };
  const common = {db,storage,...schema,eq,and,sql,normalizeShopifyShopDomain,isShopifyContactInstallationActive,console:quietConsole};
  const pipeline = await load(readFileSync('server/commerceEventPipeline.ts','utf8')
    .replace('await import("./channelService")','({channelService:fixtureChannelService})'),
    {...common,fixtureChannelService,isCommerceSourcedContact,isEmailInboxIdentitySource,
      promoteInboxIdentityToCrm:forbidden,dispatchCommerceEventAutomation:forbidden,
      syncContactToHubSpotIfEnabled:forbidden,scheduleHubSpotAutoSync:forbidden,notifyUser() {}});
  const fenceSource = readFileSync('server/shopifyContactService.ts','utf8');
  const start = fenceSource.indexOf('export async function withShopifyPrivacyFence(');
  assert.ok(start >= 0);
  const fence = await load(fenceSource.slice(start,fenceSource.indexOf('/** Same uninstall',start)),common);
  const commerce = await load(readFileSync('server/shopifyCommerceWebhooks.ts','utf8'),
    {...common,...pipeline,...fence,normalizeShopifyShopDomain,customerPrivacyLocked:async () => false,
      syncShopifyCustomer:forbidden});
  const secret = randomBytes(32);
  const raw = Buffer.from(JSON.stringify({id:123,name:'#fixture',customer:{id:456,first_name:'Fixture'},
    total_price:'1.00',currency:'USD'}));
  const signature = createHmac('sha256',secret).update(raw).digest('base64');
  const handler = createShopifyOrderWebhookHandler('orders/create',{verify(bytes,hmac) {
    const expected = createHmac('sha256',secret).update(bytes).digest('base64');
    return expected.length === hmac.length && timingSafeEqual(Buffer.from(expected),Buffer.from(hmac));
  },process:async ({shop,eventId,body}) => commerce.processShopifyOrderCreate(
    {headers:{'x-shopify-event-id':eventId}},shop,body),emit() {}});
  async function send() {
    const res = {code:0,status(n: number) {this.code=n;return this;},json() {return this;}};
    await handler({rawBody:raw,headers:{'x-shopify-hmac-sha256':signature,'x-shopify-shop-domain':shop,
      'x-shopify-topic':'orders/create','x-shopify-event-id':'fixture-delivery'}} as any,res as any);
    return res.code;
  }
  const count = async (table: PgTable) => Number((await db.select({n:sql`count(*)`}).from(table))[0].n);
  assert.equal(await send(),503);
  assert.equal(await count(schema.messages),1);assert.equal(await count(schema.activityEvents),0);
  const [partial] = await db.select().from(schema.conversations);
  assert.equal(partial.unreadCount,1);
  fault=false;
  const concurrent = await Promise.all(Array.from({length:8},() => send()));
  assert.deepEqual(concurrent,Array(8).fill(200));
  assert.equal(await send(),200);
  assert.equal(await count(schema.messages),1);assert.equal(await count(schema.activityEvents),1);
  assert.equal(await count(schema.contacts),1);assert.equal(await count(schema.conversations),1);
  assert.equal(await count(schema.workflowExecutions),0);assert.equal(effects,0);
  const [final] = await db.select().from(schema.conversations);
  assert.equal(final.unreadCount,partial.unreadCount);
  const messages = await db.select().from(schema.messages);assert.equal(messages[0].direction,'inbound');
  verifiedResults={gate:localValidation ? 'local-postgres-harness-validation' : 'staging-isolated-postgres-order-recovery',
    sha:sourceSha,
    interruptedStatus:503,retryStatus:200,concurrentDeliveries:8,cards:1,activities:1,contacts:1,
    outboundMessages:0,automationCalls:0,exportCalls:0,unreadBefore:1,unreadAfter:1,
    limitation:'SQL fixture adapters; no deployed HTTP, real provider or production acceptance'};
} catch (error) {
  if (localValidation) console.error(error instanceof Error ? error.message : 'local fixture error');
  console.error('Order recovery fixture failed; credentials and SQL errors withheld. Gate remains unverified.');
  process.exitCode=1;
} finally {
  await pool.end();
  if (createdSchema) {
    try {
      await admin.query('DROP SCHEMA ' + namespace + ' CASCADE');
      assert.equal((await admin.query('SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) present',[namespace])).rows[0].present,false);
      console.log(JSON.stringify({event:'recovery_fixture_cleanup',schema:namespace,removed:true}));
    } catch {
      console.error(JSON.stringify({event:'recovery_fixture_cleanup_failed',schema:namespace,credentialsWithheld:true}));
      process.exitCode=1;verifiedResults=undefined;
    }
  }
  await admin.end();
}
if (verifiedResults && !process.exitCode) console.log(JSON.stringify({...verifiedResults,cleanupVerified:true}));

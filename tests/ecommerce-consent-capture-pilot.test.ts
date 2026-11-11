import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import * as schema from '../shared/schema';
import { productionConsentCaptureAllowed, productionConsentCaptureBlocker } from '../server/ecommerce/consentCaptureGate';
import { commerceConnectionFingerprint, readProductionRecoveryScope } from '../server/ecommerce/checkoutRecoveryProductionRelease';
import { createRecoveryConsentCapture } from '../server/ecommerce/checkoutRecoveryInboundConsentCapture';
import { createPostPurchasePreparation } from '../server/ecommerce/postPurchasePreparation';
import { enrollmentCaptureReadiness } from '../server/ecommerce/shopifyConsentEnrollment';
import { postPurchasePreparationEnabled } from '../server/ecommerce/postPurchaseGate';
import { postPurchaseDeliveryEnabled } from '../server/ecommerce/postPurchaseDeliveryGate';
import { CONSENT_PURPOSES, WHATSAPP_CONSENT_PHRASES } from '../shared/shopifyConsentEnrollment';

const account = '10000000-0000-4000-8000-000000000001', other = '20000000-0000-4000-8000-000000000002';
const shop = 'pilot.myshopify.com', clock = Math.floor(Date.now()/1000)*1000, secret = 'fixture-only-key'.repeat(3);
const current = { accountId: account, shop, installationId: 'install', wabaId: '111111', phoneId: '111112', installedAt: clock-86400000 };
const connection = commerceConnectionFingerprint(current);
const configuration = () => ({ RAILWAY_ENVIRONMENT_NAME: 'production', APP_URL: 'https://app.whachatcrm.com',
  ECOMMERCE_CONSENT_CAPTURE_PRODUCTION_APPROVED: 'true', ECOMMERCE_CONSENT_CAPTURE_ACCOUNT_ID: account,
  ECOMMERCE_CONSENT_CAPTURE_SHOP: shop, ECOMMERCE_CONSENT_CAPTURE_CONNECTION_SHA256: connection,
  ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY: secret });
const candidate = (text: string, at = clock, overrides = {}) => ({ signatureValid: true, hasRawBody: true, type: 'text',
  phoneNumberId: current.phoneId, from: '15551234567', messageId: 'wamid.pilot_fixture_'+at, timestamp: String(at/1000), text, ...overrides });

test('capture pilot is default OFF and exact host/account/shop/installation/WABA/phone/install-time bound; outbound stays OFF', () => {
  const env = configuration();
  assert.equal(productionConsentCaptureAllowed({}, current), false);
  assert.equal(productionConsentCaptureAllowed(env, current), true);
  for (const field of Object.keys(env)) {
    assert.equal(productionConsentCaptureAllowed({ ...env, [field]: '' }, current), false, field);
  }
  for (const patch of [{accountId:other}, {shop:'other.myshopify.com'}, {installationId:'reinstalled'}, {wabaId:'222221'},
    {phoneId:'222222'}, {installedAt:clock}, {installedAt:'invalid'}, {wabaId:''}])
    assert.equal(productionConsentCaptureAllowed(env, { ...current, ...patch }), false);
  for (const APP_URL of ['http://app.whachatcrm.com','https://app.whachatcrm.com.evil.test','https://other.test'])
    assert.equal(productionConsentCaptureAllowed({ ...env, APP_URL }, current), false);
  assert.equal(productionConsentCaptureBlocker(env, account, shop), 'consent_capture_connection_required');
  assert.deepEqual(enrollmentCaptureReadiness(env, account, shop, connection), { postPurchase:true, checkoutRecovery:true });
  assert.deepEqual(enrollmentCaptureReadiness({...env, ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY:''}, account, shop, connection), { postPurchase:false, checkoutRecovery:false });
  assert.equal(postPurchasePreparationEnabled(env, account), false);
  assert.equal(postPurchaseDeliveryEnabled(env, account), false);
  assert.equal(readProductionRecoveryScope(env), null);
});

test('real capture handlers: exact signed purpose only, verified Shopify identity, STOP after pause, no preparation or outbound work', async t => {
  const pg = new PGlite(), db = drizzle(pg, { schema });
  const env: Record<string,string|undefined> = configuration();
  let privacy = false;
  const recovery = createRecoveryConsentCapture(db as any, async () => privacy);
  const post = createPostPurchasePreparation({ database: db as any, env, secret: () => secret, now: () => clock+3000,
    privacyLocked: async () => privacy, templates: async () => assert.fail('capture must not call Meta'),
    recheck: async () => assert.fail('capture must not call Shopify') });
  const capture = (purpose: typeof CONSENT_PURPOSES[number], event = candidate(WHATSAPP_CONSENT_PHRASES[purpose]), id: string|null = 'customer', accountId = account) =>
    purpose === 'checkoutRecovery' ? recovery({accountId,inboxContactId:id,candidate:event,env,secret,now:clock+3000}) : post.captureConsent(accountId,id,event);
  const execute = (q: ReturnType<typeof sql>) => db.execute(q);
  const reset = async () => {
    env.ECOMMERCE_CONSENT_CAPTURE_PRODUCTION_APPROVED = 'true'; privacy = false;
    await pg.exec(`TRUNCATE users,integrations,contacts,ecommerce_growth_event_inbox CASCADE;
      TRUNCATE ecommerce_whatsapp_recovery_consents;`);
    await execute(sql`INSERT INTO users(id,shopify_shop,shopify_installed_at,meta_business_account_id,meta_phone_number_id)
      VALUES(${account},${shop},${new Date(current.installedAt)},${current.wabaId},${current.phoneId}),
        (${other},'other.myshopify.com',${new Date(current.installedAt)},'222221','222222')`);
    await execute(sql`INSERT INTO integrations(id,user_id,config) VALUES('install',${account},${JSON.stringify({shop})}::jsonb),
      ('other-install',${other},'{"shop":"other.myshopify.com"}')`);
    await execute(sql`INSERT INTO contacts(id,user_id,phone,whatsapp_id,custom_fields,source_details)
      VALUES('customer',${account},'+15551234567','15551234567',${JSON.stringify({shopifyCustomerId:'2',shopifyShop:shop})}::jsonb,'{}')`);
  };
  try {
    await pg.exec(`CREATE TABLE users(id varchar(128) PRIMARY KEY,email text,shopify_shop text,shopify_access_token text DEFAULT 'fixture',
      shopify_subscription_status text DEFAULT 'active',shopify_installed_at timestamptz,deletion_requested_at timestamptz,
      meta_connected boolean DEFAULT true,meta_business_account_id text,meta_phone_number_id text);
      CREATE TABLE integrations(id varchar PRIMARY KEY,user_id text,type text DEFAULT 'shopify',is_active boolean DEFAULT true,config jsonb);
      CREATE TABLE contacts(id varchar PRIMARY KEY,user_id text,phone text,whatsapp_id text,custom_fields jsonb,source_details jsonb,
        automations_paused boolean DEFAULT false,tag text,pipeline_stage text);
      CREATE TABLE message_templates(id varchar PRIMARY KEY);`);
    for (const migration of ['20261019_ecommerce_growth_event_inbox.sql', '20261020_ecommerce_abandoned_checkout_observations.sql',
      '20261020_ecommerce_checkout_recovery_intents.sql', '20261020_ecommerce_whatsapp_recovery_delivery.sql',
      '20261020_ecommerce_recovery_signed_inbound_consent.sql', '20261030_ecommerce_post_purchase_intents.sql'])
      await pg.exec(await readFile('migrations/'+migration,'utf8'));
    await t.test('all exact purpose phrases produce isolated evidence; views/clicks/generic YES cannot grant', async () => {
      await reset();
      for (const purpose of CONSENT_PURPOSES) assert.equal(await capture(purpose), 'granted', purpose);
      assert.deepEqual((await execute(sql`SELECT purpose FROM ecommerce_post_purchase_consents ORDER BY purpose`)).rows.map(r=>r.purpose),
        CONSENT_PURPOSES.filter(p=>p!=='checkoutRecovery').sort());
      assert.equal((await execute(sql`SELECT count(*)::int n FROM ecommerce_whatsapp_recovery_consents`)).rows[0].n, 1);
      for (const text of ['YES','OK','page_view','click']) {
        assert.equal(await capture('checkoutRecovery',candidate(text)), 'ignored');
        assert.equal(await capture('orderConfirmation',candidate(text)), 'ignored');
      }
      await post.tick(); assert.equal(await post.ingest(shop,'orders/create','unused',{}), 'disabled');
      for (const table of ['ecommerce_post_purchase_intents','ecommerce_post_purchase_orders','ecommerce_growth_event_inbox','ecommerce_checkout_recovery_outbox'])
        assert.equal((await pg.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, 0);
    });
    await t.test('default/paused gate, forged signature/body/type, stale YES, foreign phone or tenant do not grant', async () => {
      for (const purpose of ['orderConfirmation','checkoutRecovery'] as const) {
        await reset(); env.ECOMMERCE_CONSENT_CAPTURE_PRODUCTION_APPROVED = 'false';
        assert.equal(await capture(purpose), 'disabled'); env.ECOMMERCE_CONSENT_CAPTURE_PRODUCTION_APPROVED = 'true';
        for (const patch of [{signatureValid:false},{hasRawBody:false},{type:'interactive'},{phoneNumberId:'222222'},
          {timestamp:String((clock-3600000)/1000)},{from:'15557654321'}])
          assert.equal(await capture(purpose,candidate(WHATSAPP_CONSENT_PHRASES[purpose],clock,patch)), 'ignored');
        assert.equal(await capture(purpose,candidate(WHATSAPP_CONSENT_PHRASES[purpose],clock,{phoneNumberId:'222222'}),'customer',other), 'ignored');
        for (const update of ["meta_business_account_id='222221'", "shopify_installed_at=NOW()", "shopify_shop='other.myshopify.com'"]) {
          await reset(); await pg.exec(`UPDATE users SET ${update} WHERE id='${account}'`);
          assert.equal(await capture(purpose), 'ignored');
        }
      }
    });
    await t.test('unknown, conflicting or shared Shopify identity, DNC and privacy locks fail closed', async () => {
      for (const purpose of ['orderConfirmation','checkoutRecovery'] as const) {
        for (const update of ["custom_fields='{}'", "custom_fields='{\"shopifyCustomerId\":\"2\",\"shopifyShop\":\"wrong.myshopify.com\"}'",
          "source_details='{\"shopifyCustomerId\":\"999\"}'", "automations_paused=true", "tag='DNC'",
          "custom_fields=custom_fields || '{\"doNotContact\":true}'", "custom_fields=custom_fields || '{\"marketingOptIn\":false}'"]) {
          await reset(); await pg.exec(`UPDATE contacts SET ${update}`); assert.equal(await capture(purpose), 'ignored', update);
        }
        await reset(); assert.equal(await capture(purpose,candidate(WHATSAPP_CONSENT_PHRASES[purpose]),null), 'ignored');
        await reset(); privacy = true; assert.equal(await capture(purpose), 'ignored');
        await reset(); await pg.exec("INSERT INTO contacts SELECT 'duplicate',user_id,phone,whatsapp_id,custom_fields,source_details,false,NULL,NULL FROM contacts");
        assert.equal(await capture(purpose), 'ignored');
      }
    });
    await t.test('late signed STOP revokes after pilot approval removed; older YES cannot undo STOP', async () => {
      await reset();
      for (const purpose of ['orderConfirmation','checkoutRecovery'] as const) assert.equal(await capture(purpose), 'granted');
      delete env.ECOMMERCE_CONSENT_CAPTURE_PRODUCTION_APPROVED;
      for (const purpose of ['orderConfirmation','checkoutRecovery'] as const)
        assert.equal(await capture(purpose,candidate('STOP',clock+1000),null), 'revoked');
      env.ECOMMERCE_CONSENT_CAPTURE_PRODUCTION_APPROVED = 'true';
      for (const purpose of ['orderConfirmation','checkoutRecovery'] as const) assert.equal(await capture(purpose), 'ignored');
      assert.equal((await execute(sql`SELECT count(*)::int n FROM ecommerce_post_purchase_consents WHERE granted_at IS NOT NULL AND revoked_at IS NULL`)).rows[0].n, 0);
      assert.equal((await execute(sql`SELECT count(*)::int n FROM ecommerce_whatsapp_recovery_consents WHERE revoked_at IS NULL`)).rows[0].n, 0);
    });
  } finally { await pg.close(); }
});

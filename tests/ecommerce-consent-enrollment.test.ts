import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { createShopifyTemplateProvisioner, type TemplateDatabase } from '../server/ecommerce/shopifyTemplateProvisioning';
import { commerceConnectionFingerprint } from '../server/ecommerce/checkoutRecoveryProductionRelease';
import { classifyPostPurchaseConsent } from '../server/ecommerce/postPurchaseConsent';
import { classifyRecoveryConsentInbound } from '../server/ecommerce/checkoutRecoveryInboundConsentGate';
import { postPurchaseDeliveryReadinessQuery } from '../server/ecommerce/postPurchaseDeliveryReadiness';
import { enrollmentCaptureReadiness } from '../server/ecommerce/shopifyConsentEnrollment';
import { CONSENT_PURPOSES, emptyEnrollment, enrollmentLink, enrollmentNotice, parseEnrollmentDraft, enrollmentSourceAllowed, enrollmentDraftsEqual,
  WHATSAPP_CONSENT_PHRASES } from '../shared/shopifyConsentEnrollment';
import { stripShopifyGrowthManagedConfig } from '../shared/shopifyGrowthTemplates';

const account = '10000000-0000-4000-8000-000000000001', other = '20000000-0000-4000-8000-000000000002';
const shop = 'first.myshopify.com', at = Date.now(), key = 'k'.repeat(36);
const env = { RAILWAY_ENVIRONMENT_NAME: 'staging', APP_URL: 'https://whachatcrm-staging-app-staging.up.railway.app',
  ECOMMERCE_POST_PURCHASE_PREP_ENABLED: 'true', ECOMMERCE_POST_PURCHASE_ACCOUNT_ID: account,
  ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED: 'true', ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY: key };
const draft = () => { const d = emptyEnrollment(); d.sourceUrl = `https://${shop}/pages/whatsapp`; d.merchantName = 'First Store'; d.purposes.orderConfirmation.selected = true; return d; };

async function fixture(configuration: Record<string, string | undefined> = env) {
  const pg = new PGlite(), db = drizzle(pg) as unknown as TemplateDatabase;
  await pg.exec(`CREATE TABLE users(id text PRIMARY KEY,email text DEFAULT 'owner@example.test',shopify_shop text,shopify_access_token text DEFAULT 'fixture',
    shopify_subscription_status text DEFAULT 'active',shopify_installed_at timestamptz,deletion_requested_at timestamptz,
    meta_connected boolean DEFAULT true,meta_access_token text DEFAULT 'fixture',meta_business_account_id text,
    meta_phone_number_id text,meta_display_phone_number text,meta_token_expires_at timestamptz,whatsapp_provider text DEFAULT 'meta',
    billing_plan text DEFAULT 'pro',subscription_status text DEFAULT 'active',plan_override_enabled boolean DEFAULT false,
    plan_override text,trial_ends_at timestamptz,trial_status text,trial_plan text);
    CREATE TABLE integrations(id text PRIMARY KEY,user_id text,type text DEFAULT 'shopify',is_active boolean DEFAULT true,config jsonb DEFAULT '{}');
    CREATE TABLE ecommerce_shopify_workspace_activations(account_id text,installation_id text,shop text);
    CREATE TABLE ecommerce_post_purchase_intents(id bigint,account_id text,shop text,installation_id text,journey text);
    CREATE TABLE ecommerce_post_purchase_orders(id bigint);
    CREATE TABLE ecommerce_post_purchase_consents(id bigint);
    CREATE TABLE ecommerce_whatsapp_recovery_consents(last_verified_inbound_at timestamptz,last_verified_wamid text);`);
  for (const [id, domain, wabaId, phoneId, phone] of [[account, shop, '111111', '111112', '+1 (555) 123-4567'], [other, 'second.myshopify.com', '222221', '222222', '+15557654321']]) {
    await db.execute(sql`INSERT INTO users(id,shopify_shop,shopify_installed_at,meta_business_account_id,meta_phone_number_id,meta_display_phone_number)
      VALUES(${id},${domain},${new Date(at - 60000)},${wabaId},${phoneId},${phone})`);
    const connection = commerceConnectionFingerprint({ accountId: id, shop: domain, installationId: 'i-' + id, wabaId, phoneId, installedAt: at - 60000 });
    const config = { shop: domain, keep: 'preserved', ecommercePostPurchasePlans: { orderConfirmation: { selected: true, delayMinutes: 0 } },
      ecommercePostPurchaseTemplates: { orderConfirmation: 'template-' + id },
      ecommerceTemplateSetup: { version: 1, wabas: { [wabaId]: { authorizedFor: connection, items: {
        orderConfirmation: { status: 'ready', templateId: 'template-' + id, checkedAt: at },
      } } } } };
    await db.execute(sql`INSERT INTO integrations(id,user_id,config) VALUES(${'i-' + id},${id},${JSON.stringify(config)}::jsonb)`);
    await db.execute(sql`INSERT INTO ecommerce_shopify_workspace_activations VALUES(${id},${'i-' + id},${domain})`);
  }
  let providerCalls = 0;
  const service = createShopifyTemplateProvisioner({ database: db, env: configuration, now: () => at,
    provider: { list: async () => { providerCalls++; throw Error('unexpected_provider_call'); }, create: async () => { providerCalls++; throw Error('unexpected_provider_call'); } } });
  const config = async (id = account) => (await db.execute(sql`SELECT config FROM integrations WHERE user_id=${id}`)).rows[0].config as any;
  return { pg, db, service, config, calls: () => providerCalls };
}

test('enrollment links produce only the exact existing purpose-specific signed commands', () => {
  for (const purpose of CONSENT_PURPOSES) {
    const link = new URL(enrollmentLink('+1 (555) 123-4567', purpose)!);
    assert.equal(link.hostname, 'wa.me'); assert.equal(link.pathname, '/15551234567');
    const candidate = { signatureValid: true, hasRawBody: true, type: 'text', phoneNumberId: '111112', from: '15551234567',
      messageId: 'wamid.enrollment_123456', timestamp: String(Math.floor(at / 1000)), text: link.searchParams.get('text') };
    assert.equal(candidate.text, WHATSAPP_CONSENT_PHRASES[purpose]);
    if (purpose === 'checkoutRecovery') {
      assert.equal(classifyRecoveryConsentInbound(candidate, at)?.action, 'grant');
      assert.equal(classifyPostPurchaseConsent(candidate, at), null);
    } else {
      assert.equal(classifyPostPurchaseConsent(candidate, at)?.journey, purpose);
      assert.equal(classifyRecoveryConsentInbound(candidate, at), null);
    }
    assert.equal(classifyPostPurchaseConsent({ ...candidate, signatureValid: false }, at), null);
  }
  for (const invalid of ['123', 'https://evil.test', '15551234567?text=YES', null]) assert.equal(enrollmentLink(invalid, 'orderConfirmation'), null);
});

test('editable merchant copy cannot remove required channel, purpose, store and STOP; destination and grant injection rejected', () => {
  for (const locale of ['en', 'es', 'he'] as const) {
    const d = draft(); d.locale = locale; d.purposes.orderConfirmation.additionalText = 'Merchant brand';
    const notice = enrollmentNotice(shop, 'orderConfirmation', d);
    for (const expected of ['WhatsApp', shop, 'STOP', 'Merchant brand']) assert.ok(notice.includes(expected));
    assert.ok(parseEnrollmentDraft(d));
  }
  for (const extra of [{ accountId: other }, { phone: '+15557654321' }, { consentGranted: true }, { enabled: true }])
    assert.equal(parseEnrollmentDraft({ ...draft(), ...extra }), null);
  assert.equal(parseEnrollmentDraft({ ...draft(), purposes: { orderConfirmation: { selected: true, additionalText: '' } } }), null);
  assert.equal(parseEnrollmentDraft({ ...draft(), purposes: { ...draft().purposes, orderConfirmation: { selected: true, additionalText: '<script>' } } }), null);
  for (const source of ['https://second.myshopify.com/pages/wa', `http://${shop}`, `https://${shop}.evil.test`, `https://evil.test@${shop}`, `https://${shop}/?customer=1`])
    assert.equal(enrollmentSourceAllowed(source, shop), false);
  assert.deepEqual(stripShopifyGrowthManagedConfig({ ecommerceConsentEnrollment: draft(), keep: true }), { keep: true });
});

test('enrollment persists provenance only in its tenant, survives refresh, and cannot activate approved templates', async () => {
  const f = await fixture();
  try {
    const foreignBefore = await f.config(other), ownBefore = await f.config();
    assert.equal(await f.service.saveEnrollment(account, draft()), true);
    const saved = await f.config(), view = (await f.service.enrollmentView(account))!;
    assert.deepEqual(await f.config(other), foreignBefore);
    assert.deepEqual(Object.fromEntries(Object.entries(saved).filter(([k]) => k !== 'ecommerceConsentEnrollment')), ownBefore);
    assert.equal(saved.ecommerceConsentEnrollment.savedBy, account);
    assert.equal(saved.ecommerceConsentEnrollment.savedAt, new Date(at).toISOString());
    assert.match(view.revision!, /^[a-f0-9]{64}$/); assert.deepEqual(view.draft, draft());
    assert.equal(view.connectionCurrent, true); assert.ok(view.rows[0].link?.includes('/15551234567?'));
    assert.equal(view.rows[0].templateReady, true); assert.equal(view.rows[0].operatorReleased, false);
    assert.equal(view.rows[0].recipientConsent, 'required_per_recipient');
    assert.equal(view.rows[0].activationBlocked, true);
    assert.ok(view.rows[0].blockers.includes('operator_release_required'));
    assert.equal(view.rows.find(r => r.purpose === 'fulfillmentUpdate')?.link, null);
    assert.equal(await f.service.setDelivery(account, 'postPurchase', true), false);
    assert.equal(await f.service.setDelivery(account, 'checkoutRecovery', true), false);
    assert.equal(f.calls(), 0);
    // Configuration creates no consent rows or delivery outbox.
    assert.equal((await f.db.execute(sql`SELECT count(*)::int AS total FROM ecommerce_post_purchase_consents`)).rows[0].total, 0);
    assert.equal((await f.db.execute(sql`SELECT to_regclass('ecommerce_post_purchase_outbox') AS outbox`)).rows[0].outbox, null);
    assert.equal((await f.service.enrollmentView(other))?.draft, null);
    assert.equal(await f.service.saveEnrollment(other, draft()), false);
    assert.equal(await f.service.saveEnrollment('unknown', draft()), false);
    await f.pg.exec('DROP TABLE ecommerce_post_purchase_consents');
    const missingSchema = (await f.service.enrollmentView(account))!;
    assert.equal(missingSchema.rows[0].link, null); assert.equal(missingSchema.rows[0].captureReady, false);
    assert.ok(missingSchema.rows[0].blockers.includes('consent_schema_required'));
  } finally { await f.pg.close(); }
});

test('first enrollment save matches its real JSONB readback regardless of nested key order; real edits never match', async () => {
  const f = await fixture();
  try {
    for (const locale of ['en', 'es', 'he'] as const) {
      const submitted = draft(); submitted.locale = locale;
      submitted.purposes.orderConfirmation.additionalText = 'Merchant notice';
      assert.equal(await f.service.saveEnrollment(account, submitted), true);
      const persisted = (await f.service.enrollmentView(account))!.draft!;
      assert.notEqual(JSON.stringify(persisted), JSON.stringify(submitted), 'exercise actual PostgreSQL JSONB key reordering');
      assert.equal(enrollmentDraftsEqual(persisted, submitted), true);
      assert.equal(enrollmentDraftsEqual(submitted, persisted), true);
      const reversed = Object.fromEntries(Object.entries(persisted).reverse());
      reversed.purposes = Object.fromEntries(Object.entries(persisted.purposes).reverse().map(([purpose, row]) =>
        [purpose, Object.fromEntries(Object.entries(row).reverse())]));
      assert.equal(enrollmentDraftsEqual(reversed as typeof submitted, submitted), true);
      const changedFields = [
        { ...submitted, sourceUrl: 'https://fixture.myshopify.com/pages/other' },
        { ...submitted, merchantName: 'Changed name' },
        { ...submitted, locale: locale === 'es' ? 'en' as const : 'es' as const },
      ];
      for (const edited of changedFields) assert.equal(enrollmentDraftsEqual(persisted, edited), false);
      for (const purpose of CONSENT_PURPOSES) {
        for (const field of ['selected', 'additionalText'] as const) {
          const edited = structuredClone(submitted);
          if (field === 'selected') edited.purposes[purpose].selected = !edited.purposes[purpose].selected;
          else edited.purposes[purpose].additionalText += ' changed';
          assert.equal(enrollmentDraftsEqual(persisted, edited), false, `${purpose}.${field}`);
        }
      }
      assert.equal(enrollmentDraftsEqual(persisted, null), false);
      assert.equal(enrollmentDraftsEqual(undefined, submitted), false);
      assert.equal(enrollmentDraftsEqual(null, undefined), false);
    }
    assert.equal(f.calls(), 0);
  } finally { await f.pg.close(); }
});

test('connection changes invalidate shared enrollment; pause remains available on Meta disconnect and privacy/ambiguity block edits', async () => {
  const f = await fixture();
  try {
    await f.service.saveEnrollment(account, draft());
    await f.db.execute(sql`UPDATE users SET meta_phone_number_id='999999' WHERE id=${account}`);
    const changed = (await f.service.enrollmentView(account))!;
    assert.equal(changed.connectionCurrent, false); assert.ok(changed.rows.every(r => r.link === null && !r.templateReady));
    await f.db.execute(sql`UPDATE integrations SET config=config || '{"ecommercePostPurchaseDeliveryEnabled":true,"ecommerceCheckoutRecoveryDeliveryEnabled":true}'::jsonb WHERE user_id=${account}`);
    await f.db.execute(sql`UPDATE users SET meta_connected=false WHERE id=${account}`);
    assert.equal(await f.service.enrollmentView(account), null);
    assert.equal(await f.service.saveEnrollment(account, draft()), false);
    for (const kind of ['postPurchase', 'checkoutRecovery'] as const) assert.equal(await f.service.setDelivery(account, kind, false), true);
    assert.equal((await f.config()).ecommercePostPurchaseDeliveryEnabled, false);
    await f.db.execute(sql`UPDATE users SET meta_connected=true,deletion_requested_at=NOW() WHERE id=${account}`);
    assert.equal(await f.service.saveEnrollment(account, draft()), false);
    await f.db.execute(sql`UPDATE users SET deletion_requested_at=NULL WHERE id=${account}`);
    await f.db.execute(sql`INSERT INTO integrations(id,user_id) VALUES('duplicate',${account})`);
    assert.equal(await f.service.saveEnrollment(account, draft()), false);
  } finally { await f.pg.close(); }
});

test('capture readiness is independent, default-off and exactly tenant/shop scoped in production', () => {
  assert.deepEqual(enrollmentCaptureReadiness({}, account, shop), { postPurchase: false, checkoutRecovery: false });
  assert.deepEqual(enrollmentCaptureReadiness(env, account, shop), { postPurchase: true, checkoutRecovery: true });
  assert.equal(enrollmentCaptureReadiness(env, other, shop).postPurchase, false);
  assert.deepEqual(enrollmentCaptureReadiness({ ...env, ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY: '' }, account, shop), { postPurchase: false, checkoutRecovery: false });
  const production = { ...env, RAILWAY_ENVIRONMENT_NAME: 'production', APP_URL: 'https://app.whachatcrm.com',
    ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID: account, ECOMMERCE_RECOVERY_WORKER_ALLOWED_SHOP: shop,
    ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID: 'gid://shopify/AbandonedCheckout/1', ECOMMERCE_RECOVERY_CONTROLLED_RECIPIENT_HMAC: 'a'.repeat(64),
    ECOMMERCE_RECOVERY_PRODUCTION_CONSENT_APPROVED: 'true' };
  assert.equal(enrollmentCaptureReadiness(production, account, shop).checkoutRecovery, true);
  assert.equal(enrollmentCaptureReadiness(production, other, shop).checkoutRecovery, false);
  assert.equal(enrollmentCaptureReadiness(production, account, 'second.myshopify.com').checkoutRecovery, false);
  assert.equal(enrollmentCaptureReadiness(production, account, shop).postPurchase, false);
});

test('merchant enrollment API requires an authenticated same-origin JSON request and never accepts target identities', async () => {
  const { default: express, Router } = await import('express');
  const { once } = await import('node:events');
  const { registerConsentEnrollmentRoutes } = await import('../server/ecommerce/shopifyConsentEnrollmentRoutes');
  const f = await fixture(), app = express(), router = Router();
  app.use(express.json());
  // Test authentication adapter; the application uses its existing session middleware.
  app.use((req, _res, next) => { if (req.get('x-fixture-account')) req.user = { id: req.get('x-fixture-account')! } as any; next(); });
  registerConsentEnrollmentRoutes(router, { service: f.service, appOrigin: () => 'https://app.whachatcrm.com', writeLimiter: (_req, _res, next) => next() });
  app.use('/api/shopify/merchant-engine', router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/shopify/merchant-engine/consent-enrollment`;
  const post = (body: unknown, headers: Record<string, string> = {}) => fetch(url, { method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://app.whachatcrm.com', 'x-fixture-account': account, ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await post(draft(), { 'x-fixture-account': '' })).status, 401);
    for (const origin of ['https://evil.test', 'null', '']) assert.equal((await post(draft(), { origin })).status, 403);
    assert.equal((await post(draft(), { 'content-type': 'text/plain' })).status, 403);
    assert.equal((await post({ ...draft(), accountId: other })).status, 400);
    assert.equal((await post({ ...draft(), phone: '+15557654321' })).status, 400);
    assert.equal((await post(draft(), { 'x-fixture-account': other })).status, 409);
    const response = await post(draft()); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, messagingEnabled: false, consentGranted: false });
    const read = await fetch(url, { headers: { 'x-fixture-account': account } });
    assert.equal(read.headers.get('cache-control'), 'no-store');
    const view = await read.json(); assert.deepEqual(view.draft, draft());
    assert.ok(!JSON.stringify(view).includes('fixture'), 'no credentials in enrollment response');
    assert.equal((await f.service.enrollmentView(other))?.draft, null);
    assert.equal(f.calls(), 0);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await f.pg.close(); }
});

test('production readiness shows release only for the exact existing intent journey and tenant installation', async () => {
  const production = { ...env, RAILWAY_ENVIRONMENT_NAME: 'production', APP_URL: 'https://app.whachatcrm.com',
    ECOMMERCE_PILOT_ENABLED: 'true', ECOMMERCE_PILOT_WORKSPACE_ID: account, ECOMMERCE_PILOT_OWNER_EMAIL: 'owner@example.test',
    ECOMMERCE_POST_PURCHASE_PRODUCTION_RELEASE_APPROVED: 'true', ECOMMERCE_POST_PURCHASE_DELIVERY_ENABLED: 'true',
    ECOMMERCE_POST_PURCHASE_DELIVERY_ACCOUNT_ID: account, ECOMMERCE_POST_PURCHASE_RECEIPTS_ENABLED: 'true',
    ECOMMERCE_POST_PURCHASE_WEBHOOKS_VERIFIED: 'true', ECOMMERCE_POST_PURCHASE_DELIVERY_MODE: 'controlled-one-intent',
    ECOMMERCE_POST_PURCHASE_CONTROLLED_INTENT_ID: '1', ECOMMERCE_POST_PURCHASE_CONTROLLED_RECIPIENT_HMAC: 'a'.repeat(64),
    ECOMMERCE_POST_PURCHASE_CONTROLLED_EXPIRES_AT: new Date(Date.now() + 600000).toISOString() };
  const f = await fixture(production);
  try {
    await f.db.execute(sql`INSERT INTO ecommerce_post_purchase_intents VALUES(1,${account},${shop},${'i-' + account},'fulfillmentUpdate')`);
    let view = (await f.service.enrollmentView(account))!;
    assert.deepEqual(view.rows.filter(r => r.operatorReleased).map(r => r.purpose), ['fulfillmentUpdate']);
    assert.ok(view.rows.every(r => r.activationBlocked), 'missing delivery schema still blocks activation');
    // Isolate the scope gate with the existing schema prerequisite independently
    // satisfied. No live provider or customer-sending adapter is present.
    const readyDb: TemplateDatabase = { execute: q => f.db.execute(q), transaction: fn => f.db.transaction(tx => fn({
      execute: q => q === postPurchaseDeliveryReadinessQuery ? Promise.resolve({ rows: [{ outbox: true, intents: true, consents: true }] }) : tx.execute(q),
    })) };
    const activation = createShopifyTemplateProvisioner({ database: readyDb, env: production, now: () => at,
      provider: { list: async () => assert.fail('out-of-scope activation must stop before provider calls'), create: async () => assert.fail('no template creation') } });
    assert.equal((await activation.view(account)).delivery?.postPurchase.reason, 'controlled_journey_release_required');
    assert.equal(await activation.setDelivery(account, 'postPurchase', true), false);
    await f.db.execute(sql`UPDATE ecommerce_post_purchase_intents SET journey='orderConfirmation'`);
    assert.equal((await activation.view(account)).delivery?.postPurchase.canActivate, true);
    const config = await f.config();
    config.ecommercePostPurchasePlans.fulfillmentUpdate = { selected: true, delayMinutes: 0 };
    config.ecommercePostPurchaseTemplates.fulfillmentUpdate = 'shipping-template';
    config.ecommerceTemplateSetup.wabas['111111'].items.fulfillmentUpdate = { status: 'ready', templateId: 'shipping-template', checkedAt: at };
    await f.db.execute(sql`UPDATE integrations SET config=${JSON.stringify(config)}::jsonb WHERE user_id=${account}`);
    assert.equal((await activation.view(account)).delivery?.postPurchase.reason, 'controlled_journey_release_required');
    assert.equal(await activation.setDelivery(account, 'postPurchase', true), false);
    await f.db.execute(sql`UPDATE ecommerce_post_purchase_intents SET account_id=${other}`);
    view = (await f.service.enrollmentView(account))!;
    assert.ok(view.rows.every(r => !r.operatorReleased));
    assert.equal(f.calls(), 0);
  } finally { await f.pg.close(); }
});

test('theme setup uses native JSONB, is idempotent and connection-bound, and cannot alter consent/delivery or another tenant', async () => {
  const f = await fixture();
  try {
    const foreign = await f.config(other), before = await f.config();
    for (let i = 0; i < 2; i++) assert.equal(await f.service.recordConsentThemeAction(account, 'open_editor'), true);
    assert.equal(await f.service.recordConsentThemeAction(account, 'confirm_saved'), true);
    const saved = await f.config(), context = await f.service.consentInstallation(account);
    assert.equal(saved.ecommerceConsentThemeSetup.editorOpenedAt, new Date(at).toISOString());
    assert.equal(saved.ecommerceConsentThemeSetup.merchantConfirmedAt, new Date(at).toISOString());
    assert.equal(context?.setup.connection, context?.connection);
    assert.deepEqual(Object.fromEntries(Object.entries(saved).filter(([k]) => k !== 'ecommerceConsentThemeSetup')), before);
    assert.deepEqual(await f.config(other), foreign);
    assert.equal((await f.db.execute(sql`SELECT count(*)::int AS total FROM ecommerce_post_purchase_consents`)).rows[0].total, 0);
    assert.deepEqual(stripShopifyGrowthManagedConfig({ ecommerceConsentThemeSetup: saved.ecommerceConsentThemeSetup, keep: true }), { keep: true });
    await f.db.execute(sql`UPDATE users SET meta_phone_number_id='999999' WHERE id=${account}`);
    const changed = await f.service.consentInstallation(account);
    assert.notEqual(changed?.setup.connection, changed?.connection);
    await f.service.recordConsentThemeAction(account, 'open_editor');
    assert.equal((await f.config()).ecommerceConsentThemeSetup.merchantConfirmedAt, undefined);
    await f.db.execute(sql`UPDATE users SET deletion_requested_at=NOW() WHERE id=${account}`);
    assert.equal(await f.service.consentInstallation(account), null);
    assert.equal(await f.service.recordConsentThemeAction(account, 'open_editor'), false);
    assert.equal(await f.service.recordConsentThemeAction('unknown', 'confirm_saved'), false);
    assert.equal(f.calls(), 0);
  } finally { await f.pg.close(); }
});

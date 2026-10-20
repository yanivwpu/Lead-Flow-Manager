import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkoutObservationPreviewAvailable,parseCheckoutObservationSyncRequest} from '../server/ecommerce/checkoutObservationSyncGate';

test('checkout observation imports can run only with exact staging flags',()=>{
  const env={RAILWAY_ENVIRONMENT_NAME:'staging',APP_URL:'https://whachatcrm-staging-app-staging.up.railway.app',
    ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:'true'};
  assert.equal(checkoutObservationPreviewAvailable(env),true);
  for(const patch of [
    {RAILWAY_ENVIRONMENT_NAME:'production'},
    {APP_URL:'https://app.whachatcrm.com'},
    {ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:'false'},
  ]) assert.equal(checkoutObservationPreviewAvailable({...env,...patch}),false);
});
test('input allows a bounded pagination cursor, never checkout or recipient data',()=>{
  assert.deepEqual(parseCheckoutObservationSyncRequest({action:'preview_sync'}),{action:'preview_sync',after:null});
  assert.deepEqual(parseCheckoutObservationSyncRequest({action:'preview_sync',after:'cursor'}),{action:'preview_sync',after:'cursor'});
  for(const value of [{action:'preview_sync',checkoutId:'fake'}, {action:'activate'},
     {action:'preview_sync',after:''},{action:'preview_sync',after:'x'.repeat(2049)},
     {action:'preview_sync',recipient:'123'},{action:'preview_sync',after:123}])
    assert.equal(parseCheckoutObservationSyncRequest(value),null);
});
test('staging route rechecks tenant, active Shopify install and current token under privacy lock',()=>{
  const src=readFileSync('server/shopifyRoutes.ts','utf8');
  const start=src.indexOf("router.post('/ecommerce/checkout-observation-preview-sync'");
  const end=src.indexOf("router.get('/webhooks/health/all'",start);
  assert.ok(start>0&&end>start);
  const endpoint=src.slice(start,end);
  for(const required of ['checkoutObservationPreviewAvailable','parseCheckoutObservationSyncRequest',
    "req.get('origin')", 'isShopifyContactInstallationActive',
    'fetchShopifyAbandonedCheckoutPage','pg_advisory_xact_lock','upsertCheckoutObservationQuery',
    "liveOwner.shopifyAccessToken !== owner.shopifyAccessToken",'messagingEnabled:false'])
    assert.ok(endpoint.includes(required),required);
  for(const forbidden of ['sendMessage(', 'cartCreate(', 'abandonedCheckoutUrl', 'req.body.checkoutId'])
    assert.ok(!endpoint.includes(forbidden),forbidden);
});

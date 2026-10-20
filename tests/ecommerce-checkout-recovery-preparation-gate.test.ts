import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 checkoutRecoveryPreparationEnabled,parsePrepareRecoveryRequest
} from '../server/ecommerce/checkoutRecoveryPreparationGate';

test('recovery preparation requires exact staging origin and two independent operator flags',()=>{
 const env={RAILWAY_ENVIRONMENT_NAME:'staging',
   APP_URL:'https://whachatcrm-staging-app-staging.up.railway.app',
   ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:'true',
   ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:'true'};
 assert.equal(checkoutRecoveryPreparationEnabled(env),true);
 for(const item of [
   {RAILWAY_ENVIRONMENT_NAME:'production'},
   {APP_URL:'https://app.whachatcrm.com'},
   {ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:'false'},
   {ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:undefined}
 ]) assert.equal(checkoutRecoveryPreparationEnabled({...env,...item}),false);
});
test('preparation accepts no arbitrary tenant, checkout, message or recipient data',()=>{
 assert.equal(parsePrepareRecoveryRequest({action:'prepare_review'}),true);
 for(const input of [
  {action:'prepare_review',checkoutId:'123'}, {action:'prepare_review',message:'Hi'},
  {action:'prepare_review',phone:'123'}, {action:'prepare_review',accountId:'a'},
  {action:'send'}, null, [], {}, 'prepare_review',
 ]) assert.equal(parsePrepareRecoveryRequest(input),false);
});
test('staging route uses recheck, privacy fencing, scoped SQL and no sending',()=>{
 const source=readFileSync('server/shopifyRoutes.ts','utf8');
 const start=source.indexOf("router.post('/ecommerce/checkout-recovery-prepare'");
 const end=source.indexOf("router.get('/webhooks/health/all'",start);
 assert.ok(start>=0 && end>start);
 const route=source.slice(start,end);
 for(const required of [
   'checkoutRecoveryPreparationEnabled','parsePrepareRecoveryRequest',
   "req.get('origin')",'dueCheckoutObservationsQuery',
   'recheckShopifyCheckoutForRecovery','isShopifyContactInstallationActive',
   'pg_advisory_xact_lock','prepareCheckoutRecoveryIntentQuery',
   'suppressCheckoutRecoveryIntentQuery','messagingEnabled:false',
   'sendQueueEnabled:false','recoveryActive:false'
 ]) assert.ok(route.includes(required),required);
 for(const forbidden of ['sendMessage(', 'cartCreate(', 'req.body.checkoutId', 'recoveryUrl:', 'abandonedCheckoutUrl'])
   assert.equal(route.includes(forbidden),false,forbidden);
 assert.ok(source.includes('suppressCompletedCheckoutIntentQuery'),
   'purchase snapshots must suppress prior prepared review intents');
});

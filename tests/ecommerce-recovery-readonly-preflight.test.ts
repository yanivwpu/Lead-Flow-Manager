import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PILOT_RECOVERY_SHOP,stagingRecoveryPreflightAllowed,
  recoveryAutomationFlags} from '../server/ecommerce/checkoutRecoveryPreflight';

const env={
  RAILWAY_ENVIRONMENT_NAME:'staging',
  APP_URL:'https://whachatcrm-staging-app-staging.up.railway.app',
  ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:'false',
  ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:'false',
  ECOMMERCE_RECOVERY_AUTOPREP_ENABLED:'false',
  ECOMMERCE_RECOVERY_SEND_ENABLED:'false',
  ECOMMERCE_RECOVERY_WORKER_ENABLED:'false',
};
test('read-only preflight permits exactly the authenticated pilot staging origin and shop',()=>{
 assert.equal(stagingRecoveryPreflightAllowed(env,PILOT_RECOVERY_SHOP),true);
 assert.equal(stagingRecoveryPreflightAllowed({...env,RAILWAY_ENVIRONMENT_NAME:'production'},PILOT_RECOVERY_SHOP),false);
 assert.equal(stagingRecoveryPreflightAllowed({...env,APP_URL:'https://app.whachatcrm.com'},PILOT_RECOVERY_SHOP),false);
 assert.equal(stagingRecoveryPreflightAllowed(env,'different.myshopify.com'),false);
 assert.equal(stagingRecoveryPreflightAllowed(env,'whachatcrm.myshopify.com.evil.tld'),false);
});
test('preflight only reads gate states and never turns on sending',()=>{
 const flags=recoveryAutomationFlags(env);
 assert.deepEqual(flags,{observationEnabled:false,preparationEnabled:false,
   autoprepEnabled:false,sendEnabled:false,workerEnabled:false});
 assert.equal(recoveryAutomationFlags({...env,ECOMMERCE_RECOVERY_SEND_ENABLED:'true'}).sendEnabled,true);
 assert.equal(recoveryAutomationFlags({...env,ECOMMERCE_RECOVERY_SEND_ENABLED:'TRUE'}).sendEnabled,false);
});
test('pilot endpoint uses signed-in merchant, read-only aggregate and one live Shopify page; no DB mutation',()=>{
 const src=readFileSync('server/shopifyRoutes.ts','utf8');
 const start=src.indexOf("router.get('/ecommerce/checkout-recovery-preflight'");
 const end=src.indexOf('/** Staging-only manual Shopify abandoned-checkout observation import.',start);
 assert.ok(start>=0 && end>start);
 const section=src.slice(start,end);
 for(const expected of ['if (!req.user)', 'stagingRecoveryPreflightAllowed(environment,shop)',
   'isShopifyContactInstallationActive(owner)','eq(integrations.isActive,true)',
   'fetchShopifyAbandonedCheckoutPage({shop,accessToken:owner.shopifyAccessToken})',
   "mode:'staging_read_only'", "liveMetaTemplateApproval:'not_checked'",
   'messagesSentByThisCheck:0','checkoutsCreatedByThisCheck:0']) {
   assert.ok(section.includes(expected),expected);
 }
 assert.doesNotMatch(section,/\b(?:INSERT INTO|DELETE FROM|UPDATE ecommerce_|router.post|sendRecoveryViaMeta|sendMetaWhatsAppTemplate|enqueueRecoveryDeliveryQuery|upsertCheckoutObservationQuery)\b/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
test('staging migration script is valid bash, requires fresh backup and verified restore first',()=>{
  const script='scripts/ecommerce-recovery-staging-migrate.sh';
  const syntax=spawnSync('bash',['-n',script],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
  const body=readFileSync(script,'utf8');
  const required=['RAILWAY_PROJECT_ID','RAILWAY_ENVIRONMENT_ID','RECOVERY_MIGRATION_JOB_SERVICE_ID',
    'RECOVERY_MIGRATION_APPROVAL','PGHOST','railway.internal','pg_dump',
    'pg_restore -e','RECOVERY_FRESH_BACKUP_RESTORE_VERIFIED',
    'psql "','--single-transaction','ON_ERROR_STOP=1',
    '20261020_ecommerce_abandoned_checkout_observations.sql',
    '20261020_ecommerce_checkout_recovery_intents.sql',
    '20261020_ecommerce_whatsapp_recovery_delivery.sql',
    '20261020_ecommerce_recovery_signed_inbound_consent.sql',
    '20261020_ecommerce_recovery_meta_receipts.sql'];
  for(const key of required)assert.ok(body.includes(key),key);
  assert.ok(body.indexOf('RECOVERY_FRESH_BACKUP_RESTORE_VERIFIED')<
    body.indexOf('RECOVERY_STAGING_DDL_BEGIN'));
  for(const banned of ['sendMetaWhatsAppTemplate','cartCreate','createOrder'])
    assert.equal(body.includes(banned),false,banned);
});
test('read-only test-store probe requires exact development shop and checkout identity',()=>{
 const body=readFileSync('scripts/ecommerce-recovery-staging-readonly-smoke.ts','utf8');
 for(const required of ['whachatcrm.myshopify.com','RECOVERY_TEST_READONLY_APPROVED',
  'RECOVERY_TEST_CHECKOUT_GID','fetchShopifyAbandonedCheckoutPage',
  'recheckShopifyCheckoutForRecovery','last_verified_inbound_at',
  'read_only_no_send','shopify_access_token'])assert.ok(body.includes(required),required);
 for(const forbidden of ['sendMetaWhatsAppTemplate','cartCreate(','checkoutCreate(','orders/create'])
  assert.equal(body.includes(forbidden),false,forbidden);
});

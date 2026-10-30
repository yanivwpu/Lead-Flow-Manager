import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHOPIFY_APP_CONFIG_WEBHOOK_SPECS,SHOPIFY_GRAPHQL_WEBHOOK_SPECS} from '../shared/shopifyWebhookHealth';

test('fulfillment/cancellation subscriptions use existing signed routes and one app-managed registration path',()=>{
  for(const topic of ['fulfilled','cancelled']){
    const suffix='/api/shopify/webhooks/orders-'+topic;
    assert.equal(SHOPIFY_APP_CONFIG_WEBHOOK_SPECS.filter(s=>s.topic==='orders/'+topic&&s.pathSuffix===suffix).length,1);
    assert.ok(!SHOPIFY_GRAPHQL_WEBHOOK_SPECS.some(s=>s.restTopic==='orders/'+topic));
    for(const [file,origin] of [['shopify.app.whachatcrm.toml','https://app.whachatcrm.com'],
      ['shopify.app.staging.toml','https://whachatcrm-staging-app-staging.up.railway.app']]){
      const source=readFileSync(file,'utf8');
      assert.equal(source.split('topics = ["orders/'+topic+'"]') .length,2);
      assert.ok(source.includes('uri = "'+origin+suffix+'"'));
      assert.match(source,/scopes = "read_customers,read_orders"/);
    }
  }
});

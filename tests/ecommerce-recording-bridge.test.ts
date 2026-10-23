import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('record-only Shopify bridge stays opt-in and follows successful ingest',()=>{
 const source=readFileSync('server/shopifyCommerceWebhooks.ts','utf8');
 const marker='if (process.env.ECOMMERCE_EVENT_RECORDING_ENABLED === "true")';
 assert.ok(source.includes(marker));
 assert.ok(source.indexOf(marker)>source.indexOf('if (!result.ok) throw new Error("Order persistence failed")'));
 assert.ok(source.indexOf(marker)<source.indexOf('export async function processShopifyOrderCreate'));
 assert.ok(source.includes('ON CONFLICT (account_id,shop,topic,delivery_id) DO NOTHING'));
 assert.ok(source.includes('webhookId: shopifyEventId(req, "")'));
 assert.ok(!source.slice(source.indexOf(marker),source.indexOf('export async function processShopifyOrderCreate')).includes('dispatchCommerceEventAutomation'));
});
test('Shopify route verifies HMAC before reaching order processing',()=>{
 const route=readFileSync('server/shopifyRoutes.ts','utf8');
 const handler=readFileSync('server/shopifyOrderWebhookHandler.ts','utf8');
 assert.match(route,/createShopifyOrderWebhookHandler\("orders\/create",\s*\{/);
 assert.match(route,/verify: verifyWebhookHmac/);
 assert.match(handler,/!deps\.verify\(raw, hmac\)/);
});

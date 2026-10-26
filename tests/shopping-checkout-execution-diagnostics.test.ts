import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionDiagnostics, executionFailureReason, shopifyDiagnosticRequestId, type ExecutionDiagnostic } from '../server/shopping/checkout/executionDiagnostics';
import { CheckoutError } from '../server/shopping/checkout/contract';
import { CheckoutVerificationError } from '../server/shopping/checkout/preflightDiagnostics';
import { createShopifyCheckoutProvider } from '../server/shopping/checkout/shopify';
const uuid='05185397-bb4e-4a80-9c67-e986fc5abb12';
test('fixed execution diagnostics omit raw errors, hostile headers, extra response fields, cart identifiers and checkout URLs',()=>{
 const events:ExecutionDiagnostic[]=[];const log=createExecutionDiagnostics(uuid,event=>events.push(event));log.bind(uuid);log.stage('pre_dispatch_validation');
 for(const id of ['token=private-fixture','private@example.invalid','https://private.invalid/checkout','cookie=private',uuid+'\nsecret', 'a'.repeat(200)])
  assert.equal(shopifyDiagnosticRequestId(id),undefined);
 log.provider({operation:'create',event:'response_received',httpStatus:200,shopifyRequestId:'cookie=private',token:'private-fixture'} as any);
 log.failed(Error('https://private.invalid/checkout token=private-fixture customer=private@example.invalid'));
 const malformed=new CheckoutVerificationError('storefront','failed');(malformed as any).code='token=private-fixture';
 assert.equal(executionFailureReason(malformed),'unclassified_failure');
 assert.equal(executionFailureReason({code:'token=private-fixture'}),'unclassified_failure');
 assert.equal(executionFailureReason(Object.defineProperty({},'code',{get(){throw Error('private getter');}})),'unclassified_failure');
 assert.equal(executionFailureReason(new CheckoutError('ambiguous',30000,'transport_timeout')),'ambiguous:transport_timeout');
 assert.equal(shopifyDiagnosticRequestId(uuid),uuid);assert.equal(shopifyDiagnosticRequestId(uuid+'-1793036521'),uuid+'-1793036521');
 assert.doesNotMatch(JSON.stringify(events),/private-fixture|private@example|private.invalid|cookie|token|checkoutUrl|providerCartId/);
 assert.equal(events.at(-1)!.reason,'unclassified_failure');
});
test('logging failures never authorize, repeat or prevent provider work; safe Shopify response request IDs are captured without body content',async()=>{
 const item={productId:'gid://shopify/Product/1',variantId:'gid://shopify/ProductVariant/2',quantity:1,price:'1.00',currency:'USD',options:[{name:'Title',value:'Default Title'}]};
 const events:any[]=[];let calls=0;
 const provider=createShopifyCheckoutProvider({shop:'fixture.myshopify.com',credential:{kind:'public',token:'synthetic-private-token'},
  diagnostic:event=>{events.push(event);throw Error('logger failed with private text');},fetch:async()=>{
   calls++;return new Response(JSON.stringify({data:{node:{id:item.variantId,product:{id:item.productId,requiresSellingPlan:false},availableForSale:true,quantityAvailable:5,currentlyNotInStock:false,requiresComponents:false,quantityRule:{minimum:1,maximum:null,increment:1},selectedOptions:item.options,price:{amount:'1.00',currencyCode:'USD'}}},secret:'private-body'}),{headers:{'x-shopify-api-version':'2026-10','x-request-id':uuid,'set-cookie':'private-cookie'}});
  }});
 await provider.verify(item);assert.equal(calls,1);
 assert.ok(events.some(e=>e.event==='response_received'&&e.shopifyRequestId===uuid&&e.httpStatus===200));
 assert.doesNotMatch(JSON.stringify(events),/synthetic-private-token|private-body|private-cookie|set-cookie/);
 const logger=createExecutionDiagnostics(uuid,()=>{throw Error('broken sink');});assert.doesNotThrow(()=>{logger.claimStarted();logger.claimed();logger.dispatch();logger.failed(Error('private'));});
});

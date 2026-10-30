import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recheckPostPurchaseOrder,parsePostPurchaseOrderEvent} from '../server/ecommerce/postPurchaseOrder';
import {postPurchasePreparationEnabled} from '../server/ecommerce/postPurchaseGate';
import {classifyPostPurchaseConsent,POST_PURCHASE_CONSENT_PHRASES} from '../server/ecommerce/postPurchaseConsent';
import {matchPostPurchaseTemplate} from '../server/ecommerce/postPurchaseEligibility';
import {createShopifyOrderWebhookHandler} from '../server/shopifyOrderWebhookHandler';
const now=Date.parse('2026-10-30T12:00:00Z'),orderId='gid://shopify/Order/1',customerId='gid://shopify/Customer/2';
const fixture=()=>({data:{order:{id:orderId,updatedAt:new Date(now-1000).toISOString(),cancelledAt:null as null|string,displayFulfillmentStatus:'FULFILLED',
  customer:{id:customerId,orders:{nodes:[{id:orderId,createdAt:new Date(now-86400000).toISOString()}]}}}}});

test('fresh Shopify read uses exact shop/order/customer, read-only query, timeout and fail-closed evidence',async()=>{
  let calls=0;
  const read=async(payload:unknown)=>recheckPostPurchaseOrder({shop:'fixture.myshopify.com',accessToken:'fixture',orderId,customerId,now,
    fetchImpl:async(url,init)=>{calls++;assert.equal(String(url),'https://fixture.myshopify.com/admin/api/2026-10/graphql.json');
      const body=JSON.parse(String(init?.body));assert.equal(body.variables.id,orderId);assert.ok(!/mutation/i.test(body.query));
      assert.ok(init?.signal);assert.equal(init?.redirect,'error');return {ok:true,json:async()=>payload} as Response;
    }});
  assert.equal((await read(fixture()))?.status,'fulfilled');
  const cancelled=fixture();cancelled.data.order.cancelledAt=new Date(now-1000).toISOString();assert.equal((await read(cancelled))?.status,'cancelled');
  for(const mutate of [
    (x:any)=>x.data.order.id='gid://shopify/Order/3',
    (x:any)=>x.data.order.customer.id='gid://shopify/Customer/3',
    (x:any)=>x.data.order.customer=null,
    (x:any)=>delete x.data.order.cancelledAt,
    (x:any)=>x.data.order.updatedAt=new Date(now+1).toISOString(),
    (x:any)=>x.data.order.displayFulfillmentStatus='UNRECOGNIZED',
    (x:any)=>x.errors=[{message:'permission denied'}],
  ]){const value=fixture();mutate(value);assert.equal(await read(value),null);}
  const uncertain=fixture();uncertain.data.order.customer.orders.nodes=[];
  assert.equal((await read(uncertain))?.latestPurchaseAt,null);
  assert.equal(await recheckPostPurchaseOrder({shop:'attacker.invalid',accessToken:'fixture',orderId,customerId,
    fetchImpl:async()=>{throw Error('must not fetch');}}),null);
  assert.ok(calls>0);
});

test('new fulfillment and cancellation handlers require exact signed bytes and retry on durable failure',async()=>{
  for(const topic of ['orders/fulfilled','orders/cancelled'] as const){
    let calls=0;const raw=Buffer.from('{"id":"1","customer":{"id":"2"}}');
    const request=()=>({rawBody:raw,body:{id:'forged'},headers:{'x-shopify-hmac-sha256':'valid',
      'x-shopify-topic':topic,'x-shopify-event-id':'delivery','x-shopify-shop-domain':'fixture.myshopify.com'}});
    const handler=createShopifyOrderWebhookHandler(topic,{verify:(b,h)=>b.equals(raw)&&h==='valid',emit:()=>{},
      process:async input=>{calls++;assert.equal(input.body.id,'1');throw Error('private details');}});
    const response=()=>({code:0,value:null as unknown,status(c:number){this.code=c;return this;},json(v:unknown){this.value=v;return this;}});
    const invalid=request();invalid.headers['x-shopify-hmac-sha256']='invalid';const denied=response();
    await handler(invalid as any,denied as any);assert.equal(denied.code,401);assert.equal(calls,0);
    const retry=response();await handler(request() as any,retry as any);assert.equal(retry.code,503);
    assert.ok(!JSON.stringify(retry.value).includes('private details'));
  }
});

test('identity parser rejects unsafe numeric IDs, mismatched GIDs, missing customer and future event time',()=>{
  const fixture=()=>({id:'1',customer:{id:'2'},updated_at:new Date(now).toISOString()});
  assert.ok(parsePostPurchaseOrderEvent('orders/create','event',fixture(),now));
  for(const value of [
    {...fixture(),id:Number.MAX_SAFE_INTEGER+1}, {...fixture(),customer:null},
    {...fixture(),admin_graphql_api_id:'gid://shopify/Order/2'},
    {...fixture(),updated_at:new Date(now+1).toISOString()},
  ])assert.equal(parsePostPurchaseOrderEvent('orders/create','event',value,now),null);
});

test('purpose consent uses existing signed evidence validation; checkout/generic YES never grants post-purchase',()=>{
  const candidate={signatureValid:true,hasRawBody:true,type:'text',phoneNumberId:'1234567890123',from:'15551234567',
    messageId:'wamid.fixture_signed_message',timestamp:String(now/1000),text:POST_PURCHASE_CONSENT_PHRASES.reviewRequest};
  assert.equal(classifyPostPurchaseConsent(candidate,now)?.action,'grant');
  for(const patch of [{text:'YES'},{text:'YES WHATSAPP CHECKOUT REMINDERS'},{signatureValid:false},{hasRawBody:false},
    {timestamp:String((now-16*60000)/1000)}])assert.equal(classifyPostPurchaseConsent({...candidate,...patch},now),null);
  assert.equal(classifyPostPurchaseConsent({...candidate,text:'STOP'},now)?.action,'revoke');
});

test('approved exact purpose/category/body is required; send gate cannot be enabled by any environment setting',()=>{
  const local={name:'order_update',language:'he',category:'UTILITY',status:'approved',bodyText:'Order {{1}}',headerType:'none',templateType:'text'};
  const live={...local,status:'APPROVED',components:[{type:'BODY',text:local.bodyText}]};
  assert.ok(matchPostPurchaseTemplate(local,live,'fulfillmentUpdate'));
  assert.equal(matchPostPurchaseTemplate(local,live,'reviewRequest'),false);
  assert.equal(matchPostPurchaseTemplate(local,{...live,components:[{type:'BODY',text:'Different'}]},'fulfillmentUpdate'),false);
  const env={RAILWAY_ENVIRONMENT_NAME:'staging',APP_URL:'https://whachatcrm-staging-app-staging.up.railway.app',
    ECOMMERCE_POST_PURCHASE_PREP_ENABLED:'true',ECOMMERCE_POST_PURCHASE_ACCOUNT_ID:'10000000-0000-4000-8000-000000000001'};
  assert.ok(postPurchasePreparationEnabled(env,env.ECOMMERCE_POST_PURCHASE_ACCOUNT_ID));
  assert.equal(postPurchasePreparationEnabled({...env,RAILWAY_ENVIRONMENT_NAME:'production'}),false);
  assert.equal(postPurchasePreparationEnabled(env,'another-account'),false);
  for(const file of ['postPurchasePreparation.ts','postPurchaseRuntime.ts']){
    const source=readFileSync('server/ecommerce/'+file,'utf8');assert.ok(!/sendMetaWhatsApp|sendRecoveryViaMeta|send-message|enqueueRecoveryDelivery/.test(source));
  }
});

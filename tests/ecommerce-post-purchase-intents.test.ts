import {createPostPurchaseDelivery} from '../server/ecommerce/postPurchaseDelivery';
import {createPostPurchaseReceipt} from '../server/ecommerce/postPurchaseReceipt';
import {enqueuePostPurchaseDeliveryQuery} from '../server/ecommerce/postPurchaseDeliveryReadiness';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {Pool} from 'pg';
import {drizzle as pgDrizzle} from 'drizzle-orm/node-postgres';
import {PGlite} from '@electric-sql/pglite';
import {drizzle as liteDrizzle} from 'drizzle-orm/pglite';
import {sql} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import {createPostPurchasePreparation,type PostPurchaseDatabase,type PostPurchaseTx} from '../server/ecommerce/postPurchasePreparation';
import {POST_PURCHASE_JOURNEYS,JOURNEY_POLICY} from '../shared/postPurchase';
import {POST_PURCHASE_CONSENT_PHRASES} from '../server/ecommerce/postPurchaseConsent';
import {recoveryPhoneDigest} from '../server/ecommerce/checkoutRecoveryMessagingEligibility';
import {postPurchasePrivacyQueries} from '../server/ecommerce/postPurchaseQueries';
import {createShopifyOrderWebhookHandler,type ShopifyOrderTopic} from '../server/shopifyOrderWebhookHandler';
import type {FreshPostPurchaseOrder} from '../server/ecommerce/postPurchaseOrder';

const account='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const shop='fixture.myshopify.com',secret='s'.repeat(36),phone='15551234567',phoneId='1234567890123';
const env={RAILWAY_ENVIRONMENT_NAME:'staging',APP_URL:'https://whachatcrm-staging-app-staging.up.railway.app',
  ECOMMERCE_POST_PURCHASE_PREP_ENABLED:'true',ECOMMERCE_POST_PURCHASE_ACCOUNT_ID:account};
const ready={intents:true,orders:true,consents:true};

test('post-purchase real event → durable no-send intents, consent, fresh status and privacy lifecycle',async t=>{
  let admin:Pool|undefined,pool:Pool|undefined,lite:PGlite|undefined;
  const schema='post_purchase_intent_fixture';
  let database:PostPurchaseDatabase;
  const url=process.env.ECOMMERCE_TEST_DATABASE_URL;
  if(url){
    const target=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(target.hostname));
    assert.equal(target.pathname,'/whachat_ecommerce_test');
    admin=new Pool({connectionString:url});await admin.query('CREATE SCHEMA '+schema);
    target.searchParams.set('options','-c search_path='+schema);
    pool=new Pool({connectionString:target.toString(),max:8});database=pgDrizzle(pool) as unknown as PostPurchaseDatabase;
  }else{lite=new PGlite();database=liteDrizzle(lite) as unknown as PostPurchaseDatabase;}
  const ddl=(text:string)=>lite?lite.exec(text):pool!.query(text);
  const execute=(q:ReturnType<typeof sql>)=>database.transaction(tx=>tx.execute(q));
  let clock=Math.floor(Date.now()/1000)*1000,eventAt=clock-60000,liveStatus:'open'|'fulfilled'|'cancelled'='open';
  let failFresh=false,erased=false,templateFetches=0,latestPurchase:number|null|undefined;
  let waitFresh:(()=>Promise<void>)|undefined,faultAfterInsert=false;
  const templates=POST_PURCHASE_JOURNEYS.map(j=>({name:'pp_'+j.toLowerCase(),language:'en',status:'APPROVED',category:JOURNEY_POLICY[j].category,
    components:[{type:'BODY',text:'Order {{1}}: '+j}]}));
  const faultDatabase:PostPurchaseDatabase={transaction:fn=>database.transaction(tx=>fn({execute:async q=>{
    const result=await tx.execute(q);
    if(faultAfterInsert&&new PgDialect().sqlToQuery(q).sql.includes('INSERT INTO ecommerce_post_purchase_intents')){faultAfterInsert=false;throw Error('interrupted_intent_transaction');}
    return result;
  }}))};
  const makeService=()=>createPostPurchasePreparation({database:faultDatabase,env,secret:()=>secret,now:()=>clock,
    privacyLocked:async()=>erased,templates:async()=>{templateFetches++;return templates;},
    recheck:async input=>{if(waitFresh)await waitFresh();return failFresh?null:{orderId:input.orderId,customerId:input.customerId,
      status:liveStatus,updatedAt:clock,purchasedAt:eventAt-1000,latestPurchaseAt:latestPurchase===undefined?eventAt-1000:latestPurchase} satisfies FreshPostPurchaseOrder;},
  });
  let service=makeService();
  const body=(id='1',customer='2')=>({id,admin_graphql_api_id:'gid://shopify/Order/'+id,
    customer:{id:customer,admin_graphql_api_id:'gid://shopify/Customer/'+customer},updated_at:new Date(eventAt).toISOString()});
  const candidate=(text:string,at=clock-10000)=>({signatureValid:true,hasRawBody:true,type:'text',phoneNumberId:phoneId,
    from:phone,messageId:'wamid.fixture_'+at+'_'+text.replaceAll(' ','_'),timestamp:String(at/1000),text});
  async function grant(journey:typeof POST_PURCHASE_JOURNEYS[number],at=clock-10000){
    return service.captureConsent(account,'contact',candidate(POST_PURCHASE_CONSENT_PHRASES[journey],at));
  }
  async function seed(selected=true){
    erased=false;failFresh=false;latestPurchase=undefined;liveStatus='open';waitFresh=undefined;clock=Math.floor(Date.now()/1000)*1000;eventAt=clock-60000;
    await execute(sql`TRUNCATE users,contacts,integrations,message_templates,ecommerce_growth_event_inbox CASCADE`);
    const plans=Object.fromEntries(POST_PURCHASE_JOURNEYS.map(j=>[j,{selected,delayMinutes:0}]));
    const bindings=Object.fromEntries(POST_PURCHASE_JOURNEYS.map(j=>[j,'tpl-'+j]));
    await execute(sql`INSERT INTO users(id,shopify_shop,shopify_access_token,shopify_subscription_status,shopify_installed_at,meta_connected,meta_phone_number_id)
      VALUES(${account},${shop},'fixture-token','active',${new Date(clock-86400000)},true,${phoneId}),
      (${other},'other.myshopify.com','other-token','active',${new Date(clock-86400000)},true,'9876543210123')`);
    await execute(sql`INSERT INTO integrations(id,user_id,type,is_active,config) VALUES('install',${account},'shopify',true,
      ${JSON.stringify({shop,ecommercePostPurchasePlans:plans,ecommercePostPurchaseTemplates:bindings,ecommercePostPurchaseDeliveryEnabled:true})}::jsonb),
      ('other-install',${other},'shopify',true,'{"shop":"other.myshopify.com"}')`);
    await execute(sql`INSERT INTO contacts(id,user_id,phone,whatsapp_id,custom_fields,source_details,automations_paused)
      VALUES('contact',${account},${'+'+phone},${phone},${JSON.stringify({shopifyCustomerId:'2',shopifyShop:shop})}::jsonb,'{}',false)`);
    for(const [i,j] of POST_PURCHASE_JOURNEYS.entries())await execute(sql`INSERT INTO message_templates
      (id,user_id,twilio_sid,name,language,category,status,body_text,header_type,template_type,buttons,carousel_cards)
      VALUES(${'tpl-'+j},${account},'meta_fixture',${templates[i].name},'en',${templates[i].category},'approved',${templates[i].components[0].text},'none','text','[]','[]')`);
  }
  async function rows(){return (await execute(sql`SELECT journey,state,reasons,contact_id FROM ecommerce_post_purchase_intents ORDER BY journey`)).rows;}
  async function due(){await execute(sql`UPDATE ecommerce_post_purchase_intents SET next_review_at=NOW()-INTERVAL '1 second'`);await service.tick();}
  const route=(topic:ShopifyOrderTopic)=>createShopifyOrderWebhookHandler(topic,{
    verify:(raw,hmac)=>createHmac('sha256',secret).update(raw).digest('base64')===hmac,
    process:({shop,eventId,body})=>service.ingest(shop,topic,eventId,body),emit:()=>{},
  });
  async function webhook(topic:ShopifyOrderTopic,id:string,invalid=false){
    const raw=Buffer.from(JSON.stringify(body()));
    const req={rawBody:raw,body:{id:'forged'},headers:{'x-shopify-topic':topic,'x-shopify-event-id':id,
      'x-shopify-shop-domain':shop,'x-shopify-hmac-sha256':invalid?'bad':createHmac('sha256',secret).update(raw).digest('base64')}};
    const res={code:0,status(code:number){this.code=code;return this;},json(_v:unknown){return this;}};
    await route(topic)(req as any,res as any);return res.code;
  }
  try{
    await ddl(`CREATE TABLE users(id varchar(128) PRIMARY KEY,shopify_shop text,shopify_access_token text,
      shopify_subscription_status text,deletion_requested_at timestamptz,shopify_installed_at timestamptz,meta_connected boolean,meta_phone_number_id text);
      CREATE TABLE integrations(id varchar PRIMARY KEY,user_id text,type text,is_active boolean,config jsonb);
      CREATE TABLE contacts(id varchar PRIMARY KEY,user_id text,phone text,whatsapp_id text,custom_fields jsonb,source_details jsonb,
        automations_paused boolean,tag text,pipeline_stage text);
      CREATE TABLE message_templates(id varchar PRIMARY KEY,user_id text,name text,language text,category text,status text,twilio_sid text,
        body_text text,header_type text,template_type text,buttons jsonb,carousel_cards jsonb);`);
    for(const migration of ['migrations/20261019_ecommerce_growth_event_inbox.sql','migrations/20261030_ecommerce_post_purchase_intents.sql','migrations/20261030_ecommerce_post_purchase_delivery_fence.sql'])
      await ddl(await readFile(migration,'utf8'));
    await t.test('verified creation, fulfillment and cancellation produce exactly six unique intents; no other tenant receives work',async()=>{
      await seed();for(const j of POST_PURCHASE_JOURNEYS)assert.equal(await grant(j),'granted');
      assert.equal(await webhook('orders/create','create-1',true),401);assert.equal((await rows()).length,0);
      assert.equal(await webhook('orders/create','create-1'),200);
      assert.equal((await rows())[0].state,'preview_ready');
      if(pool)await Promise.all([webhook('orders/create','create-1'),webhook('orders/create','create-retry')]);
      else{await webhook('orders/create','create-1');await webhook('orders/create','create-retry');}
      assert.equal((await rows()).length,1);
      liveStatus='fulfilled';assert.equal(await webhook('orders/fulfilled','fulfill-1'),200);
      assert.equal((await rows()).length,5);assert.equal((await rows()).filter(x=>x.state==='preview_ready').length,4);
      liveStatus='cancelled';assert.equal(await webhook('orders/cancelled','cancel-1'),200);
      assert.equal((await rows()).length,6);assert.deepEqual((await rows()).filter(x=>x.state==='preview_ready').map(x=>x.journey),['cancellation']);
      liveStatus='open';await webhook('orders/create','old-reordered');
      assert.equal((await rows()).filter(x=>x.state==='preview_ready').length,1);
      assert.equal((await execute(sql`SELECT count(*)::int AS n FROM ecommerce_post_purchase_intents WHERE account_id=${other}`)).rows[0].n,0);
    });
    await t.test('missing consent is durable but blocked; first grant older than STOP cannot enable a new purpose',async()=>{
      await seed();await webhook('orders/create','blocked');assert.equal((await rows())[0].state,'blocked');
      assert.equal(await service.captureConsent(account,'contact',candidate('YES WHATSAPP CHECKOUT REMINDERS')),'ignored');
      assert.equal(await service.captureConsent(account,null,candidate('STOP',clock)),'revoked');
      assert.equal(await grant('orderConfirmation',clock-1000),'ignored');
      await due();assert.equal((await rows())[0].state,'suppressed');
      clock+=2000;assert.equal(await grant('reviewRequest',clock),'granted');
      const grants=await execute(sql`SELECT purpose FROM ecommerce_post_purchase_consents WHERE revoked_at IS NULL`);
      assert.deepEqual(grants.rows.map(x=>x.purpose),['reviewRequest']);
      for(const q of postPurchasePrivacyQueries({mode:'customer',accountId:account,shop,customerIds:['2'],
        recipientDigests:[recoveryPhoneDigest(secret,'+'+phone)]},ready))await execute(q);
      assert.equal((await execute(sql`SELECT count(*)::int n FROM ecommerce_post_purchase_consents`)).rows[0].n,0);

    });
    await t.test('scheduled delay survives restart; due-time fresh Shopify status and plan/template changes block readiness',async()=>{
      await seed();await grant('orderConfirmation');
      await execute(sql`UPDATE integrations SET config=jsonb_set(config,'{ecommercePostPurchasePlans,orderConfirmation,delayMinutes}','10') WHERE id='install'`);
      await webhook('orders/create','delay');assert.equal((await rows())[0].state,'scheduled');
      service=makeService(); // restart: persisted rows, not process memory, drive the next tick
      clock+=10*60000;failFresh=true;await due();assert.ok(JSON.stringify((await rows())[0].reasons).includes('fresh_order_check_required'));
      failFresh=false;await execute(sql`UPDATE message_templates SET status='pending' WHERE id='tpl-orderConfirmation'`);
      await due();assert.equal((await rows())[0].state,'blocked');
      await execute(sql`UPDATE message_templates SET status='approved' WHERE id='tpl-orderConfirmation'`);
      await due();assert.equal((await rows())[0].state,'preview_ready');
      await execute(sql`UPDATE integrations SET config=jsonb_set(config,'{ecommercePostPurchasePlans,orderConfirmation,selected}','false') WHERE id='install'`);
      await due();assert.equal((await rows())[0].state,'blocked');
      liveStatus='fulfilled';await due();assert.equal((await rows())[0].state,'suppressed');
    });
    await t.test('a crash after inbox and intent insertion rolls back atomically; provider retry prepares exactly once',async()=>{
      await seed();await grant('orderConfirmation');faultAfterInsert=true;
      assert.equal(await webhook('orders/create','interrupted'),503);
      assert.equal((await rows()).length,0);
      assert.equal((await execute(sql`SELECT count(*)::int n FROM ecommerce_growth_event_inbox`)).rows[0].n,0);
      assert.equal(await webhook('orders/create','interrupted'),200);assert.equal((await rows()).length,1);
      assert.equal(await service.ingest('other.myshopify.com','orders/create','foreign',body()),'ignored');
    });
    await t.test('fresh new purchase suppresses marketing across earlier orders while transactional fulfillment remains ready',async()=>{
      await seed();for(const j of POST_PURCHASE_JOURNEYS)await grant(j);
      liveStatus='fulfilled';await webhook('orders/fulfilled','marketing');
      assert.equal((await rows()).filter(x=>x.state==='preview_ready').length,4);
      latestPurchase=clock;await due();await service.tick(); // bounded batch: remaining fourth intent on next tick
      assert.deepEqual((await rows()).filter(x=>x.state==='preview_ready').map(x=>x.journey),['fulfillmentUpdate']);
      await seed();for(const j of POST_PURCHASE_JOURNEYS)await grant(j);
      liveStatus='fulfilled';await webhook('orders/fulfilled','earlier-order');
      latestPurchase=clock;liveStatus='open';
      await service.ingest(shop,'orders/create','new-purchase',body('3'));
      const suppressed=await execute(sql`SELECT journey FROM ecommerce_post_purchase_intents
        WHERE order_gid='gid://shopify/Order/1' AND reasons='["new_purchase"]'::jsonb`);
      assert.equal(suppressed.rows.length,3);
    });
    await t.test('ambiguous CRM identity, forged customer, stale installation and unavailable API fail closed without duplicate work',async()=>{
      await seed();await grant('orderConfirmation');
      await execute(sql`INSERT INTO contacts SELECT 'duplicate',user_id,phone,whatsapp_id,custom_fields,source_details,false,NULL,NULL FROM contacts`);
      await webhook('orders/create','ambiguous');assert.equal((await rows())[0].state,'blocked');
      await execute(sql`DELETE FROM contacts WHERE id='duplicate'`);
      await execute(sql`DELETE FROM ecommerce_post_purchase_orders`);
      failFresh=true;assert.equal(await webhook('orders/create','unavailable'),503);assert.equal((await rows()).length,0);
      failFresh=false;const forged=body();forged.customer.admin_graphql_api_id='gid://shopify/Customer/999';
      assert.equal(await service.ingest(shop,'orders/create','bad-identity',forged),'ignored');
      await execute(sql`UPDATE users SET shopify_installed_at=${new Date(clock)} WHERE id=${account}`);
      assert.equal(await service.ingest(shop,'orders/create','old-install',body()),'ignored');
    });
    await t.test('STOP suppresses existing intents even with preparation paused; erasure/uninstall are scoped and terminal',async()=>{
      await seed();for(const j of POST_PURCHASE_JOURNEYS)await grant(j);
      liveStatus='fulfilled';await webhook('orders/fulfilled','ready');assert.equal((await rows()).length,4);
      env.ECOMMERCE_POST_PURCHASE_PREP_ENABLED='false';
      assert.equal(await service.captureConsent(account,null,candidate('STOP',clock)),'revoked');
      assert.ok((await rows()).every(x=>x.state==='suppressed'));env.ECOMMERCE_POST_PURCHASE_PREP_ENABLED='true';
      await database.transaction(async tx=>{await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop},0))`);
        for(const q of postPurchasePrivacyQueries({mode:'customer',shop,accountId:account,contactIds:['contact'],customerIds:['2']},ready))await tx.execute(q);
      });
      assert.equal((await rows()).length,0);erased=true;
      assert.equal(await service.ingest(shop,'orders/fulfilled','after-erasure',body()),'suppressed');
      assert.equal(await grant('reviewRequest',clock+1000),'ignored');
      await seed();await grant('orderConfirmation');await webhook('orders/create','before-uninstall');
      await database.transaction(async tx=>{await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop},0))`);
        for(const q of postPurchasePrivacyQueries({mode:'uninstall',shop,accountId:account},ready))await tx.execute(q);
        await tx.execute(sql`UPDATE integrations SET is_active=false WHERE user_id=${account}`);
        await tx.execute(sql`UPDATE users SET shopify_access_token=NULL,shopify_subscription_status='uninstalled' WHERE id=${account}`);
      });
      assert.equal(await service.ingest(shop,'orders/create','after-uninstall',body()),'ignored');assert.equal((await rows())[0].state,'suppressed');
      // Another merchant's pseudonymous order/consent evidence must survive store redaction.
      await execute(sql`INSERT INTO ecommerce_post_purchase_orders(account_id,installation_id,shop,order_gid,customer_gid,status,source_updated_at)
        VALUES(${other},'other-install','other.myshopify.com','gid://shopify/Order/99','gid://shopify/Customer/2','open',NOW())`);
      await execute(sql`INSERT INTO ecommerce_post_purchase_consents(account_id,shop,recipient_hmac,purpose,revoked_at,last_inbound_at,last_wamid)
        VALUES(${other},'other.myshopify.com',${'a'.repeat(64)},'winBack',NOW(),NOW(),'wamid.other_fixture')`);
      for(const q of postPurchasePrivacyQueries({mode:'store',shop},ready))await execute(q);
      assert.equal((await execute(sql`SELECT count(*)::int n FROM ecommerce_post_purchase_consents WHERE account_id=${account}`)).rows[0].n,0);
      assert.equal((await execute(sql`SELECT count(*)::int n FROM ecommerce_post_purchase_consents WHERE account_id=${other}`)).rows[0].n,1);
      assert.equal((await execute(sql`SELECT count(*)::int n FROM ecommerce_post_purchase_orders WHERE account_id=${other}`)).rows[0].n,1);
    });
    const sendEnv={...env,ECOMMERCE_POST_PURCHASE_DELIVERY_ENABLED:'true',
      ECOMMERCE_POST_PURCHASE_DELIVERY_ACCOUNT_ID:account,ECOMMERCE_POST_PURCHASE_RECEIPTS_ENABLED:'true',
      ECOMMERCE_POST_PURCHASE_WEBHOOKS_VERIFIED:'true'};
    let sends=0,providerThrows=false,settlementFails=false;
    const deliveryDb={...faultDatabase,execute,
      transaction:<T>(fn:(tx:PostPurchaseTx)=>Promise<T>)=>database.transaction(tx=>fn({execute:async q=>{
        const rendered=new PgDialect().sqlToQuery(q);
        if(settlementFails&&rendered.sql.includes('UPDATE ecommerce_post_purchase_outbox')&&rendered.params.includes('accepted')){
          settlementFails=false;throw Error('crash_after_provider_acceptance');
        }
        return tx.execute(q);
      }})),
    };
    const worker=()=>createPostPurchaseDelivery({database:deliveryDb,env:sendEnv,secret:()=>secret,
      authorize:(...args)=>service.authorizeDelivery(...args),
      send:async()=>{sends++;if(providerThrows)throw Error('ambiguous_provider_timeout');return {messageId:'wamid.fixture_delivery_'+sends};},
    });
    const receipt=createPostPurchaseReceipt({database,env:sendEnv,secret:()=>secret});
    async function queue(){
      const intents=await execute(sql`SELECT id::text FROM ecommerce_post_purchase_intents WHERE state='preview_ready'`);
      for(const row of intents.rows)await execute(enqueuePostPurchaseDeliveryQuery(account,shop,'install',String(row.id)));
    }
    await t.test('isolated delivery: six journeys reuse eligibility and provider adapter; receipt reconciliation never dispatches',async()=>{
      await seed();sends=0;for(const j of POST_PURCHASE_JOURNEYS)await grant(j);
      await webhook('orders/create','send-create');assert.equal(await worker().tick(),'accepted');
      assert.equal(await worker().tick(),'idle');
      liveStatus='fulfilled';await webhook('orders/fulfilled','send-fulfilled');
      for(let i=0;i<4;i++)assert.equal(await worker().tick(),'accepted');
      liveStatus='cancelled';await webhook('orders/cancelled','send-cancelled');assert.equal(await worker().tick(),'accepted');
      assert.equal(sends,6);
      assert.equal((await execute(sql`SELECT count(*)::int n FROM ecommerce_post_purchase_outbox WHERE state='accepted' AND provider_attempted_at IS NOT NULL`)).rows[0].n,6);
      const c={signatureValid:true,hasRawBody:true,phoneNumberId:phoneId,messageId:'wamid.fixture_delivery_1',recipientId:phone,
        status:'delivered',timestamp:String(Math.floor(Date.now()/1000))};
      sendEnv.ECOMMERCE_POST_PURCHASE_DELIVERY_ENABLED='false';
      assert.equal(await receipt(account,{...c,signatureValid:false}),'ignored');
      assert.equal(await receipt(other,c),'ignored');
      assert.equal(await receipt(account,{...c,recipientId:'15550009999'}),'ignored');
      assert.equal(await receipt(account,{...c,phoneNumberId:'9999999999999'}),'ignored');
      assert.equal(await receipt(account,c),'recorded');
      assert.equal(await receipt(account,{...c,status:'sent'}),'ignored');
      assert.equal(await receipt(account,{...c,status:'read'}),'recorded');
      assert.equal(await receipt(account,{...c,status:'failed'}),'ignored');
      assert.equal(await worker().tick(),'disabled');assert.equal(sends,6);
      sendEnv.ECOMMERCE_POST_PURCHASE_DELIVERY_ENABLED='true';
    });
    await t.test('send-time changes to consent, HMAC, phone, local/live template, plan, installation, Shopify and erasure never send',async()=>{
      const cases=[
        async()=>{await service.captureConsent(account,null,candidate('STOP',clock));},
        async()=>{await execute(sql`UPDATE ecommerce_post_purchase_consents SET recipient_hmac=${'0'.repeat(64)}`);},
        async()=>{await execute(sql`UPDATE contacts SET whatsapp_id='15550009999'`);},
        async()=>{await execute(sql`UPDATE message_templates SET status='pending'`);},
        async()=>{await execute(sql`UPDATE message_templates SET twilio_sid='unverified'`);},
        async()=>{await execute(sql`UPDATE integrations SET config=jsonb_set(config,'{ecommercePostPurchaseDeliveryEnabled}','false') WHERE id='install'`);},
        async()=>{templates[0].status='PENDING';},
        async()=>{await execute(sql`UPDATE integrations SET config=jsonb_set(config,'{ecommercePostPurchasePlans,orderConfirmation,selected}','false') WHERE id='install'`);},
        async()=>{await execute(sql`UPDATE integrations SET config=jsonb_set(config,'{ecommercePostPurchasePaused}','true') WHERE id='install'`);},
        async()=>{await execute(sql`UPDATE integrations SET is_active=false WHERE id='install'`);},
        async()=>{liveStatus='cancelled';},
        async()=>{failFresh=true;},
        async()=>{erased=true;},
      ];
      for(const change of cases){
        templates[0].status='APPROVED';await seed();await grant('orderConfirmation');
        await webhook('orders/create','queued-before-change');await queue();
        const before=sends;await change();
        assert.notEqual(await worker().tick(),'accepted');assert.equal(sends,before);
      }
      templates[0].status='APPROVED';
    });
    await t.test('durable attempt survives provider timeout, failed settlement and restart without retry',async()=>{
      for(const failure of ['timeout','settlement']){
        await seed();await grant('orderConfirmation');await webhook('orders/create','uncertain-'+failure);
        providerThrows=failure==='timeout';settlementFails=failure==='settlement';
        const before=sends;assert.equal(await worker().tick(),'uncertain');assert.equal(sends,before+1);
        providerThrows=false;
        const attempted=(await execute(sql`SELECT id::text,claim_token::text,provider_attempted_at,state FROM ecommerce_post_purchase_outbox`)).rows[0];
        assert.ok(attempted.provider_attempted_at);assert.equal(attempted.state,'uncertain');
        await assert.rejects(()=>execute(sql`UPDATE ecommerce_post_purchase_outbox SET state='pending',claim_token=NULL,claimed_at=NULL,provider_attempted_at=NULL`));
        await assert.rejects(()=>execute(sql`UPDATE ecommerce_post_purchase_outbox SET provider_attempted_at=NULL`));
        assert.equal(await worker().processClaim({id:String(attempted.id),token:String(attempted.claim_token),accountId:account,shop,installationId:'install'}),'fenced');
        service=makeService();assert.equal(await worker().tick(),'idle');assert.equal(sends,before+1);
      }
    });
    await t.test('outbox scope constraints and privacy cascades use the existing migration and erasure queries',async()=>{
      await seed();await grant('orderConfirmation');await webhook('orders/create','privacy-queue');await queue();
      await assert.rejects(()=>execute(sql`UPDATE ecommerce_post_purchase_outbox SET account_id=${other}`));
      for(const q of postPurchasePrivacyQueries({mode:'customer',shop,accountId:account,customerIds:['2']},ready))await execute(q);
      assert.equal((await execute(sql`SELECT count(*)::int n FROM ecommerce_post_purchase_outbox`)).rows[0].n,0);
    });
    if(pool)await t.test('native PostgreSQL: concurrent workers claim once across process restarts',async()=>{
      await seed();await grant('orderConfirmation');await webhook('orders/create','concurrent-send');
      const before=sends;await Promise.all([worker().tick(),worker().tick(),worker().tick()]);
      assert.equal(sends,before+1);assert.equal(await worker().tick(),'idle');
    });
    if(pool)await t.test('native PostgreSQL: STOP serializes against send-time authorization and prevents subsequent attempts',async()=>{
      await seed();await grant('orderConfirmation');await webhook('orders/create','stop-race');
      let entered!:()=>void,finish!:()=>void;
      const reading=new Promise<void>(r=>entered=r),release=new Promise<void>(r=>finish=r);
      waitFresh=async()=>{entered();await release;};
      const before=sends,sending=worker().tick();await reading;
      const stopping=service.captureConsent(account,null,candidate('STOP',clock));
      finish();await Promise.all([sending,stopping]);waitFresh=undefined;
      assert.equal(sends,before+1);assert.equal(await worker().tick(),'idle');
      assert.ok((await rows()).every(x=>x.state==='suppressed'));
    });
    if(pool)await t.test('native PostgreSQL: uninstall races an in-flight review under the same advisory lock',async()=>{
      await seed();await grant('orderConfirmation');
      let entered!:()=>void,finish!:()=>void;
      const readyToRead=new Promise<void>(r=>entered=r),release=new Promise<void>(r=>finish=r);
      waitFresh=async()=>{entered();await release;};
      const ingest=webhook('orders/create','racing');await readyToRead;
      const uninstall=database.transaction(async tx=>{
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop},0))`);
        for(const q of postPurchasePrivacyQueries({mode:'uninstall',shop,accountId:account},ready))await tx.execute(q);
        await tx.execute(sql`UPDATE integrations SET is_active=false WHERE user_id=${account}`);
      });
      finish();await Promise.all([ingest,uninstall]);assert.ok((await rows()).every(x=>x.state==='suppressed'));
    });
    assert.ok(templateFetches>0);
  }finally{await pool?.end();if(admin){await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();}await lite?.close();}
});

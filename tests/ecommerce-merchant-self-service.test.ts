import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {sql} from 'drizzle-orm';
import * as schema from '../shared/schema';
import {createShopifyTemplateProvisioner} from '../server/ecommerce/shopifyTemplateProvisioning';
import {loadMerchantRelease,merchantProductionAvailable,merchantReleaseCurrent} from '../server/ecommerce/merchantRelease';
import {createPostPurchasePreparation} from '../server/ecommerce/postPurchasePreparation';
import {createPostPurchaseDelivery} from '../server/ecommerce/postPurchaseDelivery';
import {createPostPurchaseReceipt} from '../server/ecommerce/postPurchaseReceipt';
import {createRecoveryConsentCapture} from '../server/ecommerce/checkoutRecoveryInboundConsentCapture';
import {recoveryClaimExecutionEnabled} from '../server/ecommerce/checkoutRecoveryDeliveryWorker';
import {canonicalMatchedShopifyPhone} from '../shared/shopifyContactPrivacy';
import {emptyEnrollment,WHATSAPP_CONSENT_PHRASES} from '../shared/shopifyConsentEnrollment';
import {SHOPIFY_GROWTH_TEMPLATES,stripShopifyGrowthManagedConfig} from '../shared/shopifyGrowthTemplates';

const account='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
const shop='merchant.myshopify.com',phone='15551234567',phoneId='111112',secret='synthetic-key-for-test-only-'.repeat(2);
const env={RAILWAY_ENVIRONMENT_NAME:'production',APP_URL:'https://app.whachatcrm.com',ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY:secret,
  ECOMMERCE_PILOT_WORKSPACE_ID:other,ECOMMERCE_POST_PURCHASE_DELIVERY_ENABLED:'false',ECOMMERCE_RECOVERY_SEND_ENABLED:'false'};

test('public availability preserves pilot isolation, strict environment and signing binding',()=>{
  assert.equal(merchantProductionAvailable(env,account,shop),true);
  for(const patch of [{RAILWAY_ENVIRONMENT_NAME:'staging'},{APP_URL:'https://other.test'},
    {ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY:''}])assert.equal(merchantProductionAvailable({...env,...patch},account,shop),false);
  assert.equal(merchantProductionAvailable(env,other,shop),false);
  assert.equal(merchantProductionAvailable(env,account,'whachatcrm-live-test.myshopify.com'),false);
  const m={accountId:account,shop,installationId:'install',fingerprint:'a'.repeat(64),config:{}};
  assert.equal(merchantReleaseCurrent(env,m),false);
  assert.deepEqual(stripShopifyGrowthManagedConfig({ecommerceMerchantRelease:{version:1},ecommercePostPurchaseActivatedAt:'forged',syncEnabled:true}),{syncEnabled:true});
});

test('real merchant activation → signed consent → fenced order delivery → receipt/pause; tenant/privacy/identity failures close',async t=>{
 const pg=new PGlite(),db=drizzle(pg,{schema});
 const clock=Math.floor(Date.now()/1000)*1000-1000;
 let privacy=false,sends=0,orderStatus:'open'|'fulfilled'='open';
 const execute=(q:ReturnType<typeof sql>)=>db.execute(q);
 const inventory=SHOPIFY_GROWTH_TEMPLATES.map((template,i)=>({id:String(1000+i),name:template.name,language:'en',status:'APPROVED',
   category:template.category,components:[{type:'BODY',text:template.bodyText}]}));
 const setup=createShopifyTemplateProvisioner({database:db as any,env,now:()=>clock,provider:{list:async()=>inventory,create:async()=>assert.fail('reuse approved templates')}});
 const post=createPostPurchasePreparation({database:db as any,env,secret:()=>secret,now:()=>clock,
   templates:async()=>inventory,privacyLocked:async()=>privacy,
   recheck:async input=>({orderId:input.orderId,customerId:input.customerId,status:orderStatus,updatedAt:clock,purchasedAt:clock,latestPurchaseAt:null})});
 const recovery=createRecoveryConsentCapture(db as any,async()=>privacy);
 const delivery=createPostPurchaseDelivery({database:db as any,env,merchantAccountId:account,secret:()=>secret,authorize:post.authorizeDelivery,
   send:async(_account,_phone,_name,_language,_components,_tx,authorize)=>{assert.equal(authorize(),true);sends++;return {messageId:'wamid.public_fixture_1'};}});
 const receipt=createPostPurchaseReceipt({database:db as any,env,secret:()=>secret});
 const candidate=(purpose:keyof typeof WHATSAPP_CONSENT_PHRASES,patch={})=>({signatureValid:true,hasRawBody:true,type:'text',phoneNumberId:phoneId,
   from:phone,messageId:'wamid.fixture_'+purpose,timestamp:String(clock/1000),text:WHATSAPP_CONSENT_PHRASES[purpose],...patch});
 const config=async()=> (await execute(sql`SELECT config FROM integrations WHERE id='install'`)).rows[0].config as Record<string,any>;
 const event=(id='1',at=clock)=>({id,customer:{id:'2'},updated_at:new Date(at).toISOString()});
 try{
  await pg.exec(`CREATE TABLE users(id varchar(128) PRIMARY KEY,email text,shopify_shop text,shopify_access_token text DEFAULT 'fixture-shopify',
    shopify_subscription_status text DEFAULT 'active',shopify_installed_at timestamptz,deletion_requested_at timestamptz,
    meta_connected boolean DEFAULT true,meta_access_token text DEFAULT 'fixture-meta',meta_business_account_id text,
    meta_phone_number_id text,meta_display_phone_number text,meta_token_expires_at timestamptz,whatsapp_provider text DEFAULT 'meta',
    billing_plan text DEFAULT 'pro',subscription_status text DEFAULT 'active',plan_override_enabled boolean DEFAULT false,
    plan_override text,trial_ends_at timestamptz,trial_status text,trial_plan text);
    CREATE TABLE integrations(id varchar PRIMARY KEY,user_id text,type text DEFAULT 'shopify',is_active boolean DEFAULT true,config jsonb DEFAULT '{}');
    CREATE TABLE ecommerce_shopify_workspace_activations(account_id text,installation_id text,shop text);
    CREATE TABLE contacts(id varchar PRIMARY KEY,user_id text,phone text,whatsapp_id text,custom_fields jsonb,source_details jsonb,
      automations_paused boolean DEFAULT false,tag text,pipeline_stage text);
    CREATE TABLE message_templates(id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,user_id text,twilio_sid text,
      name text,language text,category text,status text,template_type text,body_text text,footer_text text,header_type text,
      buttons jsonb,carousel_cards jsonb,variables jsonb,last_synced_at timestamptz);`);
  for(const migration of ['20261019_ecommerce_growth_event_inbox.sql','20261020_ecommerce_abandoned_checkout_observations.sql',
    '20261020_ecommerce_checkout_recovery_intents.sql','20261020_ecommerce_whatsapp_recovery_delivery.sql',
    '20261020_ecommerce_recovery_signed_inbound_consent.sql','20261020_ecommerce_recovery_meta_receipts.sql',
    '20261028_ecommerce_recovery_provider_attempt.sql','20261030_ecommerce_post_purchase_intents.sql','20261030_ecommerce_post_purchase_delivery_fence.sql'])
    await pg.exec(await readFile('migrations/'+migration,'utf8'));
  await execute(sql`INSERT INTO users(id,email,shopify_shop,shopify_installed_at,meta_business_account_id,meta_phone_number_id,meta_display_phone_number)
    VALUES(${account},'fixture@example.invalid',${shop},${new Date(clock-86400000)},'111111',${phoneId},${'+'+phone})`);
  await execute(sql`INSERT INTO integrations(id,user_id,config) VALUES('install',${account},${JSON.stringify({shop})}::jsonb)`);
  await execute(sql`INSERT INTO ecommerce_shopify_workspace_activations VALUES(${account},'install',${shop})`);
  await execute(sql`INSERT INTO contacts(id,user_id,phone,whatsapp_id,custom_fields,source_details)
    VALUES('customer',${account},${'+'+phone},${phone},${JSON.stringify({shopifyCustomerId:'2',shopifyShop:shop})}::jsonb,'{}')`);
  await t.test('fresh setup persists on this installation without enabling delivery or manufacturing consent',async()=>{
    assert.equal(await db.transaction(tx=>loadMerchantRelease(tx as any,env,account)),null);
    assert.equal(await setup.authorize(account),true);
    assert.equal(await setup.reconcile(account),'reconciled');
    assert.equal((await config()).ecommercePostPurchaseDeliveryEnabled,undefined);
    assert.equal((await execute(sql`SELECT count(*)::int AS n FROM ecommerce_post_purchase_consents`)).rows[0].n,0);
    assert.ok(await db.transaction(tx=>loadMerchantRelease(tx as any,env,account)));
    assert.equal(await db.transaction(tx=>loadMerchantRelease(tx as any,env,other)),null);
    assert.equal(await setup.setDelivery(account,'postPurchase',true),false);
    const draft=emptyEnrollment();draft.merchantName='Fixture Store';draft.sourceUrl='https://'+shop+'/pages/whatsapp';
    for(const purpose of ['orderConfirmation','fulfillmentUpdate','checkoutRecovery'] as const)draft.purposes[purpose].selected=true;
    assert.equal(await setup.saveEnrollment(account,draft),true);
    for(const journey of ['orderConfirmation','fulfillmentUpdate'] as const)assert.equal(await setup.savePlan(account,journey,{selected:true,delayMinutes:0}),true);
    const enrollment=await setup.enrollmentView(account);
    assert.ok(enrollment?.rows.filter(row=>['orderConfirmation','fulfillmentUpdate','checkoutRecovery'].includes(row.purpose)).every(row=>row.captureReady));
    assert.equal(await setup.setTemplate(account,'orderConfirmation','foreign-template'),false);
    const chosen=(await config()).ecommercePostPurchaseTemplates.orderConfirmation;
    assert.equal(await setup.setTemplate(account,'orderConfirmation',chosen),true);
    assert.equal((await setup.view(account)).rows.find(row=>row.journey==='orderConfirmation')?.templateId,chosen);
    assert.equal(await setup.setDelivery(account,'postPurchase',true),true);
    assert.equal(await setup.setTemplate(account,'orderConfirmation',chosen),false,'pause before changing a live journey');
    assert.equal(await setup.setDelivery(account,'checkoutRecovery',true),true);
    assert.equal((await setup.view(account)).delivery?.postPurchase.deliveryEnabled,true);
    assert.equal((await setup.view(account)).delivery?.checkoutRecovery.deliveryEnabled,true);
    assert.equal((await config()).ecommercePostPurchaseDeliveryConnection,(await config()).ecommerceMerchantRelease.connection);
  });
  await t.test('capture rejects unverified identities, privacy restriction and generic YES; grants only signed purpose evidence',async()=>{
    assert.equal(await post.captureConsent(account,'customer',candidate('orderConfirmation',{text:'YES'})),'ignored');
    assert.equal(await post.captureConsent(account,'customer',candidate('orderConfirmation',{signatureValid:false})),'ignored');
    privacy=true;assert.equal(await post.captureConsent(account,'customer',candidate('orderConfirmation')),'ignored');privacy=false;
    assert.equal(await post.captureConsent(other,'customer',candidate('orderConfirmation')),'disabled');
    await execute(sql`UPDATE contacts SET phone=${phone} WHERE id='customer'`);
    assert.equal(await post.captureConsent(account,'customer',candidate('orderConfirmation')),'ignored');
    const canonical=canonicalMatchedShopifyPhone({phone,customFields:{shopifyCustomerId:'2',shopifyShop:shop}},phone);
    assert.equal(canonical,'+'+phone);
    assert.equal(canonicalMatchedShopifyPhone({phone,customFields:{shopifyCustomerId:'2',shopifyShop:shop}},'15557654321'),null);
    await execute(sql`UPDATE contacts SET phone=${canonical} WHERE id='customer'`);
    await execute(sql`INSERT INTO contacts(id,user_id,phone,custom_fields,source_details) VALUES('shared-number',${account},${phone},'{}','{}')`);
    assert.equal(await post.captureConsent(account,'customer',candidate('orderConfirmation')),'ignored');
    assert.equal(await recovery({accountId:account,inboxContactId:'customer',candidate:candidate('checkoutRecovery'),env,secret,now:clock}),'ignored');
    await execute(sql`DELETE FROM contacts WHERE id='shared-number'`);
    assert.equal(await post.captureConsent(account,'customer',candidate('orderConfirmation')),'granted');
    assert.equal(await recovery({accountId:account,inboxContactId:'customer',candidate:candidate('checkoutRecovery'),env,secret,now:clock}),'granted');
    const changed=candidate('checkoutRecovery',{phoneNumberId:'222222'});
    assert.equal(await recovery({accountId:account,inboxContactId:'customer',candidate:changed,env,secret,now:clock}),'ignored');
  });
  await t.test('new consented order uses existing provider fence once; old orders and missing purpose never send',async()=>{
    assert.equal(await post.ingest(shop,'orders/create','old-event',event('3',clock-60000)),'ignored');
    assert.equal(await post.ingest(shop,'orders/create','new-event',event()),'recorded');
    assert.equal(await delivery.tick(),'accepted');assert.equal(sends,1);
    assert.equal(await delivery.tick(),'idle');assert.equal(sends,1);
    const view=await setup.view(account);assert.equal(view.messaging?.accepted,1);
    orderStatus='fulfilled';
    assert.equal(await post.ingest(shop,'orders/fulfilled','shipping-event',event('2')),'recorded');
    assert.equal(await delivery.tick(),'idle');assert.equal(sends,1,'order consent cannot authorize shipping purpose');
    orderStatus='open';
    assert.equal(await setup.setDelivery(account,'postPurchase',false),true);
    assert.equal(await post.ingest(shop,'orders/create','paused-event',event('4')),'ignored');
    assert.equal(await delivery.tick(),'idle');assert.equal(sends,1);
    assert.equal(await receipt(account,{signatureValid:true,hasRawBody:true,phoneNumberId:phoneId,messageId:'wamid.public_fixture_1',
      recipientId:phone,status:'delivered',timestamp:String(clock/1000)}),'recorded');
    assert.equal((await setup.view(account)).messaging?.delivered,1);
    assert.equal(await post.captureConsent(account,null,candidate('orderConfirmation',{text:'STOP',timestamp:String(clock/1000+1)})),'revoked');
  });
  await t.test('downgrade, reconnect, ambiguous install, stale marker and pilot store fail closed',async()=>{
    for(const update of [sql`UPDATE users SET billing_plan='free',shopify_subscription_status='pending' WHERE id=${account}`,
      sql`UPDATE users SET meta_phone_number_id='222222' WHERE id=${account}`,
      sql`UPDATE users SET deletion_requested_at=NOW() WHERE id=${account}`]){
      await db.transaction(async tx=>{await tx.execute(update);assert.equal(await loadMerchantRelease(tx as any,env,account),null);throw Error('rollback-fixture');}).catch(error=>assert.equal(error.message,'rollback-fixture'));
    }
    await execute(sql`INSERT INTO integrations(id,user_id,config) VALUES('duplicate-install',${account},${JSON.stringify({shop})}::jsonb)`);
    assert.equal(await db.transaction(tx=>loadMerchantRelease(tx as any,env,account)),null);
    await execute(sql`DELETE FROM integrations WHERE id='duplicate-install'`);
    await execute(sql`UPDATE integrations SET config=config || '{"ecommerceMerchantRelease":{"version":1,"connection":"stale","authorizedAt":"2026-01-01"}}'::jsonb WHERE id='install'`);
    assert.equal(await db.transaction(tx=>loadMerchantRelease(tx as any,env,account)),null);
    const claim={accountId:account,shop,id:'1',checkoutId:'gid://shopify/AbandonedCheckout/1',claimToken:'fixture',contactId:'customer',templateId:'template'};
    assert.equal(recoveryClaimExecutionEnabled(env,claim),false);
    assert.equal(recoveryClaimExecutionEnabled(env,claim,account),true);
    assert.equal(recoveryClaimExecutionEnabled(env,{...claim,accountId:other},other),false);
    assert.equal(recoveryClaimExecutionEnabled(env,{...claim,shop:'whachatcrm-live-test.myshopify.com'},account),false);
  });
 }finally{await pg.close();}
});

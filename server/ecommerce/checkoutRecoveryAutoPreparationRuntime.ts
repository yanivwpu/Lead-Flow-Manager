import {timingSafeEqual} from 'node:crypto';
import {and,eq,sql} from 'drizzle-orm';
import {db} from '../../drizzle/db';
import {users,integrations} from '@shared/schema';
import {isShopifyContactInstallationActive} from '@shared/shopifyContactPrivacy';
import {normalizeShopifyShopDomain} from '@shared/shopifyBilling';
import {fetchShopifyAbandonedCheckoutPage,type AbandonedCheckoutSnapshot} from './abandonedCheckoutSource';
import {recheckShopifyCheckoutForRecovery} from './checkoutFreshRecheck';
import {upsertCheckoutObservationQuery,dueCheckoutObservationsQuery} from './checkoutObservationQueries';
import {prepareCheckoutRecoveryIntentQuery,suppressCheckoutRecoveryIntentQuery,
 suppressCompletedCheckoutIntentQuery} from './checkoutRecoveryIntents';
import {enqueueRecoveryDeliveryQuery,suppressPendingRecoveryDeliveryQuery} from './checkoutRecoveryOutbox';
import {recoveryPhoneDigest} from './checkoutRecoveryMessagingEligibility';
import {runAutoRecoveryPreparationTick,recoveryAutoPrepEnabled,
 type AutoPrepMerchant,type PreparedRecoveryIdentity,type RecoveryAutoPrepEnvironment} from './checkoutRecoveryAutoPreparation';

const env=():RecoveryAutoPrepEnvironment=>({
 RAILWAY_ENVIRONMENT_NAME:process.env.RAILWAY_ENVIRONMENT_NAME,
 APP_URL:process.env.APP_URL,
 ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:process.env.ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED,
 ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:process.env.ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED,
 ECOMMERCE_RECOVERY_AUTOPREP_ENABLED:process.env.ECOMMERCE_RECOVERY_AUTOPREP_ENABLED,
 ECOMMERCE_RECOVERY_WORKER_MODE:process.env.ECOMMERCE_RECOVERY_WORKER_MODE,
 ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID:process.env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID,
 ECOMMERCE_RECOVERY_TEMPLATE_NAME:process.env.ECOMMERCE_RECOVERY_TEMPLATE_NAME,
});
function safeConfig(v:unknown):Record<string,unknown>{
 return v && typeof v==='object' && !Array.isArray(v)?v as Record<string,unknown>:{};
}
async function ownerStillActive(tx:typeof db,merchant:AutoPrepMerchant):Promise<boolean>{
 const [owner]=await tx.select().from(users).where(and(
   eq(users.id,merchant.accountId),eq(users.shopifyShop,merchant.shop)
 )).limit(1);
 if(!owner || !owner.metaConnected || !isShopifyContactInstallationActive(owner) ||
   !owner.shopifyAccessToken || owner.shopifyAccessToken!==merchant.accessToken)return false;
 const rows=await tx.select().from(integrations).where(and(
   eq(integrations.userId,merchant.accountId),eq(integrations.type,'shopify'),
   eq(integrations.isActive,true)
 )).limit(2);
 if(rows.length!==1)return false;
 const cfg=safeConfig(rows[0].config);
 for(const key of ['shop','shopUrl'])if(cfg[key]!=null &&
   (typeof cfg[key]!=='string' || normalizeShopifyShopDomain(cfg[key])!==merchant.shop))
   return false;
 return true;
}
function withShopLock<T>(merchant:AutoPrepMerchant,fn:(tx:typeof db)=>Promise<T>):Promise<T>{
 return db.transaction(async tx=>{
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${merchant.shop},0))`);
   return fn(tx as typeof db);
 });
}
async function getMerchant(accountId:string):Promise<AutoPrepMerchant|null>{
 const [merchant]=await db.select().from(users).where(eq(users.id,accountId)).limit(1);
 if(!merchant||!merchant.shopifyShop||!merchant.shopifyAccessToken||
   !isShopifyContactInstallationActive(merchant)||!merchant.metaConnected)return null;
 if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(merchant.shopifyShop))return null;
 const scope={accountId,shop:merchant.shopifyShop,accessToken:merchant.shopifyAccessToken};
 return await withShopLock(scope,async tx=>
   await ownerStillActive(tx,scope)?scope:null);
}
async function ensureSchema():Promise<boolean>{
 const r=await db.execute(sql`
  SELECT to_regclass('public.ecommerce_abandoned_checkout_observations') IS NOT NULL AS observations,
    to_regclass('public.ecommerce_checkout_recovery_intents') IS NOT NULL AS intents,
    to_regclass('public.ecommerce_whatsapp_recovery_consents') IS NOT NULL AS consents,
    to_regclass('public.ecommerce_checkout_recovery_outbox') IS NOT NULL AS outbox,
    EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ecommerce_whatsapp_recovery_consents'
        AND column_name='last_verified_inbound_at') AS signed_consent`);
 return !!r.rows[0] && Object.values(r.rows[0]).every(x=>x===true);
}
async function persist(merchant:AutoPrepMerchant,item:AbandonedCheckoutSnapshot):Promise<boolean>{
 return withShopLock(merchant,async tx=>{
   if(!await ownerStillActive(tx,merchant))return false;
   await tx.execute(upsertCheckoutObservationQuery({
     accountId:merchant.accountId,shop:merchant.shop,snapshot:item
   }));
   if(item.completed){
     await tx.execute(suppressCompletedCheckoutIntentQuery({
       accountId:merchant.accountId,shop:merchant.shop,checkoutId:item.checkoutId
     }));
     await tx.execute(suppressPendingRecoveryDeliveryQuery({
       accountId:merchant.accountId,shop:merchant.shop,checkoutId:item.checkoutId
     }));
   }
   return true;
 });
}
async function resolve(merchant:AutoPrepMerchant,shopifyCustomerId:string,templateName:string):
 Promise<PreparedRecoveryIdentity|null>{
 if(!/^gid:\/\/shopify\/Customer\/[1-9][0-9]{0,19}$/.test(shopifyCustomerId))return null;
 const customerNumeric=shopifyCustomerId.slice('gid://shopify/Customer/'.length);
 const q=await db.execute(sql`
   SELECT c.id AS contact_id,t.id AS template_id,
     c.phone AS phone,consent.recipient_hmac AS recipient_digest
   FROM contacts c
   JOIN ecommerce_whatsapp_recovery_consents consent
     ON consent.account_id=c.user_id AND consent.contact_id=c.id
     AND consent.shop=${merchant.shop}
     AND consent.shopify_customer_gid=${shopifyCustomerId}
     AND consent.channel='whatsapp' AND consent.purpose='checkout_recovery'
     AND consent.evidence_source='verified_whatsapp_explicit_opt_in'
     AND consent.revoked_at IS NULL
     AND consent.granted_at<=NOW()
     AND consent.granted_at > NOW()-INTERVAL '365 days'
     AND consent.last_verified_inbound_at IS NOT NULL
   JOIN message_templates t ON t.user_id=c.user_id
     AND t.name=${templateName} AND lower(t.category)='marketing'
     AND lower(t.status)='approved'
   WHERE c.user_id=${merchant.accountId}
     AND COALESCE(c.custom_fields->>'shopifyCustomerId',
                  c.source_details->>'shopifyCustomerId')=${customerNumeric}
     AND COALESCE(c.custom_fields->>'shopifyShop',c.source_details->>'shop')=${merchant.shop}
     AND c.automations_paused=FALSE
     AND c.phone ~ '^\\+[1-9][0-9]{7,14}$'
     AND c.whatsapp_id=substring(c.phone FROM 2)
     AND lower(coalesce(c.custom_fields->>'doNotContact','false')) <> 'true'
     AND lower(coalesce(c.custom_fields->>'marketingOptIn','true')) <> 'false'
   LIMIT 2
 `);
 if(q.rows.length!==1)return null;
 const row=q.rows[0],secret=process.env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY||'';
 if(secret.length<32)return null;
 try{
   const calculated=Buffer.from(recoveryPhoneDigest(secret,String(row.phone)),'hex');
   const stored=Buffer.from(String(row.recipient_digest),'hex');
   if(stored.length!==32||!timingSafeEqual(calculated,stored))return null;
 }catch{return null;}
 return {contactId:String(row.contact_id),templateId:String(row.template_id),
   shopifyCustomerId};
}
async function prepare(merchant:AutoPrepMerchant,checkoutId:string,lastActivityAt:string,
 match:PreparedRecoveryIdentity):Promise<boolean>{
 return withShopLock(merchant,async tx=>{
   if(!await ownerStillActive(tx,merchant))return false;
   await tx.execute(prepareCheckoutRecoveryIntentQuery({
     accountId:merchant.accountId,shop:merchant.shop,
     checkoutId,verifiedLastActivityAt:lastActivityAt
   }));
   const rows=await tx.execute(enqueueRecoveryDeliveryQuery({
     accountId:merchant.accountId,shop:merchant.shop,checkoutId,
     contactId:match.contactId,templateId:match.templateId,
     shopifyCustomerId:match.shopifyCustomerId
   }));
   return rows.rows.length===1;
 });
}
async function suppress(merchant:AutoPrepMerchant,checkoutId:string):Promise<boolean>{
 return withShopLock(merchant,async tx=>{
   if(!await ownerStillActive(tx,merchant))return false;
   await tx.execute(suppressCheckoutRecoveryIntentQuery({
     accountId:merchant.accountId,shop:merchant.shop,checkoutId
   }));
   await tx.execute(suppressPendingRecoveryDeliveryQuery({
     accountId:merchant.accountId,shop:merchant.shop,checkoutId
   }));
   return true;
 });
}
/** Bounded, explicitly enabled auto-prep ONLY for the one staging test shop.
 * Does NOT start any send worker or enable Meta template messaging.
 */
export function startCheckoutRecoveryAutoPreparation():null|(()=>void){
 const configuration=env();
 if(!recoveryAutoPrepEnabled(configuration))return null;
 let busy=false,stopped=false;
 const tick=async()=>{
   if(busy||stopped)return;busy=true;
   try{
     if(!await ensureSchema())return;
     await runAutoRecoveryPreparationTick(configuration,{
       merchant:getMerchant,
       observePage:merchant=>fetchShopifyAbandonedCheckoutPage({
         shop:merchant.shop,accessToken:merchant.accessToken
       }),
       persistObservation:persist,
       due:async merchant=>{
         const rows=await db.execute(dueCheckoutObservationsQuery(
           merchant.accountId,merchant.shop));
         return rows.rows.map(r=>({
           checkoutId:String(r.checkout_gid),
           lastActivityAt:new Date(String(r.last_activity_at)).toISOString()
         }));
       },
       recheck:(merchant,checkoutId)=>recheckShopifyCheckoutForRecovery({
         shop:merchant.shop,accessToken:merchant.accessToken,checkoutId
       }),
       suppress,resolveIdentity:resolve,prepareAndEnqueue:prepare,
     });
   }catch(error){
     console.error('[EcommerceRecoveryAutoPrep] paused tick:',
       error instanceof Error?error.message:'unknown_error');
   }finally{busy=false;}
 };
 const timer=setInterval(()=>{void tick()},90_000);
 timer.unref?.();
 return ()=>{stopped=true;clearInterval(timer)};
}

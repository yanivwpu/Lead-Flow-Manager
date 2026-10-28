import {and,eq,sql} from 'drizzle-orm';
import {db} from '../../drizzle/db';
import {users,contacts,messageTemplates} from '@shared/schema';
import {storage} from '../storage';
import {getMetaMessageTemplates} from '../userMeta';
import {isShopifyContactInstallationActive} from '@shared/shopifyContactPrivacy';
import {recheckShopifyCheckoutForRecovery} from './checkoutFreshRecheck';
import {readRecoveryConsentQuery,claimRecoveryDeliveryQuery,settleRecoveryDeliveryQuery} from './checkoutRecoveryOutbox';
import {processClaimedRecoveryDelivery,type ClaimedRecoveryDelivery} from './checkoutRecoveryDeliveryWorker';
import {sendRecoveryViaMeta} from './checkoutRecoveryMetaSender';
import {recoveryRuntimeSchemaReadyQuery} from './checkoutRecoverySchema';
import {recoveryWorkerEnabled,startStagingRecoveryWorkerScheduler,
 type RecoveryWorkerEnvironment} from './checkoutRecoveryWorkerScheduler';
import type {RecoveryContact,WhatsAppRecoveryConsent,RecoveryTemplateApproval} from './checkoutRecoveryMessagingEligibility';

const isShop=(shop:unknown):shop is string=>typeof shop==='string'&&
 /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)
 ? v as Record<string,unknown>:{};
const env=():RecoveryWorkerEnvironment=>({
 RAILWAY_ENVIRONMENT_NAME:process.env.RAILWAY_ENVIRONMENT_NAME,
 APP_URL:process.env.APP_URL,
 ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:process.env.ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED,
 ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:process.env.ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED,
 ECOMMERCE_RECOVERY_SEND_ENABLED:process.env.ECOMMERCE_RECOVERY_SEND_ENABLED,
 ECOMMERCE_RECOVERY_WORKER_ENABLED:process.env.ECOMMERCE_RECOVERY_WORKER_ENABLED,
 ECOMMERCE_RECOVERY_WORKER_MODE:process.env.ECOMMERCE_RECOVERY_WORKER_MODE,
 ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID:process.env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID,
});
async function installation(accountId:string,shop:string):Promise<boolean>{
 const [user]=await db.select().from(users).where(and(eq(users.id,accountId),
   eq(users.shopifyShop,shop))).limit(1);
 return !!user&&isShopifyContactInstallationActive(user)&&
   !!user.shopifyAccessToken&&user.metaConnected===true;
}
async function claimOne(accountId:string):Promise<ClaimedRecoveryDelivery|null>{
 const secret=process.env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY||'';
 if(secret.length<32)return null;
 const [owner]=await db.select().from(users).where(eq(users.id,accountId)).limit(1);
 if(!owner||!isShop(owner.shopifyShop)||
   !await installation(accountId,owner.shopifyShop))return null;
 const shop=owner.shopifyShop;
 const schema=await db.execute(recoveryRuntimeSchemaReadyQuery());
 if(schema.rows[0]?.ready!==true)
   return null;
 const res=await db.execute(claimRecoveryDeliveryQuery({accountId,shop}));
 if(res.rows.length!==1)return null;
 const row=res.rows[0];
 return {
   id:String(row.id),accountId:String(row.account_id),shop:String(row.shop),
   checkoutId:String(row.checkout_gid),contactId:String(row.contact_id),
   templateId:String(row.template_id),claimToken:String(row.claim_token)
 };
}
async function fetchFresh(claim:ClaimedRecoveryDelivery){
 const owner=await storage.getUserForSession(claim.accountId);
 if(!owner||owner.shopifyShop!==claim.shop||
   !isShopifyContactInstallationActive(owner)||!owner.shopifyAccessToken)
   return {status:'blocked' as const,reason:'inactive_shopify_installation',completed:true};
 return recheckShopifyCheckoutForRecovery({
   shop:claim.shop,accessToken:owner.shopifyAccessToken,checkoutId:claim.checkoutId
 });
}
async function evidence(claim:ClaimedRecoveryDelivery,shopifyCustomerId:string):Promise<{
 contact:RecoveryContact|null;consent:WhatsAppRecoveryConsent|null;
 localTemplate:RecoveryTemplateApproval|null;liveMetaTemplate:RecoveryTemplateApproval|null;
}>{
 const [contact]=await db.select().from(contacts).where(and(
   eq(contacts.id,claim.contactId),eq(contacts.userId,claim.accountId))).limit(1);
 const [template]=await db.select().from(messageTemplates).where(and(
   eq(messageTemplates.id,claim.templateId),eq(messageTemplates.userId,claim.accountId))).limit(1);
 const proof=await db.execute(readRecoveryConsentQuery({
   accountId:claim.accountId,shop:claim.shop,
   contactId:claim.contactId,shopifyCustomerId
 }));
 const consentRow=proof.rows[0];
 const live=await getMetaMessageTemplates(claim.accountId);
 const found=live.filter(item=>item?.name===template?.name &&
   item?.language===template?.language);
 const status=found.length===1?found[0]:null;
 const cf=obj(contact?.customFields),source=obj(contact?.sourceDetails);
 const identity=cf.shopifyCustomerId??source.shopifyCustomerId;
 const identityShop=cf.shopifyShop??source.shop;
 return{
   contact:contact ? {
     id:contact.id,userId:contact.userId,phone:contact.phone,
     whatsappId:contact.whatsappId,
     shopifyCustomerId:typeof identity==='string'&&identityShop===claim.shop
      ?'gid://shopify/Customer/'+identity:null,
     automationsPaused:contact.automationsPaused,tag:contact.tag,
     pipelineStage:contact.pipelineStage,customFields:contact.customFields,
   }:null,
   consent:consentRow?{
     accountId:String(consentRow.account_id),shop:String(consentRow.shop),
     contactId:String(consentRow.contact_id),
     shopifyCustomerId:String(consentRow.shopify_customer_gid),
     purpose:String(consentRow.purpose) as 'checkout_recovery',
     channel:String(consentRow.channel) as 'whatsapp',
     source:String(consentRow.evidence_source) as 'verified_whatsapp_explicit_opt_in',
     phoneDigest:String(consentRow.recipient_hmac),
     grantedAt:new Date(String(consentRow.granted_at)).toISOString(),
     revokedAt:consentRow.revoked_at?new Date(String(consentRow.revoked_at)).toISOString():null,
   }:null,
   localTemplate:template?{
     name:template.name,language:template.language||'',category:template.category,
     status:template.status
   }:null,
   liveMetaTemplate:status?{
     name:String(status.name),language:String(status.language),
     category:String(status.category),status:String(status.status),
   }:null
 };
}
async function settle(claim:ClaimedRecoveryDelivery,
 outcome:'accepted'|'uncertain'|'suppressed',providerMessageId?:string){
 const result=await db.execute(settleRecoveryDeliveryQuery({
   id:claim.id,accountId:claim.accountId,shop:claim.shop,
   claimToken:claim.claimToken,outcome,providerMessageId
 }));
 return result.rows.length===1;
}
/**
 * Not started unless ALL staging, test tenant and outbound approvals are set.
 * Reuses two independent purchase/Meta/consent checks and the existing sender.
 */
export function startCheckoutRecoveryRuntime():null|(()=>void){
 const configuration=env();
 if(!recoveryWorkerEnabled(configuration))return null;
 return startStagingRecoveryWorkerScheduler(configuration,{
   claim:claimOne,
   process:async (claim,setting)=>{
     const status=await processClaimedRecoveryDelivery(claim,setting,{
       verifyCurrentInstallation:()=>installation(claim.accountId,claim.shop),
       freshShopifyRecheck:()=>fetchFresh(claim),
       resolveCurrentEvidence:(_claimed,shopifyCustomerId)=>evidence(claim,shopifyCustomerId),
       sendApprovedTemplate:args=>sendRecoveryViaMeta(args),
       settle,
     },process.env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY||'');
     return status==='disabled'?'uncertain':status;
   }
 },()=>{
   console.error('[EcommerceRecoveryWorker] guarded staging tick failed');
 });
}

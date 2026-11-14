import {merchantProductionAvailable,loadMerchantRelease} from './merchantRelease';
import { consentCaptureSchemaQuery } from './consentCaptureSchema';
import { productionConsentCaptureAllowed } from './consentCaptureGate';
import {and,eq,sql} from 'drizzle-orm';
import type {db} from '../../drizzle/db';
import {users,contacts,integrations} from '@shared/schema';
import {isShopifyContactInstallationActive} from '@shared/shopifyContactPrivacy';
import {normalizeShopifyShopDomain} from '@shared/shopifyBilling';
import {classifyRecoveryConsentInbound,recoveryConsentCaptureEnabled,
 type VerifiedInboundConsentCandidate} from './checkoutRecoveryInboundConsentGate';
import {grantSignedRecoveryConsentQuery,revokeSignedRecoveryConsentQuery,
 suppressRecoveryOutboxByContactQuery} from './checkoutRecoveryInboundConsentQueries';
import {productionRecoveryEvidenceScope} from './checkoutRecoveryProductionRelease';
import {recoveryPhoneDigest,commerceContactSuppressed} from './checkoutRecoveryMessagingEligibility';

const SHOP=/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const CUSTOMER=/^[1-9][0-9]{0,19}$/;
function obj(v:unknown):Record<string,unknown>{
 return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
}
function customerIdentity(contact:{customFields:unknown;sourceDetails:unknown},
 shop:string):string|null{
 const custom=obj(contact.customFields),source=obj(contact.sourceDetails);
 for(const [data,idKey,shopKey] of [[custom,'shopifyCustomerId','shopifyShop'],[source,'shopifyCustomerId','shop']] as const){
   if(data[idKey]!=null&&data[idKey] !== (custom.shopifyCustomerId ?? source.shopifyCustomerId))return null;
   if(data[shopKey]!=null&&data[shopKey]!==shop)return null;
 }
 const id=custom.shopifyCustomerId ?? source.shopifyCustomerId;
 const taggedShop=custom.shopifyShop ?? source.shop;
 return typeof id==='string'&&CUSTOMER.test(id)&&taggedShop===shop?id:null;
}
/**
 * Called only from the already verified Meta webhook, after the inbound CRM
 * message was persisted and bound to the merchant phone_number_id.
 * Existing staging capture and separately approved production evidence scopes
 * share these identity/privacy guards. Capture never activates customer sending.
 */
type ConsentTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function createRecoveryConsentCapture(database: typeof db, privacyLocked = async (tx: ConsentTx, shop: string, customer: string) =>
  (await import('../shopifyPrivacyRequests')).customerPrivacyLocked(shop, { id: customer }, tx)) {
return async function captureRecoveryConsentFromVerifiedMeta(input:{
 accountId:string;inboxContactId:string|null;candidate:VerifiedInboundConsentCandidate;
 env:Record<string,string|undefined>;
 secret:string;now?:number;
}):Promise<'disabled'|'ignored'|'granted'|'revoked'> {
 const classified=classifyRecoveryConsentInbound(input.candidate,input.now);
 const production=input.env.RAILWAY_ENVIRONMENT_NAME==='production'&&
   input.env.APP_URL?.replace(/\/$/,'')==='https://app.whachatcrm.com';
 const scope=productionRecoveryEvidenceScope(input.env);
 const productionGrant=production&&!!scope&&scope.accountId===input.accountId&&
   input.env.ECOMMERCE_RECOVERY_PRODUCTION_CONSENT_APPROVED==='true'&&input.env.ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED==='true';
 // A signed STOP remains effective after rollout is paused or its scope expires.
 if(!recoveryConsentCaptureEnabled(input.env)&&!productionGrant&&
   !merchantProductionAvailable(input.env,input.accountId)&&!(production&&input.env.ECOMMERCE_CONSENT_CAPTURE_PRODUCTION_APPROVED==='true')&&!(production&&classified?.action==='revoke'))return 'disabled';
 if(!classified || !input.accountId || input.secret.length<32)return 'ignored';
 const {candidate}=input;
 const currentPhone='+'+candidate.from;
 return database.transaction(async tx=>{
   // Match the lock used by customer/redact, shop/redact and uninstall before
   // changing pseudonymous evidence or any existing outbox state.
   const [owner]=await tx.select({shopifyShop:users.shopifyShop,metaConnected:users.metaConnected,metaPhoneNumberId:users.metaPhoneNumberId}).from(users).where(eq(users.id,input.accountId)).limit(1);
   const shop=owner?.shopifyShop;
   if(!owner || !shop || !SHOP.test(shop) ||
      !owner.metaConnected || owner.metaPhoneNumberId!==candidate.phoneNumberId)
     return 'ignored';
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop},0))`);
   const [liveOwner]=await tx.select({shopifyShop:users.shopifyShop,shopifyAccessToken:users.shopifyAccessToken,
     shopifySubscriptionStatus:users.shopifySubscriptionStatus,deletionRequestedAt:users.deletionRequestedAt,
     shopifyInstalledAt:users.shopifyInstalledAt,metaConnected:users.metaConnected,
     metaPhoneNumberId:users.metaPhoneNumberId,metaBusinessAccountId:users.metaBusinessAccountId}).from(users)
     .where(and(eq(users.id,input.accountId),eq(users.shopifyShop,shop)))
     .for('share').limit(1);
   if(!liveOwner || !liveOwner.metaConnected ||
       liveOwner.metaPhoneNumberId!==candidate.phoneNumberId)return 'ignored';
   // Explicit Shopify customer/redact locks always win. No phone-only inference
   // can reconnect or regrant an erased Shopify customer.
   const ready=await tx.execute(sql`
     SELECT to_regclass('ecommerce_whatsapp_recovery_consents') IS NOT NULL AS consent,
            to_regclass('ecommerce_checkout_recovery_outbox') IS NOT NULL AS outbox`);
   if((await tx.execute(consentCaptureSchemaQuery)).rows[0]?.recovery!==true ||
      ready.rows[0]?.consent!==true)
     throw Error('signed_recovery_consent_schema_missing');
   if(classified.action==='revoke'){
     const rows=await tx.execute(revokeSignedRecoveryConsentQuery({
       accountId:input.accountId,shop,phone:currentPhone,
       eventAt:classified.eventAt,wamid:candidate.messageId,secret:input.secret,
     }));
     const ids=[...new Set(rows.rows.map(r=>String(r.contact_id)).filter(Boolean))];
     if(ids.length && ready.rows[0]?.outbox===true){
       const query=suppressRecoveryOutboxByContactQuery({
         accountId:input.accountId,shop,contactIds:ids});
       if(query)await tx.execute(query);
     }
     return ids.length?'revoked':'ignored';
   }
   if(!isShopifyContactInstallationActive(liveOwner) || !liveOwner.shopifyAccessToken)
     return 'ignored';
   const active=await tx.select({id:integrations.id,config:integrations.config}).from(integrations).where(and(
     eq(integrations.userId,input.accountId),eq(integrations.type,'shopify'),
     eq(integrations.isActive,true))).for('share').limit(2);
   if(active.length!==1)return 'ignored';
   const cfg=obj(active[0].config);
   for(const k of ['shop','shopUrl'])if(cfg[k]!=null &&
     (typeof cfg[k]!=='string' || normalizeShopifyShopDomain(cfg[k])!==shop))return 'ignored';
   const selfService=await loadMerchantRelease(tx,input.env,input.accountId);
   const pilot=productionConsentCaptureAllowed(input.env,{accountId:input.accountId,shop,
     installationId:active[0].id,wabaId:liveOwner.metaBusinessAccountId||'',phoneId:liveOwner.metaPhoneNumberId||'',
     installedAt:liveOwner.shopifyInstalledAt});
   if(production&&!selfService&&!pilot&&(!productionGrant||!scope||scope.shop!==shop||
     scope.recipientHmac!==recoveryPhoneDigest(input.secret,currentPhone)))return 'ignored';
   if(!liveOwner.shopifyInstalledAt||classified.eventAt<liveOwner.shopifyInstalledAt)return 'ignored';
   if(!input.inboxContactId)return 'ignored';
   const exactContacts=await tx.select({id:contacts.id,whatsappId:contacts.whatsappId,customFields:contacts.customFields,
     sourceDetails:contacts.sourceDetails,automationsPaused:contacts.automationsPaused,tag:contacts.tag,pipelineStage:contacts.pipelineStage}).from(contacts).where(and(
     eq(contacts.userId,input.accountId),sql`(regexp_replace(COALESCE(${contacts.phone},''),'[^0-9]','','g')=${candidate.from}
      OR regexp_replace(COALESCE(${contacts.whatsappId},''),'[^0-9]','','g')=${candidate.from})`
   )).for('share');
   const qualified=exactContacts.filter(c=>c.id===input.inboxContactId &&
     c.whatsappId===candidate.from && customerIdentity(c,shop));
   if(qualified.length!==1||exactContacts.length!==1)return 'ignored';
   const c=qualified[0],customer=customerIdentity(c,shop)!;
   if(exactContacts.filter(v=>customerIdentity(v,shop)===customer).length!==1)
     return 'ignored';
   // An unqualified sender or a shared phone across multiple Shopify
   // identities must not be counted as checkout marketing consent.
   if(exactContacts.some(v=>v.id!==c.id && customerIdentity(v,shop)))
     return 'ignored';
   if(commerceContactSuppressed(c)||await privacyLocked(tx,shop,customer))return 'ignored';
   const saved=await tx.execute(grantSignedRecoveryConsentQuery({
     accountId:input.accountId,shop,contactId:c.id,
     shopifyCustomerId:'gid://shopify/Customer/'+customer,
     whatsappId:candidate.from,phone:currentPhone,secret:input.secret,
     eventAt:classified.eventAt,wamid:candidate.messageId,
   }));
   return saved.rows.length===1?'granted':'ignored';
 });
}

}
export async function captureRecoveryConsentFromVerifiedMeta(input: Parameters<ReturnType<typeof createRecoveryConsentCapture>>[0]) {
 const {db} = await import('../../drizzle/db');
 return createRecoveryConsentCapture(db)(input);
}

import {and,eq,sql} from 'drizzle-orm';
import {db} from '../../drizzle/db';
import {users,contacts,integrations} from '@shared/schema';
import {isShopifyContactInstallationActive} from '@shared/shopifyContactPrivacy';
import {classifyRecoveryConsentInbound,recoveryConsentCaptureEnabled,
 type VerifiedInboundConsentCandidate} from './checkoutRecoveryInboundConsentGate';
import {grantSignedRecoveryConsentQuery,revokeSignedRecoveryConsentQuery,
 suppressRecoveryOutboxByContactQuery} from './checkoutRecoveryInboundConsentQueries';

const SHOP=/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const CUSTOMER=/^[1-9][0-9]{0,19}$/;
function obj(v:unknown):Record<string,unknown>{
 return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
}
function customerIdentity(contact:{customFields:unknown;sourceDetails:unknown},
 shop:string):string|null{
 const custom=obj(contact.customFields),source=obj(contact.sourceDetails);
 const id=custom.shopifyCustomerId ?? source.shopifyCustomerId;
 const taggedShop=custom.shopifyShop ?? source.shop;
 return typeof id==='string'&&CUSTOMER.test(id)&&taggedShop===shop?id:null;
}
/**
 * Called only from the already verified Meta webhook, after the inbound CRM
 * message was persisted and bound to the merchant phone_number_id.
 * This is a staging-only capture, not an automatic sender or marketing toggle.
 */
export async function captureRecoveryConsentFromVerifiedMeta(input:{
 accountId:string;inboxContactId:string|null;candidate:VerifiedInboundConsentCandidate;
 env:{
  RAILWAY_ENVIRONMENT_NAME?:string;APP_URL?:string;
  ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED?:string;
 };
 secret:string;now?:number;
}):Promise<'disabled'|'ignored'|'granted'|'revoked'> {
 if(!recoveryConsentCaptureEnabled(input.env))return 'disabled';
 const classified=classifyRecoveryConsentInbound(input.candidate,input.now);
 if(!classified || !input.accountId || input.secret.length<32)return 'ignored';
 const {candidate}=input;
 const currentPhone='+'+candidate.from;
 return db.transaction(async tx=>{
   // Match the lock used by customer/redact, shop/redact and uninstall before
   // changing pseudonymous evidence or any existing outbox state.
   const [owner]=await tx.select().from(users).where(eq(users.id,input.accountId)).limit(1);
   const shop=owner?.shopifyShop;
   if(!owner || !shop || !SHOP.test(shop) ||
      !owner.metaConnected || owner.metaPhoneNumberId!==candidate.phoneNumberId)
     return 'ignored';
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop},0))`);
   const [liveOwner]=await tx.select().from(users)
     .where(and(eq(users.id,input.accountId),eq(users.shopifyShop,shop)))
     .for('share').limit(1);
   if(!liveOwner || !liveOwner.metaConnected ||
       liveOwner.metaPhoneNumberId!==candidate.phoneNumberId)return 'ignored';
   // Explicit Shopify customer/redact locks always win. No phone-only inference
   // can reconnect or regrant an erased Shopify customer.
   const ready=await tx.execute(sql`
     SELECT to_regclass('public.ecommerce_whatsapp_recovery_consents') IS NOT NULL AS consent,
            to_regclass('public.ecommerce_checkout_recovery_outbox') IS NOT NULL AS outbox,
            EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public'
                AND table_name='ecommerce_whatsapp_recovery_consents'
                AND column_name='last_verified_inbound_at') AS ordered`);
   if(ready.rows[0]?.consent!==true || ready.rows[0]?.ordered!==true)
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
   const active=await tx.select().from(integrations).where(and(
     eq(integrations.userId,input.accountId),eq(integrations.type,'shopify'),
     eq(integrations.isActive,true))).limit(2);
   if(active.length!==1)return 'ignored';
   const cfg=obj(active[0].config);
   for(const k of ['shop','shopUrl'])if(cfg[k]!=null &&
     cfg[k]!==shop)return 'ignored';
   if(!input.inboxContactId)return 'ignored';
   const exactContacts=await tx.select().from(contacts).where(and(
     eq(contacts.userId,input.accountId),eq(contacts.phone,currentPhone)
   )).for('share');
   const qualified=exactContacts.filter(c=>c.id===input.inboxContactId &&
     c.whatsappId===candidate.from && customerIdentity(c,shop));
   if(qualified.length!==1)return 'ignored';
   const c=qualified[0],customer=customerIdentity(c,shop)!;
   if(exactContacts.filter(v=>customerIdentity(v,shop)===customer).length!==1)
     return 'ignored';
   // An unqualified sender or a shared phone across multiple Shopify
   // identities must not be counted as checkout marketing consent.
   if(exactContacts.some(v=>v.id!==c.id && customerIdentity(v,shop)))
     return 'ignored';
   const saved=await tx.execute(grantSignedRecoveryConsentQuery({
     accountId:input.accountId,shop,contactId:c.id,
     shopifyCustomerId:'gid://shopify/Customer/'+customer,
     whatsappId:candidate.from,phone:currentPhone,secret:input.secret,
     eventAt:classified.eventAt,wamid:candidate.messageId,
   }));
   return saved.rows.length===1?'granted':'ignored';
 });
}

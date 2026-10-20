import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../drizzle/db';
import { users, contacts, messageTemplates, integrations } from '@shared/schema';
import { isShopifyContactInstallationActive } from '@shared/shopifyContactPrivacy';
import { getMetaMessageTemplates, sendMetaWhatsAppTemplate } from '../userMeta';
import { recheckShopifyCheckoutForRecovery } from './checkoutFreshRecheck';
import { evaluateRecoveryMessagingEligibility, type RecoveryTemplateApproval } from './checkoutRecoveryMessagingEligibility';
import { recoveryDeliveryExecutionEnabled, type ClaimedRecoveryDelivery } from './checkoutRecoveryDeliveryWorker';
import { validateRecoveryMetaTemplate, recoveryTemplateBodyComponents, type RecoveryTemplateShape } from './checkoutRecoveryMetaTemplate';

const E164=/^\+[1-9]\d{7,14}$/;
function plainObject(value:unknown):Record<string,unknown>{
  return value && typeof value==='object' && !Array.isArray(value)
    ? value as Record<string,unknown> : {};
}
export type RecoveryMetaSenderArgs={
 claim:ClaimedRecoveryDelivery;
 phone:string;templateName:string;templateLanguage:string;
 checkoutRecoveryUrl:string;
};
type ProviderDeps={
 templates:(accountId:string)=>Promise<unknown[]>;
 send:(accountId:string,phone:string,templateName:string,language:string,
  components:Record<string,unknown>[])=>Promise<{messageId:string}>;
 recheck:typeof recheckShopifyCheckoutForRecovery;
};
/**
 * Not registered in a route, scheduler or webhook. Future worker may inject
 * this adapter only after it acquired an at-most-once outbox claim.
 * Explicit staging flags, live tenant/shop ownership, exact checkout/customer,
 * locked current opt-in/contact and live Meta template are rechecked under the
 * existing Shopify shop privacy lock, including during the provider request.
 */
export async function sendRecoveryViaMeta(
 args:RecoveryMetaSenderArgs,
 deps:ProviderDeps={
   templates:getMetaMessageTemplates,
   send:async(a,p,n,l,c)=>{
     const r=await sendMetaWhatsAppTemplate(a,p,n,l,c);
     return {messageId:r.messageId};
   },
   recheck:recheckShopifyCheckoutForRecovery,
 },
):Promise<{messageId:string}> {
 const {claim}=args;
 if(!recoveryDeliveryExecutionEnabled({
   RAILWAY_ENVIRONMENT_NAME:process.env.RAILWAY_ENVIRONMENT_NAME,
   APP_URL:process.env.APP_URL,
   ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:process.env.ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED,
   ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:process.env.ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED,
   ECOMMERCE_RECOVERY_SEND_ENABLED:process.env.ECOMMERCE_RECOVERY_SEND_ENABLED,
 }))throw Error('recovery_send_disabled');
 if(!E164.test(args.phone) || !/^[1-9][0-9]{0,18}$/.test(claim.id) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claim.claimToken) ||
    !claim.accountId || !claim.shop || !claim.checkoutId || !claim.contactId ||
    !claim.templateId || !args.checkoutRecoveryUrl)
   throw Error('invalid_recovery_send_claim');

 return db.transaction(async tx=>{
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${claim.shop},0))`);
   // A forged or stale caller cannot turn this adapter into a direct send:
   // only a uniquely claimed, tenant-owned, purchase-incomplete and due
   // outbox record may reach the provider. Keep the claim locked until the
   // one-and-only Meta send has resolved; a second caller must not overlap.
   const claimed=await tx.execute(sql`
     SELECT o.id
     FROM ecommerce_checkout_recovery_outbox o
     INNER JOIN ecommerce_checkout_recovery_intents i ON i.id=o.intent_id
     INNER JOIN ecommerce_abandoned_checkout_observations obs
       ON obs.account_id=o.account_id AND obs.shop=o.shop
         AND obs.checkout_gid=o.checkout_gid
     WHERE o.id=CAST(${claim.id} AS BIGINT)
       AND o.account_id=${claim.accountId} AND o.shop=${claim.shop}
       AND o.checkout_gid=${claim.checkoutId}
       AND o.contact_id=${claim.contactId}
       AND o.template_id=${claim.templateId}
       AND o.claim_token=CAST(${claim.claimToken} AS UUID)
       AND o.state='claimed' AND i.status='ready'
       AND obs.completed=FALSE AND obs.next_review_at<=NOW()
     FOR UPDATE OF o
   `);
   if(claimed.rows.length!==1)throw Error('unclaimed_or_suppressed_recovery_delivery');
   const [merchant]=await tx.select().from(users)
     .where(and(eq(users.id,claim.accountId),eq(users.shopifyShop,claim.shop)))
     .for('share').limit(1);
   if(!merchant || !isShopifyContactInstallationActive(merchant) ||
      !merchant.shopifyAccessToken)throw Error('shopify_installation_not_active');
   const active=await tx.select().from(integrations)
     .where(and(eq(integrations.userId,claim.accountId),
       eq(integrations.type,'shopify'),eq(integrations.isActive,true))).limit(2);
   if(active.length!==1)throw Error('shopify_integration_ambiguous');
   const cfg=plainObject(active[0].config);
   for(const key of ['shop','shopUrl'])if(cfg[key]!=null &&
     cfg[key]!==claim.shop)throw Error('shopify_integration_shop_mismatch');

   const [contact]=await tx.select().from(contacts).where(and(
     eq(contacts.userId,claim.accountId),eq(contacts.id,claim.contactId)
   )).for('share').limit(1);
   const [template]=await tx.select().from(messageTemplates).where(and(
     eq(messageTemplates.userId,claim.accountId),eq(messageTemplates.id,claim.templateId)
   )).for('share').limit(1);
   if(!contact || !template || template.name!==args.templateName ||
      template.language!==args.templateLanguage)
     throw Error('recovery_contact_or_template_changed');
   const cf=plainObject(contact.customFields),details=plainObject(contact.sourceDetails);
   const exactId=cf.shopifyCustomerId ?? details.shopifyCustomerId;
   if(!exactId || !/^[1-9]\d{0,19}$/.test(String(exactId)) ||
      (cf.shopifyShop ?? details.shop)!==claim.shop)
     throw Error('shopify_customer_mapping_unverified');

   const data=await tx.execute(sql`
     SELECT account_id,shop,contact_id,shopify_customer_gid,purpose,channel,
       evidence_source,recipient_hmac,granted_at,revoked_at
     FROM ecommerce_whatsapp_recovery_consents
     WHERE account_id=${claim.accountId} AND shop=${claim.shop}
       AND contact_id=${claim.contactId}
     FOR SHARE`);
   if(data.rows.length!==1)throw Error('whatsapp_checkout_optin_missing');
   const proof=data.rows[0];
   const shopperId='gid://shopify/Customer/'+String(exactId);
   const stored=String(proof.shopify_customer_gid||'');
   if(stored!==shopperId)throw Error('whatsapp_checkout_customer_mismatch');

   // One more Shopify check AFTER acquiring the contact/consent locks and
   // immediately before the final Meta verification and one provider call.
   const fresh=await deps.recheck({
     shop:claim.shop,accessToken:merchant.shopifyAccessToken,checkoutId:claim.checkoutId
   });
   if(fresh.status!=='eligible_for_review' ||
      fresh.shopifyCustomerId!==shopperId ||
      fresh.recoveryUrl!==args.checkoutRecoveryUrl)
     throw Error('checkout_recovery_no_longer_valid');

   const live=await deps.templates(claim.accountId);
   const matches=live.filter(item=>{
     const row=plainObject(item);
     return row.name===template.name && row.language===template.language;
   });
   if(matches.length!==1)throw Error('meta_template_approval_unconfirmed');
   const local:RecoveryTemplateShape={
     name:template.name,language:template.language||'',
     category:template.category,status:template.status,bodyText:template.bodyText,
     headerType:template.headerType,templateType:template.templateType,
     buttons:template.buttons,carouselCards:template.carouselCards,
   };
   const approved=validateRecoveryMetaTemplate(local,matches[0]);
   if(!approved.ok)throw Error('meta_recovery_template_not_approved');
   const decision=evaluateRecoveryMessagingEligibility({
     accountId:claim.accountId,shop:claim.shop,shopifyCustomerId:shopperId,
     contact:{
       id:contact.id,userId:contact.userId,phone:contact.phone,
       whatsappId:contact.whatsappId,shopifyCustomerId:shopperId,
       automationsPaused:contact.automationsPaused,tag:contact.tag,
       pipelineStage:contact.pipelineStage,customFields:contact.customFields,
     },
     consent:{
       accountId:String(proof.account_id),shop:String(proof.shop),
       contactId:String(proof.contact_id),shopifyCustomerId:stored,
       purpose:String(proof.purpose) as 'checkout_recovery',
       channel:String(proof.channel) as 'whatsapp',
       source:String(proof.evidence_source) as 'verified_whatsapp_explicit_opt_in',
       phoneDigest:String(proof.recipient_hmac),
       grantedAt:new Date(String(proof.granted_at)).toISOString(),
       revokedAt:proof.revoked_at ? new Date(String(proof.revoked_at)).toISOString() : null,
     },
     localTemplate:local as RecoveryTemplateApproval,
     liveMetaTemplate:{
       name:approved.name,language:approved.language,
       category:'MARKETING',status:'APPROVED'
     },
     consentDigestSecret:process.env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY||'',
   });
   if(!decision.ok || decision.recipientPhone!==args.phone)
     throw Error('whatsapp_recovery_consent_or_recipient_invalid');
   const response=await deps.send(claim.accountId,args.phone,
     approved.name,approved.language,
     recoveryTemplateBodyComponents(approved,fresh.recoveryUrl));
   if(!response?.messageId || response.messageId.length>256)
     throw Error('meta_provider_acceptance_unknown');
   return {messageId:response.messageId};
 });
}

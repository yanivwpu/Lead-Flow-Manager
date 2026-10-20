import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Strict opt-in and approved Meta MARKETING template gate for abandoned checkout.
 * Shopify email/SMS marketing permissions are NOT WhatsApp consent.
 * Every input must be read from trusted tenant DB / live Meta API, never request JSON.
 */
export type RecoveryContact = {
  id:string; userId:string; phone:string|null; whatsappId:string|null;
  shopifyCustomerId:string|null; automationsPaused:boolean;
  tag:string|null; pipelineStage:string|null; customFields:unknown;
};
export type WhatsAppRecoveryConsent = {
  accountId:string; shop:string; contactId:string; shopifyCustomerId:string;
  purpose:'checkout_recovery'; channel:'whatsapp';
  source:'verified_whatsapp_explicit_opt_in';
  phoneDigest:string; grantedAt:string; revokedAt:string|null;
};
export type RecoveryTemplateApproval = {
  name:string; language:string; category:string; status:string;
};
export type RecoveryMessagingDecision =
  | {ok:true; recipientPhone:string; templateName:string; templateLanguage:string}
  | {ok:false;reason:string};
const SHOP=/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const CUSTOMER=/^gid:\/\/shopify\/Customer\/[1-9][0-9]{0,19}$/;
const HEX=/^[a-f0-9]{64}$/i;
const PHONE=/^\+[1-9][0-9]{7,14}$/;
const FIELDS=['doNotContact','dnc','optOut','optedOut','unsubscribed','unsubscribe','stop','campaignOptOut'] as const;
export function recoveryPhoneDigest(secret:string,phone:string):string{
 if(secret.length<32||!PHONE.test(phone)) throw Error('invalid_consent_digest_input');
 return createHmac('sha256',secret).update('whachat/ecommerce/whatsapp-recovery/phone/v1:')
   .update(phone).digest('hex');
}
export function evaluateRecoveryMessagingEligibility(input:{
 accountId:string;shop:string;shopifyCustomerId:string;
 contact:RecoveryContact|null;consent:WhatsAppRecoveryConsent|null;
 localTemplate:RecoveryTemplateApproval|null;liveMetaTemplate:RecoveryTemplateApproval|null;
 consentDigestSecret:string;now?:number;
}):RecoveryMessagingDecision{
 const denied=(reason:string):RecoveryMessagingDecision=>({ok:false,reason});
 const {accountId,shop,shopifyCustomerId,contact,consent,localTemplate,liveMetaTemplate}=input;
 if(!accountId||!SHOP.test(shop)||!CUSTOMER.test(shopifyCustomerId))
   return denied('invalid_tenant_or_customer');
 if(!contact||contact.userId!==accountId||!contact.id||!PHONE.test(contact.phone||''))
   return denied('contact_not_tenant_verified');
 if(contact.shopifyCustomerId!==shopifyCustomerId)
   return denied('shopify_customer_not_matched');
 if(!contact.whatsappId || !/^[1-9][0-9]{7,14}$/.test(contact.whatsappId) ||
    '+'+contact.whatsappId!==contact.phone)
   return denied('whatsapp_recipient_unverified');
 const fields=contact.customFields&&typeof contact.customFields==='object'&&!Array.isArray(contact.customFields)
   ? contact.customFields as Record<string,unknown>:{};
 if(contact.automationsPaused || fields.marketingOptIn===false || FIELDS.some(k=>fields[k]===true) ||
   /\b(do not contact|dnc|stop|unsubscribe|unsubscribed|opt\s*out|remove me)\b/i.test(
     (contact.tag||'')+' '+(contact.pipelineStage||'')))
   return denied('contact_suppressed');
 if(!consent||consent.accountId!==accountId||consent.shop!==shop ||
    consent.contactId!==contact.id||consent.shopifyCustomerId!==shopifyCustomerId ||
    consent.purpose!=='checkout_recovery'||consent.channel!=='whatsapp'||
    consent.source!=='verified_whatsapp_explicit_opt_in'||consent.revokedAt!==null)
   return denied('whatsapp_consent_unverified');
 const now=input.now??Date.now(),when=Date.parse(consent.grantedAt);
 if(!Number.isFinite(when)||when>now||now-when>365*24*3600_000)
   return denied('whatsapp_consent_stale');
 if(!HEX.test(consent.phoneDigest)||input.consentDigestSecret.length<32)
   return denied('whatsapp_consent_digest_unverified');
 const digest=recoveryPhoneDigest(input.consentDigestSecret,contact.phone!);
 if(!timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(consent.phoneDigest,'hex')))
   return denied('whatsapp_consent_recipient_changed');
 if(!localTemplate||!liveMetaTemplate||
    !/^[a-z][a-z0-9_]{0,511}$/.test(localTemplate.name)||
    localTemplate.name!==liveMetaTemplate.name||
    localTemplate.language!==liveMetaTemplate.language ||
    !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(localTemplate.language)||
    localTemplate.category.toLowerCase()!=='marketing'||
    liveMetaTemplate.category.toLowerCase()!=='marketing'||
    localTemplate.status.toLowerCase()!=='approved'||
    liveMetaTemplate.status.toUpperCase()!=='APPROVED')
   return denied('meta_marketing_template_unapproved');
 return {ok:true,recipientPhone:contact.phone!,templateName:localTemplate.name,
   templateLanguage:localTemplate.language};
}

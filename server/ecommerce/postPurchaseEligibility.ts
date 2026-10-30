import {JOURNEY_POLICY,type PostPurchaseJourney} from '../../shared/postPurchase';
import {evaluateCommerceMessagingEligibility,type RecoveryContact,type WhatsAppRecoveryConsent} from './checkoutRecoveryMessagingEligibility';
import type {RecoveryTemplateShape} from './checkoutRecoveryMetaTemplate';
export function matchPostPurchaseTemplate(local:RecoveryTemplateShape|null,live:unknown,journey:PostPurchaseJourney):boolean{
  if(!local||!live||typeof live!=='object'||Array.isArray(live))return false;
  const row=live as Record<string,unknown>;
  if(local.name!==row.name||local.language!==row.language||local.status.toLowerCase()!=='approved'||
    row.status!=='APPROVED'||local.category.toUpperCase()!==JOURNEY_POLICY[journey].category||row.category!==JOURNEY_POLICY[journey].category||
    !local.bodyText||local.bodyText.length>4096||/\{\{(?!1\}\})/.test(local.bodyText)||
    (local.headerType&&local.headerType.toLowerCase()!=='none')||(local.templateType&&local.templateType.toLowerCase()!=='text')||
    (local.buttons!=null&&(!Array.isArray(local.buttons)||local.buttons.length))||
    (local.carouselCards!=null&&(!Array.isArray(local.carouselCards)||local.carouselCards.length)))return false;
  if(!Array.isArray(row.components)||row.components.some(c=>!c||!['BODY','FOOTER'].includes(c.type)))return false;
  const bodies=row.components.filter(c=>c.type==='BODY');
  return bodies.length===1&&bodies[0].text===local.bodyText;
}
/** Reuses existing phone HMAC, exact CRM/WhatsApp identity and suppression checks. */
export function eligiblePostPurchaseRecipient(input:{journey:PostPurchaseJourney;accountId:string;shop:string;customerId:string;
  contact:RecoveryContact|null;consent:WhatsAppRecoveryConsent|null;template:RecoveryTemplateShape|null;live:unknown;secret:string;now:number}){
  if(!matchPostPurchaseTemplate(input.template,input.live,input.journey))return {ok:false as const,reason:'approved_matching_template_required'};
  const live=input.live as {name:string;language:string;category:string;status:string};
  return evaluateCommerceMessagingEligibility({accountId:input.accountId,shop:input.shop,shopifyCustomerId:input.customerId,
    contact:input.contact,consent:input.consent,localTemplate:input.template,liveMetaTemplate:live,
    purpose:input.journey,category:JOURNEY_POLICY[input.journey].category,consentDigestSecret:input.secret,now:input.now});
}

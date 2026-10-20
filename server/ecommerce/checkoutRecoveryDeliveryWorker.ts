import { evaluateRecoveryMessagingEligibility,
 type RecoveryContact,type WhatsAppRecoveryConsent,type RecoveryTemplateApproval
} from './checkoutRecoveryMessagingEligibility';
import type { FreshRecoveryResult } from './checkoutFreshRecheck';

/**
 * Adapter-driven delivery core, NOT registered with any scheduler/API route.
 * The only way to call Meta is through an explicitly supplied, reviewed adapter.
 * A durable outbox claim must be obtained BEFORE this function is invoked.
 * At-most-once safety: a timeout/unknown provider acceptance remains uncertain;
 * no automatic requeue or second provider call is possible.
 */
export type ClaimedRecoveryDelivery={
 id:string;claimToken:string;accountId:string;shop:string;checkoutId:string;
 contactId:string;templateId:string;
};
type Evidence={
 contact:RecoveryContact|null;consent:WhatsAppRecoveryConsent|null;
 localTemplate:RecoveryTemplateApproval|null;liveMetaTemplate:RecoveryTemplateApproval|null;
};
type DeliveryDeps={
 verifyCurrentInstallation:(claim:ClaimedRecoveryDelivery)=>Promise<boolean>;
 freshShopifyRecheck:(claim:ClaimedRecoveryDelivery)=>Promise<FreshRecoveryResult>;
 resolveCurrentEvidence:(claim:ClaimedRecoveryDelivery,shopifyCustomerId:string)=>Promise<Evidence>;
 sendApprovedTemplate:(args:{
   claim:ClaimedRecoveryDelivery;phone:string;templateName:string;
   templateLanguage:string;checkoutRecoveryUrl:string
 })=>Promise<{messageId:string}>;
 settle:(claim:ClaimedRecoveryDelivery,outcome:'accepted'|'uncertain'|'suppressed',
  providerMessageId?:string)=>Promise<boolean>;
};
export function recoveryDeliveryExecutionEnabled(env:{
 RAILWAY_ENVIRONMENT_NAME?:string;APP_URL?:string;
 ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED?:string;
 ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED?:string;
 ECOMMERCE_RECOVERY_SEND_ENABLED?:string;
}):boolean{
 return env.RAILWAY_ENVIRONMENT_NAME==='staging' &&
   env.APP_URL?.replace(/\/$/,'')==='https://whachatcrm-staging-app-staging.up.railway.app' &&
   env.ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED==='true' &&
   env.ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED==='true' &&
   env.ECOMMERCE_RECOVERY_SEND_ENABLED==='true';
}
export async function processClaimedRecoveryDelivery(
 claim:ClaimedRecoveryDelivery,env:Parameters<typeof recoveryDeliveryExecutionEnabled>[0],
 deps:DeliveryDeps,consentDigestSecret:string
):Promise<'disabled'|'suppressed'|'accepted'|'uncertain'> {
 if(!recoveryDeliveryExecutionEnabled(env))return 'disabled';
 let providerAttempted=false;
 try{
   if(!await deps.verifyCurrentInstallation(claim)){
     if(!await deps.settle(claim,'suppressed'))return 'uncertain';
     return 'suppressed';
   }
   const fresh=await deps.freshShopifyRecheck(claim);
   if(fresh.status!=='eligible_for_review'){
     if(!await deps.settle(claim,fresh.completed?'suppressed':'uncertain'))return 'uncertain';
     return fresh.completed?'suppressed':'uncertain';
   }
   const proof=await deps.resolveCurrentEvidence(claim,fresh.shopifyCustomerId);
   if(!proof.contact||proof.contact.id!==claim.contactId){
     if(!await deps.settle(claim,'suppressed'))return 'uncertain';
     return 'suppressed';
   }
   const decision=evaluateRecoveryMessagingEligibility({
     accountId:claim.accountId,shop:claim.shop,
     shopifyCustomerId:fresh.shopifyCustomerId,...proof,
     consentDigestSecret
   });
   if(!decision.ok){
     if(!await deps.settle(claim,'suppressed'))return 'uncertain';
     return 'suppressed';
   }
   // The fresh Shopify check, verified recipient, opt-in and live Meta status
   // immediately precede the one-and-only provider attempt. No send here if
   // any prior guard is unavailable.
   providerAttempted=true;
   const accepted=await deps.sendApprovedTemplate({
     claim,phone:decision.recipientPhone,
     templateName:decision.templateName,templateLanguage:decision.templateLanguage,
     checkoutRecoveryUrl:fresh.recoveryUrl
   });
   if(!accepted?.messageId||accepted.messageId.length>256)throw Error('ambiguous_provider_acceptance');
   if(!await deps.settle(claim,'accepted',accepted.messageId))return 'uncertain';
   return 'accepted';
 }catch{
   // Transport failures may mean the provider accepted the message; NEVER
   // automatically reset claimed -> pending or retry the provider.
   try{await deps.settle(claim,'uncertain');}catch{/* operator reconciliation */}
   return 'uncertain';
 }
}

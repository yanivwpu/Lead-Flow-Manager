import type {AbandonedCheckoutSnapshot,CheckoutSourcePage} from './abandonedCheckoutSource';
import type {FreshRecoveryResult} from './checkoutFreshRecheck';

export type RecoveryAutoPrepEnvironment={
 RAILWAY_ENVIRONMENT_NAME?:string;APP_URL?:string;
 ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED?:string;
 ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED?:string;
 ECOMMERCE_RECOVERY_AUTOPREP_ENABLED?:string;
 ECOMMERCE_RECOVERY_WORKER_MODE?:string;
 ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID?:string;
 ECOMMERCE_RECOVERY_TEMPLATE_NAME?:string;
};
const ACCOUNT=/^[a-zA-Z0-9][a-zA-Z0-9_-]{5,127}$/;
const TEMPLATE=/^[a-z][a-z0-9_]{0,511}$/;
/** Independent, operator-only auto-prepare switch. No customer sending here.
 * A staging merchant is named explicitly; no global/multimerchant loop.
 */
export function recoveryAutoPrepEnabled(env:RecoveryAutoPrepEnvironment):boolean{
 return env.RAILWAY_ENVIRONMENT_NAME==='staging' &&
   env.APP_URL?.replace(/\/$/,'')==='https://whachatcrm-staging-app-staging.up.railway.app' &&
   env.ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED==='true' &&
   env.ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED==='true' &&
   env.ECOMMERCE_RECOVERY_AUTOPREP_ENABLED==='true' &&
   env.ECOMMERCE_RECOVERY_WORKER_MODE==='staging-test-only' &&
   !!env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID &&
   ACCOUNT.test(env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID) &&
   !!env.ECOMMERCE_RECOVERY_TEMPLATE_NAME &&
   TEMPLATE.test(env.ECOMMERCE_RECOVERY_TEMPLATE_NAME);
}
export type AutoPrepMerchant={
 accountId:string;shop:string;accessToken:string;
};
export type DueRecoveryObservation={checkoutId:string;lastActivityAt:string};
export type PreparedRecoveryIdentity={
 contactId:string;templateId:string;shopifyCustomerId:string;
};
/** Fixed, privacy-safe staging gate labels. No customer IDs, phone, checkout URL,
 * token or raw provider errors must appear in the diagnostic stream.
 */
export type AutoPrepDiagnostic =
  | 'merchant_not_eligible'
  | 'checkout_completed'
  | 'shopify_status_unavailable'
  | 'shopify_query_unavailable'
  | 'checkout_not_confirmed'
  | 'checkout_status_unknown'
  | 'new_order_or_order_status_unknown'
  | 'shopify_customer_identity_unverified'
  | 'checkout_timestamp_unverified'
  | 'recovery_url_unverified'
  | 'invalid_checkout_or_shop'
  | 'other_fresh_checkout_block'
  | 'contact_consent_template_unmatched'
  | 'outbox_not_prepared';
const knownFreshBlockCodes=new Set<string>([
  'shopify_status_unavailable','shopify_query_unavailable','checkout_not_confirmed',
  'checkout_status_unknown','new_order_or_order_status_unknown',
  'shopify_customer_identity_unverified','checkout_timestamp_unverified',
  'recovery_url_unverified','invalid_checkout_or_shop'
]);
export type AutoPrepDeps={
 onDiagnostic?: (code:AutoPrepDiagnostic)=>void;
 merchant:(accountId:string)=>Promise<AutoPrepMerchant|null>;
 observePage:(merchant:AutoPrepMerchant)=>Promise<CheckoutSourcePage>;
 persistObservation:(merchant:AutoPrepMerchant,snapshot:AbandonedCheckoutSnapshot)=>Promise<boolean>;
 due:(merchant:AutoPrepMerchant)=>Promise<DueRecoveryObservation[]>;
 recheck:(merchant:AutoPrepMerchant,checkoutId:string)=>Promise<FreshRecoveryResult>;
 suppress:(merchant:AutoPrepMerchant,checkoutId:string)=>Promise<boolean>;
 resolveIdentity:(merchant:AutoPrepMerchant,shopifyCustomerId:string,templateName:string)=>Promise<PreparedRecoveryIdentity|null>;
 prepareAndEnqueue:(merchant:AutoPrepMerchant,checkoutId:string,lastActivityAt:string,match:PreparedRecoveryIdentity)=>Promise<boolean>;
};
/** Observation -> Shopify purchase recheck -> exact customer & consent lookup ->
 * unique durable queue. No Meta send or recipient payload crosses this surface.
 * Only first page and at most 3 due checkouts per 90-second tick.
 */
export async function runAutoRecoveryPreparationTick(
 env:RecoveryAutoPrepEnvironment,deps:AutoPrepDeps
):Promise<{disabled?:true;observed:number;checked:number;queued:number;suppressed:number;skipped:number}>{
 const stats={observed:0,checked:0,queued:0,suppressed:0,skipped:0};
 if(!recoveryAutoPrepEnabled(env))return {disabled:true,...stats};
 const accountId=env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID!;
 const merchant=await deps.merchant(accountId);
 if(!merchant||merchant.accountId!==accountId ||
   !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(merchant.shop) ||
   !merchant.accessToken){
     deps.onDiagnostic?.('merchant_not_eligible');
     return stats;
   }
 const page=await deps.observePage(merchant);
 if(!Array.isArray(page.observations)||page.observations.length>25)
   throw Error('invalid_checkout_observation_page');
 for(const item of page.observations){
   if(await deps.persistObservation(merchant,item))stats.observed++;
 }
 const due=await deps.due(merchant);
 if(!Array.isArray(due)||due.length>25)throw Error('invalid_due_checkout_batch');
 for(const item of due.slice(0,3)){
   const current=await deps.recheck(merchant,item.checkoutId);
   stats.checked++;
   if(current.status==='blocked'){
     deps.onDiagnostic?.(current.completed?'checkout_completed':
       knownFreshBlockCodes.has(current.reason)
         ? current.reason as AutoPrepDiagnostic : 'other_fresh_checkout_block');
     if(current.completed){
       if(await deps.suppress(merchant,item.checkoutId))stats.suppressed++;
     }else stats.skipped++;
     continue;
   }
   // A changed checkout resets the delay in the transaction.
   // Never infer the shopper from an email/phone or Shopify marketing opt-in.
   const match=await deps.resolveIdentity(merchant,current.shopifyCustomerId,
     env.ECOMMERCE_RECOVERY_TEMPLATE_NAME!);
   if(!match || match.shopifyCustomerId!==current.shopifyCustomerId){
     stats.skipped++;
     deps.onDiagnostic?.('contact_consent_template_unmatched');
     continue;
   }
   if(await deps.prepareAndEnqueue(merchant,item.checkoutId,current.lastActivityAt,match))
     stats.queued++;
   else {
     stats.skipped++;
     deps.onDiagnostic?.('outbox_not_prepared');
   }
 }
 return stats;
}

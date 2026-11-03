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
 ECOMMERCE_RECOVERY_PRODUCTION_PREP_APPROVED?:string;
 ECOMMERCE_RECOVERY_WORKER_ALLOWED_SHOP?:string;
 ECOMMERCE_RECOVERY_SEND_ENABLED?:string;
 ECOMMERCE_RECOVERY_OBSERVATION_ONLY?:string;
};
const ACCOUNT=/^[a-zA-Z0-9][a-zA-Z0-9_-]{5,127}$/;
const TEMPLATE=/^[a-z][a-z0-9_]{0,511}$/;
/** Independent, operator-only auto-prepare switch. Never grants permission
 * to send: recoveryDeliveryExecutionEnabled() remains staging-only.
 * Production requires a separate exact-store, exact-account no-send pilot.
 */
const SHOP=/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
export function recoveryAutoPrepEnabled(env:RecoveryAutoPrepEnvironment):boolean{
 const base=env.ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED==='true' &&
   env.ECOMMERCE_RECOVERY_AUTOPREP_ENABLED==='true' &&
   !!env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID &&
   ACCOUNT.test(env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID);
 if(!base)return false;
 const prep=env.ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED==='true' &&
   !!env.ECOMMERCE_RECOVERY_TEMPLATE_NAME &&
   TEMPLATE.test(env.ECOMMERCE_RECOVERY_TEMPLATE_NAME);
 const staging=env.RAILWAY_ENVIRONMENT_NAME==='staging' &&
   env.APP_URL?.replace(/\/$/,'')==='https://whachatcrm-staging-app-staging.up.railway.app' &&
   env.ECOMMERCE_RECOVERY_WORKER_MODE==='staging-test-only' &&
   prep;
 const productionBase=env.RAILWAY_ENVIRONMENT_NAME==='production' &&
   env.APP_URL?.replace(/\/$/,'')==='https://app.whachatcrm.com' &&
   env.ECOMMERCE_RECOVERY_PRODUCTION_PREP_APPROVED==='true' &&
   env.ECOMMERCE_RECOVERY_SEND_ENABLED!=='true' &&
   typeof env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_SHOP==='string' &&
   SHOP.test(env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_SHOP);
 const productionPrep=productionBase &&
   env.ECOMMERCE_RECOVERY_WORKER_MODE==='production-pilot-no-send' &&
   prep && env.ECOMMERCE_RECOVERY_OBSERVATION_ONLY!=='true';
 const productionObservationOnly=productionBase &&
   env.ECOMMERCE_RECOVERY_WORKER_MODE==='production-pilot-observe-only' &&
   env.ECOMMERCE_RECOVERY_OBSERVATION_ONLY==='true' &&
   env.ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED!=='true';
 return staging||productionPrep||productionObservationOnly;
}
export type AutoPrepMerchant={
 accountId:string;shop:string;accessToken:string;
};
export type DueRecoveryObservation={checkoutId:string;lastActivityAt:string};
export type PreparedRecoveryIdentity={
 contactId:string;templateId:string;shopifyCustomerId:string;
};
export type AutoPrepDeps={
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
   !SHOP.test(merchant.shop) ||
   (env.RAILWAY_ENVIRONMENT_NAME==='production' &&
     merchant.shop!==env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_SHOP) ||
   !merchant.accessToken)return stats;
 const page=await deps.observePage(merchant);
 if(!Array.isArray(page.observations)||page.observations.length>25)
   throw Error('invalid_checkout_observation_page');
 for(const item of page.observations){
   if(await deps.persistObservation(merchant,item))stats.observed++;
 }
 // Observation-only production pilot never inspects recipients, consent or
 // templates, never creates intents/outbox records, and cannot invoke Meta.
 if(env.RAILWAY_ENVIRONMENT_NAME==='production' &&
    env.ECOMMERCE_RECOVERY_WORKER_MODE==='production-pilot-observe-only')
   return stats;
 const due=await deps.due(merchant);
 if(!Array.isArray(due)||due.length>25)throw Error('invalid_due_checkout_batch');
 for(const item of due.slice(0,3)){
   const current=await deps.recheck(merchant,item.checkoutId);
   stats.checked++;
   if(current.status==='blocked'){
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
     stats.skipped++;continue;
   }
   if(await deps.prepareAndEnqueue(merchant,item.checkoutId,current.lastActivityAt,match))
     stats.queued++;
   else stats.skipped++;
 }
 return stats;
}

import type {ClaimedRecoveryDelivery} from './checkoutRecoveryDeliveryWorker';
import {processClaimedRecoveryDelivery,recoveryDeliveryExecutionEnabled} from './checkoutRecoveryDeliveryWorker';

/** Server-side only. Test-store allowlist and an independent manual approval
 * flag are required IN ADDITION to the already-disabled outbound send gates.
 * Scheduling never runs for production. At most one delivery is claimed/tick.
 */
export type RecoveryWorkerEnvironment={
 RAILWAY_ENVIRONMENT_NAME?:string;APP_URL?:string;
 ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED?:string;
 ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED?:string;
 ECOMMERCE_RECOVERY_SEND_ENABLED?:string;
 ECOMMERCE_RECOVERY_WORKER_ENABLED?:string;
 ECOMMERCE_RECOVERY_WORKER_MODE?:string;
 ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID?:string;
 ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID?:string;
};
const ACCOUNT=/^[a-zA-Z0-9][a-zA-Z0-9_-]{5,127}$/;
const CHECKOUT=/^gid:\/\/shopify\/AbandonedCheckout\/[1-9][0-9]{0,19}$/;
export function recoveryWorkerEnabled(env:RecoveryWorkerEnvironment):boolean{
 return recoveryDeliveryExecutionEnabled(env) &&
   env.ECOMMERCE_RECOVERY_WORKER_ENABLED==='true' &&
   env.ECOMMERCE_RECOVERY_WORKER_MODE==='staging-test-only' &&
   !!env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID &&
   ACCOUNT.test(env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID) &&
   !!env.ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID &&
   CHECKOUT.test(env.ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID);
}
type WorkerDeps={
 claim:(accountId:string,checkoutId:string)=>Promise<ClaimedRecoveryDelivery|null>;
 process:(claim:ClaimedRecoveryDelivery,env:RecoveryWorkerEnvironment)=>Promise<'accepted'|'suppressed'|'uncertain'>;
};
/** One shot, caller handles interval and global in-process mutex.
 * There is NEVER a fallback retry after an ambiguous Meta acceptance.
 */
export async function runRecoveryWorkerTick(
 env:RecoveryWorkerEnvironment,deps:WorkerDeps
):Promise<'disabled'|'empty'|'accepted'|'suppressed'|'uncertain'>{
 if(!recoveryWorkerEnabled(env))return 'disabled';
 const accountId=env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID!;
 const checkoutId=env.ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID!;
 const claimed=await deps.claim(accountId,checkoutId);
 if(!claimed)return 'empty';
 if(claimed.accountId!==accountId || claimed.checkoutId!==checkoutId)
   return 'uncertain';
 return deps.process(claimed,env);
}
/** Reserved for explicit reviewed server bootstrap. No worker starts from an
 * import, webhook request, merchant UI or an automatically applied migration.
 */
export function startStagingRecoveryWorkerScheduler(
 env:RecoveryWorkerEnvironment,deps:WorkerDeps,
 onError:(error:unknown)=>void
):null|(()=>void){
 if(!recoveryWorkerEnabled(env))return null;
 let busy=false,closed=false;
 const tick=async()=>{
   if(busy||closed)return;
   busy=true;
   try{
     const result=await runRecoveryWorkerTick(env,deps);
     // Operator approved one exact checkout. Stop the scheduler after
     // a single claim/attempt, irrespective of the outcome.
     if(result!=='empty' && result!=='disabled'){
       closed=true;
       clearInterval(timer);
     }
   }catch(e){onError(e);}finally{busy=false;}
 };
 const timer=setInterval(()=>{void tick()},90_000);
 timer.unref?.();
 return ()=>{closed=true;clearInterval(timer)};
}
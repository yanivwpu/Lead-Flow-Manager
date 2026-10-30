import {db} from '../../drizzle/db';
import {sendMetaWhatsAppTemplate} from '../userMeta';
import {postPurchasePreparation} from './postPurchaseRuntime';
import {createPostPurchaseDelivery} from './postPurchaseDelivery';
import {postPurchaseOperatorReady} from './postPurchaseActivation';

const delivery=createPostPurchaseDelivery({database:db,env:process.env,
  secret:()=>process.env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY||'',
  authorize:postPurchasePreparation.authorizeDelivery,
  send:(account,phone,name,language,components,tx,authorizeDispatch)=>sendMetaWhatsAppTemplate(account,phone,name,language,components,{signal:AbortSignal.timeout(10_000),suppressionExecutor:tx,authorizeDispatch}),
});
export function startPostPurchaseDelivery():null|(()=>void){
  const account=process.env.ECOMMERCE_POST_PURCHASE_DELIVERY_ACCOUNT_ID||'';
  if(!postPurchaseOperatorReady(process.env,account))return null;
  let busy=false;
  const timer=setInterval(()=>{if(busy)return;busy=true;
    void delivery.tick().catch(()=>console.error('[PostPurchase] delivery_tick_failed')).finally(()=>{busy=false;});
  },90_000);
  timer.unref?.();return ()=>clearInterval(timer);
}

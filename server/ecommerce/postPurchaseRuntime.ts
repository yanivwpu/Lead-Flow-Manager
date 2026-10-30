import {db} from '../../drizzle/db';
import {customerPrivacyLocked} from '../shopifyPrivacyRequests';
import {getMetaMessageTemplates} from '../userMeta';
import {createPostPurchasePreparation} from './postPurchasePreparation';
import {postPurchasePreparationEnabled} from './postPurchaseGate';
/** No delivery/sender import, and no migration/bootstrap capability. */
export const postPurchasePreparation=createPostPurchasePreparation({
  database:db,env:process.env,secret:()=>process.env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY||'',
  privacyLocked:(tx,shop,customerId)=>customerPrivacyLocked(shop,{id:customerId.slice('gid://shopify/Customer/'.length)},tx as unknown as typeof db),
  templates:accountId=>getMetaMessageTemplates(accountId,{signal:AbortSignal.timeout(8000)}),
});
export function startPostPurchasePreparation():null|(()=>void){
  if(!postPurchasePreparationEnabled(process.env))return null;
  let busy=false,stopped=false;
  const timer=setInterval(()=>{if(busy||stopped)return;busy=true;
    void postPurchasePreparation.tick().catch(()=>console.error('[PostPurchase] preparation_tick_failed')).finally(()=>{busy=false;});
  },90_000);timer.unref?.();
  return ()=>{stopped=true;clearInterval(timer);};
}

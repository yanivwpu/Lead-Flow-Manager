import {sql} from 'drizzle-orm';
import {db} from '../../drizzle/db';
import {sendMetaWhatsAppTemplate} from '../userMeta';
import {loadMerchantRelease,merchantProductionAvailable} from './merchantRelease';
import {postPurchasePreparation} from './postPurchaseRuntime';
import {createPostPurchaseDelivery} from './postPurchaseDelivery';
import {runMerchantRecoveryPreparation} from './checkoutRecoveryAutoPreparationRuntime';
import {runMerchantRecoveryDelivery} from './checkoutRecoveryWorkerRuntime';

/** Reuses the existing bounded workers/outboxes; no new queue or infrastructure.
 * Only explicit, connection-bound merchant enrollments are selected. A persisted
 * review timestamp rotates work across merchants and suppresses overlapping ticks.
 */
export function startMerchantAutomations():null|(()=>void){
  if(!merchantProductionAvailable(process.env))return null;
  let busy=false,closed=false;
  const tick=async()=>{
    if(busy||closed)return;busy=true;
    try{
      const accounts=await db.transaction(async tx=>{
        const rows=await tx.execute(sql`SELECT user_id FROM integrations
          WHERE type='shopify' AND is_active IS TRUE AND config->'ecommerceMerchantRelease'->>'version'='1'
            AND user_id<>${process.env.ECOMMERCE_PILOT_WORKSPACE_ID??''}
            AND COALESCE(config->>'ecommerceMerchantWorkerCheckedAt','')<${new Date(Date.now()-90_000).toISOString()}
          ORDER BY COALESCE(config->>'ecommerceMerchantWorkerCheckedAt',''),id LIMIT 3 FOR UPDATE SKIP LOCKED`);
        for(const row of rows.rows)await tx.execute(sql`UPDATE integrations SET config=jsonb_set(config,
          '{ecommerceMerchantWorkerCheckedAt}',${JSON.stringify(new Date().toISOString())}::jsonb,true)
          WHERE user_id=${row.user_id} AND type='shopify' AND is_active IS TRUE`);
        return rows.rows.map(row=>String(row.user_id));
      });
      for(const accountId of accounts){
        if(closed)break;
        try{
          const release=await db.transaction(tx=>loadMerchantRelease(tx,process.env,accountId));
          if(!release)continue;
          if(release.config.ecommercePostPurchaseDeliveryEnabled===true){
            await postPurchasePreparation.tick(accountId);
            await createPostPurchaseDelivery({database:db,env:process.env,merchantAccountId:accountId,
              secret:()=>process.env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY||'',
              authorize:postPurchasePreparation.authorizeDelivery,
              send:(account,phone,name,language,components,tx,authorizeDispatch)=>sendMetaWhatsAppTemplate(account,phone,name,language,components,
                {signal:AbortSignal.timeout(10_000),suppressionExecutor:tx,authorizeDispatch}),
            }).tick();
          }
          if(release.config.ecommerceCheckoutRecoveryDeliveryEnabled===true){
            await runMerchantRecoveryPreparation(accountId);
            await runMerchantRecoveryDelivery(accountId);
          }
        }catch{console.error('[MerchantAutomations] merchant_tick_unavailable');}
      }
    }catch{console.error('[MerchantAutomations] tick_unavailable');}
    finally{busy=false;}
  };
  const timer=setInterval(()=>{void tick();},90_000);timer.unref?.();
  return()=>{closed=true;clearInterval(timer);};
}

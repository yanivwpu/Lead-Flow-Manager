import {validRecoveryWamid} from './checkoutRecoveryInboundConsentGate';
import {sql,type SQL} from 'drizzle-orm';
import type {PostPurchaseDatabase,PostPurchaseTx,createPostPurchasePreparation} from './postPurchasePreparation';
import {postPurchaseOperatorReady} from './postPurchaseActivation';
import {claimPostPurchaseDeliveryQuery,enqueuePostPurchaseDeliveryQuery,recordPostPurchaseAttemptQuery,
  settlePostPurchaseAttemptQuery,postPurchaseDeliveryReadinessQuery} from './postPurchaseDeliveryReadiness';
import {recoveryPhoneDigest} from './checkoutRecoveryMessagingEligibility';

type Claim={id:string;token:string;accountId:string;shop:string;installationId:string};
type Database=PostPurchaseDatabase&{execute:(q:SQL)=>Promise<{rows:Record<string,unknown>[]}>};
/** Internal-only worker. No routes, migrations, consent grants or automatic retries. */
export function createPostPurchaseDelivery(deps:{
  database:Database;env:Record<string,string|undefined>;secret:()=>string;
  authorize:ReturnType<typeof createPostPurchasePreparation>['authorizeDelivery'];
  send:(accountId:string,phone:string,name:string,language:string,components:Record<string,unknown>[],tx:PostPurchaseTx)=>Promise<{messageId:string}>;
}){
  const enabled=(accountId:string)=>postPurchaseOperatorReady({...deps.env,
    ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY:deps.secret()},accountId);
  async function locked<T>(shop:string,fn:(tx:PostPurchaseTx)=>Promise<T>){
    return deps.database.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop},0))`);
      return fn(tx);
    });
  }
  async function processClaim(claim:Claim){
    if(!enabled(claim.accountId))return 'disabled';
    // AUTOCOMMIT before authorization/provider IO: a crash or rolled-back send transaction
    // must never erase evidence that this claim has consumed its only provider opportunity.
    const fence=await deps.database.execute(recordPostPurchaseAttemptQuery(claim.id,claim.accountId,claim.shop,claim.token));
    if(fence.rows.length!==1)return 'fenced';
    try{
      return await locked(claim.shop,async tx=>{
        // Acquire DNC serialization before any contact row lock; provider reuses this transaction.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"marketing:"+claim.accountId},0))`);
        const rows=await tx.execute(sql`SELECT intent_id::text,contact_id,template_id,order_gid,journey
          FROM ecommerce_post_purchase_outbox WHERE id=${claim.id}::bigint
            AND account_id=${claim.accountId} AND shop=${claim.shop} AND installation_id=${claim.installationId}
            AND claim_token=${claim.token}::uuid AND state='claimed' AND provider_attempted_at IS NOT NULL FOR UPDATE`);
        const row=rows.rows[0];if(!row)throw Error('claim_unavailable');
        const proof=await deps.authorize(tx,claim,String(row.intent_id));
        if(!proof||proof.contactId!==row.contact_id||proof.templateId!==row.template_id||!enabled(claim.accountId)){
          await tx.execute(settlePostPurchaseAttemptQuery(claim.id,claim.accountId,claim.shop,claim.token,'uncertain'));
          return 'blocked';
        }
        await tx.execute(sql`UPDATE ecommerce_post_purchase_outbox SET recipient_hmac=${recoveryPhoneDigest(deps.secret(),proof.phone)}
          WHERE id=${claim.id}::bigint AND account_id=${claim.accountId} AND shop=${claim.shop}`);
        const response=await deps.send(claim.accountId,proof.phone,proof.templateName,proof.language,proof.components,tx);
        if(!validRecoveryWamid(response?.messageId))throw Error('provider_acceptance_unknown');
        const result=await tx.execute(settlePostPurchaseAttemptQuery(claim.id,claim.accountId,claim.shop,claim.token,'accepted',response.messageId));
        if(result.rows.length!==1)throw Error('provider_settlement_unknown');
        return 'accepted';
      });
    }catch{
      await deps.database.execute(settlePostPurchaseAttemptQuery(claim.id,claim.accountId,claim.shop,claim.token,'uncertain'));
      return 'uncertain';
    }
  }
  async function tick(){
    const accountId=deps.env.ECOMMERCE_POST_PURCHASE_DELIVERY_ACCOUNT_ID??'';
    if(!enabled(accountId))return 'disabled';
    const schema=await deps.database.execute(postPurchaseDeliveryReadinessQuery);
    if(!schema.rows[0]?.outbox||!schema.rows[0]?.intents||!schema.rows[0]?.consents)return 'schema_missing';
    const owner=await deps.database.execute(sql`SELECT shopify_shop FROM users WHERE id=${accountId}`);
    const shop=owner.rows[0]?.shopify_shop;
    if(typeof shop!=='string'||!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop))return 'unavailable';
    const claim=await locked(shop,async tx=>{
      const active=await tx.execute(sql`SELECT id,config FROM integrations WHERE user_id=${accountId}
        AND type='shopify' AND is_active IS TRUE LIMIT 2 FOR SHARE`);
      if(active.rows.length!==1)return null;
      const config=active.rows[0].config as Record<string,unknown>|null;
      if(config?.ecommercePostPurchaseDeliveryEnabled!==true)return null;
      const installationId=String(active.rows[0].id);
      const due=await tx.execute(sql`SELECT i.id::text FROM ecommerce_post_purchase_intents i WHERE i.account_id=${accountId}
        AND i.shop=${shop} AND i.installation_id=${installationId} AND i.state='preview_ready' AND i.due_at<=NOW()
        AND NOT EXISTS(SELECT 1 FROM ecommerce_post_purchase_outbox o WHERE o.intent_id=i.id)
        ORDER BY i.id LIMIT 3`);
      for(const row of due.rows)await tx.execute(enqueuePostPurchaseDeliveryQuery(accountId,shop,installationId,String(row.id)));
      const picked=await tx.execute(claimPostPurchaseDeliveryQuery(accountId,shop,installationId));
      return picked.rows.length===1?{id:String(picked.rows[0].id),token:String(picked.rows[0].claim_token),accountId,shop,installationId}:null;
    });
    return claim?processClaim(claim):'idle';
  }
  return {tick,processClaim};
}

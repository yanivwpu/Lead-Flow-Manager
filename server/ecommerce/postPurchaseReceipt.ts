import {sql} from 'drizzle-orm';
import type {PostPurchaseDatabase} from './postPurchasePreparation';
import {parseSignedRecoveryReceipt,type MetaRecoveryReceiptCandidate} from './checkoutRecoveryMetaReceipts';
import {reconcilePostPurchaseReceiptQuery} from './postPurchaseDeliveryReadiness';

/** Receipt capture is independent of the send switch; stopping sends must preserve reconciliation. */
export function createPostPurchaseReceipt(deps:{database:PostPurchaseDatabase;env:Record<string,string|undefined>;secret:()=>string}){
  return async (accountId:string,candidate:MetaRecoveryReceiptCandidate)=>{
    if(deps.env.ECOMMERCE_POST_PURCHASE_RECEIPTS_ENABLED!=='true')return 'disabled';
    const receipt=parseSignedRecoveryReceipt(candidate,deps.secret());
    if(!receipt||!accountId)return 'ignored';
    return deps.database.transaction(async tx=>{
      const before=await tx.execute(sql`SELECT shopify_shop FROM users WHERE id=${accountId}`);
      const shop=before.rows[0]?.shopify_shop;
      if(typeof shop!=='string'||!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop))return 'ignored';
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop},0))`);
      const owner=await tx.execute(sql`SELECT id FROM users WHERE id=${accountId} AND shopify_shop=${shop}
        AND meta_connected IS TRUE AND meta_phone_number_id=${candidate.phoneNumberId} FOR SHARE`);
      if(owner.rows.length!==1)return 'ignored';
      const schema=await tx.execute(sql`SELECT to_regclass('ecommerce_post_purchase_outbox') IS NOT NULL AS ready`);
      if(schema.rows[0]?.ready!==true)return 'unavailable';
      const result=await tx.execute(reconcilePostPurchaseReceiptQuery({accountId,shop,
        recipientDigest:receipt.recipientDigest,eventAt:receipt.eventAt,providerMessageId:receipt.messageId,status:receipt.status}));
      return result.rows.length===1?'recorded':'ignored';
    });
  };
}

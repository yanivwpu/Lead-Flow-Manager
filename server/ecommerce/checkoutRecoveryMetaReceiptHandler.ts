import { and,eq,sql } from 'drizzle-orm';
import {db} from '../../drizzle/db';
import {users} from '@shared/schema';
import {metaRecoveryReceiptCaptureEnabled} from './checkoutRecoveryMetaReceiptGate';
import {parseSignedRecoveryReceipt,
 applySignedRecoveryReceiptQuery,type MetaRecoveryReceiptCandidate
} from './checkoutRecoveryMetaReceipts';

export async function recordRecoveryReceiptFromVerifiedMeta(input:{
 accountId:string;candidate:MetaRecoveryReceiptCandidate;secret:string;
 env:Parameters<typeof metaRecoveryReceiptCaptureEnabled>[0];
}):Promise<'disabled'|'ignored'|'recorded'>{
 if(!metaRecoveryReceiptCaptureEnabled(input.env))return 'disabled';
 const receipt=parseSignedRecoveryReceipt(input.candidate,input.secret);
 if(!receipt||!input.accountId)return 'ignored';
 return db.transaction(async tx=>{
   const [owner]=await tx.select().from(users).where(eq(users.id,input.accountId)).limit(1);
   const shop=owner?.shopifyShop;
   if(!owner || !owner.metaConnected ||
      owner.metaPhoneNumberId!==input.candidate.phoneNumberId ||
      !shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop))
     return 'ignored';
   // Serialize with Shopify signed privacy erasure and uninstall.
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop},0))`);
   const [live]=await tx.select().from(users)
     .where(and(eq(users.id,input.accountId),eq(users.shopifyShop,shop)))
     .for('share').limit(1);
   if(!live?.metaConnected || live.metaPhoneNumberId!==input.candidate.phoneNumberId)
     return 'ignored';
   const schema=await tx.execute(sql`
     SELECT to_regclass('public.ecommerce_checkout_recovery_outbox') IS NOT NULL AS outbox,
       to_regclass('public.ecommerce_whatsapp_recovery_consents') IS NOT NULL AS consents,
       EXISTS(SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='ecommerce_checkout_recovery_outbox'
           AND column_name='meta_delivery_status') AS receipts`);
   if(schema.rows[0]?.outbox!==true || schema.rows[0]?.consents!==true ||
      schema.rows[0]?.receipts!==true)throw Error('meta_recovery_receipt_schema_unavailable');
   const result=await tx.execute(applySignedRecoveryReceiptQuery({
     accountId:input.accountId,shop,receipt
   }));
   return result.rows.length===1?'recorded':'ignored';
 });
}

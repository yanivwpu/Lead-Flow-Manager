import { sql } from 'drizzle-orm';
import type { CatalogDb } from '../salesCatalog/commerceStore';
import { checkoutReceiptCodec } from '../shopping/checkout/attempts';
import type { CheckoutReceipt } from '../shopping/checkout/contract';
import type { ExecutionDiagnostic } from '../shopping/checkout/executionDiagnostics';
import { TestChatError } from './sessions';

// Separate release approval required. Neither browser input nor an env flag enables this.
export const PRIVATE_CART_SECOND_EXECUTION_ENABLED = false;
export type SecondCartBinding = {workspaceId:string;operatorId:string;shop:string;integrationId:string;installationDigest:string};
export function privateCartReceiptCodec(env:NodeJS.ProcessEnv) {
 const encoded=env.SHOPPING_CHECKOUT_RECEIPT_KEY??'';
 if(!/^[A-Za-z0-9+/]{43}=$/.test(encoded))throw new TestChatError(503,'private_cart_receipt_setup_required');
 return checkoutReceiptCodec(Buffer.from(encoded,'base64'));
}
const denied=()=>new TestChatError(409,'private_cart_second_authorization_unavailable');
/** A manually approved, single second-attempt slot. The original consumed row/index stays intact.
 * No provisioning, reset, lease stealing, provider call or retry capability exists here. */
export function secondCartAuthorization(db:CatalogDb,b:SecondCartBinding) {
 const setup=async()=>{
  const result=await db.execute(sql`SELECT i.indisunique,i.indisvalid,i.indisready FROM pg_index i
   WHERE i.indrelid=to_regclass('public.shopify_private_cart_second_authorization') AND i.indisprimary
   AND i.indnkeyatts=1 AND pg_get_indexdef(i.indexrelid,1,true)='attempt_number' AND i.indpred IS NULL
   AND EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=i.indrelid
     AND t.tgname='preserve_private_cart_second_authorization' AND t.tgenabled='O' AND NOT t.tgisinternal)`);
  const index=result.rows[0];if(!index?.indisunique||!index.indisvalid||!index.indisready)throw denied();
 };
 const owned=sql`a.attempt_number=2 AND a.workspace_id=${b.workspaceId} AND a.operator_id=${b.operatorId}
   AND a.approved_by=${b.operatorId} AND a.shop=${b.shop} AND a.integration_id=${b.integrationId}
   AND a.installation_digest=${b.installationDigest}`;
 const original=sql`EXISTS (SELECT 1 FROM public.shopify_checkout_admin_tests old
   WHERE old.request_id=a.original_request_id AND old.shop=a.shop AND old.workspace_id=a.workspace_id
   AND old.operator_id=a.operator_id AND old.claimed_at IS NOT NULL)`;
 return {
  async available(id?:string,claimedRequest?:string) {
   await setup();
   const result=await db.execute(sql`SELECT a.authorization_id FROM public.shopify_private_cart_second_authorization a
    WHERE ${owned} AND ${original} AND a.expires_at>now() AND a.revoked_at IS NULL
    AND ${id?sql`a.authorization_id=${id}::uuid`:sql`true`}
    AND ${claimedRequest?sql`a.request_id=${claimedRequest}::uuid AND a.claimed_at IS NOT NULL`:sql`a.claimed_at IS NULL`}`);
   const value=result.rows[0]?.authorization_id;if(typeof value!=='string')throw denied();return value;
  },
  async claim(id:string,requestId:string,digest:string) {
   await setup();
   const result=await db.execute(sql`UPDATE public.shopify_private_cart_second_authorization a
    SET request_id=${requestId}::uuid,scope_digest=${digest},claimed_at=now(),
      diagnostic=jsonb_build_object('stage','claim_commit','claim','committed','dispatchStarted',false,'cartReported',false,'receiptValidated',false)
    WHERE ${owned} AND ${original} AND a.authorization_id=${id}::uuid AND a.claimed_at IS NULL AND a.expires_at>now() AND a.revoked_at IS NULL
    AND EXISTS (SELECT 1 FROM public.shopify_checkout_admin_tests r WHERE r.request_id=${requestId}::uuid
      AND r.workspace_id=a.workspace_id AND r.operator_id=a.operator_id AND r.shop=a.shop
      AND r.integration_id=a.integration_id AND r.installation_digest=a.installation_digest
      AND r.selection->>'authorizationId'=a.authorization_id::text
      AND r.claimed_at IS NULL AND r.expires_at>now()) RETURNING authorization_id`);
   if(result.rows.length!==1)throw denied();
  },
  async persist(id:string,requestId:string,event:ExecutionDiagnostic,receipt?:{value:CheckoutReceipt;env:NodeJS.ProcessEnv},verified=false,events:readonly ExecutionDiagnostic[]=[]) {
   // event is constructed by the existing fixed-vocabulary diagnostics, not provider input.
   const encrypted=receipt?privateCartReceiptCodec(receipt.env).seal(receipt.value,`${id}:${requestId}`):undefined;
   const result=await db.execute(sql`UPDATE public.shopify_private_cart_second_authorization a SET
    diagnostic=${JSON.stringify({...event,events:events.slice(-64)})}::jsonb,
    dispatch_started_at=CASE WHEN ${event.dispatchStarted} THEN COALESCE(a.dispatch_started_at,now()) ELSE a.dispatch_started_at END,
    encrypted_receipt=COALESCE(${encrypted??null},a.encrypted_receipt),
    receipt_at=CASE WHEN ${!!receipt} THEN COALESCE(a.receipt_at,now()) ELSE a.receipt_at END,
    verified_at=CASE WHEN ${verified} THEN now() ELSE a.verified_at END
    WHERE ${owned} AND a.authorization_id=${id}::uuid AND a.request_id=${requestId}::uuid AND a.claimed_at IS NOT NULL AND a.revoked_at IS NULL
    RETURNING authorization_id`);
   if(result.rows.length!==1)throw denied();
  },
 };
}

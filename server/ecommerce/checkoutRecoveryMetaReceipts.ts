import { sql } from 'drizzle-orm';
import { recoveryPhoneDigest } from './checkoutRecoveryMessagingEligibility';

export type MetaRecoveryReceiptCandidate={
  signatureValid:boolean;hasRawBody:boolean;phoneNumberId:string;
  messageId:string;recipientId:string;status:string;timestamp:string;
};
export type VerifiedRecoveryReceipt={
  messageId:string;recipientDigest:string;status:'sent'|'delivered'|'read'|'failed';eventAt:Date;
};
const statuses=['sent','delivered','read','failed'];
/** Only process delivery receipts from signed raw Meta webhooks. An inbound
 * ordinary CRM message or unsigned development bypass is NEVER evidence.
 */
export function parseSignedRecoveryReceipt(
  input:MetaRecoveryReceiptCandidate,secret:string,now=Date.now()
):VerifiedRecoveryReceipt|null {
  if(!input.signatureValid||!input.hasRawBody||secret.length<32 ||
     !/^[1-9][0-9]{5,24}$/.test(input.phoneNumberId)||
     !/^wamid\.[A-Za-z0-9._-]{8,250}$/.test(input.messageId)||
     !/^[1-9][0-9]{7,14}$/.test(input.recipientId)||
     !statuses.includes(input.status)||
     !/^[1-9][0-9]{8,11}$/.test(input.timestamp))return null;
  const when=Number(input.timestamp)*1000;
  if(!Number.isFinite(when)||when>now+5*60_000||
      when<now-31*24*60*60_000)return null;
  return {messageId:input.messageId,status:input.status as VerifiedRecoveryReceipt['status'],
    recipientDigest:recoveryPhoneDigest(secret,'+'+input.recipientId),
    eventAt:new Date(when)};
}
/** No outbox state is reset here. In particular, a failed Meta receipt never
 * requeues the checkout or sends a second reminder.
 * Recipient HMAC/tenant ownership match is required in addition to provider ID.
 * Duplicate/out-of-order delivery receipts are ignored deterministically.
 */
export function applySignedRecoveryReceiptQuery(
  input:{accountId:string;shop:string;receipt:VerifiedRecoveryReceipt}
){
  if(!input.accountId?.trim() ||input.accountId.length>128 ||
     !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(input.shop))
    throw Error('invalid_recovery_receipt_scope');
  const {receipt:r}=input;
  return sql`
    UPDATE ecommerce_checkout_recovery_outbox o
    SET meta_delivery_status=${r.status},
        meta_delivery_at=${r.eventAt},
        updated_at=NOW()
    FROM ecommerce_whatsapp_recovery_consents c
    WHERE o.account_id=${input.accountId} AND o.shop=${input.shop}
      AND o.provider_message_id=${r.messageId}
      AND o.state='accepted'
      AND c.account_id=o.account_id AND c.shop=o.shop
      AND c.contact_id=o.contact_id
      AND c.recipient_hmac=${r.recipientDigest}
      AND o.claimed_at IS NOT NULL
      AND ${r.eventAt} >= o.claimed_at - INTERVAL '5 minutes'
      AND (
        o.meta_delivery_status IS NULL
        OR (o.meta_delivery_status='sent' AND ${r.status} IN ('delivered','read','failed'))
        OR (o.meta_delivery_status='delivered' AND ${r.status}='read')
      )
    RETURNING o.id::text AS id
  `;
}

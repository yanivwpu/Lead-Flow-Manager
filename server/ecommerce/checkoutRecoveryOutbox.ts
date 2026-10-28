import { sql } from 'drizzle-orm';
const SHOP=/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const GID=/^gid:\/\/shopify\/AbandonedCheckout\/[1-9][0-9]{0,19}$/;
function assertTenant(x:{accountId:string;shop:string;checkoutId:string}){
 if(!x.accountId?.trim()||x.accountId.length>128||!SHOP.test(x.shop)||!GID.test(x.checkoutId))
   throw Error('invalid_recovery_delivery_key');
}
/** Privacy-scoped evidence read. Imported Shopify email/SMS permission is excluded.
 * No public route or merchant-controlled write endpoint creates these records.
 */
export function readRecoveryConsentQuery(input:{
 accountId:string;shop:string;contactId:string;shopifyCustomerId:string;
}){
 if(!input.accountId?.trim()||!SHOP.test(input.shop)||!input.contactId?.trim()||
    !/^gid:\/\/shopify\/Customer\/[1-9][0-9]{0,19}$/.test(input.shopifyCustomerId))
    throw Error('invalid_consent_identity');
 return sql`
   SELECT account_id,shop,contact_id,shopify_customer_gid,purpose,channel,
     evidence_source,recipient_hmac,granted_at,revoked_at
   FROM ecommerce_whatsapp_recovery_consents
   WHERE account_id=${input.accountId} AND shop=${input.shop}
     AND contact_id=${input.contactId}
     AND shopify_customer_gid=${input.shopifyCustomerId}
   LIMIT 1
 `;
}
/** An internal outbox entry can be created only for a ready, due, uncompleted,
 * tenant-owned intent with explicit consent evidence + a local approved
 * MARKETING template. This is NOT permission to call Meta; the worker
 * must fresh-recheck Shopify and Meta approval + contact opt-out again.
 */
export function enqueueRecoveryDeliveryQuery(input:{
 accountId:string;shop:string;checkoutId:string;contactId:string;
 templateId:string;shopifyCustomerId:string;
}){
 assertTenant(input);
 if(!input.contactId?.trim()||!input.templateId?.trim()||
   !/^gid:\/\/shopify\/Customer\/[1-9][0-9]{0,19}$/.test(input.shopifyCustomerId))
   throw Error('invalid_recovery_delivery_identity');
 return sql`
   INSERT INTO ecommerce_checkout_recovery_outbox
     (intent_id,account_id,shop,checkout_gid,contact_id,template_id,state)
   SELECT i.id,i.account_id,i.shop,i.checkout_gid,c.id,t.id,'pending'
   FROM ecommerce_checkout_recovery_intents i
   INNER JOIN ecommerce_abandoned_checkout_observations o
     ON o.account_id=i.account_id AND o.shop=i.shop AND o.checkout_gid=i.checkout_gid
   INNER JOIN contacts c ON c.id=${input.contactId} AND c.user_id=i.account_id
     AND COALESCE(c.custom_fields->>'shopifyCustomerId',
                  c.source_details->>'shopifyCustomerId') =
       REPLACE(${input.shopifyCustomerId},'gid://shopify/Customer/','')
     AND COALESCE(c.custom_fields->>'shopifyShop',
                  c.source_details->>'shop')=i.shop
     AND c.automations_paused=FALSE
   INNER JOIN ecommerce_whatsapp_recovery_consents consent
     ON consent.account_id=i.account_id AND consent.shop=i.shop
     AND consent.contact_id=c.id
     AND consent.shopify_customer_gid=${input.shopifyCustomerId}
     AND consent.channel='whatsapp' AND consent.purpose='checkout_recovery'
     AND consent.evidence_source='verified_whatsapp_explicit_opt_in'
     AND consent.revoked_at IS NULL
     AND consent.granted_at<=NOW()
     AND consent.granted_at>NOW()-INTERVAL '365 days'
   INNER JOIN message_templates t
     ON t.id=${input.templateId} AND t.user_id=i.account_id
     AND lower(t.category)='marketing' AND lower(t.status)='approved'
   WHERE i.account_id=${input.accountId} AND i.shop=${input.shop}
     AND i.checkout_gid=${input.checkoutId} AND i.status='ready'
     AND o.completed=FALSE AND o.recovery_url_available=TRUE AND o.next_review_at<=NOW()
   ON CONFLICT (intent_id) DO NOTHING
   RETURNING id::text AS id
 `;
}
/** At-most-once claim. No retry of claimed records after crash/timeout.
 * Only one worker obtains the same pending outbox row.
 * Claims do not constitute permission to send; MUST recheck all gates.
 */
export function claimRecoveryDeliveryQuery(input:{accountId:string;shop:string}){
 if(!input.accountId?.trim()||!SHOP.test(input.shop)) throw Error('invalid_claim_scope');
 return sql`
   WITH candidate AS (
     SELECT o.id FROM ecommerce_checkout_recovery_outbox o
     INNER JOIN ecommerce_checkout_recovery_intents i ON i.id=o.intent_id
     INNER JOIN ecommerce_abandoned_checkout_observations obs
       ON obs.account_id=o.account_id AND obs.shop=o.shop AND obs.checkout_gid=o.checkout_gid
     INNER JOIN ecommerce_whatsapp_recovery_consents consent
       ON consent.account_id=o.account_id AND consent.shop=o.shop
       AND consent.contact_id=o.contact_id
     WHERE o.account_id=${input.accountId} AND o.shop=${input.shop} AND o.state='pending'
       AND i.status='ready' AND obs.completed=FALSE AND obs.next_review_at<=NOW()
       AND consent.revoked_at IS NULL
     ORDER BY o.id LIMIT 1 FOR UPDATE OF o SKIP LOCKED
   )
   UPDATE ecommerce_checkout_recovery_outbox o
   SET state='claimed', claim_token=gen_random_uuid(), claimed_at=NOW(), updated_at=NOW()
   FROM candidate WHERE o.id=candidate.id
   RETURNING o.id::text AS id,o.account_id,o.shop,o.checkout_gid,
     o.contact_id,o.template_id,o.claim_token::text AS claim_token
 `;
}
/** Commit on the root connection BEFORE entering the provider transaction.
 * This fence intentionally survives a rolled-back send transaction. A lost
 * acknowledgement or crash sacrifices delivery rather than risking a resend.
 */
export function fenceRecoveryProviderAttemptQuery(input:{
 id:string;accountId:string;shop:string;claimToken:string;
}){
 if(!input.accountId?.trim() || !SHOP.test(input.shop) ||
    !/^[1-9][0-9]{0,18}$/.test(input.id) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.claimToken))
   throw Error('invalid_recovery_attempt_claim');
 return sql`
   UPDATE ecommerce_checkout_recovery_outbox
   SET provider_attempted_at=NOW(),updated_at=NOW()
   WHERE id=CAST(${input.id} AS BIGINT) AND account_id=${input.accountId}
     AND shop=${input.shop} AND claim_token=CAST(${input.claimToken} AS UUID)
     AND state='claimed' AND provider_attempted_at IS NULL
   RETURNING id::text AS id
 `;
}
/** Terminal, no automatic provider retries. Ambiguous acceptance -> uncertain. */
export function settleRecoveryDeliveryQuery(input:{
 id:string;accountId:string;shop:string;claimToken:string;
 outcome:'accepted'|'uncertain'|'suppressed';providerMessageId?:string|null;
}){
 if(!input.accountId?.trim()||!SHOP.test(input.shop)||
    !/^[1-9][0-9]{0,18}$/.test(input.id)||!/^[-0-9a-f]{36}$/i.test(input.claimToken)||
    (input.outcome==='accepted'
      ? !input.providerMessageId||input.providerMessageId.length>256
      : input.providerMessageId!=null)) throw Error('invalid_delivery_settlement');
 return sql`
   UPDATE ecommerce_checkout_recovery_outbox
   SET state=${input.outcome},
     provider_message_id=${input.outcome==='accepted'?input.providerMessageId!:null},
     updated_at=NOW()
   WHERE id=CAST(${input.id} AS BIGINT) AND account_id=${input.accountId}
     AND shop=${input.shop} AND claim_token=CAST(${input.claimToken} AS UUID)
     AND (state='claimed' OR
       (state='accepted' AND ${input.outcome}='accepted'
        AND provider_message_id=${input.providerMessageId ?? null}))
   RETURNING id::text AS id
 `;
}
/** A checkout purchase or consent revocation suppresses unsent entries.
 * Claimed sends may already be in-flight: reconcile separately; no safe promise
 * to cancel an already accepted provider call.
 */
export function suppressPendingRecoveryDeliveryQuery(input:{
 accountId:string;shop:string;checkoutId:string;
}){
 assertTenant(input);
 return sql`
   UPDATE ecommerce_checkout_recovery_outbox
   SET state='suppressed',updated_at=NOW()
   WHERE account_id=${input.accountId} AND shop=${input.shop}
     AND checkout_gid=${input.checkoutId} AND state='pending'
   RETURNING id::text AS id
 `;
}

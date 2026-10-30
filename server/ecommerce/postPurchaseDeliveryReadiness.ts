import {sql} from 'drizzle-orm';

/** Read-only schema presence; never grants permission to send. */
export const postPurchaseDeliveryReadinessQuery = sql`SELECT
  (to_regclass('ecommerce_post_purchase_outbox') IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['id','intent_id','account_id','installation_id','shop','order_gid',
      'journey','contact_id','template_id','state','claim_token','claimed_at','provider_attempted_at',
      'provider_message_id','recipient_hmac','meta_delivery_status','meta_delivery_at']) required(name)
      WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('ecommerce_post_purchase_outbox')
        AND a.attname=required.name AND a.attnum>0 AND NOT a.attisdropped))
    AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('ecommerce_post_purchase_outbox')
      AND tgname='ecommerce_postpurchase_preserve_attempt' AND tgenabled IN ('O','A'))
  ) AS outbox,
  to_regclass('ecommerce_post_purchase_intents') IS NOT NULL AS intents,
  to_regclass('ecommerce_post_purchase_consents') IS NOT NULL AS consents`;

const SHOP=/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
export function claimPostPurchaseDeliveryQuery(accountId:string,shop:string,installationId:string,intentId?:string){
  if(!accountId?.trim()||!SHOP.test(shop)||!installationId?.trim()||
    (intentId!==undefined&&!/^[1-9][0-9]{0,18}$/.test(intentId)))
    throw Error('invalid_delivery_scope');
  return sql`
    WITH candidate AS (
      SELECT o.id FROM ecommerce_post_purchase_outbox o
      JOIN ecommerce_post_purchase_intents i ON i.id=o.intent_id
        AND i.account_id=o.account_id AND i.shop=o.shop
        AND i.installation_id=o.installation_id AND i.journey=o.journey
      WHERE o.account_id=${accountId} AND o.shop=${shop}
        AND o.installation_id=${installationId} AND o.state='pending'
        AND i.state='preview_ready' AND i.due_at<=NOW()
        AND ${intentId===undefined?sql`TRUE`:sql`i.id=${intentId}::bigint`}
      ORDER BY o.id LIMIT 1 FOR UPDATE OF o SKIP LOCKED
    )
    UPDATE ecommerce_post_purchase_outbox o
    SET state='claimed',claim_token=gen_random_uuid(),claimed_at=NOW(),updated_at=NOW()
    FROM candidate WHERE o.id=candidate.id
    RETURNING o.id::text AS id,o.claim_token::text AS claim_token
  `;
}

/** Commit before requesting delivery. Missing or repeated claims affect zero rows. */
export function recordPostPurchaseAttemptQuery(id:string,accountId:string,shop:string,token:string,intentId?:string){
  if(!/^[1-9][0-9]{0,18}$/.test(id)||!accountId?.trim()||!SHOP.test(shop)||
    !/^[0-9a-f-]{36}$/i.test(token)||
    (intentId!==undefined&&!/^[1-9][0-9]{0,18}$/.test(intentId)))throw Error('invalid_delivery_attempt');
  return sql`
    UPDATE ecommerce_post_purchase_outbox
    SET provider_attempted_at=NOW(),updated_at=NOW()
    WHERE id=CAST(${id} AS BIGINT) AND account_id=${accountId}
      AND shop=${shop} AND claim_token=CAST(${token} AS UUID)
      AND state='claimed' AND provider_attempted_at IS NULL
      AND ${intentId===undefined?sql`TRUE`:sql`intent_id=${intentId}::bigint`}
    RETURNING id::text AS id
  `;
}

/** Terminal outcome: never makes the claimed record pending again. */
export function settlePostPurchaseAttemptQuery(
  id:string,accountId:string,shop:string,token:string,
  outcome:'accepted'|'uncertain',providerMessageId?:string
){
  if(!/^[1-9][0-9]{0,18}$/.test(id)||!accountId?.trim()||!SHOP.test(shop)||
    !/^[0-9a-f-]{36}$/i.test(token)||
    (outcome==='accepted'?!providerMessageId||providerMessageId.length>256:providerMessageId!==undefined))
    throw Error('invalid_delivery_settlement');
  return sql`
    UPDATE ecommerce_post_purchase_outbox
    SET state=${outcome},provider_message_id=${outcome==='accepted'?providerMessageId:null},
      updated_at=NOW()
    WHERE id=CAST(${id} AS BIGINT) AND account_id=${accountId}
      AND shop=${shop} AND claim_token=CAST(${token} AS UUID)
      AND state='claimed' AND provider_attempted_at IS NOT NULL
    RETURNING id::text AS id
  `;
}
/** Only unsent, unclaimed work may be suppressed. */
export function suppressPendingPostPurchaseQuery(accountId:string,shop:string,orderGid:string){
  if(!accountId?.trim()||!SHOP.test(shop)||
    !/^gid:\/\/shopify\/Order\/[1-9][0-9]{0,19}$/.test(orderGid))
    throw Error('invalid_delivery_suppression');
  return sql`
    UPDATE ecommerce_post_purchase_outbox
    SET state='suppressed',updated_at=NOW()
    WHERE account_id=${accountId} AND shop=${shop}
      AND order_gid=${orderGid} AND state='pending'
    RETURNING id::text AS id
  `;
}

/** Internal only: queue already-qualified intent, not permission to contact customer.
 * Runs under the existing per-shop privacy transaction lock. An active sender must
 * recheck all customer-specific gates immediately before attempting Meta delivery.
 */
export function enqueuePostPurchaseDeliveryQuery(accountId:string,shop:string,installationId:string,intentId:string){
  if(!accountId?.trim()||!SHOP.test(shop)||!installationId?.trim()||
    !/^[1-9][0-9]{0,18}$/.test(intentId))throw Error('invalid_delivery_enqueue');
  return sql`
    INSERT INTO ecommerce_post_purchase_outbox
      (intent_id,account_id,installation_id,shop,order_gid,journey,contact_id,template_id,state)
    SELECT i.id,i.account_id,i.installation_id,i.shop,i.order_gid,i.journey,c.id,t.id,'pending'
    FROM ecommerce_post_purchase_intents i
    JOIN contacts c ON c.id=i.contact_id AND c.user_id=i.account_id
      AND c.automations_paused=FALSE
      AND c.phone IS NOT NULL AND c.whatsapp_id IS NOT NULL
      AND c.phone=('+' || c.whatsapp_id)
    JOIN ecommerce_post_purchase_consents consent
      ON consent.account_id=i.account_id AND consent.shop=i.shop
      AND consent.contact_id=c.id AND consent.customer_gid=i.customer_gid
      AND consent.purpose=i.journey AND consent.channel='whatsapp'
      AND consent.evidence_source='verified_whatsapp_explicit_opt_in'
      AND consent.granted_at IS NOT NULL AND consent.granted_at<=NOW()
      AND consent.granted_at>NOW()-INTERVAL '365 days'
      AND consent.revoked_at IS NULL
    JOIN message_templates t ON t.id=i.template_id AND t.user_id=i.account_id
      AND lower(t.status)='approved'
      AND lower(t.category)=CASE WHEN i.journey IN
        ('orderConfirmation','fulfillmentUpdate','cancellation') THEN 'utility' ELSE 'marketing' END
    JOIN integrations inst ON inst.id=i.installation_id
      AND inst.user_id=i.account_id AND inst.type='shopify' AND inst.is_active IS TRUE
    WHERE i.id=CAST(${intentId} AS BIGINT) AND i.account_id=${accountId}
      AND i.shop=${shop} AND i.installation_id=${installationId}
      AND i.state='preview_ready' AND i.due_at<=NOW()
    ON CONFLICT (intent_id) DO NOTHING
    RETURNING id::text AS id
  `;
}

/** Internal signed-webhook reconciliation primitive. Caller MUST authenticate Meta's
 * raw-body signature and bind the receiving WABA to the correct account first.
 * Never call this from a public unauthenticated request, and never trigger sends.
 */
export function reconcilePostPurchaseReceiptQuery(input:{
  accountId:string;shop:string;recipientDigest:string;eventAt:Date;providerMessageId:string;status:'sent'|'delivered'|'read'|'failed';
}){
  if(!input.accountId?.trim()||!SHOP.test(input.shop)||!/^([a-f0-9]{64})$/.test(input.recipientDigest)||
    !Number.isFinite(input.eventAt?.valueOf())||!input.providerMessageId||
    input.providerMessageId.length>256||!/^(sent|delivered|read|failed)$/.test(input.status))
    throw Error('invalid_delivery_receipt');
  return sql`
    UPDATE ecommerce_post_purchase_outbox
    SET meta_delivery_status=${input.status},meta_delivery_at=${input.eventAt},updated_at=NOW()
    WHERE account_id=${input.accountId}
      AND shop=${input.shop} AND recipient_hmac=${input.recipientDigest}
      AND ${input.eventAt}>=claimed_at-INTERVAL '5 minutes'
      AND provider_message_id=${input.providerMessageId}
      AND state='accepted'
      AND (meta_delivery_status IS NULL
        OR (meta_delivery_status='sent' AND ${input.status} IN ('delivered','read','failed'))
        OR (meta_delivery_status='delivered' AND ${input.status}='read'))
    RETURNING id::text AS id
  `;
}

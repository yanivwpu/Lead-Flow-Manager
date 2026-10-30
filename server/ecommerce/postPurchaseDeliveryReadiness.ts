import {sql} from 'drizzle-orm';

/** Read-only schema presence; never grants permission to send. */
export const postPurchaseDeliveryReadinessQuery = sql`SELECT
  to_regclass('ecommerce_post_purchase_outbox') IS NOT NULL AS outbox,
  to_regclass('ecommerce_post_purchase_intents') IS NOT NULL AS intents,
  to_regclass('ecommerce_post_purchase_consents') IS NOT NULL AS consents`;

const SHOP=/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
export function claimPostPurchaseDeliveryQuery(accountId:string,shop:string,installationId:string){
  if(!accountId?.trim()||!SHOP.test(shop)||!installationId?.trim())
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
      ORDER BY o.id LIMIT 1 FOR UPDATE OF o SKIP LOCKED
    )
    UPDATE ecommerce_post_purchase_outbox o
    SET state='claimed',claim_token=gen_random_uuid(),claimed_at=NOW(),updated_at=NOW()
    FROM candidate WHERE o.id=candidate.id
    RETURNING o.id::text AS id,o.claim_token::text AS claim_token
  `;
}

/** Commit before requesting delivery. Missing or repeated claims affect zero rows. */
export function recordPostPurchaseAttemptQuery(id:string,accountId:string,shop:string,token:string){
  if(!/^[1-9][0-9]{0,18}$/.test(id)||!accountId?.trim()||!SHOP.test(shop)||
    !/^[0-9a-f-]{36}$/i.test(token))throw Error('invalid_delivery_attempt');
  return sql`
    UPDATE ecommerce_post_purchase_outbox
    SET provider_attempted_at=NOW(),updated_at=NOW()
    WHERE id=CAST(${id} AS BIGINT) AND account_id=${accountId}
      AND shop=${shop} AND claim_token=CAST(${token} AS UUID)
      AND state='claimed' AND provider_attempted_at IS NULL
    RETURNING id::text AS id
  `;
}

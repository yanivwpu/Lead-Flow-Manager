import {sql} from 'drizzle-orm';

/** Read-only schema presence; never grants permission to send. */
export const postPurchaseDeliveryReadinessQuery = sql`SELECT
  to_regclass('ecommerce_post_purchase_outbox') IS NOT NULL AS outbox,
  to_regclass('ecommerce_post_purchase_intents') IS NOT NULL AS intents,
  to_regclass('ecommerce_post_purchase_consents') IS NOT NULL AS consents`;

const SHOP=/^[a-z0-9][a-z0-9-]*\\.myshopify\\.com$/;
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

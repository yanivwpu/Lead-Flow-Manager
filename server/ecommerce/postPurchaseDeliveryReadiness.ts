import {sql} from 'drizzle-orm';

/** Read-only schema presence; never grants permission to send. */
export const postPurchaseDeliveryReadinessQuery = sql`SELECT
  to_regclass('ecommerce_post_purchase_outbox') IS NOT NULL AS outbox,
  to_regclass('ecommerce_post_purchase_intents') IS NOT NULL AS intents,
  to_regclass('ecommerce_post_purchase_consents') IS NOT NULL AS consents`;

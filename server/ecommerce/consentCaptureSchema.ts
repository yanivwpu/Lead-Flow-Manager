import { sql } from 'drizzle-orm';
/** Read-only checks for the ordered evidence fields used by the capture writers.
 * Existing reviewed migrations own schema changes; capture never bootstraps. */
export const consentCaptureSchemaQuery = sql`SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
    AND table_name='ecommerce_post_purchase_consents' AND column_name IN
    ('account_id','shop','recipient_hmac','purpose','contact_id','customer_gid','granted_at','revoked_at','last_inbound_at','last_wamid'))=10 AS post_purchase,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
    AND table_name='ecommerce_whatsapp_recovery_consents' AND column_name IN
    ('account_id','shop','contact_id','shopify_customer_gid','purpose','channel','evidence_source','recipient_hmac',
     'granted_at','revoked_at','last_verified_inbound_at','last_verified_wamid'))=12 AS recovery`;

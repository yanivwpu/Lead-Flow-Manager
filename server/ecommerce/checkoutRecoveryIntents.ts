import { sql } from 'drizzle-orm';
const SHOP = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const GID = /^gid:\/\/shopify\/AbandonedCheckout\/[1-9][0-9]{0,19}$/;
type CheckoutKey = { accountId:string; shop:string; checkoutId:string };
function validate(key:CheckoutKey) {
  if (!key.accountId?.trim() || key.accountId.length>128 ||
      !SHOP.test(key.shop) || !GID.test(key.checkoutId))
    throw Error('invalid_checkout_tenant_key');
}
/** Internal review record only, NEVER an outbound send instruction.
 * Rows lock the observation and unique constraint dedupes concurrent retries.
 */
export function prepareCheckoutRecoveryIntentQuery(input:CheckoutKey & { verifiedLastActivityAt:string }) {
  validate(input);
  const verified=new Date(input.verifiedLastActivityAt);
  if(!Number.isFinite(verified.valueOf())) throw Error('invalid_checkout_verification');
  return sql`
    INSERT INTO ecommerce_checkout_recovery_intents (account_id,shop,checkout_gid,status,verified_at)
    SELECT o.account_id,o.shop,o.checkout_gid,'ready',NOW()
    FROM ecommerce_abandoned_checkout_observations o
    WHERE o.account_id=${input.accountId} AND o.shop=${input.shop}
      AND o.checkout_gid=${input.checkoutId}
      AND o.completed=FALSE AND o.recovery_url_available=TRUE
      AND o.next_review_at <= NOW() AND o.last_activity_at <= ${verified}
    FOR UPDATE OF o
    ON CONFLICT (account_id,shop,checkout_gid) DO NOTHING
    RETURNING id::text AS id
  `;
}
/** Terminal suppression: purchase elsewhere, opt-out, or revoked recovery consent.
 * Stale events cannot re-open this checkout's intent.
 */
export function suppressCheckoutRecoveryIntentQuery(input:CheckoutKey) {
  validate(input);
  return sql`
    INSERT INTO ecommerce_checkout_recovery_intents (account_id,shop,checkout_gid,status,verified_at)
    SELECT o.account_id,o.shop,o.checkout_gid,'suppressed',NOW()
    FROM ecommerce_abandoned_checkout_observations o
    WHERE o.account_id=${input.accountId} AND o.shop=${input.shop}
      AND o.checkout_gid=${input.checkoutId}
    ON CONFLICT (account_id,shop,checkout_gid) DO UPDATE
      SET status='suppressed',updated_at=NOW()
    RETURNING id::text AS id
  `;
}
/** Purchase-completed observation cancels an already prepared intent.
 * Use inside the same shop-fenced transaction as the Shopify observation update.
 */
export function suppressCompletedCheckoutIntentQuery(input:CheckoutKey) {
  validate(input);
  return sql`
    UPDATE ecommerce_checkout_recovery_intents i
    SET status='suppressed',updated_at=NOW()
    WHERE i.account_id=${input.accountId} AND i.shop=${input.shop}
      AND i.checkout_gid=${input.checkoutId} AND i.status='ready'
      AND EXISTS (SELECT 1 FROM ecommerce_abandoned_checkout_observations o
        WHERE o.account_id=i.account_id AND o.shop=i.shop
        AND o.checkout_gid=i.checkout_gid AND o.completed=TRUE)
    RETURNING i.id::text AS id
  `;
}

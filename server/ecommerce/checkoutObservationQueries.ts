import { sql } from 'drizzle-orm';
import type { AbandonedCheckoutSnapshot } from './abandonedCheckoutSource';

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\\.myshopify\\.com$/;
const GID_RE = /^gid:\/\/shopify\/AbandonedCheckout\/[1-9][0-9]{0,19}$/;
export const CHECKOUT_OBSERVATION_DELAY_MINUTES = 60;

/**
 * Read-only observed-checkout ledger. Never store recovery URLs/customer data.
 * A due observation is NOT an outbound message request or an abandoned-cart claim.
 * Only an authorized Shopify re-fetch and consent check can precede a send.
 */
export function upsertCheckoutObservationQuery(input: {
  accountId: string; shop: string; snapshot: AbandonedCheckoutSnapshot;
}) {
  const { accountId, shop, snapshot } = input;
  if (!accountId || accountId.length > 128 || !SHOP_RE.test(shop) ||
      !GID_RE.test(snapshot.checkoutId) || !Number.isFinite(Date.parse(snapshot.lastActivityAt)))
    throw Error('invalid_checkout_observation');
  const observedAt = new Date(snapshot.lastActivityAt);
  const completed = snapshot.completed === true;
  const hasRecoveryUrl = snapshot.hasRecoveryUrl === true;
  return sql`
    INSERT INTO ecommerce_abandoned_checkout_observations AS existing
      (account_id, shop, checkout_gid, last_activity_at, completed, recovery_url_available, next_review_at)
    VALUES (
      ${accountId}, ${shop}, ${snapshot.checkoutId}, ${observedAt},
      ${completed}, ${hasRecoveryUrl},
      CASE WHEN ${completed}::boolean THEN NULL
           ELSE GREATEST(${observedAt}::timestamptz, NOW()) + INTERVAL '60 minutes' END
    )
    ON CONFLICT (account_id,shop,checkout_gid) DO UPDATE SET
      last_activity_at = GREATEST(existing.last_activity_at, EXCLUDED.last_activity_at),
      completed = existing.completed OR EXCLUDED.completed,
      recovery_url_available = CASE
        WHEN EXCLUDED.last_activity_at >= existing.last_activity_at
        THEN EXCLUDED.recovery_url_available ELSE existing.recovery_url_available END,
      next_review_at = CASE
        WHEN existing.completed OR EXCLUDED.completed THEN NULL
        WHEN EXCLUDED.last_activity_at > existing.last_activity_at
          THEN GREATEST(EXCLUDED.last_activity_at, NOW()) + INTERVAL '60 minutes'
        ELSE existing.next_review_at END,
      updated_at = NOW()
    RETURNING id::text AS id, completed, next_review_at
  `;
}
/** Manual staging review only. No worker consumes this automatically. */
export function dueCheckoutObservationsQuery(accountId: string, shop: string) {
  if (!accountId || accountId.length > 128 || !SHOP_RE.test(shop))
    throw Error('invalid_checkout_scope');
  return sql`
    SELECT checkout_gid, last_activity_at
    FROM ecommerce_abandoned_checkout_observations
    WHERE account_id=${accountId} AND shop=${shop}
      AND completed=FALSE AND recovery_url_available=TRUE
      AND next_review_at <= NOW()
    ORDER BY next_review_at ASC, id ASC LIMIT 25
  `;
}

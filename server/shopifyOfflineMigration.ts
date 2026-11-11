import { sql } from 'drizzle-orm';
import { normalizeShopifyShopDomain } from '@shared/shopifyBilling';
import { assertOfflineTokenStorage, offlineTokenDatabase, OFFLINE_REF_PREFIX, persistOfflineInstallation, type TokenDatabase } from './shopifyOfflineTokens';
import { requestOfflinePair, safeTokenFailure, ShopifyTokenError } from './shopifyOfflineGrant';

/** Operator library only. NOT registered as a route, cron, startup hook or batch command.
 * Calling this invalidates the legacy token. Requires separate authorization for this exact
 * production app, owner and shop, plus paused/drained API workers. No execution in PR CI.
 */
export async function migrateAuthorizedLegacyInstallation(input: {
  userId: string; shop: string; expectedAppClientId: string;
  acknowledgement: 'invalidate-only-this-authorized-store-legacy-token';
}, options: { database?: TokenDatabase; grant?: typeof requestOfflinePair } = {}) {
  if (input.acknowledgement !== 'invalidate-only-this-authorized-store-legacy-token' ||
    !input.expectedAppClientId || input.expectedAppClientId !== process.env.SHOPIFY_API_KEY ||
    normalizeShopifyShopDomain(input.shop) !== input.shop) throw new ShopifyTokenError('configuration');
  const db = options.database ?? await offlineTokenDatabase();
  await assertOfflineTokenStorage(db);
  return db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '12s'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.shop},0))`);
    // Commit intent before the network operation, on a second connection. A process crash
    // or ambiguous response must not put the now-invalid legacy token back into API traffic.
    const check = await db.execute(sql`SELECT id,shopify_access_token FROM users WHERE id=${input.userId}
      AND shopify_shop=${input.shop} AND shopify_access_token IS NOT NULL AND deletion_requested_at IS NULL
      AND LOWER(COALESCE(shopify_subscription_status,'')) NOT IN ('uninstalled','redacted')`);
    const owner = check.rows[0];
    if (!owner || check.rows.length !== 1) throw new ShopifyTokenError('installation_changed');
    if (String(owner.shopify_access_token).startsWith(OFFLINE_REF_PREFIX)) return { status: 'already_migrated' as const };
    const conflict = await db.execute(sql`SELECT id FROM users WHERE shopify_shop=${input.shop}
      AND id<>${input.userId} AND shopify_access_token IS NOT NULL`);
    if (conflict.rows.length) throw new ShopifyTokenError('installation_changed');
    const active = await db.execute(sql`SELECT user_id FROM integrations WHERE user_id=${input.userId}
      AND type='shopify' AND is_active=true AND COALESCE(config->>'shopUrl',config->>'shop',${input.shop})=${input.shop}`);
    if (!active.rows.length) throw new ShopifyTokenError('installation_changed');
    await db.execute(sql`INSERT INTO shopify_offline_migration_attempts(user_id,shop)
      VALUES (${input.userId},${input.shop}) ON CONFLICT(user_id) DO NOTHING`);
    const attempts = await tx.execute(sql`SELECT first_attempt_at,shop FROM shopify_offline_migration_attempts
      WHERE user_id=${input.userId}`);
    const attempt = attempts.rows[0];
    if (!attempt || attempt.shop !== input.shop ||
      Date.now() - new Date(String(attempt.first_attempt_at)).getTime() >= 7 * 86400_000)
      throw new ShopifyTokenError('reauthorization_required');
    const locked = await tx.execute(sql`SELECT shopify_access_token FROM users WHERE id=${input.userId}
      AND shopify_shop=${input.shop} AND shopify_access_token=${owner.shopify_access_token}
      AND deletion_requested_at IS NULL AND LOWER(COALESCE(shopify_subscription_status,'')) NOT IN ('uninstalled','redacted') FOR UPDATE`);
    if (locked.rows.length !== 1) throw new ShopifyTokenError('installation_changed');
    const pair = await (options.grant ?? requestOfflinePair)(input.shop, { legacy_token: String(owner.shopify_access_token) });
    // Nested transaction is a savepoint on this SAME connection; no nested advisory lock.
    await persistOfflineInstallation(input.userId,input.shop,pair,{},tx as unknown as TokenDatabase);
    await tx.execute(sql`DELETE FROM shopify_offline_migration_attempts WHERE user_id=${input.userId}`);
    return { status: 'migrated' as const };
  }).catch(safeTokenFailure);
}

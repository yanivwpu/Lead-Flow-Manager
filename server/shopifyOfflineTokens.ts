import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { users, type User } from '@shared/schema';
import { normalizeShopifyShopDomain } from '@shared/shopifyBilling';
import { safeTokenFailure, offlineTokenKey, openOfflinePair, requestOfflinePair, sealOfflinePair, ShopifyTokenError, type OfflinePair } from './shopifyOfflineGrant';

export const OFFLINE_REF_PREFIX = 'shopify-offline:v1:';
// Deliberately separate from users/Integration DTOs. No pair is cached in a session.
export async function offlineTokenDatabase() { return (await import('../drizzle/db')).db; }
export type TokenDatabase = Awaited<ReturnType<typeof offlineTokenDatabase>>;
export async function assertOfflineTokenStorage(database?: TokenDatabase) {
  offlineTokenKey();
  database ??= await offlineTokenDatabase();
  await database.execute(sql`SELECT user_id FROM shopify_offline_tokens LIMIT 0`);
  await database.execute(sql`SELECT user_id FROM shopify_offline_migration_attempts LIMIT 0`);
  const cleanup = await database.execute(sql`SELECT 1 FROM pg_trigger WHERE tgrelid='users'::regclass
    AND tgname='purge_changed_shopify_offline_tokens' AND tgenabled='O' AND NOT tgisinternal`);
  if (cleanup.rows.length !== 1) throw new ShopifyTokenError('configuration');
}
/** Called under the existing installation privacy fence. Pair and user connection commit together. */
export async function persistOfflineInstallation(userId: string, shop: string, pair: OfflinePair,
  patch: Partial<User>, database?: TokenDatabase): Promise<string> {
  if (normalizeShopifyShopDomain(shop) !== shop) throw new ShopifyTokenError('installation_changed');
  const clientId = process.env.SHOPIFY_API_KEY;
  if (!clientId) throw new ShopifyTokenError('configuration');
  const ref = OFFLINE_REF_PREFIX + randomUUID();
  const encrypted = sealOfflinePair(pair, userId, shop, ref);
  const db = database ?? await offlineTokenDatabase();
  await db.transaction(async tx => {
    const conflicting = await tx.execute(sql`SELECT id FROM users WHERE shopify_shop=${shop}
      AND id<>${userId} AND shopify_access_token IS NOT NULL`);
    if (conflicting.rows.length) throw new ShopifyTokenError('installation_changed');
    const updated = await tx.update(users).set({ ...patch, shopifyShop: shop, shopifyAccessToken: ref })
      .where(eq(users.id, userId)).returning({ id: users.id });
    if (updated.length !== 1) throw new ShopifyTokenError('installation_changed');
    await tx.execute(sql`INSERT INTO shopify_offline_tokens
      (user_id,shop,credential_ref,app_client_id,encrypted_pair,access_expires_at,refresh_expires_at)
      VALUES (${userId},${shop},${ref},${clientId},${encrypted},${pair.accessExpiresAt},${pair.refreshExpiresAt})
      ON CONFLICT (user_id) DO UPDATE SET shop=EXCLUDED.shop,credential_ref=EXCLUDED.credential_ref,
        app_client_id=EXCLUDED.app_client_id,encrypted_pair=EXCLUDED.encrypted_pair,access_expires_at=EXCLUDED.access_expires_at,
        refresh_expires_at=EXCLUDED.refresh_expires_at,status='active',updated_at=now()`);
  }).catch(safeTokenFailure);
  return ref;
}
/** Each caller presents the installation reference already authorized by its tenant boundary.
 * User SHARE lock serializes with uninstall/reassignment; token row UPDATE lock serializes
 * refresh across processes. No shop advisory lock: callers can already hold the privacy fence.
 */
export async function resolveOfflineAccessToken(shop: string, ref: string, options: {
  database?: TokenDatabase; grant?: typeof requestOfflinePair; now?: () => number;
} = {}): Promise<string> {
  if (normalizeShopifyShopDomain(shop) !== shop || !ref) throw new ShopifyTokenError('installation_changed');
  const db = options.database ?? await offlineTokenDatabase(), now = options.now ?? Date.now;
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '12s'`);
    const owner = await tx.execute(sql`SELECT u.id FROM users u WHERE u.shopify_shop=${shop}
      AND u.shopify_access_token=${ref} AND u.deletion_requested_at IS NULL
      AND LOWER(COALESCE(u.shopify_subscription_status,'')) NOT IN ('uninstalled','redacted')
      AND EXISTS (SELECT 1 FROM integrations i WHERE i.user_id=u.id AND i.type='shopify' AND i.is_active=true
        AND COALESCE(i.config->>'shopUrl',i.config->>'shop',u.shopify_shop)=u.shopify_shop)
      AND NOT EXISTS (SELECT 1 FROM users other WHERE other.shopify_shop=${shop} AND other.id<>u.id AND other.shopify_access_token IS NOT NULL)
      FOR SHARE OF u`);
    if (owner.rows.length !== 1) throw new ShopifyTokenError('installation_changed');
    // Existing installations remain untouched; no legacy exchange occurs on reads/startup.
    if (!ref.startsWith(OFFLINE_REF_PREFIX)) {
      const available = await tx.execute(sql`SELECT to_regclass('shopify_offline_migration_attempts') AS attempts`);
      if (available.rows[0]?.attempts) {
        const pending = await tx.execute(sql`SELECT user_id FROM shopify_offline_migration_attempts WHERE shop=${shop}`);
        if (pending.rows.length) throw new ShopifyTokenError('retry_later');
      }
      return { token: ref };
    }
    const userId = String(owner.rows[0].id);
    const rows = await tx.execute(sql`SELECT * FROM shopify_offline_tokens WHERE user_id=${userId}
      AND shop=${shop} AND credential_ref=${ref} FOR UPDATE`);
    const row = rows.rows[0];
    if (!row || row.status !== 'active') return { terminal: true };
    if (row.app_client_id !== process.env.SHOPIFY_API_KEY) throw new ShopifyTokenError('configuration');
    const pair = openOfflinePair(String(row.encrypted_pair), userId, shop, ref);
    const time = now();
    if (pair.refreshExpiresAt.getTime() <= time) {
      await tx.execute(sql`UPDATE shopify_offline_tokens SET status='reauthorization_required' WHERE user_id=${userId}`);
      return { terminal: true };
    }
    if (pair.accessExpiresAt.getTime() > time + 60_000) return { token: pair.accessToken };
    let next: OfflinePair;
    try { next = await (options.grant ?? requestOfflinePair)(shop, { refresh_token: pair.refreshToken }); }
    catch (error) {
      if (error instanceof ShopifyTokenError && error.code === 'reauthorization_required') {
        await tx.execute(sql`UPDATE shopify_offline_tokens SET status='reauthorization_required' WHERE user_id=${userId}`);
        return { terminal: true };
      }
      // Rollback keeps the last durable pair for the next invocation, including ambiguous timeouts.
      throw error;
    }
    if (next.accessExpiresAt.getTime() <= now() || next.refreshExpiresAt.getTime() <= now())
      throw new ShopifyTokenError('invalid_response');
    const encrypted = sealOfflinePair(next, userId, shop, ref);
    await tx.execute(sql`UPDATE shopify_offline_tokens SET encrypted_pair=${encrypted},
      access_expires_at=${next.accessExpiresAt},refresh_expires_at=${next.refreshExpiresAt},updated_at=now()
      WHERE user_id=${userId} AND credential_ref=${ref}`);
    return { token: next.accessToken };
  }).catch(safeTokenFailure);
  if (!result.token) throw new ShopifyTokenError('reauthorization_required');
  return result.token;
}

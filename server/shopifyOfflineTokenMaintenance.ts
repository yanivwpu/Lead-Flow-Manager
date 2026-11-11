import { sql } from 'drizzle-orm';
import { offlineTokenDatabase, resolveOfflineAccessToken, type TokenDatabase } from './shopifyOfflineTokens';
import { ShopifyTokenError } from './shopifyOfflineGrant';

/** Keep dormant migrated installations alive; NEVER selects/exchanges legacy tokens.
 * Per-process overlap suppression is only an optimization; PostgreSQL owns serialization.
 */
export async function maintainOfflineTokens(options: {
  database?: TokenDatabase; resolve?: typeof resolveOfflineAccessToken;
} = {}) {
  const db = options.database ?? await offlineTokenDatabase();
  const available = await db.execute(sql`SELECT to_regclass('shopify_offline_tokens') AS tokens`);
  if (!available.rows[0]?.tokens) return { checked: 0, failed: 0 };
  const due = await db.execute(sql`SELECT shop,credential_ref FROM shopify_offline_tokens
    WHERE status='active' AND access_expires_at <= now() + interval '60 seconds'
    ORDER BY access_expires_at LIMIT 50`);
  let failed = 0;
  for (const row of due.rows) {
    try { await (options.resolve ?? resolveOfflineAccessToken)(String(row.shop), String(row.credential_ref), { database: db }); }
    catch { failed++; } // No raw database/provider errors or credentials in cron logs.
  }
  return { checked: due.rows.length, failed };
}
let inFlight = false;
export async function runShopifyOfflineTokenTick() {
  if (inFlight || !process.env.SHOPIFY_OFFLINE_TOKEN_KEY) return;
  inFlight = true;
  try {
    const result = await maintainOfflineTokens();
    if (result.failed) console.warn('[ShopifyOfflineTokens]', result);
  } catch (error) {
    console.warn('[ShopifyOfflineTokens]', { code: error instanceof ShopifyTokenError ? error.code : 'storage_unavailable' });
  } finally { inFlight = false; }
}

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { normalizeShopifyShopDomain } from '@shared/shopifyBilling';

export class ShopifyTokenError extends Error {
  constructor(public readonly code: 'invalid_response' | 'retry_later' | 'reauthorization_required' | 'configuration' | 'installation_changed' | 'scope_denied' | 'legacy_rejected') {
    super(`shopify_token_${code}`);
  }
}
/** Database/SDK errors may embed SQL params or HTTP headers. Never retain their cause. */
export function safeTokenFailure(error: unknown): never {
  if (error instanceof ShopifyTokenError) throw error;
  throw new ShopifyTokenError('retry_later');
}
export type OfflinePair = { accessToken: string; refreshToken: string; accessExpiresAt: Date; refreshExpiresAt: Date; scope: string };
export function offlineTokenKey(): Buffer {
  const key = process.env.SHOPIFY_OFFLINE_TOKEN_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new ShopifyTokenError('configuration');
  return Buffer.from(key, 'hex');
}
export function sealOfflinePair(pair: OfflinePair, owner: string, shop: string, ref: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', offlineTokenKey(), iv);
  cipher.setAAD(Buffer.from(JSON.stringify([owner, shop, ref])));
  const data = Buffer.concat([cipher.update(JSON.stringify(pair), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}
export function openOfflinePair(value: string, owner: string, shop: string, ref: string): OfflinePair {
  try {
    const [iv, tag, data] = value.split('.').map(s => Buffer.from(s, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', offlineTokenKey(), iv);
    decipher.setAAD(Buffer.from(JSON.stringify([owner, shop, ref])));
    decipher.setAuthTag(tag);
    const pair = JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
    return { ...pair, accessExpiresAt: new Date(pair.accessExpiresAt), refreshExpiresAt: new Date(pair.refreshExpiresAt) };
  } catch { throw new ShopifyTokenError('configuration'); }
}
export function parseOfflinePair(value: unknown, startedAt: number): OfflinePair {
  const p = value as Record<string, unknown> | null;
  const token = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 4096 && !/\s/.test(v);
  const expiry = (ttl: unknown) => {
    if (typeof ttl !== 'number' || !Number.isSafeInteger(ttl) || ttl <= 0 ||
      !Number.isSafeInteger(startedAt + ttl * 1000) || startedAt + ttl * 1000 > 8640000000000000)
      throw new ShopifyTokenError('invalid_response');
    return new Date(startedAt + ttl * 1000);
  };
  if (!p || !token(p.access_token) || !token(p.refresh_token) || typeof p.scope !== 'string' || !p.scope.trim() || p.associated_user)
    throw new ShopifyTokenError('invalid_response');
  return { accessToken: p.access_token, refreshToken: p.refresh_token, scope: p.scope,
    accessExpiresAt: expiry(p.expires_in), refreshExpiresAt: expiry(p.refresh_token_expires_in) };
}
/** No automatic grant retry and no provider bodies/errors in logs or exceptions. */
export async function requestOfflinePair(shop: string, grant: { code: string } | { refresh_token: string } | { legacy_token: string }, fetchImpl = fetch, now = Date.now): Promise<OfflinePair> {
  if (normalizeShopifyShopDomain(shop) !== shop || !process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET)
    throw new ShopifyTokenError('configuration');
  const startedAt = now();
  let response: Response;
  try {
    response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.SHOPIFY_API_KEY, client_secret: process.env.SHOPIFY_API_SECRET,
        ...('code' in grant ? { code: grant.code, expiring: '1' }
          : 'refresh_token' in grant ? { grant_type: 'refresh_token', refresh_token: grant.refresh_token }
          : { grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token: grant.legacy_token,
            subject_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
            requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token', expiring: '1' }) }),
    });
  } catch { throw new ShopifyTokenError('retry_later'); }
  if (response.status === 401) throw new ShopifyTokenError('reauthorization_required');
  if (response.status === 429 || response.status >= 500) throw new ShopifyTokenError('retry_later');
  if (!response.ok) throw new ShopifyTokenError('configuration');
  try {
    const pair = parseOfflinePair(await response.json(), startedAt);
    if (pair.accessExpiresAt.getTime() <= now() || pair.refreshExpiresAt.getTime() <= now())
      throw new ShopifyTokenError('invalid_response');
    return pair;
  }
  catch (e) { if (e instanceof ShopifyTokenError) throw e; throw new ShopifyTokenError('invalid_response'); }
}
export function classifyShopifyAdminFailure(status: number, message: string): ShopifyTokenError {
  return new ShopifyTokenError(status === 403 && message.includes('Non-expiring access tokens are no longer accepted for the Admin API')
    ? 'legacy_rejected' : status === 403 ? 'scope_denied' : status === 401 ? 'reauthorization_required' : 'retry_later');
}

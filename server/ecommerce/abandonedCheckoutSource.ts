/**
 * Bounded, read-only Shopify Admin API source for abandoned checkout observations.
 * Shopify returns both abandoned and recovered checkouts; completedAt is authoritative.
 * Do not log/store recovery URLs or customer data, and never infer WhatsApp permission.
 */
export type AbandonedCheckoutSnapshot = {
  checkoutId: string;
  lastActivityAt: string;
  completed: boolean;
  hasRecoveryUrl: boolean;
};
export type CheckoutSourcePage = { observations: AbandonedCheckoutSnapshot[]; hasNextPage: boolean; nextCursor: string | null };
type FetchLike = typeof fetch;
const QUERY = `query EcommerceAbandonedCheckouts($first: Int!, $after: String) {
  abandonedCheckouts(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
    nodes { id updatedAt completedAt abandonedCheckoutUrl }
    pageInfo { hasNextPage endCursor }
  }
}`;
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const ID_RE = /^gid:\/\/shopify\/AbandonedCheckout\/[1-9][0-9]{0,19}$/;

function validDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value);
}
export function parseAbandonedCheckoutSnapshot(value: unknown, now = Date.now()): AbandonedCheckoutSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_checkout_record');
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !ID_RE.test(row.id) || !validDate(row.updatedAt) ||
      Date.parse(row.updatedAt) > now + 5 * 60_000 ||
      !Object.prototype.hasOwnProperty.call(row, 'completedAt') ||
      !(row.completedAt === null || validDate(row.completedAt))) throw Error('invalid_checkout_record');
  const rawUrl = row.abandonedCheckoutUrl;
  let hasRecoveryUrl = false;
  if (typeof rawUrl === 'string') {
    try {
      const u = new URL(rawUrl);
      hasRecoveryUrl = u.protocol === 'https:' && !u.username && !u.password && !u.hash && !u.port;
    } catch { /* Missing/malformed URL is not permission to recover. */ }
  }
  return { checkoutId: row.id, lastActivityAt: row.updatedAt, completed: row.completedAt !== null, hasRecoveryUrl };
}

export async function fetchShopifyAbandonedCheckoutPage(input: {
  shop: string; accessToken: string; after?: string | null;
  fetchImpl?: FetchLike; now?: number;
}): Promise<CheckoutSourcePage> {
  if (!SHOP_RE.test(input.shop) || !input.accessToken || input.accessToken.length > 4096 ||
      (input.after != null && (typeof input.after !== 'string' || !input.after || input.after.length > 2048)))
    throw Error('invalid_shopify_checkout_request');
  const response = await (input.fetchImpl || fetch)(
    `https://${input.shop}/admin/api/2026-10/graphql.json`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Shopify-Access-Token': input.accessToken},
      body: JSON.stringify({query: QUERY, variables:{first: 25, after: input.after ?? null}}),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) throw Error('shopify_abandoned_checkout_source_unavailable');
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw Error('shopify_checkout_source_invalid');
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.errors) && root.errors.length) throw Error('shopify_checkout_permission_or_query_error');
  const data = root.data as Record<string, unknown> | undefined;
  const connection = data?.abandonedCheckouts as Record<string, unknown> | undefined;
  const nodes = connection?.nodes;
  const pageInfo = connection?.pageInfo as Record<string, unknown> | undefined;
  if (!Array.isArray(nodes) || nodes.length > 25 ||
      typeof pageInfo?.hasNextPage !== 'boolean' ||
      !(pageInfo.endCursor === null || typeof pageInfo.endCursor === 'string') ||
      (pageInfo.hasNextPage && (!pageInfo.endCursor || pageInfo.endCursor.length > 2048)))
    throw Error('shopify_checkout_source_invalid');
  return {
    observations: nodes.map(node => parseAbandonedCheckoutSnapshot(node, input.now)),
    hasNextPage: pageInfo.hasNextPage,
    nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor as string : null,
  };
}

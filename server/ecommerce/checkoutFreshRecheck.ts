/**
 * One-shot Shopify Admin recheck of a single abandoned checkout before
 * preparing a recovery. NO outbound messaging or checkout creation.
 *
 * Shopify's abandonedCheckouts query can include recovered checkouts. The
 * additional abandonment query verifies that no later order was placed.
 * Fails closed if either source is missing, stale or inaccessible.
 */
export type FreshRecoveryResult =
  | { status: 'eligible_for_review'; checkoutId: string; shopifyCustomerId: string; lastActivityAt: string; recoveryUrl: string }
  | { status: 'blocked'; reason: string; completed: boolean };

type FetchLike = typeof fetch;
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const CHECKOUT_RE = /^gid:\/\/shopify\/AbandonedCheckout\/([1-9][0-9]{0,19})$/;
const QUERY = [
  'query OneCheckoutRecoveryRecheck($checkoutId: ID!, $search: String!) {',
  '  abandonedCheckouts(first: 2, query: $search) {',
  '    nodes { id updatedAt completedAt abandonedCheckoutUrl customer { id } }',
  '  }',
  '  abandonmentByAbandonedCheckoutId(abandonedCheckoutId: $checkoutId) {',
  '    customerHasNoOrderSinceAbandonment customer { id }',
  '  }',
  '  shop { primaryDomain { url } }',
  '}',
].join('\\n');
/** Bounded verification fallback when Shopify's documented ID search returns no
 * exact match despite the checkout appearing in its normal recent-checkout
 * listing. Fail closed if the exact global ID is absent from this one page.
 * No pagination, no customer inference, no additional shop mutation.
 */
const BOUNDED_QUERY = [
  'query BoundedCheckoutRecoveryRecheck($checkoutId: ID!) {',
  '  abandonedCheckouts(first: 25, sortKey: CREATED_AT, reverse: true) {',
  '    nodes { id updatedAt completedAt abandonedCheckoutUrl customer { id } }',
  '  }',
  '  abandonmentByAbandonedCheckoutId(abandonedCheckoutId: $checkoutId) {',
  '    customerHasNoOrderSinceAbandonment customer { id }',
  '  }',
  '  shop { primaryDomain { url } }',
  '}',
].join('\\n');

function safeShopifyRecoveryUrl(raw: unknown, shopDomain: string, primaryUrl: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 8192 || typeof primaryUrl !== 'string') return null;
  try {
    const url = new URL(raw);
    const primary = new URL(primaryUrl);
    const allowedHosts = new Set([shopDomain, primary.hostname.toLowerCase()]);
    if (url.protocol !== 'https:' || primary.protocol !== 'https:' ||
        url.username || url.password || url.hash || url.port ||
        primary.username || primary.password || primary.port ||
        !url.hostname || !allowedHosts.has(url.hostname.toLowerCase()) ||
        !url.pathname.includes('/checkouts/') || !url.pathname.includes('/recover')) return null;
    return url.href;
  } catch { return null; }
}
export async function recheckShopifyCheckoutForRecovery(input: {
  shop: string; accessToken: string; checkoutId: string; now?: number;
  fetchImpl?: FetchLike;
}): Promise<FreshRecoveryResult> {
  const blocked = (reason: string, completed=false): FreshRecoveryResult =>
    ({status:'blocked',reason,completed});
  const match = typeof input.checkoutId === 'string' ? CHECKOUT_RE.exec(input.checkoutId) : null;
  if (!SHOP_RE.test(input.shop) || !match || !input.accessToken || input.accessToken.length > 4096)
    return blocked('invalid_checkout_or_shop');
  try {
    const response = await (input.fetchImpl || fetch)(
      'https://' + input.shop + '/admin/api/2026-10/graphql.json', {
        method:'POST',
        headers:{'Content-Type':'application/json', 'X-Shopify-Access-Token':input.accessToken},
        body:JSON.stringify({query:QUERY, variables:{
          checkoutId:input.checkoutId, search:'id:' + match[1],
        }}),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return blocked('shopify_status_unavailable');
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return blocked('shopify_status_unavailable');
    const root=payload as Record<string,unknown>;
    if (Array.isArray(root.errors) && root.errors.length) return blocked('shopify_query_unavailable');
    let data=root.data as Record<string,unknown> | undefined;
    let connection=data?.abandonedCheckouts as Record<string,unknown> | undefined;
    let nodes=connection?.nodes;
    if (!Array.isArray(nodes) || nodes.length > 2) return blocked('checkout_not_confirmed');
    // Never accept a different checkout. Only if the filtered response missed
    // the exact ID, attempt the same bounded recent-list source used in discovery.
    let exact=nodes.filter(n => n && typeof n === 'object' &&
      (n as Record<string,unknown>).id === input.checkoutId);
    if (exact.length !== 1) {
      const fallbackResponse=await (input.fetchImpl || fetch)(
        'https://' + input.shop + '/admin/api/2026-10/graphql.json', {
          method:'POST',
          headers:{'Content-Type':'application/json', 'X-Shopify-Access-Token':input.accessToken},
          body:JSON.stringify({query:BOUNDED_QUERY,variables:{checkoutId:input.checkoutId}}),
          signal:AbortSignal.timeout(8000),
        },
      );
      if (!fallbackResponse.ok) return blocked('shopify_status_unavailable');
      const fallbackPayload:unknown=await fallbackResponse.json();
      if (!fallbackPayload || typeof fallbackPayload !== 'object' ||
          Array.isArray(fallbackPayload)) return blocked('shopify_query_unavailable');
      const fallbackRoot=fallbackPayload as Record<string,unknown>;
      if (Array.isArray(fallbackRoot.errors) && fallbackRoot.errors.length)
        return blocked('shopify_query_unavailable');
      data=fallbackRoot.data as Record<string,unknown> | undefined;
      connection=data?.abandonedCheckouts as Record<string,unknown> | undefined;
      nodes=connection?.nodes;
      if (!Array.isArray(nodes) || nodes.length > 25)
        return blocked('checkout_not_confirmed');
      exact=nodes.filter(n => n && typeof n === 'object' &&
        (n as Record<string,unknown>).id === input.checkoutId);
      if (exact.length !== 1) return blocked('checkout_not_confirmed');
    }
    const row=exact[0] as Record<string,unknown>;
    if (!Object.prototype.hasOwnProperty.call(row,'completedAt') ||
        !(row.completedAt === null ||
          (typeof row.completedAt === 'string' && Number.isFinite(Date.parse(row.completedAt)))))
      return blocked('checkout_status_unknown');
    if (row.completedAt !== null) return blocked('checkout_completed',true);
    const abandonment=data?.abandonmentByAbandonedCheckoutId as Record<string,unknown> | undefined;
    if (abandonment?.customerHasNoOrderSinceAbandonment !== true)
      return blocked('new_order_or_order_status_unknown',
        abandonment?.customerHasNoOrderSinceAbandonment === false);
    const checkoutCustomer=row.customer as Record<string,unknown> | undefined;
    const abandonmentCustomer=abandonment.customer as Record<string,unknown> | undefined;
    const customerId=checkoutCustomer?.id;
    if (typeof customerId !== 'string' ||
        !/^gid:\/\/shopify\/Customer\/[1-9][0-9]{0,19}$/.test(customerId) ||
        customerId !== abandonmentCustomer?.id)
      return blocked('shopify_customer_identity_unverified');
    const updated=row.updatedAt;
    const now=input.now ?? Date.now();
    if (typeof updated !== 'string' || !Number.isFinite(Date.parse(updated)) ||
        Date.parse(updated) > now + 5*60_000) return blocked('checkout_timestamp_unverified');
    const shop=data?.shop as Record<string,unknown> | undefined;
    const domain=shop?.primaryDomain as Record<string,unknown> | undefined;
    const recoveryUrl=safeShopifyRecoveryUrl(row.abandonedCheckoutUrl,input.shop,domain?.url);
    if (!recoveryUrl) return blocked('recovery_url_unverified');
    return {status:'eligible_for_review',checkoutId:input.checkoutId,shopifyCustomerId:customerId,lastActivityAt:updated,
      recoveryUrl};
  } catch { return blocked('shopify_status_unavailable'); }
}

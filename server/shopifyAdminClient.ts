import { classifyShopifyAdminFailure } from './shopifyOfflineGrant';
import { resolveOfflineAccessToken } from './shopifyOfflineTokens';

/** Resolve immediately before EVERY API call (including pagination/long-running clients).
 * Never replay the Admin operation on an auth failure: it may have been a mutation.
 */
export function offlineGraphqlClient(shop: string, ref: string, deps = {
  resolve: resolveOfflineAccessToken,
  client: async (token: string) => {
    const api = (await import('./shopify')).getShopifyApi();
    if (!api) throw Error('shopify_api_unconfigured');
    return new api.clients.Graphql({ session: { shop, accessToken: token } as any });
  },
}) {
  return { request: async (query: string, options?: any): Promise<any> => {
    const token = await deps.resolve(shop, ref);
    try { return await (await deps.client(token)).request(query, options); }
    catch (error: any) {
      const status = error?.response?.code ?? error?.response?.status ?? error?.status;
      if (status === 401 || status === 403) {
        const raw = error?.body?.errors ?? error?.response?.body?.errors ?? '';
        throw classifyShopifyAdminFailure(status, typeof raw === 'string' ? raw : JSON.stringify(raw));
      }
      // Preserve bounded status/GraphQL codes needed by catalog diagnostics without
      // retaining SDK request headers, variables, provider messages or credentials.
      const raw = error?.body?.errors ?? error?.response?.errors?.graphQLErrors ?? [];
      const entries = Array.isArray(raw) ? raw : Array.isArray(raw?.graphQLErrors) ? raw.graphQLErrors : [];
      const allowed = new Set(['THROTTLED', 'ACCESS_DENIED', 'selectionMismatch']);
      const safe = Object.assign(new Error('shopify_admin_unavailable'), {
        response: { code: typeof status === 'number' ? status : undefined },
        body: { errors: entries.map((entry: any) => ({ extensions: {
          code: allowed.has(entry?.extensions?.code) ? entry.extensions.code : 'UNKNOWN',
        } })) },
      });
      throw safe;
    }
  } };
}
/** Injectable fetch remains a complete test transport; the production transport resolves refs. */
export function createOfflineAdminFetch(resolve = resolveOfflineAccessToken, fetchImpl = fetch) {
 return async (url: string, init?: RequestInit): Promise<Response> => {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !/^\/admin\/api\/\d{4}-\d{2}\/graphql\.json$/.test(target.pathname) || target.username || target.password || target.port)
    throw Error('shopify_admin_url_invalid');
  const headers = new Headers(init?.headers);
  const ref = headers.get('X-Shopify-Access-Token') ?? '';
  headers.set('X-Shopify-Access-Token', await resolve(target.hostname, ref));
  const response = await fetchImpl(url, { ...init, headers, redirect: 'error' });
  if (response.status === 401 || response.status === 403)
    throw classifyShopifyAdminFailure(response.status, await response.text());
  return response;
};
}
export async function offlineAdminFetch(url: string, init?: RequestInit): Promise<Response> {
  return createOfflineAdminFetch()(url, init);
}

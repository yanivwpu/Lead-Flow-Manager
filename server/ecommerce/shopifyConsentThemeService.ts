import { consentEditorUrl, consentThemeState, CONSENT_THEME_QUERY } from './shopifyConsentStorefront';
import type { ConsentThemeSetup } from '../../shared/shopifyConsentStorefront';

export function createConsentThemeService(deps: {
  installation: (id: string) => Promise<{ shop: string; token: string; connection: string; setup: Record<string, any> } | null>;
  request: (shop: string, token: string, query: string) => Promise<any>;
  env: Record<string, string | undefined>; now?: () => number;
}) {
  return async (accountId: string, verify = false): Promise<ConsentThemeSetup | null> => {
    const install = await deps.installation(accountId);
    if (!install) return null;
    const { env } = deps, now = deps.now ?? Date.now;
    const version = env.SHOPIFY_CONSENT_EXTENSION_RELEASED_VERSION;
    const clientId = env.SHOPIFY_API_KEY ?? '';
    const extensionId = env.SHOPIFY_CONSENT_EXTENSION_ID ?? '';
    // Operator records the reviewed Shopify version/extension identity AFTER a
    // separately approved release. Railway builds cannot set this implicitly.
    const released = !!version && /^[a-zA-Z0-9._-]{1,120}$/.test(version) &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-(?:[a-f0-9]{12}|[a-f0-9]{20})$/.test(extensionId) && !!consentEditorUrl(install.shop, clientId);
    const current = install.setup.connection === install.connection ? install.setup : {};
    const result: ConsentThemeSetup = {
      state: released ? current.merchantConfirmedAt ? 'merchant_confirmed_saved' : current.editorOpenedAt ? 'editor_opened' : 'configured' : 'unreleased',
      editorUrl: released ? consentEditorUrl(install.shop, clientId) : null,
      approvalUrl: null, releasedVersion: released ? version! : null, checkedAt: null,
      editorOpenedAt: current.editorOpenedAt ?? null, merchantConfirmedAt: current.merchantConfirmedAt ?? null,
    };
    if (!released || !verify) return result;
    try {
      const meta = await deps.request(install.shop, install.token,
        'query ConsentThemeAccess { currentAppInstallation { accessScopes { handle } } shop { myshopifyDomain } }');
      if (meta?.shop?.myshopifyDomain !== install.shop) return { ...result, state: 'unverified' };
      const scopes = meta?.currentAppInstallation?.accessScopes;
      if (!Array.isArray(scopes)) return { ...result, state: 'unverified' };
      const approval = new URL(`https://admin.shopify.com/store/${install.shop.replace('.myshopify.com', '')}/oauth/install`);
      approval.searchParams.set('client_id', clientId);
      if (!scopes.some(s => s.handle === 'write_app_proxy')) {
        // Required permissions are approved in Shopify's install/update flow.
        // Do not send a merchant into a theme with an unavailable data proxy.
        return { ...result, editorUrl: null, state: 'proxy_permission_required', approvalUrl: approval.href };
      }
      if (!scopes.some(s => s.handle === 'read_themes')) {
        approval.searchParams.set('optional_scopes', 'read_themes');
        return { ...result, state: 'permission_required', approvalUrl: approval.href };
      }
      const response = await deps.request(install.shop, install.token, CONSENT_THEME_QUERY);
      // Discard results if privacy, ownership, installation or WABA changed in flight.
      const latest = await deps.installation(accountId);
      if (!latest || latest.shop !== install.shop || latest.token !== install.token || latest.connection !== install.connection) return null;
      return { ...result, state: consentThemeState(response, extensionId), checkedAt: new Date(now()).toISOString() };
    } catch { return { ...result, state: 'unverified' }; }
  };
}

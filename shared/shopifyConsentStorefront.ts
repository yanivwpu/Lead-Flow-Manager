export const CONSENT_EMBED_HANDLE = 'whatsapp-consent';
export const CONSENT_PROXY_PATH = '/apps/whachat-consent';
export type ConsentThemeState = 'unreleased' | 'configured' | 'editor_opened' | 'merchant_confirmed_saved' |
  'enabled_verified' | 'disabled_verified' | 'not_supported' | 'proxy_permission_required' | 'permission_required' | 'unverified';
export type ConsentThemeSetup = {
  state: ConsentThemeState; editorUrl: string | null; approvalUrl: string | null;
  releasedVersion: string | null; checkedAt: string | null;
  editorOpenedAt: string | null; merchantConfirmedAt: string | null;
};

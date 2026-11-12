export const CONSENT_EMBED_HANDLE = 'whatsapp-consent';
export const CONSENT_PROXY_PATH = '/apps/whachat-consent';
export type ConsentThemeState = 'unreleased' | 'configured' | 'editor_opened' | 'merchant_confirmed_saved' |
  'enabled_verified' | 'disabled_verified' | 'not_supported' | 'proxy_permission_required' | 'permission_required' | 'unverified';
/** Fixed codes only. Authenticated merchant diagnostics contain no theme data,
 * provider messages, credentials, customer identifiers or connection digests. */
export type ConsentThemeVerificationReason =
  | 'extension_unreleased' | 'verification_not_requested' | 'extension_id_invalid'
  | 'malformed_graphql' | 'no_published_theme' | 'theme_not_main' | 'theme_processing'
  | 'settings_file_missing' | 'settings_content_invalid' | 'settings_json_invalid'
  | 'current_settings_invalid' | 'blocks_invalid' | 'block_missing' | 'wrong_handle'
  | 'extension_id_mismatch' | 'duplicate_block' | 'block_disabled'
  | 'enabled_flag_missing' | 'enabled_flag_invalid' | 'block_enabled'
  | 'shop_mismatch' | 'scope_metadata_invalid' | 'proxy_permission_required'
  | 'theme_permission_required' | 'unauthorized' | 'throttled' | 'provider_unavailable';
/** Explicit diagnostic projection only; invalid flag values and malformed type
 * strings are redacted instead of copying arbitrary settings into a response. */
export type ConsentThemeBlockDiagnostic = { type: string | null; disabled: boolean | 'missing' | 'invalid' };
export type ConsentThemeVerification = {
  state: ConsentThemeState; verificationReason: ConsentThemeVerificationReason;
  blockDiagnostic?: ConsentThemeBlockDiagnostic[];
};
export type ConsentThemeSetup = {
  verificationReason?: ConsentThemeVerificationReason;
  blockDiagnostic?: ConsentThemeBlockDiagnostic[];
  state: ConsentThemeState; editorUrl: string | null; approvalUrl: string | null;
  releasedVersion: string | null; checkedAt: string | null;
  editorOpenedAt: string | null; merchantConfirmedAt: string | null;
};

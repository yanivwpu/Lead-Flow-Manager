import { createHmac, timingSafeEqual } from 'node:crypto';
import { CONSENT_EMBED_HANDLE, CONSENT_PROXY_PATH, type ConsentThemeState, type ConsentThemeVerification } from '../../shared/shopifyConsentStorefront';
import { CONSENT_LABELS, CONSENT_PURPOSES, WHATSAPP_CONSENT_PHRASES, type EnrollmentView } from '../../shared/shopifyConsentEnrollment';

export function consentEditorUrl(shop: string, clientId: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) || !/^[a-f0-9]{32}$/.test(clientId)) return null;
  const url = new URL(`https://${shop}/admin/themes/current/editor`);
  url.searchParams.set('context', 'apps');
  url.searchParams.set('activateAppId', `${clientId}/${CONSENT_EMBED_HANDLE}`);
  return url.href;
}
/** Raw query only; duplicate keys are rejected before Express can coerce them.
 * The signed shop selects the tenant. No customer field is used as identity. */
export function verifyConsentProxy(rawQuery: string, secret: string, now = Date.now()): { shop: string } | null {
  if (!secret || rawQuery.length > 4096) return null;
  const params = new URLSearchParams(rawQuery);
  const entries = [...params];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return null;
  const signature = params.get('signature'), shop = params.get('shop'), timestamp = params.get('timestamp');
  if (!signature || !/^[a-f0-9]{64}$/.test(signature) || !shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ||
      !timestamp || !/^[0-9]{10,11}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300_000 ||
      params.get('path_prefix') !== CONSENT_PROXY_PATH) return null;
  const message = entries.filter(([key]) => key !== 'signature').map(([key, value]) => `${key}=${value}`).sort().join('');
  const expected = createHmac('sha256', secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex')) ? { shop } : null;
}
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Deliberate public allowlist. The business destination is shown only as the
 * intended wa.me link; no customer phone, account, scopes or credentials. */
export function consentStorefrontHtml(view: EnrollmentView): string | null {
  if (!view.connectionCurrent || !view.draft) return null;
  const draft = view.draft, locale = draft.locale;
  const labels = {
    en: { title: 'WhatsApp preferences', action: 'Open WhatsApp to opt in', rule: 'Sending the displayed text is optional. Opening this link does not grant consent. Unknown customers remain ineligible.' },
    es: { title: 'Preferencias de WhatsApp', action: 'Abrir WhatsApp para aceptar', rule: 'Enviar el texto mostrado es opcional. Abrir este enlace no otorga consentimiento. Los clientes no identificados siguen sin ser elegibles.' },
    he: { title: 'העדפות WhatsApp', action: 'פתיחת WhatsApp להסכמה', rule: 'שליחת הטקסט המוצג היא רשות. פתיחת הקישור אינה מעניקה הסכמה. לקוחות לא מזוהים אינם זכאים.' },
  }[locale];
  // Delivery/journey selection is a separate gate. Customers must be able to
  // enroll while delivery is paused or before a journey is selected.
  const rows = view.rows.filter(row => CONSENT_PURPOSES.includes(row.purpose) && draft.purposes[row.purpose].selected &&
    row.notice && row.link && row.captureReady && /^https:\/\/wa\.me\/[1-9][0-9]{7,14}\?text=/.test(row.link));
  if (!rows.length) return null;
  return `<section class="whachat-consent" lang="${locale}" dir="${locale === 'he' ? 'rtl' : 'ltr'}" aria-label="${escape(labels.title)}">
<h2>${escape(view.draft.merchantName)} — ${escape(labels.title)}</h2><p>${escape(labels.rule)}</p>
${rows.map(row => `<article><h3>${escape(CONSENT_LABELS[locale][CONSENT_PURPOSES.indexOf(row.purpose)])}</h3><p class="whachat-consent-notice">${escape(row.notice!)}</p><p><code dir="ltr">${escape(WHATSAPP_CONSENT_PHRASES[row.purpose])}</code></p><a href="${escape(row.link!)}" rel="noopener noreferrer" target="_blank">${escape(labels.action)}</a></article>`).join('')}
</section>`;
}
/** Inspect only current settings from the MAIN theme. A disabled block persists
 * in settings_data.json; presets and other apps are never activation evidence. */
export function inspectConsentTheme(payload: any, extensionId: string): ConsentThemeVerification {
  const result = (state: ConsentThemeState, verificationReason: ConsentThemeVerification['verificationReason']) => ({ state, verificationReason });
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-(?:[a-f0-9]{12}|[a-f0-9]{20})$/.test(extensionId)) return result('unverified', 'extension_id_invalid');
  if (payload?.errors) return result('unverified', 'malformed_graphql');
  const themes = payload?.themes?.nodes;
  if (!Array.isArray(themes) || themes.length > 1) return result('unverified', 'malformed_graphql');
  if (!themes.length) return result('not_supported', 'no_published_theme');
  const theme = themes[0];
  if (!theme || theme.role !== 'MAIN') return result('unverified', 'theme_not_main');
  if (theme.processing !== false || theme.processingFailed !== false) return result('unverified', 'theme_processing');
  const files = theme.files?.nodes;
  if (!Array.isArray(files)) return result('unverified', 'malformed_graphql');
  const matchingFiles = files.filter((f: any) => f?.filename === 'config/settings_data.json');
  if (!matchingFiles.length) return result('unverified', 'settings_file_missing');
  if (matchingFiles.length !== 1) return result('unverified', 'malformed_graphql');
  const content = matchingFiles[0].body?.content;
  if (typeof content !== 'string' || content.length > 1_000_000) return result('unverified', 'settings_content_invalid');
  let settings;
  try {
    // Shopify can prepend a generated-file comment to JSON theme assets.
    settings = JSON.parse(content.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
  } catch { return result('unverified', 'settings_json_invalid'); }
  if (!settings?.current || typeof settings.current !== 'object' || Array.isArray(settings.current)) return result('unverified', 'current_settings_invalid');
  const blocks = settings.current.blocks === undefined ? {} : settings.current.blocks;
  if (!blocks || typeof blocks !== 'object' || Array.isArray(blocks)) return result('unverified', 'blocks_invalid');
  // The app slug can vary; the exact block handle AND registered extension UID
  // select this embed. Other blocks, presets and draft themes are not proof.
  const types = Object.values(blocks).map((b: any) => ({ block: b,
    parts: typeof b?.type === 'string' ? /^shopify:\/\/apps\/[^/]+\/blocks\/([^/]+)\/([^/]+)$/.exec(b.type) : null }));
  const matches = types.filter(({ parts }) => parts?.[1] === CONSENT_EMBED_HANDLE && parts[2] === extensionId);
  if (matches.length > 1) return result('unverified', 'duplicate_block');
  if (!matches.length) {
    const reason = types.some(({ parts }) => parts?.[2] === extensionId) ? 'wrong_handle' :
      types.some(({ parts }) => parts?.[1] === CONSENT_EMBED_HANDLE) ? 'extension_id_mismatch' : 'block_missing';
    return result('disabled_verified', reason);
  }
  const block = matches[0].block;
  if (block.disabled === true) return result('disabled_verified', 'block_disabled');
  if (block.disabled === false) return result('enabled_verified', 'block_enabled');
  // An omitted flag is not positive activation evidence. Keep serialization
  // uncertainty distinct from an explicitly disabled block.
  return result('unverified', Object.prototype.hasOwnProperty.call(block, 'disabled') ? 'enabled_flag_invalid' : 'enabled_flag_missing');
}
export function consentThemeState(payload: any, extensionId: string): ConsentThemeState {
  return inspectConsentTheme(payload, extensionId).state;
}
export const CONSENT_THEME_QUERY = `query ConsentPublishedTheme {
  themes(first: 2, roles: [MAIN]) { nodes { id role processing processingFailed
    files(first: 1, filenames: ["config/settings_data.json"]) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } } }
  } }
}`;

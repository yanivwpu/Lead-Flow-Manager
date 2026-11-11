import { createHmac, timingSafeEqual } from 'node:crypto';
import { CONSENT_EMBED_HANDLE, CONSENT_PROXY_PATH, type ConsentThemeState } from '../../shared/shopifyConsentStorefront';
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
export function consentThemeState(payload: any, extensionId: string): ConsentThemeState {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-(?:[a-f0-9]{12}|[a-f0-9]{20})$/.test(extensionId)) return 'unverified';
  const themes = payload?.themes?.nodes;
  if (!Array.isArray(themes) || themes.length !== 1) return Array.isArray(themes) && !themes.length ? 'not_supported' : 'unverified';
  const theme = themes[0];
  if (theme.role !== 'MAIN' || theme.processing !== false || theme.processingFailed !== false) return 'unverified';
  const file = theme.files?.nodes?.find((f: any) => f.filename === 'config/settings_data.json');
  if (typeof file?.body?.content !== 'string' || file.body.content.length > 1_000_000) return 'unverified';
  try {
    // Shopify can prepend a generated-file comment to JSON theme assets.
    const settings = JSON.parse(file.body.content.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
    if (!settings.current || typeof settings.current !== 'object' || Array.isArray(settings.current)) return 'unverified';
    const blocks = settings.current.blocks ?? {};
    if (typeof blocks !== 'object' || Array.isArray(blocks)) return 'unverified';
    const matches = Object.values(blocks).filter((b: any) => typeof b?.type === 'string' &&
      /^shopify:\/\/apps\/[^/]+\/blocks\//.test(b.type) && b.type.endsWith(`/blocks/${CONSENT_EMBED_HANDLE}/${extensionId}`)) as any[];
    if (matches.length > 1) return 'unverified';
    return matches.length === 1 && matches[0].disabled === false ? 'enabled_verified' : 'disabled_verified';
  } catch { return 'unverified'; }
}
export const CONSENT_THEME_QUERY = `query ConsentPublishedTheme {
  themes(first: 2, roles: [MAIN]) { nodes { id role processing processingFailed
    files(first: 1, filenames: ["config/settings_data.json"]) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } } }
  } }
}`;

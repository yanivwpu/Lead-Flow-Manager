import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import express, { Router } from 'express';
import { parseHTML } from 'linkedom';
import { consentEditorUrl, verifyConsentProxy, consentStorefrontHtml, consentThemeState } from '../server/ecommerce/shopifyConsentStorefront';
import { createConsentThemeService } from '../server/ecommerce/shopifyConsentThemeService';
import { registerConsentProxyRoute, registerConsentThemeRoutes } from '../server/ecommerce/shopifyConsentStorefrontRoutes';
import { CONSENT_PURPOSES, emptyEnrollment, enrollmentNotice, enrollmentLink, WHATSAPP_CONSENT_PHRASES, type EnrollmentView } from '../shared/shopifyConsentEnrollment';
const shop = 'first.myshopify.com', secret = 'proxy-fixture-secret', now = Date.now(), key = 'a'.repeat(32), extensionId = '11111111-2222-4333-8444-555555555555';
function query(extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ shop, path_prefix: '/apps/whachat-consent', timestamp: String(Math.floor(now / 1000)), logged_in_customer_id: '', ...extra });
  params.set('signature', createHmac('sha256', secret).update([...params].map(([k, v]) => `${k}=${v}`).sort().join('')).digest('hex'));
  return params.toString();
}
function view(locale: 'en' | 'es' | 'he' = 'en'): EnrollmentView {
  const draft = emptyEnrollment(locale); draft.merchantName = 'Store & partners'; draft.sourceUrl = `https://${shop}/`;
  for (const purpose of CONSENT_PURPOSES) draft.purposes[purpose].selected = true;
  return { shop, draft, revision: 'a'.repeat(64), savedAt: new Date(now).toISOString(), connectionCurrent: true, phoneAvailable: true,
    rows: CONSENT_PURPOSES.map(purpose => ({ purpose, selected: true, templateReady: false, merchantEnabled: false,
      operatorReleased: false, captureReady: true, activationBlocked: true, recipientConsent: 'required_per_recipient', blockers: [],
      notice: enrollmentNotice(shop, purpose, draft), link: enrollmentLink('+15551234567', purpose) })) };
}
function theme(blocks: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return { themes: { nodes: [{ role: 'MAIN', processing: false, processingFailed: false,
    files: { nodes: [{ filename: 'config/settings_data.json', body: { content: JSON.stringify({ current: { blocks } }) } }] }, ...overrides }] } };
}
const block = (disabled: boolean, id = extensionId) => ({ type: `shopify://apps/whachatcrm/blocks/whatsapp-consent/${id}`, disabled });
test('Shopify HMAC provenance rejects forged/cross-shop, stale, duplicate and missing signatures; customer fields never establish identity', () => {
  assert.deepEqual(verifyConsentProxy(query(), secret, now), { shop });
  assert.deepEqual(verifyConsentProxy(query({ logged_in_customer_id: '999', accountId: 'other', purpose: 'winBack' }), secret, now), { shop });
  for (const invalid of [query().replace('first.myshopify.com', 'second.myshopify.com'), query() + '&shop=second.myshopify.com',
    query({ timestamp: '1000000000' }), query({ path_prefix: '/apps/other' }), query({ shop: 'evil.test' }), query().replace(/signature=[^&]+/, 'signature=bad')]) {
    assert.equal(verifyConsentProxy(invalid, secret, now), null);
  }
  assert.equal(verifyConsentProxy(query(), '', now), null);
});
test('localized public notices are a safe allowlist with exact affirmative phrases and no tenant/customer metadata', () => {
  for (const locale of ['en', 'es', 'he'] as const) {
    const v = view(locale);
    v.rows[0].notice += '<script>alert(1)</script><img src=x onerror=alert(1)>';
    const html = consentStorefrontHtml(v)!;
    const { document } = parseHTML(html), section = document.querySelector('section')!;
    assert.equal(section.lang, locale); assert.equal(section.dir, locale === 'he' ? 'rtl' : 'ltr');
    assert.equal(document.querySelectorAll('article').length, 7);
    assert.equal(document.querySelector('script, img, form, input'), null);
    assert.ok(section.textContent.includes('STOP')); assert.ok(section.textContent.includes(shop));
    for (const a of document.querySelectorAll('a')) {
      const link = new URL(a.getAttribute('href')!);
      assert.equal(link.host, 'wa.me'); assert.ok(Object.values(WHATSAPP_CONSENT_PHRASES).includes(link.searchParams.get('text')!));
    }
    for (const value of ['revision', 'savedAt', 'recipientConsent', 'operatorReleased', 'accountId', 'customerId']) assert.ok(!html.includes(value));
    assert.equal(consentStorefrontHtml({ ...v, connectionCurrent: false }), null);
    assert.equal(consentStorefrontHtml({ ...v, rows: v.rows.map(r => ({ ...r, captureReady: false })) }), null);
    const paused = { ...v, rows: v.rows.map(r => ({ ...r, selected: false, merchantEnabled: false })) };
    assert.equal(parseHTML(consentStorefrontHtml(paused)!).document.querySelectorAll('article').length, 7);
    for (const purpose of CONSENT_PURPOSES) paused.draft!.purposes[purpose].selected = false;
    assert.equal(consentStorefrontHtml(paused), null, 'delivery selection cannot offer a purpose the merchant did not enroll');
  }
});
test('deep links validate exact shop and app identity and use idempotent embed activation', () => {
  const url = new URL(consentEditorUrl(shop, key)!);
  assert.equal(url.origin, `https://${shop}`); assert.equal(url.pathname, '/admin/themes/current/editor');
  assert.equal(url.searchParams.get('activateAppId'), `${key}/whatsapp-consent`);
  assert.equal(url.searchParams.has('addAppBlockId'), false);
  for (const s of ['https://first.myshopify.com', 'first.myshopify.com.evil.test', 'evil@first.myshopify.com']) assert.equal(consentEditorUrl(s, key), null);
  assert.equal(consentEditorUrl(shop, 'unverified-app'), null);
});
test('published-theme evidence distinguishes active, disabled, missing, draft, foreign and malformed blocks', () => {
  assert.equal(consentThemeState(theme({ embed: block(false) }), extensionId), 'enabled_verified');
  assert.equal(consentThemeState(theme({ embed: block(true) }), extensionId), 'disabled_verified');
  assert.equal(consentThemeState(theme(), extensionId), 'disabled_verified');
  assert.equal(consentThemeState(theme({ embed: block(false, 'another-app') }), extensionId), 'disabled_verified');
  assert.equal(consentThemeState(theme({ embed: block(false) }, { role: 'UNPUBLISHED' }), extensionId), 'unverified');
  assert.equal(consentThemeState(theme({ a: block(false), b: block(false) }), extensionId), 'unverified');
  assert.equal(consentThemeState({ themes: { nodes: [] } }, extensionId), 'not_supported');
  assert.equal(consentThemeState({ themes: { nodes: [{ role: 'MAIN' }] } }, extensionId), 'unverified');
});
test('release and merchant confirmations cannot claim live status; permission failure and connection races fail closed', async () => {
  let install: any = { shop, token: 'PRIVATE_TOKEN', connection: 'current', setup: {} }, calls = 0, readAllowed = false, proxyAllowed = true;
  let mutate = false;
  const env: Record<string, string> = { SHOPIFY_API_KEY: key };
  const setup = createConsentThemeService({ env, now: () => now, installation: async () => install,
    request: async (domain, token, q) => {
      calls++; assert.equal(domain, shop); assert.equal(token, 'PRIVATE_TOKEN');
      if (q.includes('ConsentThemeAccess')) return { shop: { myshopifyDomain: shop }, currentAppInstallation: { accessScopes: [...(readAllowed ? [{ handle: 'read_themes' }] : []), ...(proxyAllowed ? [{ handle: 'write_app_proxy' }] : [])] } };
      if (mutate) install = { ...install, connection: 'changed' };
      return theme({ embed: block(false) });
    } });
  assert.equal((await setup('owner', true))?.state, 'unreleased'); assert.equal(calls, 0);
  env.SHOPIFY_CONSENT_EXTENSION_RELEASED_VERSION = 'reviewed-version'; env.SHOPIFY_CONSENT_EXTENSION_ID = extensionId;
  install.setup = { connection: 'current', merchantConfirmedAt: new Date(now).toISOString() };
  assert.equal((await setup('owner'))?.state, 'merchant_confirmed_saved');
  let result = (await setup('owner', true))!;
  assert.equal(result.state, 'permission_required'); assert.equal(new URL(result.approvalUrl!).searchParams.get('optional_scopes'), 'read_themes');
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TOKEN'));
  proxyAllowed = false; result = (await setup('owner', true))!;
  assert.equal(result.state, 'proxy_permission_required'); assert.equal(result.editorUrl, null);
  assert.equal(new URL(result.approvalUrl!).searchParams.has('optional_scopes'), false);
  proxyAllowed = true; readAllowed = true; result = (await setup('owner', true))!;
  assert.equal(result.state, 'enabled_verified'); assert.equal(result.checkedAt, new Date(now).toISOString());
  mutate = true; assert.equal(await setup('owner', true), null);
  install = null; assert.equal(await setup('owner'), null);
});
test('native HTTP proxy and merchant setup enforce separate provenance, no cache/CORS, same-origin and no grant writes', async () => {
  const app = express(), router = Router(); let reads = 0, records = 0, requiresApproval = false;
  app.use(express.json()); app.use((req, _res, next) => { if (req.get('x-fixture-owner')) req.user = { id: 'owner' } as any; next(); });
  registerConsentProxyRoute(router, { secret: () => secret, limiter: (_q, _s, n) => n(), enrollmentForShop: async domain => { reads++; return domain === shop ? view() : null; } });
  registerConsentThemeRoutes(router, { limiter: (_q, _s, n) => n(), appOrigin: () => 'https://app.whachatcrm.com',
    record: async (id) => { assert.equal(id, 'owner'); records++; return true; }, setup: async (_id, verify) => ({ state: requiresApproval && verify ? 'proxy_permission_required' : 'configured', editorUrl: requiresApproval && verify ? null : consentEditorUrl(shop, key),
      approvalUrl: null, releasedVersion: 'reviewed', checkedAt: null, editorOpenedAt: null, merchantConfirmedAt: null }) });
  app.use(router); const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const root = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = (body: unknown, headers = {}) => fetch(root + '/consent-theme', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://app.whachatcrm.com', 'x-fixture-owner': '1', ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(root + '/consent-storefront?shop=' + shop)).status, 403); assert.equal(reads, 0);
    const r = await fetch(root + '/consent-storefront?' + query()); assert.equal(r.status, 200);
    assert.ok(r.headers.get('cache-control')?.includes('no-store')); assert.equal(r.headers.get('access-control-allow-origin'), null);
    assert.equal((await fetch(root + '/consent-storefront?' + query({ shop: 'second.myshopify.com' }))).status, 404);
    assert.equal((await fetch(root + '/consent-theme')).status, 401);
    assert.equal((await post({ action: 'confirm_saved' }, { origin: 'https://evil.test' })).status, 403);
    assert.equal((await post({ action: 'confirm_saved', accountId: 'other' })).status, 400);
    assert.equal((await post({ action: 'grant' })).status, 400); assert.equal(records, 0);
    const confirmation = await post({ action: 'confirm_saved' }); assert.equal(confirmation.status, 200);
    const body = await confirmation.json(); assert.equal(body.consentGranted, false); assert.equal(body.messagingEnabled, false);
    assert.notEqual(body.state, 'enabled_verified'); assert.equal(records, 1);
    requiresApproval = true;
    const approval = await (await post({ action: 'open_editor' })).json();
    assert.equal(approval.state, 'proxy_permission_required'); assert.equal(approval.editorUrl, null);
    assert.equal(records, 1, 'missing merchant approval cannot record an editor-open action');
    assert.equal((await fetch(root + '/consent-storefront?' + query(), { method: 'POST' })).status, 404);
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});

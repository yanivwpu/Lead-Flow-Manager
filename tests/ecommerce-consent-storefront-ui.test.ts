import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { build } from 'esbuild';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import type { ConsentThemeSetup, ConsentThemeState } from '../shared/shopifyConsentStorefront';
await mkdir('work', { recursive: true });
const scratch = await mkdtemp(resolve('work/consent-theme-ui-'));
after(() => rm(scratch, { recursive: true, force: true }));
await build({ entryPoints: ['client/src/components/ecommerce/ShopifyConsentThemeSetup.tsx'], outfile: join(scratch, 'panel.mjs'),
  bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', plugins: [{ name: 'hooks', setup(b) {
    const stubs: Record<string, string> = { '@/lib/auth-context': 'export const useAuth=()=>({})', '@/lib/accountQueryScope': 'export const withUserQueryScope=k=>k' };
    b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: 'stub' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'js' }));
  } }] });
const { ConsentThemePanel: Panel } = await import(pathToFileURL(join(scratch, 'panel.mjs')).href);
const setup = (state: ConsentThemeState): ConsentThemeSetup => ({ state, editorUrl: 'https://first.myshopify.com/admin/themes/current/editor',
  releasedVersion: 'reviewed', approvalUrl: null, checkedAt: null, editorOpenedAt: null, merchantConfirmedAt: null });
for (const locale of ['en', 'es', 'he']) test(`${locale} storefront setup offers one add action, merchant-owned confirmation and truthful published states`, () => {
  for (const state of ['unreleased', 'configured', 'editor_opened', 'merchant_confirmed_saved', 'enabled_verified', 'disabled_verified', 'not_supported', 'permission_required', 'unverified'] as const) {
    const { document } = parseHTML(renderToStaticMarkup(React.createElement(Panel, { locale, setup: setup(state), blocked: false, busy: false, failed: false, action: () => assert.fail('SSR action') })));
    const panel = document.querySelector('[data-testid="consent-theme-setup"]')!;
    assert.equal(panel.getAttribute('dir'), locale === 'he' ? 'rtl' : 'ltr');
    assert.equal(panel.getAttribute('lang'), locale);
    assert.equal(panel.querySelectorAll('button').length, 3);
    assert.ok(panel.querySelector('[role="status"]')?.textContent);
    assert.equal(panel.querySelector('input, textarea, form'), null, 'no page URL or code copy step');
  }
  const { document } = parseHTML(renderToStaticMarkup(React.createElement(Panel, { locale, setup: { ...setup('unreleased'), editorUrl: null }, blocked: true, busy: false, failed: true, action: () => {} })));
  assert.ok(document.querySelector('button[disabled]')); assert.ok(document.querySelector('[role="alert"]'));
});
test('native extension JavaScript fetches only the Shopify proxy, sanitizes fetched markup, renders once and never sends a customer message', async () => {
  const { document, DOMParser, Node } = parseHTML('<html><body><div data-whachat-consent></div></body></html>');
  const calls: string[] = [];
  const script = await readFile('extensions/whachat-consent/assets/consent.js', 'utf8');
  const hostile = `<section class="whachat-consent" lang="he" dir="rtl"><h2>Store</h2><p onclick="alert(1)">STOP</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://wa.me/15551234567?text=YES%20WHATSAPP%20ORDER%20CONFIRMATIONS" onclick="alert(1)">opt in</a><img src="https://evil.test/track"></section>`;
  runInNewContext(script, { document, DOMParser, Node, fetch: async (url: string, options: any) => {
    calls.push(url); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.method, undefined);
    return { ok: true, status: 200, text: async () => hostile };
  } });
  await new Promise(resolve => setImmediate(resolve));
  const section = document.querySelector('section')!;
  assert.ok(section); assert.equal(section.getAttribute('dir'), 'rtl');
  assert.equal(section.querySelectorAll('a').length, 1); assert.equal(section.querySelector('[onclick], script, img'), null);
  assert.equal(section.querySelector('a')?.getAttribute('target'), '_blank');
  document.dispatchEvent(new (parseHTML('<html/>').Event)('shopify:section:load'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['/apps/whachat-consent']);
  const css = await readFile('extensions/whachat-consent/assets/consent.css', 'utf8');
  assert.ok(css.includes('min-height: 44px')); assert.ok(css.includes(':focus-visible')); assert.ok(css.includes('@media (max-width: 480px)'));
});

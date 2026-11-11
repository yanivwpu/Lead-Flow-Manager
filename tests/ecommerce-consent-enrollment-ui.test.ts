import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { build } from 'esbuild';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONSENT_PURPOSES, CONSENT_LABELS, emptyEnrollment, enrollmentNotice, enrollmentLink, type EnrollmentView } from '../shared/shopifyConsentEnrollment';

await mkdir('work', { recursive: true });
const scratch = await mkdtemp(resolve('work/enrollment-ui-'));
after(() => rm(scratch, { force: true, recursive: true }));
await build({ entryPoints: ['client/src/components/ecommerce/ShopifyConsentEnrollment.tsx'], outfile: join(scratch, 'panel.mjs'),
  bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', plugins: [{ name: 'hooks', setup(b) {
    const stubs: Record<string, string> = {
      '@/lib/auth-context': 'export const useAuth=()=>({})', '@/lib/accountQueryScope': 'export const withUserQueryScope=k=>k',
    };
    b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: 'stub' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'js' }));
  } }] });
const { ShopifyConsentEnrollmentPanel: Panel } = await import(pathToFileURL(join(scratch, 'panel.mjs')).href);

for (const locale of ['en', 'es', 'he'] as const) {
  test(`${locale} enrollment renders separate purposes and four truthful gates${locale === 'he' ? ' in RTL' : ''}`, () => {
    const draft = emptyEnrollment(locale); draft.sourceUrl = 'https://first.myshopify.com/pages/whatsapp'; draft.merchantName = 'First Store';
    draft.purposes.orderConfirmation = { selected: true, additionalText: 'Merchant notice' };
    const data: EnrollmentView = { shop: 'first.myshopify.com', draft, revision: 'a'.repeat(64), savedAt: new Date().toISOString(),
      connectionCurrent: true, phoneAvailable: true, rows: CONSENT_PURPOSES.map(purpose => ({ purpose,
        selected: purpose === 'orderConfirmation', templateReady: true, merchantEnabled: false, operatorReleased: false,
        captureReady: true, activationBlocked: true, recipientConsent: 'required_per_recipient',
        blockers: ['operator_release_required', 'recipient_consent_required'],
        notice: draft.purposes[purpose].selected ? enrollmentNotice('first.myshopify.com', purpose, draft) : null,
        link: draft.purposes[purpose].selected ? enrollmentLink('+15551234567', purpose) : null })) };
    const { document } = parseHTML(renderToStaticMarkup(React.createElement(Panel, { locale, data, onSave: () => assert.fail('SSR must not save') })));
    const panel = document.querySelector('[data-testid="shopify-consent-enrollment"]')!;
    assert.equal(panel.getAttribute('dir'), locale === 'he' ? 'rtl' : 'ltr');
    assert.equal(panel.getAttribute('lang'), locale);
    assert.equal(panel.querySelectorAll('fieldset').length, 7);
    for (const label of CONSENT_LABELS[locale]) assert.ok(panel.textContent.includes(label));
    assert.equal(panel.querySelectorAll('input[type="checkbox"][checked]').length, 1);
    assert.equal(panel.querySelectorAll('[data-testid="consent-readiness"] thead th').length, 5);
    assert.equal(panel.querySelectorAll('[data-testid="consent-readiness"] tbody tr').length, 7);
    assert.equal(panel.querySelectorAll('input[value^="https://wa.me/"]').length, 1);
    const url = panel.querySelector('input[value^="https://wa.me/"]')!;
    assert.equal(url.getAttribute('dir'), 'ltr');
    assert.ok(panel.textContent.includes('YES WHATSAPP ORDER CONFIRMATIONS'));
    assert.ok(panel.textContent.includes('STOP'));
    const blockedText = { en: 'Activation blocked', es: 'Activación bloqueada', he: 'ההפעלה חסומה' };
    assert.ok(panel.textContent.includes(blockedText[locale]));
    assert.ok(!panel.querySelector('button[data-testid^="activate"]'), 'enrollment itself never enables sends');
    const blocked = { ...data, connectionCurrent: false, rows: data.rows.map(r => ({ ...r, captureReady: false, link: null })) };
    const html = renderToStaticMarkup(React.createElement(Panel, { locale, data: blocked, failed: true, onSave: () => {} }));
    assert.ok(!parseHTML(html).document.querySelector('input[value^="https://wa.me/"]'));
    assert.ok(parseHTML(html).document.querySelector('[role="alert"]'));
  });
}

test('missing eligibility does not render a usable enrollment form or destination', () => {
  const { document } = parseHTML(renderToStaticMarkup(React.createElement(Panel, { locale: 'en', onSave: () => {} })));
  assert.equal(document.querySelector('form'), null);
  assert.equal(document.querySelector('input[value^="https://wa.me/"]'), null);
});

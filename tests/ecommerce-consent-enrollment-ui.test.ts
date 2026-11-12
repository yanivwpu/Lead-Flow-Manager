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
    const help = panel.querySelector('[data-testid="consent-compliance-help"]')!;
    assert.ok(!help.hasAttribute('open'));
    assert.ok(help.textContent.includes('STOP'));
    assert.ok(help.textContent.includes('Meta'));
    assert.ok(help.textContent.includes('Shopify'));
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

for (const locale of ['en', 'es', 'he'] as const) {
  test(`${locale} save action is sticky, green only when dirty, and reports saving/saved/error and the exact storefront blocker`, () => {
    const draft = emptyEnrollment(locale); draft.merchantName = 'Pilot'; draft.sourceUrl = 'https://first.myshopify.com/';
    draft.purposes.orderConfirmation.selected = true;
    const data: EnrollmentView = {shop:'first.myshopify.com', draft, revision:null, savedAt:null, connectionCurrent:true, phoneAvailable:true,
      rows:[{purpose:'orderConfirmation',selected:true,templateReady:false,merchantEnabled:false,operatorReleased:false,captureReady:false,
        activationBlocked:true,recipientConsent:'required_per_recipient',blockers:['operator_release_required','consent_capture_connection_required'],
        notice:enrollmentNotice('first.myshopify.com','orderConfirmation',draft),link:null}]};
    let reason: string|undefined;
    const render = (props = {}) => parseHTML(renderToStaticMarkup(React.createElement(Panel, {locale,data,onSave:()=>assert.fail('render must not save'),
      themeSetup:(blocked:boolean, why:string) => {reason=why;return React.createElement('button', {disabled:blocked,'data-testid':'storefront'},why);}, ...props}))).document;
    let document = render();
    const save = document.querySelector('button[type="submit"]')!;
    assert.ok(save.hasAttribute('disabled')); assert.ok(!save.className.includes('bg-green-700'));
    assert.ok(document.querySelector('[data-testid="consent-save-bar"]')!.className.includes('sticky'));
    assert.ok(document.querySelector('[data-testid="storefront"]')!.hasAttribute('disabled'));
    const connectionCopy = {en:'Your Shopify or WhatsApp connection needs pilot approval again. Contact support.',
      es:'Tu conexión Shopify o WhatsApp requiere nueva aprobación piloto. Contacta con soporte.',
      he:'חיבור Shopify או WhatsApp דורש אישור פיילוט מחדש. יש לפנות לתמיכה.'};
    assert.equal(reason, connectionCopy[locale]);
    document = render({data:{...data,draft:null}});
    assert.ok(!document.querySelector('button[type="submit"]')!.hasAttribute('disabled'));
    assert.ok(document.querySelector('button[type="submit"]')!.className.includes('bg-green-700'));
    const labels = {en:'Save changes',es:'Guardar cambios',he:'שמירת שינויים'};
    assert.equal(document.querySelector('button[type="submit"]')!.textContent,labels[locale]);
    document = render({saving:true});
    assert.ok(document.querySelector('button[type="submit"]')!.hasAttribute('disabled'));
    assert.equal(document.querySelector('button[type="submit"]')!.getAttribute('aria-busy'),'true');
    assert.ok(!document.querySelector('button[type="submit"]')!.className.includes('bg-green-700'));
    document = render({failed:true}); assert.ok(document.querySelector('[role="alert"]'));
    const ready = {...data,rows:data.rows.map(row=>({...row,captureReady:true,link:enrollmentLink('+15551234567',row.purpose),blockers:['operator_release_required']}))};
    document = render({data:ready});
    assert.ok(!document.querySelector('[data-testid="storefront"]')!.hasAttribute('disabled'), 'outbound approval must not block embed');
    assert.equal(reason, undefined);
  });
}

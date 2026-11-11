import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { build } from 'esbuild';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { emptyEnrollment, enrollmentLink, enrollmentNotice, type EnrollmentDraft, type EnrollmentView } from '../shared/shopifyConsentEnrollment';

// Exercise the component's actual async save callback. Only its hook/HTTP
// boundaries are fixtures; write and refetch round-trip through real JSONB.
await mkdir('work', { recursive: true });
const scratch = await mkdtemp(resolve('work/enrollment-save-'));
const fixtureKey = '__consentEnrollmentSave';
after(async () => { await rm(scratch, { recursive: true, force: true }); delete (globalThis as any)[fixtureKey]; });
await build({ entryPoints: ['client/src/components/ecommerce/ShopifyConsentEnrollment.tsx'], outfile: join(scratch, 'save.mjs'),
  bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', plugins: [{ name: 'save-boundaries', setup(b) {
    const stubs: Record<string, string> = {
      react: `export const useState=(...args)=>globalThis.${fixtureKey}.useState(...args)`,
      '@/lib/auth-context': 'export const useAuth=()=>({user:{id:"fixture"},sessionAligned:true})',
      '@/lib/accountQueryScope': 'export const withUserQueryScope=k=>k',
      '@tanstack/react-query': `export const useQuery=()=>globalThis.${fixtureKey}.query; export const useQueryClient=()=>({})`,
    };
    b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: 'stub' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'js' }));
  } }] });
const { ShopifyConsentEnrollment: Component, ShopifyConsentEnrollmentPanel: Panel } = await import(pathToFileURL(join(scratch, 'save.mjs')).href);

test('save callback accepts JSONB key reordering, retries write failures and rejects unsafe or mismatched readback', { timeout: 30000 }, async t => {
  const pg = new PGlite(), previousFetch = globalThis.fetch;
  try {
    await pg.exec('CREATE TABLE enrollment_fixture(id int PRIMARY KEY, draft jsonb)');
    const submitted = emptyEnrollment(); submitted.merchantName = 'Fixture Store';
    submitted.sourceUrl = 'https://fixture.myshopify.com/pages/whatsapp';
    submitted.purposes.orderConfirmation.selected = true;
    let mode = 'write_failure', reads = 0, writes = 0;
    globalThis.fetch = (async (_url, options) => {
      writes++; assert.equal(options?.method, 'POST'); assert.equal(options?.credentials, 'include');
      if (mode === 'write_failure') return { ok: false };
      await pg.query('INSERT INTO enrollment_fixture VALUES(1,$1::jsonb) ON CONFLICT(id) DO UPDATE SET draft=EXCLUDED.draft', [String(options?.body)]);
      return { ok: true, json: async () => ({ ok: mode !== 'not_ok', consentGranted: mode === 'consent_granted', messagingEnabled: mode === 'sending_enabled' }) };
    }) as typeof fetch;
    async function save(nextMode: string) {
      mode = nextMode;
      const states: boolean[] = []; let hook = 0;
      let finished!: () => void;
      const completion = new Promise<void>(resolve => { finished = resolve; });
      (globalThis as any)[fixtureKey] = {
        useState: (initial: boolean) => {
          const index = hook++; states[index] = initial;
          return [initial, (value: boolean) => { states[index] = value; if (index === 0 && !value) finished(); }];
        },
        query: { isError: false, refetch: async () => {
          reads++;
          const persisted = (await pg.query<{ draft: EnrollmentDraft }>('SELECT draft FROM enrollment_fixture WHERE id=1')).rows[0].draft;
          assert.notEqual(JSON.stringify(persisted), JSON.stringify(submitted), 'the fixture must exercise actual JSONB key ordering');
          if (mode === 'mismatch') persisted.purposes.orderConfirmation.additionalText = 'Not the submitted notice';
          return { isError: mode === 'read_failure', data: mode === 'missing_data' ? undefined : {
            connectionCurrent: mode !== 'stale_connection', draft: mode === 'missing_draft' ? null : persisted } };
        } },
      };
      Component({ locale: 'en' }).props.onSave(submitted);
      await completion;
      return { saved: states[1], failed: states[2] };
    }
    await t.test('failed POST surfaces an error; retry verifies the reordered committed draft', async () => {
      assert.deepEqual(await save('write_failure'), { saved: false, failed: true }); assert.equal(reads, 0);
      assert.deepEqual(await save('success'), { saved: true, failed: false }); assert.equal(reads, 1);
    });
    for (const failure of ['mismatch', 'read_failure', 'missing_data', 'missing_draft', 'stale_connection']) {
      await t.test(failure, async () => { assert.deepEqual(await save(failure), { saved: false, failed: true }); });
    }
    for (const unsafe of ['not_ok', 'consent_granted', 'sending_enabled']) {
      await t.test(unsafe, async () => {
        const before = reads;
        assert.deepEqual(await save(unsafe), { saved: false, failed: true }); assert.equal(reads, before);
      });
    }
    assert.equal(writes, 10);
    await t.test('key order alone preserves confirmation/sharing; unsaved edits hide both until reverted', async () => {
      const persisted = (await pg.query<{ draft: EnrollmentDraft }>('SELECT draft FROM enrollment_fixture WHERE id=1')).rows[0].draft;
      const data: EnrollmentView = { shop: 'fixture.myshopify.com', draft: persisted, revision: 'a'.repeat(64), savedAt: null,
        connectionCurrent: true, phoneAvailable: true, rows: [{ purpose: 'orderConfirmation', selected: true, templateReady: false,
          merchantEnabled: false, operatorReleased: false, captureReady: true, activationBlocked: true,
          recipientConsent: 'required_per_recipient', blockers: ['operator_release_required'],
          notice: enrollmentNotice('fixture.myshopify.com', 'orderConfirmation', persisted), link: enrollmentLink('+15551234567', 'orderConfirmation') }] };
      function renderDraft(edited: EnrollmentDraft) {
        let hook = 0;
        (globalThis as any)[fixtureKey].useState = (initial: unknown) => [hook++ === 0 ? edited : initial, () => {}];
        return parseHTML(renderToStaticMarkup(Panel({ locale: 'en', data, saved: true, onSave: () => assert.fail('render must not save') }))).document;
      }
      const share = 'input[value^="https://wa.me/"]', confirmation = 'Configuration saved; no customer consent was created.';
      assert.ok(renderDraft(submitted).querySelector(share));
      assert.ok(renderDraft(submitted).querySelector('section')!.textContent.includes(confirmation));
      const edited = structuredClone(submitted); edited.purposes.orderConfirmation.additionalText = 'Unsaved notice';
      assert.equal(renderDraft(edited).querySelector(share), null);
      assert.ok(!renderDraft(edited).querySelector('section')!.textContent.includes(confirmation));
      assert.ok(renderDraft(submitted).querySelector(share), 'reverting restores the verified asset');
    });
  } finally { globalThis.fetch = previousFetch; await pg.close(); }
});

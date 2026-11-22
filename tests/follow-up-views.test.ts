import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import { parseHTML } from 'linkedom';

mkdirSync('work', { recursive: true });
const scratch = mkdtempSync(resolve('work/follow-up-render-'));
const date = new Date();
date.setHours(12, 0, 0, 0);
const future = new Date(date); future.setDate(date.getDate() + 1);
const overdue = new Date(date); overdue.setDate(date.getDate() - 1);
const state = { view: 'list', filter: null as string | null, nullState: 0, writes: 0, rows: [] as any[], appointments: [] as any[] };
(globalThis as any).__followUpRender = state;
after(() => { rmSync(scratch, { recursive: true, force: true }); delete (globalThis as any).__followUpRender; });
const stubs: Record<string, string> = {
  'react': `import * as React from 'fixture-real-react';
    export * from 'fixture-real-react';
    export const useState=(initial)=>React.useState(initial==='list' ? globalThis.__followUpRender.view :
      initial===null && ++globalThis.__followUpRender.nullState===1 ? globalThis.__followUpRender.filter : initial);`,
  'auth-context': `export const useAuth=()=>({user:{id:'fixture',name:'Fixture'}});`,
  'use-mobile': `export const useIsMobile=()=>false;`,
  'use-toast': `export const useToast=()=>({toast:()=>{}});`,
  'ecommercePilot': `export const useEcommercePilot=()=>({available:false});`,
  'react-i18next': `export const useTranslation=()=>({i18n:{resolvedLanguage:'en'}});`,
  '@tanstack/react-query': `export const useQueryClient=()=>({invalidateQueries:async()=>{}});
    export const useMutation=()=>({isPending:false,mutate:()=>{globalThis.__followUpRender.writes++},mutateAsync:async()=>{globalThis.__followUpRender.writes++}});
    export const useQuery=(options)=>({data:options.queryKey.includes('/api/inbox') ? globalThis.__followUpRender.rows :
      options.queryKey.includes('/api/appointments') ? globalThis.__followUpRender.appointments : [],refetch:()=>{}});`,
};
await build({ entryPoints: ['client/src/pages/FollowUps.tsx'], outfile: join(scratch, 'page.mjs'),
  bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
  plugins: [{ name: 'fixture-hooks', setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      if (args.path === 'fixture-real-react') return { path: resolve('node_modules/react/index.js'), external: true };
      const leaf = args.path.split('/').pop()!;
      const key = stubs[leaf] ? leaf : args.path;
      return stubs[key] ? { path: key, namespace: 'fixture' } : undefined;
    });
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }));
  } }] });
const { FollowUps } = await import(pathToFileURL(join(scratch, 'page.mjs')).href);
const fixture = (id: string, text = 'Thanks!', contact: object = {}) => ({
  contact: { id, name: id, email: 'customer@example.com', tag: 'New', pipelineStage: 'Lead', source: 'email_inbox', ...contact },
  conversation: { id: `thread-${id}`, channel: 'email', status: 'open', lastMessageDirection: 'inbound', lastMessagePreview: text },
  channel: 'email', lastMessage: text, lastMessageAt: date.toISOString(), unreadCount: 99,
});
function render(view: string, filter: string | null = null) {
  Object.assign(state, { view, filter, nullState: 0 });
  return parseHTML(renderToStaticMarkup(React.createElement(Router, { ssrPath: '/app/followups' }, React.createElement(FollowUps)))).document;
}
function reset() {
  state.rows = [
    fixture('ordinary'), fixture('railway', 'Your deployment failed. Please check logs.'),
    fixture('promo', 'Interested in buying? Save 30% off today!'),
    fixture('inquiry', 'Can you send a quote?'),
    fixture('manual', 'Thanks!', { source: 'manual', followUp: 'Call customer', followUpDate: overdue.toISOString() }),
    fixture('realtor', 'Thanks!', { source: 'whatsapp', tag: 'Warm', pipelineStage: 'Qualified (Warm)', followUp: 'Realtor follow-up', followUpDate: future.toISOString() }),
    fixture('deal', 'Thanks!', { source: 'email', pipelineStage: 'Proposal' }),
    fixture('undated', 'Thanks!', { followUp: 'Prepare quote', followUpDate: 'invalid' }),
  ];
  state.rows.push({ ...state.rows[4], conversation: { ...state.rows[4].conversation, id: 'second-email-thread' } });
  state.appointments = [{ id: 'appt', contactId: 'manual', contactName: 'manual', appointmentType: 'Consultation', appointmentDate: date.toISOString(), status: 'scheduled', title: 'Consultation' }];
  state.writes = 0;
}

test('List renders genuine work with accurate counts and rule-based copy, without writing', () => {
  reset();
  const document = render('list');
  const text = document.documentElement.textContent!;
  assert.match(text, /2 scheduled follow-ups · 1 appointment/);
  assert.match(text, /Recommended Tasks/);
  assert.doesNotMatch(text, /AI Recommended|unread messages|Follow up: null/);
  for (const id of ['manual', 'realtor', 'inquiry', 'undated']) assert.ok(document.querySelector(`[data-testid="task-item-${id}"]`), id);
  for (const id of ['ordinary', 'railway', 'promo', 'deal']) assert.equal(document.querySelector(`[data-testid="task-item-${id}"]`), null, id);
  assert.equal(document.querySelectorAll('[data-testid="task-item-manual"]').length, 1);
  const columns = document.querySelector('[data-testid="follow-up-list-columns"]')!;
  assert.ok(columns.classList.contains('lg:grid-cols-2'));
  assert.ok(columns.children[0].querySelector('[data-testid="task-item-realtor"]'), 'upcoming follow-ups appear first, including on mobile');
  assert.ok(columns.children[1].querySelector('[data-testid="task-item-inquiry"]'), 'reply recommendations appear in the second section');
  assert.equal(document.querySelector('[data-testid="button-mark-done-inquiry"]'), null, 'reply work cannot clear contact reminders');
  assert.equal(document.querySelector('[data-testid="kpi-active-deals"] p')?.textContent, '2');
  assert.equal(document.querySelector('[data-testid="kpi-needs-reply"] p')?.textContent, '1');
  assert.equal(state.writes, 0);
});

test('KPI filters never rename unscheduled inquiries or sales opportunities as scheduled work', () => {
  reset();
  for (const filter of ['needs-reply', 'active-deals']) {
    const document = render('list', filter);
    assert.match(document.documentElement.textContent!, /2 scheduled follow-ups · 1 appointment/);
    assert.equal(document.querySelector('[data-testid="task-item-ordinary"]'), null);
    assert.equal(document.querySelector('[data-testid="task-item-railway"]'), null);
  }
  const needsReply = render('list', 'needs-reply');
  assert.ok(needsReply.querySelector('[data-testid="task-item-inquiry"]'));
  assert.equal(needsReply.querySelector('[data-testid="button-mark-done-inquiry"]'), null);
  const deals = render('list', 'active-deals');
  assert.ok(deals.querySelector('[data-testid="task-item-deal"]'));
  assert.equal(deals.querySelector('[data-testid="button-mark-done-deal"]'), null);
});

test('Calendar contains only valid dated tasks and appointments and respects filters', () => {
  reset();
  const document = render('calendar');
  for (const id of ['manual', 'realtor', 'appt']) assert.ok(document.querySelector(`[data-testid="calendar-task-${id}"]`), id);
  for (const id of ['ordinary', 'railway', 'promo', 'inquiry', 'undated', 'deal']) assert.equal(document.querySelector(`[data-testid="calendar-task-${id}"]`), null, id);
  assert.equal(document.querySelector('[data-testid="calendar-task-appt"]')?.getAttribute('draggable'), 'false');
  const overdueDocument = render('calendar', 'overdue');
  assert.ok(overdueDocument.querySelector('[data-testid="calendar-task-manual"]'));
  assert.equal(overdueDocument.querySelector('[data-testid="calendar-task-appt"]'), null);
  assert.equal(render('calendar', 'needs-reply').querySelectorAll('[data-testid^="calendar-task-"]').length, 0);
  assert.equal(state.writes, 0);
});

test('fresh form reviews surface with a reminder action after urgent work, with a count for overflow', () => {
  reset();
  state.rows.unshift(fixture('urgent', 'Can you send a quote today?'));
  const form = (id: string, source: string, ageMinutes: number) => {
    const row = fixture(id, 'Could you send a quote?', {
      source: 'webchat', sourceDetails: { agentPageForm: true, leadSource: source, rgeNewLeadReviewRecommended: 'Review new lead' },
    });
    return { ...row, lastMessageAt: new Date(date.getTime() - ageMinutes * 60_000).toISOString(),
      channel: 'webchat', conversation: { ...row.conversation, channel: 'webchat', channelAccountId: 'agent_page_form' } };
  };
  for (let i = 0; i < 7; i++) state.rows.push(form(`old-review-${i}`, 'Agent Page', 100 + i));
  state.rows.push(form('z-mls-review', 'MLS Property Listing', 0), form('a-agent-review', 'Agent Page', 2),
    form('b-neighborhood-review', 'Agent Page · Victoria Park', 3));

  const page = render('list');
  const recommended = page.querySelector('[aria-labelledby="recommended-tasks-heading"]')!;
  const visible = [...recommended.querySelectorAll('[data-testid^="task-item-"]')].filter(row => !row.closest('details'));
  assert.deepEqual(visible.slice(0, 4).map(row => row.getAttribute('data-testid')),
    ['task-item-urgent', 'task-item-z-mls-review', 'task-item-a-agent-review', 'task-item-b-neighborhood-review']);
  for (const row of visible.slice(1, 4)) {
    assert.match(row.textContent ?? '', /Review new lead.*Set Reminder/);
    assert.doesNotMatch(row.textContent ?? '', /Needs Reply/);
  }
  assert.match(page.querySelector('a[href="#recommended-tasks-heading"]')?.textContent ?? '', /Lead reviews \(10\)/);
  assert.match(recommended.querySelector('summary')?.textContent ?? '', /More recommendations \(7\)/);
  assert.ok(page.querySelector('[data-testid="task-item-manual"]'), 'existing overdue work stays visible');
  const calendar = render('calendar');
  for (const id of ['z-mls-review', 'a-agent-review', 'b-neighborhood-review']) {
    assert.equal(calendar.querySelector(`[data-testid="calendar-task-${id}"]`), null);
  }
  assert.equal(state.writes, 0);
});

test('Pipeline uses the same deal definition as KPI/List and preserves Realtor qualification stages', () => {
  reset();
  const document = render('pipeline');
  for (const id of ['realtor', 'deal']) assert.ok(document.querySelector(`[data-testid="pipeline-card-${id}"]`), id);
  for (const id of ['ordinary', 'railway', 'promo', 'inquiry', 'manual', 'undated']) assert.equal(document.querySelector(`[data-testid="pipeline-card-${id}"]`), null, id);
  assert.ok(document.querySelector('[data-testid="pipeline-column-qualified (warm)"] [data-testid="pipeline-card-realtor"]'));
  assert.equal(document.querySelectorAll('[data-testid^="pipeline-card-"]').length, Number(document.querySelector('[data-testid="kpi-active-deals"] p')?.textContent));
  assert.equal(render('pipeline', 'needs-reply').querySelectorAll('[data-testid^="pipeline-card-"]').length, 0);
  assert.equal(state.writes, 0);
});

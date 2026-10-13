import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { PgDialect, getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '../shared/schema';
import { buildContactDetails } from '../shared/contactDetails';
import { shopifyContactRedactionPatch } from '../shared/shopifyPrivacyRedaction';
import { contactDetailsPatchSchema } from '../shared/contactDetailsPatch';
import { readContactsListState, contactDetailsHref, safeContactsReturnHref, contactConversationHref } from '../shared/contactDetailsNavigation';

const stamp = new Date('2026-10-13T12:00:00Z');
const contact = { id: 'crm', userId: 'owner', name: 'Customer', email: 'customer@example.invalid', phone: '15551234567',
  source: 'shopify', primaryChannel: 'shopify', tag: 'New', pipelineStage: 'Lead', createdAt: stamp, updatedAt: stamp,
  customFields: { shopifyCustomerId: '123', shopifyShop: 'fixture.myshopify.com', shopifyCustomerSync: { ordersCount: 4, totalSpent: '180.00' } },
  notes: '', sourceDetails: {}, leadScore: 42 } as schema.Contact;
const event = (id: string, eventType: string, data: Record<string, unknown>, at = stamp): schema.ActivityEvent => ({
  id, eventType, eventData: data, createdAt: at, userId: 'owner', contactId: 'crm', conversationId: null, actorType: 'system', actorId: null,
});
const build = (overrides: Partial<Parameters<typeof buildContactDetails>[0]> = {}) => buildContactDetails({
  contact, events: [], notes: [], conversations: [], appointments: [], ...overrides,
});

test('contact navigation preserves every filter, Unicode search, tab and sort through a direct return link', () => {
  const search = 'q=Ana+%26+%D7%99&tag=Warm&channel=instagram&stage=Qualified&tab=all&sort=name&dir=asc';
  const href = contactDetailsHref('contact/space', search);
  assert.ok(href.startsWith('/app/contacts/contact%2Fspace?'));
  const list = safeContactsReturnHref(href.split('?')[1]);
  assert.deepEqual(readContactsListState(list.split('?')[1]), {
    search: 'Ana & י', filterTag: 'Warm', filterChannel: 'instagram', filterStage: 'Qualified', listTab: 'all', sortField: 'name', sortDir: 'asc',
  });
  for (const path of ['https://evil.invalid', '//evil.invalid', '/app/inbox', '/app/contacts/foreign']) assert.equal(safeContactsReturnHref(`returnTo=${encodeURIComponent(path)}`), '/app/contacts');
  assert.equal(readContactsListState('sort=invalid&dir=invalid&tab=invalid').sortField, 'createdAt');
});

test('explicit Inbox links select the persisted conversation and a missing conversation cannot create a thread', () => {
  assert.equal(contactConversationHref('crm', 'email/thread'), '/app/inbox/crm?conversation=email%2Fthread');
  assert.equal(contactConversationHref('crm', null), null);
  assert.deepEqual(build().conversations, []);
});

test('Shopify orders use latest persisted snapshots and expose no raw customer IDs or credentials', () => {
  const result = build({ events: [
    event('latest', 'shopify_order_updated', { shop: 'fixture.myshopify.com', orderId: '7', orderName: '#1007', totalPrice: '45.00', currency: 'USD', financialStatus: 'paid', fulfillmentStatus: 'fulfilled', lineItems: [{ title: 'T-shirt', quantity: 2, sku: 'private' }], email: 'old@example.invalid', accessToken: 'private-token' }),
    event('older', 'shopify_order_created', { shop: 'fixture.myshopify.com', orderId: '7', totalPrice: '40.00' }, new Date('2026-10-12')),
    event('hidden', 'shopify_order_created', { orderId: '8', redacted: true }),
  ] });
  assert.equal(result.shopify?.orders.length, 1);
  assert.equal(result.shopify?.orders[0].number, '#1007');
  assert.equal(result.shopify?.orders[0].total, '45.00');
  assert.equal(result.shopify?.orders[0].dateSource, 'Synced');
  assert.deepEqual(result.shopify?.orders[0].items, [{ title: 'T-shirt', quantity: 2 }]);
  assert.equal(result.shopify?.ordersCount, 4);
  for (const privateValue of ['old@example.invalid', 'private-token', 'shopifyCustomerId', 'private']) assert.ok(!JSON.stringify(result).includes(privateValue));
});

test('all non-Shopify channels omit commerce and keep CRM identity, notes, score and persisted chronology', () => {
  for (const channel of ['whatsapp', 'facebook', 'instagram', 'sms', 'webchat', 'email', 'telegram']) {
    const result = build({ contact: { ...contact, source: channel, primaryChannel: channel, customFields: {} },
      events: [event('stage', 'stage_change', { from: 'Lead', to: 'Qualified' }, new Date('2026-10-14'))],
      notes: [{ id: 'note', content: 'Call next week', createdByName: 'Agent', createdAt: stamp } as schema.ContactNote] });
    assert.equal(result.shopify, null); assert.equal(result.profile.identityReadOnly, false);
    assert.equal(result.notes[0].content, 'Call next week'); assert.equal(result.timeline[0].id, 'event:stage');
    assert.equal(result.profile.leadScore, 42);
    assert.ok(!result.timeline.some(e => e.title === 'Contact updated')); // updatedAt cannot invent history
  }
});

test('erased Shopify data is not reconstructed from metadata; flagged data drops notes and conversation links', () => {
  const erased = shopifyContactRedactionPatch(contact, 'fixture.myshopify.com');
  const result = build({ contact: { ...contact, ...erased } });
  assert.equal(result.shopify, null); assert.equal(result.profile.email, null); assert.equal(result.profile.name, 'Contact');
  const suppressed = build({ contact: { ...contact, customFields: { ...contact.customFields as object, shopifyRedacted: true }, notes: 'sensitive' },
    notes: [{ id: 'secret', content: 'sensitive', createdAt: stamp } as schema.ContactNote] });
  assert.equal(suppressed.shopify, null); assert.deepEqual(suppressed.notes, []); assert.deepEqual(suppressed.conversations, []);
  assert.ok(!JSON.stringify(suppressed).includes('sensitive'));
});

test('details edits require concurrency version and reject ownership, synchronized fields and invalid values', () => {
  assert.ok(contactDetailsPatchSchema.safeParse({ expectedUpdatedAt: stamp.toISOString(), tag: 'Warm', followUpDate: stamp.toISOString() }).success);
  for (const patch of [{ userId: 'foreign' }, { customFields: { shopifyCustomerId: 'foreign' } }, { assignedTo: '' }, { email: 'bad' }, { followUpDate: 'bad' }]) {
    assert.equal(contactDetailsPatchSchema.safeParse({ expectedUpdatedAt: stamp.toISOString(), ...patch }).success, false);
  }
  assert.equal(contactDetailsPatchSchema.safeParse({ tag: 'Warm' }).success, false);
});

test('real SQL: scoped ownership, privacy locks, dirty sibling records, and concurrent updates', async () => {
  process.env.DATABASE_URL ||= 'postgres://fixture:fixture@127.0.0.1:1/whachat_shopify_test';
  process.env.SHOPIFY_API_SECRET = 'contact-details-fixture';
  const { loadContactDetails, contactUpdateCondition } = await import('../server/contactDetailsService');
  const { customerIdentityTokens } = await import('../server/shopifyPrivacyRequests');
  const { createHmac } = await import('node:crypto');
  const queries: string[] = [];
  const pg = new PGlite(); const database = drizzle(pg, { logger: { logQuery(query) { queries.push(query); } } });
  const dialect = new PgDialect(); const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
  for (const table of [schema.users, schema.contacts, schema.conversations, schema.activityEvents, schema.contactNotes, schema.appointments, schema.shopifyPrivacyCustomerLocks]) {
    const cfg = getTableConfig(table as PgTable);
    const columns = cfg.columns.map(c => quote(c.name) + ' ' + (c.enumValues?.length ? 'text' : c.getSQLType()) +
      (c.name === 'id' ? ' PRIMARY KEY DEFAULT gen_random_uuid()::text' : c.default !== undefined ? ' DEFAULT ' +
        (typeof c.default === 'object' && c.default !== null && 'getSQL' in c.default ? dialect.sqlToQuery(c.default as any).sql : typeof c.default === 'string' ? "'" + c.default.replaceAll("'", "''") + "'" : String(c.default)) : ''));
    await pg.exec('CREATE TABLE ' + quote(cfg.name) + ' (' + columns.join(',') + ')');
  }
  const db = database as unknown as typeof import('../drizzle/db').db;
  try {
    await database.insert(schema.users).values({ id: 'owner', name: 'Owner', email: 'owner@example.invalid', password: 'fixture', shopifyShop: 'fixture.myshopify.com' });
    await database.insert(schema.contacts).values(contact);
    await database.insert(schema.conversations).values([{ id: 'owned-thread', userId: 'owner', contactId: 'crm', channel: 'shopify' }, { id: 'foreign-thread', userId: 'foreign', contactId: 'crm', channel: 'email' }]);
    await database.insert(schema.contactNotes).values([{ id: 'owned-note', workspaceId: 'owner', contactId: 'crm', content: 'Owner note' }, { id: 'foreign-note', workspaceId: 'foreign', contactId: 'crm', content: 'Foreign secret' }]);
    await database.insert(schema.activityEvents).values([event('owned', 'stage_change', { to: 'Lead' }), { ...event('foreign', 'shopify_order_created', { orderId: '123', totalPrice: 'secret' }), userId: 'foreign' }]);
    queries.length = 0;
    assert.equal(await loadContactDetails('foreign', 'crm', false, db), null);
    assert.equal(queries.length, 1, 'Unauthorized contact must not trigger any related or privacy reads');
    assert.equal(await loadContactDetails('owner', 'missing', false, db), null);
    const result = await loadContactDetails('owner', 'crm', false, db);
    assert.deepEqual(result?.conversations.map(v => v.id), ['owned-thread']);
    assert.deepEqual(result?.notes.map(v => v.content), ['Owner note']);
    assert.ok(!JSON.stringify(result).includes('Foreign secret')); assert.equal(result?.shopify?.orders.length, 0);
    const options = { expectedWorkspaceUserId: 'owner', expectedUpdatedAt: stamp };
    assert.equal((await database.update(schema.contacts).set({ tag: 'Warm', updatedAt: new Date('2026-10-14') }).where(contactUpdateCondition('crm', options)).returning()).length, 1);
    assert.equal((await database.update(schema.contacts).set({ name: 'Stale edit' }).where(contactUpdateCondition('crm', options)).returning()).length, 0);
    assert.equal((await database.update(schema.contacts).set({ tag: 'Hacked' }).where(contactUpdateCondition('crm', { expectedWorkspaceUserId: 'foreign' })).returning()).length, 0);
    const hash = createHmac('sha256', process.env.SHOPIFY_API_SECRET).update('shopify-privacy-v1:' + JSON.stringify(['fixture.myshopify.com', customerIdentityTokens({ id: '123' })[0]])).digest('hex');
    await database.insert(schema.shopifyPrivacyCustomerLocks).values({ identityHash: hash });
    assert.equal(await loadContactDetails('owner', 'crm', false, db), null);
    await database.delete(schema.shopifyPrivacyCustomerLocks);
    await database.update(schema.users).set({ shopifySubscriptionStatus: 'redacted' }).where(eq(schema.users.id, 'owner'));
    assert.equal(await loadContactDetails('owner', 'crm', false, db), null);
  } finally { await pg.close(); }
});

test('route and UI wiring preserves explicit Inbox paths and uses responsive, inline CRM actions', () => {
  const contacts = readFileSync('client/src/pages/Contacts.tsx', 'utf8');
  assert.equal((contacts.match(/navigate\(contactDetailsHref\(contact.id, listSearch\)\)/g) || []).length, 3);
  assert.ok(!contacts.includes('navigate(`/app/inbox/${contact.id}`)'));
  const layout = readFileSync('client/src/pages/AppLayout.tsx', 'utf8');
  assert.ok(layout.includes('path="/app/contacts/:contactId"')); assert.ok(layout.includes('path="/app/inbox/:contactId?"'));
  const details = readFileSync('client/src/pages/ContactDetails.tsx', 'utf8');
  assert.ok(details.includes('lg:grid-cols-')); assert.ok(details.includes('sm:flex-row')); assert.ok(details.includes('break-words'));
  assert.ok(details.includes('withUserQueryScope')); assert.ok(details.includes('expectedUpdatedAt: baseline.updatedAt'));
  assert.ok(details.includes('Add note')); assert.ok(details.includes('Create follow-up')); assert.ok(details.includes('disabled={profile.identityReadOnly}'));
});

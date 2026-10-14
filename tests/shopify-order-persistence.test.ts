import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import { eq, and, sql } from 'drizzle-orm';
import { activityEvents } from '../shared/schema';

test('actual order pipeline repairs a card-only interrupted write before acknowledging completion, without automation or exports', async () => {
  let message: any;
  let activity = false;
  let failActivity = true;
  let cardWrites = 0, activityWrites = 0, sideEffects = 0;
  const source = readFileSync('server/commerceEventPipeline.ts', 'utf8');
  const body = source.slice(source.indexOf('export async function ingestCommerceEvent('))
    .replace('await import("./channelService")', '({ channelService: fixtureChannelService })');
  const compiled = await transform(body, { loader: 'ts', format: 'cjs', target: 'es2022' });
  const module = { exports: {} as any };
  const storage = { getMessageByUserExternalId: async () => message, updateConversation: async () => {} };
  const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => activity ? [{ id: 'activity' }] : [] }) }) }) };
  const channelService = { logActivity: async () => {
    if (failActivity) throw Error('fixture activity failure');
    activity = true; activityWrites++;
  } };
  const contact = { id: 'contact', userId: 'owner' };
  const conversation = { id: 'conversation', userId: 'owner' };
  const effect = async () => { sideEffects++; };
  new Function('storage', 'db', 'activityEvents', 'eq', 'and', 'sql', 'logCommerce',
    'upsertCommerceContact', 'ensureCommerceConversation', 'appendCommerceChatMessage', 'fixtureChannelService',
    'dispatchCommerceEventAutomation', 'syncContactToHubSpotIfEnabled', 'scheduleHubSpotAutoSync', 'module', 'exports', compiled.code)(
    storage, db, activityEvents, eq, and, sql, () => {},
    async () => ({ contact, created: false }), async () => ({ conversation, created: false }),
    async () => { cardWrites++; message = { id: 'message', contactId: contact.id, createdAt: new Date() }; return message.id; },
    channelService, effect, effect, effect, module, module.exports);
  const ingest = module.exports.ingestCommerceEvent;
  const input = { userId: 'owner', source: 'shopify', allowSideEffects: false, triggerType: 'shopify_order_created',
    recordMode: 'commerce_message', externalMessageId: 'event-1', messageBody: 'Order #1',
    activityEventType: 'shopify_order_created', metadata: {}, contactHints: {} };
  assert.equal((await ingest(input)).ok, false);
  assert.equal(cardWrites, 1); assert.equal(activityWrites, 0);
  failActivity = false;
  assert.equal((await ingest(input)).ok, true);
  assert.equal(cardWrites, 1); assert.equal(activityWrites, 1);
  assert.equal((await ingest(input)).deduped, true);
  assert.equal(cardWrites, 1); assert.equal(activityWrites, 1); assert.equal(sideEffects, 0);
});

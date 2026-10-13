import assert from 'node:assert/strict';
import test from 'node:test';
import { createShopifyOrderWebhookHandler } from '../server/shopifyOrderWebhookHandler';

const raw = Buffer.from('{"id":123,"customer":{"id":456}}');
const request = () => ({ rawBody: raw, body: { id: 999 }, headers: {
  'x-shopify-hmac-sha256': 'valid', 'x-shopify-shop-domain': 'fixture.myshopify.com',
  'x-shopify-topic': 'orders/create', 'x-shopify-event-id': 'event-123',
} });
function response() {
  return { code: 0, body: undefined as unknown, status(code: number) { this.code = code; return this; },
    json(body: unknown) { this.body = body; return this; } };
}
test('orders are acknowledged only after persistence finishes and use verified bytes', async () => {
  let finish!: () => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const persisted = new Promise<void>(resolve => { finish = resolve; });
  const handler = createShopifyOrderWebhookHandler('orders/create', {
    verify: (bytes, hmac) => bytes.equals(raw) && hmac === 'valid', emit: () => {},
    process: async input => { assert.equal(input.body.id, 123); assert.equal(input.eventId, 'event-123'); started(); await persisted; },
  });
  const res = response();
  const result = handler(request() as any, res as any);
  await ready;
  assert.equal(res.code, 0);
  finish(); await result;
  assert.equal(res.code, 200);
});
test('persistence failure is retryable and emits no customer details', async () => {
  const lines: string[] = [];
  const res = response();
  await createShopifyOrderWebhookHandler('orders/create', { verify: () => true,
    process: async () => { throw Error('private customer payload'); }, emit: line => lines.push(line),
  })(request() as any, res as any);
  assert.equal(res.code, 503);
  assert.ok(!JSON.stringify([lines, res.body]).includes('private customer payload'));
});
test('invalid signature, missing raw bytes, wrong topic/domain and absent delivery ID never process', async () => {
  let calls = 0;
  const handler = createShopifyOrderWebhookHandler('orders/create', { verify: (_raw, hmac) => hmac === 'valid',
    process: async () => { calls++; }, emit: () => {},
  });
  for (const mutate of [
    (req: any) => { req.headers['x-shopify-hmac-sha256'] = 'invalid'; },
    (req: any) => { delete req.rawBody; },
    (req: any) => { req.headers['x-shopify-topic'] = 'customers/create'; },
    (req: any) => { req.headers['x-shopify-shop-domain'] = 'foreign.invalid'; },
    (req: any) => { delete req.headers['x-shopify-event-id']; },
  ]) {
    const req = request(); mutate(req); const res = response();
    await handler(req as any, res as any);
    assert.ok([400, 401].includes(res.code));
  }
  assert.equal(calls, 0);
});

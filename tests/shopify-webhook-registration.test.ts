import assert from "node:assert/strict";
import test from "node:test";
import { registerVerifiedShopWebhooks } from "../server/shopifyWebhookRegistration";
import { SHOPIFY_GRAPHQL_WEBHOOK_SPECS as specs } from "../shared/shopifyWebhookHealth";
const host = "https://fixture.example.invalid";
const staging = "https://whachatcrm-staging-app-staging.up.railway.app";
function fixture(options: { host?: string; grants?: string[] | null; existing?: any[]; lookupFails?: boolean; mutation?: any; confirm?: boolean } = {}) {
  const origin = options.host ?? host;
  let existing = options.existing ?? [];
  let mutations = 0;
  const client = { request: async (query: string, args?: any) => {
    if (query.includes('shopifyAppInstallationScopes')) return { data: { currentAppInstallation: { accessScopes: options.grants === null ? [] : (options.grants ?? ['read_customers', 'read_orders']).map(handle => ({ handle })) } } };
    if (query.includes('listWebhookSubscriptions')) {
      if (options.lookupFails) throw new Error('401');
      return { data: { webhookSubscriptions: { edges: existing.map(node => ({ node: { ...node, endpoint: { callbackUrl: node.callbackUrl } } })), pageInfo: { hasNextPage: false } } } };
    }
    mutations++;
    const spec = specs.find(s => s.topic === args.variables.topic)!;
    if (options.confirm !== false) existing = [...existing, { id: String(mutations), topic: spec.topic, callbackUrl: origin + spec.pathSuffix }];
    return options.mutation ?? { data: { webhookSubscriptionCreate: { webhookSubscription: { id: String(mutations) }, userErrors: [] } } };
  } };
  return { run: () => registerVerifiedShopWebhooks({ getClient: () => client, host: origin, requestedScopes: ['read_customers', 'read_orders'] }), mutations: () => mutations };
}
const registrations = (origin = host) => specs.map(s => ({ id: s.topic, topic: s.topic, callbackUrl: origin + s.pathSuffix }));
test('existing verified subscriptions and repeated runs create no duplicates', async () => {
  const f = fixture();
  assert.ok((await f.run()).every(r => r.status === 'registered'));
  assert.ok((await f.run()).every(r => r.status === 'already_registered'));
  assert.equal(f.mutations(), 3);
});
test('staging commerce is app-owned; verified per-shop uninstall is preserved', async () => {
  const f = fixture({ host: staging, existing: registrations(staging).slice(0, 1) });
  const result = await f.run();
  assert.equal(result[0].status, 'already_registered');
  assert.ok(result.slice(1).every(r => r.status === 'skipped_verification' && r.message?.includes('app-managed')));
  assert.equal(f.mutations(), 0);
});
test('staging existing matching commerce is acknowledged without mutation', async () => {
  const f = fixture({ host: staging, existing: registrations(staging) });
  assert.ok((await f.run()).every(r => r.status === 'already_registered'));
  assert.equal(f.mutations(), 0);
});
test('unknown subscription lookup prevents all creations', async () => {
  const f = fixture({ lookupFails: true });
  assert.ok((await f.run()).every(r => r.status === 'skipped_verification'));
  assert.equal(f.mutations(), 0);
});
test('unknown scopes remain fail-closed even with known commerce registrations', async () => {
  const f = fixture({ grants: null, existing: registrations() });
  assert.ok((await f.run()).slice(1).every(r => r.status === 'skipped_verification'));
  assert.equal(f.mutations(), 0);
});
for (const missing of ['read_customers', 'read_orders']) test(`missing ${missing} blocks its commerce mutation`, async () => {
  const f = fixture({ grants: ['read_customers', 'read_orders'].filter(s => s !== missing), existing: registrations() });
  const result = await f.run();
  assert.equal(result[missing === 'read_customers' ? 1 : 2].status, 'skipped_scope');
  assert.equal(f.mutations(), 0);
});
for (const mode of ['duplicate', 'conflict', 'case']) test(`${mode} requires review and never creates parallel subscriptions`, async () => {
  let existing = registrations();
  if (mode === 'duplicate') existing.push({ ...existing[0], id: 'duplicate' });
  else existing[0].callbackUrl = mode === 'case' ? existing[0].callbackUrl.toUpperCase() : 'https://wrong.example.invalid';
  const f = fixture({ existing });
  assert.equal((await f.run())[0].status, 'failed');
  assert.equal(f.mutations(), 0);
});
for (const [name, mutation] of Object.entries({ empty: {}, nullPayload: { data: { webhookSubscriptionCreate: null } }, missingId: { data: { webhookSubscriptionCreate: { userErrors: [] } } }, graphqlError: { errors: [{ message: 'denied' }] }, duplicateError: { data: { webhookSubscriptionCreate: { userErrors: [{ message: 'already been taken' }] } } } })) {
  test(`${name} never reports unverified success`, async () => {
    const f = fixture({ existing: registrations().slice(1), mutation, confirm: false });
    assert.equal((await f.run())[0].status, 'failed');
  });
}
test('mutation ID without confirmed callback is failure', async () => {
  const f = fixture({ existing: registrations().slice(1), confirm: false });
  assert.equal((await f.run())[0].status, 'failed');
});
test('concurrent duplicate error only succeeds after read-back confirmation', async () => {
  const f = fixture({ existing: registrations().slice(1), mutation: { data: { webhookSubscriptionCreate: { userErrors: [{ message: 'already been taken' }] } } } });
  assert.equal((await f.run())[0].status, 'already_registered');
});
test('protected data rejection stays distinct from missing scope', async () => {
  const f = fixture({ existing: registrations().slice(0, 1), confirm: false, mutation: { data: { webhookSubscriptionCreate: { userErrors: [{ message: 'Protected customer data not approved for this app' }] } } } });
  assert.ok((await f.run()).slice(1).every(r => r.status === 'skipped_protected_data'));
});

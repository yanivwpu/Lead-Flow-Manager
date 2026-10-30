import test from "node:test";
import assert from "node:assert/strict";
import { buildShopWebhookHealthReport, verifyShopScopes, listVerifiedWebhookSubscriptions, classifyRegistrationFailure } from "../server/shopifyWebhookHealthAudit";
import { SHOPIFY_GRAPHQL_WEBHOOK_SPECS } from "../shared/shopifyWebhookHealth";
const host = "https://crm.example.com";
const grants = ["read_orders", "read_customers"];
const listed = SHOPIFY_GRAPHQL_WEBHOOK_SPECS.map(s => ({ id: s.topic, topic: s.topic, callbackUrl: host + s.pathSuffix }));
function report(overrides: Partial<Parameters<typeof buildShopWebhookHealthReport>[0]> = {}) {
  return buildShopWebhookHealthReport({ shop: "one.myshopify.com", host, requestedScopes: grants,
    scopes: { status: "verified", grantedScopes: grants }, subscriptions: { status: "verified", listed }, ...overrides });
}
test("actual installation scopes verified independently of requested scopes", async () => {
  let query = "";
  const result = await verifyShopScopes(() => ({ request: async q => { query = q; return { data: { currentAppInstallation: { accessScopes: [{ handle: "read_customers" }] } } }; } }));
  assert.match(query, /currentAppInstallation.*accessScopes/s);
  assert.deepEqual(result, { status: "verified", grantedScopes: ["read_customers"] });
});
for (const scope of grants) test(`confirmed missing ${scope} requires action`, () => {
  const r = report({ scopes: { status: "verified", grantedScopes: grants.filter(s => s !== scope) } });
  assert.deepEqual(r.missingScopes, [scope]);
  assert.equal(r.webhooks.find(w => w.topic === (scope === "read_orders" ? "ORDERS_CREATE" : "CUSTOMERS_CREATE"))?.status, "blocked_scope");
  assert.equal(r.summary.status, "Action Required"); assert.equal(r.summary.healthy, false);
});
for (const [label, response] of Object.entries({ empty: {}, nullInstallation: { data: { currentAppInstallation: null } }, noScopes: { data: { currentAppInstallation: { accessScopes: [] } } }, graphqlError: { errors: [{ message: "denied" }], data: { currentAppInstallation: { accessScopes: [{ handle: "read_orders" }] } } }, malformed: { data: { currentAppInstallation: { accessScopes: [{ handle: "" }] } } } })) {
  test(`${label} scope response is unknown`, async () => {
    const result = await verifyShopScopes(() => ({ request: async () => response }));
    assert.equal(result.status, "unknown"); assert.deepEqual(result.grantedScopes, []);
  });
}
test("GraphQL failure, authentication failure, unavailable client and timeout fail closed", async () => {
  for (const message of ["GraphQL failed", "401 Unauthorized"]) {
    assert.equal((await verifyShopScopes(() => ({ request: async () => { throw new Error(message); } }))).status, "unknown");
  }
  assert.equal((await verifyShopScopes(() => { throw new Error("not configured"); })).status, "unknown");
  assert.equal((await verifyShopScopes(() => ({ request: () => new Promise(() => {}) }), 5)).status, "unknown");
});
test("unknown scopes do not become missing; overall cannot be green", () => {
  const r = report({ scopes: { status: "unknown", grantedScopes: [], reason: "failed" } });
  assert.deepEqual(r.missingScopes, []); assert.deepEqual(r.unknownScopes, grants);
  assert.equal(r.summary.status, "Verification Unavailable"); assert.equal(r.summary.healthy, false);
});
test("incorrect callback path including case is action required", () => {
  const r = report({ subscriptions: { status: "verified", listed: listed.map(h => h.topic === "ORDERS_CREATE" ? { ...h, callbackUrl: h.callbackUrl.toUpperCase() } : h) } });
  assert.equal(r.webhooks.find(w => w.topic === "ORDERS_CREATE")?.status, "wrong_url");
  assert.equal(r.summary.healthy, false);
});
test("matching duplicate callback is selected", () => {
  const r = report({ subscriptions: { status: "verified", listed: [{ ...listed[0], callbackUrl: "https://wrong.example" }, ...listed] } });
  assert.equal(r.webhooks[0].status, "registered");
});
for (const topic of ["CUSTOMERS_CREATE", "ORDERS_CREATE"]) test(`missing ${topic} is missing registration, not inferred rejection`, () => {
  const r = report({ subscriptions: { status: "verified", listed: listed.filter(h => h.topic !== topic) } });
  assert.equal(r.webhooks.find(w => w.topic === topic)?.status, "missing");
  assert.equal(r.summary.status, "Action Required"); assert.equal(r.summary.healthy, false);
  if (topic === "ORDERS_CREATE") assert.equal(r.ordersCreateAudit.registrationBlockedReason, "not_attempted");
});
test("explicit protected-data rejection and generic failed registrations are separate", () => {
  for (const topic of ["CUSTOMERS_CREATE", "ORDERS_CREATE"]) {
    assert.equal(classifyRegistrationFailure(topic, "Protected customer data not approved for this app"), "skipped_protected_data");
    const r = report({ subscriptions: { status: "verified", listed: [] }, registrationAttempts: [{ topic, address: host, status: "skipped_protected_data", message: "Protected customer data rejected" }] });
    assert.equal(r.webhooks.find(w => w.topic === topic)?.status, "protected_data_unconfirmed");
    assert.equal(r.failedRegistrations.length, 1); assert.equal(r.summary.healthy, false);
  }
  const r = report({ subscriptions: { status: "verified", listed: [] }, registrationAttempts: [{ topic: "ORDERS_CREATE", address: host, status: "failed", message: "Shopify rejected callback" }] });
  assert.equal(r.webhooks.find(w => w.topic === "ORDERS_CREATE")?.status, "blocked_shopify");
});
test("TOML compliance declarations are not confirmed live registrations", () => {
  const r = report();
  assert.equal(r.webhooks.filter(w => w.registrationMethod === "graphql").every(w => w.status === "registered"), true);
  const app = r.webhooks.filter(w => w.registrationMethod === "app_toml");
  assert.deepEqual(app.map(w => w.topic), ["orders/fulfilled", "orders/cancelled", "customers/update", "customers/data_request", "customers/redact", "shop/redact"]);
  assert.equal(app.every(w => w.registeredCallbackUrl === null && w.status === "app_config"), true);
  assert.equal(r.summary.status, "Verification Unavailable"); assert.equal(r.summary.healthy, false);
  assert.equal(r.protectedCustomerData.reportedApprovalDate, "2026-06-25");
  assert.equal(r.protectedCustomerData.liveConfirmation, "not_confirmed");
  assert.equal(r.oauthScopesRequested.includes("read_all_orders"), false);
});
test("webhook lookup failure remains unknown, not missing", () => {
  const r = report({ subscriptions: { status: "unknown", listed: [] } });
  assert.equal(r.webhooks.filter(w => w.registrationMethod === "graphql").every(w => w.status === "registration_unknown"), true);
  assert.equal(r.summary.missingRequired, 0); assert.equal(r.summary.healthy, false);
});
test("subscription response must be complete, empty connection is valid and pagination is verified", async () => {
  await assert.rejects(listVerifiedWebhookSubscriptions({ request: async () => ({}) }));
  assert.deepEqual(await listVerifiedWebhookSubscriptions({ request: async () => ({ data: { webhookSubscriptions: { edges: [], pageInfo: { hasNextPage: false } } } }) }), []);
  let count = 0;
  const result = await listVerifiedWebhookSubscriptions({ request: async (_q, options) => {
    count++; assert.equal(options.variables.cursor, count === 1 ? null : "next");
    return { data: { webhookSubscriptions: { edges: [{ node: { id: String(count), topic: "ORDERS_CREATE", endpoint: { callbackUrl: host } } }], pageInfo: { hasNextPage: count === 1, endCursor: "next" } } } };
  } });
  assert.equal(result.length, 2);
  await assert.rejects(listVerifiedWebhookSubscriptions({ request: async () => ({ data: { webhookSubscriptions: { edges: [], pageInfo: { hasNextPage: true, endCursor: null } } } }) }));
});

test("subscription authentication, GraphQL failure and timeout do not confirm absence", async () => {
  await assert.rejects(listVerifiedWebhookSubscriptions({ request: async () => { throw new Error("401"); } }));
  await assert.rejects(listVerifiedWebhookSubscriptions({ request: async () => ({ errors: [{ message: "denied" }] }) }));
  await assert.rejects(listVerifiedWebhookSubscriptions({ request: () => new Promise(() => {}) }, 5), /timed out/);
});

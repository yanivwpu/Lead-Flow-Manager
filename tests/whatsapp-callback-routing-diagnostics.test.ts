import test from "node:test";
import assert from "node:assert/strict";
import { buildCallbackRoutingDiagnostics as report, callbackTarget, fetchAppWebhookSubscriptions,
  fetchPhoneWebhookConfiguration, buildStagingCallbackRepairDryRun as preview, STAGING_CALLBACK_SCOPE as scope } from "../server/whatsappCallbackRoutingDiagnostics";

const appId = "123456789";
const input = (row: Record<string, unknown>, appBody: unknown = {data: []}) => ({
  appId, wabaStatus: 200, wabaBody: {data: [row]}, appStatus: 200, appBody,
});
test("membership without callback metadata never proves a destination", () => {
  for (const extra of [{}, {override_callback_uri: null}, {override_callback_uri: ""}]) {
    const result = report(input({whatsapp_business_api_data: {id: appId}, ...extra}, {
      data: [{object: "whatsapp_business_account", callback_url: "https://app.whachatcrm.com/api/webhook/meta", fields: [{name: "messages"}]}],
    }));
    assert.equal(result.configuredAppMembership, "present");
    assert.equal(result.appCallback.category, "production");
    assert.equal(result.messagesSubscribed, "yes");
    assert.equal(result.effectiveCallback.category, "unknown");
    assert.equal(result.inboundReceipt, "not_measured");
  }
});
test("reports only the configured app override and strips URL secrets", () => {
  const result = report(input({whatsapp_business_api_data: {id: appId},
    override_callback_uri: "https://whachatcrm-staging-app-staging.up.railway.app/api/webhook/meta?secret=DO_NOT_EXPOSE#private"}));
  assert.equal(result.reportedWabaOverride.category, "staging");
  assert.equal(result.reportedWabaOverride.expectedPath, true);
  assert.equal(result.effectiveCallback.category, "unknown", "a WABA row cannot exclude a phone override");
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_EXPOSE|private|secret=/);
  assert.equal(report(input({id: "987654321", override_callback_uri: "https://app.whachatcrm.com/api/webhook/meta"})).effectiveCallback.category, "unknown");
});
test("rejects ambiguous identity, failed Graph probes, and unrelated nested IDs", () => {
  const row = {id: appId, override_callback_uri: "https://app.whachatcrm.com/api/webhook/meta"};
  assert.equal(report({...input(row), wabaBody: {data: [row, row]}}).configuredAppMembership, "unknown");
  assert.equal(report(input({other: {id: appId}, override_callback_uri: row.override_callback_uri})).configuredAppMembership, "absent");
  const failed = report({...input(row), wabaStatus: 400, wabaBody: {error: {code: 190, error_subcode: 463, message: "secret-provider-message"}}});
  assert.equal(failed.wabaProbe.errorSubcode, 463);
  assert.equal(failed.configuredAppMembership, "unknown");
  assert.equal(failed.effectiveCallback.category, "unknown");
  assert.doesNotMatch(JSON.stringify(failed), /secret-provider-message/);
  assert.equal(report({...input({}), wabaBody: {data: [], paging: {next: "secret-url"}}}).configuredAppMembership, "unknown");
  assert.equal(report({...input({}), wabaBody: {_parseError: true}}).configuredAppMembership, "unknown");
  assert.equal(report({...input({}), wabaBody: null}).configuredAppMembership, "unknown");
});
test("app fields are independent of WABA membership and incomplete responses stay unknown", () => {
  assert.equal(report(input({id: appId}, {data: [{object: "whatsapp_business_account", fields: []}]})).messagesSubscribed, "no");
  assert.equal(report(input({id: appId})).messagesSubscribed, "unknown");
  assert.equal(report({...input({id: appId}), appStatus: 403}).messagesSubscribed, "unknown");
  assert.equal(callbackTarget("https://unrelated.example/private?token=SECRET").origin, null);
  assert.equal(callbackTarget("https://user:SECRET@app.whachatcrm.com/api/webhook/meta").category, "unknown");
  assert.equal(callbackTarget("http://app.whachatcrm.com/api/webhook/meta").category, "unknown");
  assert.equal(callbackTarget("https://app.whachatcrm.com/wrong-path").expectedPath, false);
});
test("app probe uses only GET and header credentials; failures never expose exception text", async () => {
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "https://graph.facebook.com/v25.0/123456789/subscriptions");
    assert.equal(init?.method, "GET");
    assert.deepEqual(init?.headers, {Authorization: "Bearer 123456789|APP_SECRET"});
    return new Response(JSON.stringify({data: []}), {status: 200});
  }) as typeof fetch;
  assert.deepEqual(await fetchAppWebhookSubscriptions({graphBase: "https://graph.facebook.com/v25.0", appId, appSecret: "APP_SECRET", fetchImpl}), {status: 200, body: {data: []}});
  const fail = (async () => {throw Error("APP_SECRET");}) as typeof fetch;
  assert.deepEqual(await fetchAppWebhookSubscriptions({graphBase: "https://graph.facebook.com/v25.0", appId, appSecret: "APP_SECRET", fetchImpl: fail}), {status: null, body: null});
});

const production = "https://app.whachatcrm.com/api/webhook/meta";
const hierarchy = (config: Record<string, unknown>, patch: Record<string, unknown> = {}) => report({
  appId: scope.appId, wabaStatus: 200, wabaBody: {data: [{whatsapp_business_api_data: {id: scope.appId}}]},
  appStatus: 200, appBody: {data: [{object: "whatsapp_business_account", callback_url: production, fields: ["messages"]}]},
  phoneNumberId: scope.phoneNumberId, phoneStatus: 200, phoneTokenAppId: scope.appId,
  phoneBody: {id: scope.phoneNumberId, webhook_configuration: config}, ...patch,
});
const planInput = (routing = hierarchy({application: production})) => ({
  env: {RAILWAY_ENVIRONMENT_NAME: "staging", APP_URL: scope.callback.replace("/api/webhook/meta", "")},
  appId: scope.appId, wabaId: scope.wabaId, phoneNumberId: scope.phoneNumberId,
  ownerMatchesSession: true, phoneUnderWaba: true, verifyTokenConfigured: true,
  token: {ok: true, is_valid: true, app_id: scope.appId, scopes: ["whatsapp_business_management"]}, routing,
});

test("missing and malformed configured app identities remain unknown", () => {
  for (const id of ["", "bad-id", " "]) {
    assert.equal(report({...input({id: "123"}), appId: id}).configuredAppMembership, "unknown");
  }
});

test("phone configuration resolves phone, WABA and app precedence without claiming receipt", () => {
  for (const [config, category, source] of [
    [{application: production}, "production", "application"],
    [{application: production, whatsapp_business_account: scope.callback}, "staging", "whatsapp_business_account"],
    [{application: production, whatsapp_business_account: scope.callback, phone_number: "https://elsewhere.example/private?secret=HIDE"}, "other", "phone_number"],
  ] as const) {
    const r = hierarchy(config);
    assert.equal(r.effectiveCallback.category, category);
    assert.equal(r.effectiveCallbackEvidence, `phone_configuration_${source}`);
    assert.equal(r.inboundReceipt, "not_measured");
    assert.doesNotMatch(JSON.stringify(r), /elsewhere|HIDE|private/);
  }
});

test("failed, missing, wrong-phone, contradictory and invalid hierarchy evidence stays unknown", () => {
  const config = {application: production, phone_number: "invalid"};
  assert.equal(hierarchy(config).effectiveCallback.category, "unknown");
  for (const patch of [
    {phoneTokenAppId: null}, {phoneTokenAppId: "another-app"},
    {phoneStatus: 403}, {phoneBody: null}, {phoneBody: {}},
    {phoneBody: {id: "another-phone", webhook_configuration: {application: production}}},
    {phoneBody: {id: scope.phoneNumberId, webhook_configuration: {}}},
    {wabaBody: {data: []}},
    {wabaBody: {data: [{id: scope.appId, override_callback_uri: scope.callback}]}},
  ]) assert.equal(hierarchy({application: production}, patch).effectiveCallback.category, "unknown");
});

test("phone probe uses the saved phone ID, GET and header-only credentials; failures are isolated", async () => {
  let calls = 0;
  const options = {graphBase: "https://graph.facebook.com/v25.0", phoneNumberId: scope.phoneNumberId, accessToken: "PRIVATE_TOKEN"};
  const fetchImpl = (async (url, init) => {
    calls++;
    assert.equal(String(url), `https://graph.facebook.com/v25.0/${scope.phoneNumberId}?fields=webhook_configuration`);
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.deepEqual(init?.headers, {Authorization: "Bearer PRIVATE_TOKEN"});
    return new Response(JSON.stringify({error: {code: 100, message: "PRIVATE_TOKEN"}}), {status: 400});
  }) as typeof fetch;
  const result = await fetchPhoneWebhookConfiguration({...options, fetchImpl});
  assert.equal(result.status, 400);
  const safe = hierarchy({application: production}, {phoneStatus: result.status, phoneBody: result.body});
  assert.equal(safe.phoneProbe.errorCode, 100);
  assert.doesNotMatch(JSON.stringify(safe), /PRIVATE_TOKEN/);
  await fetchPhoneWebhookConfiguration({...options, phoneNumberId: "invalid", fetchImpl});
  assert.equal(calls, 1);
  const fail = (async () => {throw Error("PRIVATE_TOKEN");}) as typeof fetch;
  assert.deepEqual(await fetchPhoneWebhookConfiguration({...options, fetchImpl: fail}), {status: null, body: null});
});

test("dry-run proposes only the test WABA override and a subscription-preserving rollback", () => {
  const result = preview(planInput());
  assert.equal(result.decision, "approval_required");
  assert.equal(result.mutationPerformed, false);
  assert.equal(result.requiresExplicitApproval, true);
  assert.equal(result.proposedRequest.path, `/${scope.wabaId}/subscribed_apps`);
  assert.equal(result.proposedRequest.body.override_callback_uri, scope.callback);
  assert.match(result.proposedRequest.body.verify_token, /withheld/);
  assert.match(result.rollback.instruction, /Never DELETE/);
  assert.match(result.rollback.instruction, /no body/);
  assert.equal(preview(planInput(hierarchy({application: production, whatsapp_business_account: scope.callback}))).decision, "already_correct");
});

test("dry-run blocks other WABAs, tenants, apps, production, missing credentials and uncertain routing", () => {
  const base = planInput();
  for (const patch of [
    {wabaId: "another-waba"}, {phoneNumberId: "another-phone"}, {appId: "another-app"},
    {env: {...base.env, RAILWAY_ENVIRONMENT_NAME: "production"}},
    {env: {...base.env, APP_URL: "https://app.whachatcrm.com"}},
    {ownerMatchesSession: false}, {phoneUnderWaba: false}, {verifyTokenConfigured: false},
    {token: {...base.token, app_id: "another-app"}}, {token: {...base.token, is_valid: false}},
    {token: {...base.token, scopes: []}},
    {routing: hierarchy({})},
    {routing: hierarchy({application: production, phone_number: production})},
    {routing: hierarchy({application: production, whatsapp_business_account: `${production}?private=HIDE`})},
    {routing: hierarchy({application: production, whatsapp_business_account: "https://other.example/hook"})},
  ]) {
    const result = preview({...base, ...patch});
    assert.equal(result.decision, "blocked", JSON.stringify(patch));
    assert.ok(result.blockers.length > 0);
    assert.equal(result.mutationPerformed, false);
    assert.doesNotMatch(JSON.stringify(result), /private=HIDE|other\.example/);
  }
});

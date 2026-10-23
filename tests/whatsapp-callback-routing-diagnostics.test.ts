import test from "node:test";
import assert from "node:assert/strict";
import { buildCallbackRoutingDiagnostics as report, callbackTarget, fetchAppWebhookSubscriptions } from "../server/whatsappCallbackRoutingDiagnostics";

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
  assert.equal(result.effectiveCallback.category, "staging");
  assert.equal(result.effectiveCallback.expectedPath, true);
  assert.equal(result.effectiveCallbackEvidence, "waba_override_reported");
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

/** Read-only evidence. Subscription membership and endpoint reachability do not prove delivery. */
type Json = Record<string, unknown>;
const object = (v: unknown): Json => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Json : {};
const rows = (v: unknown): Json[] => Array.isArray(object(v).data) ? (object(v).data as unknown[]).map(object) : [];
const STAGING = "https://whachatcrm-staging-app-staging.up.railway.app";
const PRODUCTION = "https://app.whachatcrm.com";

export function callbackTarget(value: unknown) {
  const unknown = { category: "unknown", origin: null as string | null, expectedPath: false };
  if (typeof value !== "string" || !value) return unknown;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return unknown;
    // Never expose arbitrary hosts, paths, credentials, fragments or query parameters.
    const category = url.origin === STAGING ? "staging" : url.origin === PRODUCTION ? "production" : "other";
    return { category, origin: category === "other" ? null : url.origin, expectedPath: url.pathname === "/api/webhook/meta" };
  } catch { return unknown; }
}

export function graphProbeSummary(status: number | null, body: unknown) {
  const error = object(object(body).error);
  return {
    httpStatus: status,
    ok: status !== null && status >= 200 && status < 300 && !object(body).error,
    errorCode: typeof error.code === "number" ? error.code : null,
    errorSubcode: typeof error.error_subcode === "number" ? error.error_subcode : null,
  };
}

export function buildCallbackRoutingDiagnostics(input: {
  appId: string; wabaStatus: number | null; wabaBody: unknown;
  appStatus: number | null; appBody: unknown; checkedAt?: string;
}) {
  const wabaProbe = graphProbeSummary(input.wabaStatus, input.wabaBody);
  const appProbe = graphProbeSummary(input.appStatus, input.appBody);
  // Match only explicit app identity fields in a single row; never search arbitrary nested IDs.
  const matches = rows(input.wabaBody).filter(row => input.appId &&
    [row.id, row.app_id, object(row.whatsapp_business_api_data).id,
      object(row.application).id, object(row.app).id].some(id => String(id ?? "") === input.appId));
  const membership = !wabaProbe.ok || !Array.isArray(object(input.wabaBody).data) ? "unknown" : matches.length === 1 ? "present" :
    matches.length > 1 || object(object(input.wabaBody).paging).next ? "unknown" : "absent";
  const row = membership === "present" ? matches[0] : {};
  const override = wabaProbe.ok ? callbackTarget(row.override_callback_uri) : callbackTarget(null);
  const subscriptions = appProbe.ok ? rows(input.appBody).filter(row => row.object === "whatsapp_business_account") : [];
  const subscription = subscriptions.length === 1 ? subscriptions[0] : {};
  const appCallback = callbackTarget(subscription.callback_url);
  const fields = Array.isArray(subscription.fields) ? subscription.fields : [];
  const messagesSubscribed = !appProbe.ok || subscriptions.length !== 1 || !Array.isArray(subscription.fields) ? "unknown" :
    fields.some(field => field === "messages" || object(field).name === "messages") ? "yes" :
    object(object(input.appBody).paging).next ? "unknown" : "no";
  return {
    diagnosticOnly: true,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    wabaProbe, appProbe, configuredAppMembership: membership,
    reportedWabaOverride: override,
    appCallback,
    messagesSubscribed,
    // Omission/null is not proof that Meta has no override. Never infer effective routing from membership.
    effectiveCallback: override,
    effectiveCallbackEvidence: override.category === "unknown" ? "not_exposed" : "waba_override_reported",
    inboundReceipt: "not_measured",
  };
}

/** GET only; use the app's own credential, never a tenant token, for app subscriptions. */
export async function fetchAppWebhookSubscriptions(input: {
  graphBase: string; appId: string; appSecret: string; fetchImpl?: typeof fetch;
}): Promise<{ status: number | null; body: unknown }> {
  if (!/^\d+$/.test(input.appId) || !input.appSecret) return { status: null, body: null };
  try {
    const response = await (input.fetchImpl ?? fetch)(`${input.graphBase}/${encodeURIComponent(input.appId)}/subscriptions`, {
      method: "GET", headers: { Authorization: `Bearer ${input.appId}|${input.appSecret}` },
      signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch { return { status: null, body: null }; }
}

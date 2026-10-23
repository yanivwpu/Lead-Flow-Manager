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
  phoneNumberId?: string; phoneStatus?: number | null; phoneBody?: unknown;
}) {
  const wabaProbe = graphProbeSummary(input.wabaStatus, input.wabaBody);
  const appProbe = graphProbeSummary(input.appStatus, input.appBody);
  // Match only explicit app identity fields in a single row; never search arbitrary nested IDs.
  const matches = rows(input.wabaBody).filter(row => input.appId &&
    [row.id, row.app_id, object(row.whatsapp_business_api_data).id,
      object(row.application).id, object(row.app).id].some(id => String(id ?? "") === input.appId));
  const membership = !/^\d+$/.test(input.appId) || !wabaProbe.ok || !Array.isArray(object(input.wabaBody).data) ? "unknown" : matches.length === 1 ? "present" :
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
  const phoneProbe = graphProbeSummary(input.phoneStatus ?? null, input.phoneBody);
  const phoneBody = object(input.phoneBody);
  const phoneIdentityMatches = !!input.phoneNumberId && phoneBody.id === input.phoneNumberId;
  const config = phoneProbe.ok && phoneIdentityMatches ? object(phoneBody.webhook_configuration) : {};
  const reportedPhoneConfiguration = {
    phoneNumber: callbackTarget(config.phone_number),
    waba: callbackTarget(config.whatsapp_business_account),
    application: callbackTarget(config.application),
  };
  const completePhoneConfiguration = membership === "present" && reportedPhoneConfiguration.application.category !== "unknown";
  const priorWaba = config.whatsapp_business_account;
  const wabaRollbackState = !completePhoneConfiguration ? "unknown" :
    priorWaba === undefined || priorWaba === null || priorWaba === "" ? "absent" :
    priorWaba === `${STAGING}/api/webhook/meta` || priorWaba === `${PRODUCTION}/api/webhook/meta` ? "known_exact" : "unknown";
  const wabaEvidenceConsistent = completePhoneConfiguration &&
    (row.override_callback_uri === undefined || row.override_callback_uri === null || row.override_callback_uri === "" ||
      row.override_callback_uri === priorWaba);
  // The phone GET exposes the hierarchy for the requesting app. A WABA row alone
  // cannot rule out a higher-priority phone override. Missing configuration, a
  // malformed higher-priority value, or a failed probe must never imply fallback.
  let effectiveCallback = callbackTarget(null);
  let effectiveCallbackEvidence = "not_exposed";
  if (completePhoneConfiguration) {
    const level = ["phone_number", "whatsapp_business_account", "application"]
      .find(key => config[key] !== undefined && config[key] !== null && config[key] !== "");
    if (level) {
      effectiveCallback = callbackTarget(config[level]);
      effectiveCallbackEvidence = effectiveCallback.category === "unknown" ? "invalid_phone_configuration" : `phone_configuration_${level}`;
    }
    if (!wabaEvidenceConsistent && level !== "phone_number") {
      effectiveCallback = callbackTarget(null);
      effectiveCallbackEvidence = "conflicting_waba_evidence";
    }
  }
  return {
    diagnosticOnly: true,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    wabaProbe, appProbe, phoneProbe, phoneIdentityMatches, configuredAppMembership: membership,
    reportedWabaOverride: override,
    reportedPhoneConfiguration,
    wabaRollbackState, wabaEvidenceConsistent,
    appCallback,
    messagesSubscribed,
    effectiveCallback,
    effectiveCallbackEvidence,
    inboundReceipt: "not_measured",
  };
}

/** Separate optional GET: an unsupported field must not break existing phone diagnostics. */
export async function fetchPhoneWebhookConfiguration(input: {
  graphBase: string; phoneNumberId: string; accessToken: string; fetchImpl?: typeof fetch;
}): Promise<{ status: number | null; body: unknown }> {
  if (!/^\d+$/.test(input.phoneNumberId) || !input.accessToken) return { status: null, body: null };
  try {
    const response = await (input.fetchImpl ?? fetch)(`${input.graphBase}/${input.phoneNumberId}?fields=webhook_configuration`, {
      method: "GET", headers: { Authorization: `Bearer ${input.accessToken}` },
      redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch { return { status: null, body: null }; }
}

export const STAGING_CALLBACK_SCOPE = {
  appId: "810621184995059", wabaId: "967263072832328", phoneNumberId: "1144480422078565",
  callback: `${STAGING}/api/webhook/meta`,
} as const;

/** Pure preview only. There is deliberately no apply route or callback-changing fetch. */
export function buildStagingCallbackRepairDryRun(input: {
  env: { RAILWAY_ENVIRONMENT_NAME?: string; APP_URL?: string };
  appId: string; wabaId: string; phoneNumberId: string;
  ownerMatchesSession: boolean; phoneUnderWaba: boolean; verifyTokenConfigured: boolean;
  token: { ok: boolean; is_valid?: boolean | null; app_id?: string | null; scopes?: string[] | null };
  routing: ReturnType<typeof buildCallbackRoutingDiagnostics>;
}) {
  const blockers: string[] = [];
  const scope = STAGING_CALLBACK_SCOPE;
  if (input.env.RAILWAY_ENVIRONMENT_NAME !== "staging" ||
      input.env.APP_URL?.replace(/\/$/, "") !== STAGING || input.appId !== scope.appId ||
      input.wabaId !== scope.wabaId || input.phoneNumberId !== scope.phoneNumberId) blockers.push("outside_exact_test_scope");
  if (!input.ownerMatchesSession || !input.phoneUnderWaba) blockers.push("tenant_or_waba_phone_mapping_unverified");
  if (!input.token.ok || input.token.is_valid !== true || input.token.app_id !== scope.appId ||
      !input.token.scopes?.includes("whatsapp_business_management")) blockers.push("token_app_or_management_permission_unverified");
  if (!input.verifyTokenConfigured) blockers.push("staging_verification_token_missing");
  const { routing } = input;
  if (routing.configuredAppMembership !== "present" || routing.messagesSubscribed !== "yes") blockers.push("subscription_prerequisites_unverified");
  if (!routing.phoneProbe.ok || !routing.phoneIdentityMatches || routing.effectiveCallback.category === "unknown") blockers.push("effective_callback_unverified");
  if (routing.effectiveCallbackEvidence === "phone_configuration_phone_number") blockers.push("phone_override_takes_precedence_requires_separate_review");
  // Only the two known, exact webhook URLs can form a safe rollback preview.
  // Query/fragment-bearing or arbitrary prior overrides cannot be reconstructed
  // from redacted evidence and need a securely retained provider snapshot.
  if (routing.wabaRollbackState === "unknown" || !routing.wabaEvidenceConsistent) blockers.push("secure_prior_override_snapshot_required");
  const alreadyCorrect = routing.effectiveCallback.category === "staging" && routing.effectiveCallback.expectedPath;
  return {
    dryRun: true, mutationPerformed: false, requiresExplicitApproval: true,
    scope, checkedAt: routing.checkedAt,
    decision: blockers.length ? "blocked" : alreadyCorrect ? "already_correct" : "approval_required",
    blockers,
    proposedRequest: {
      method: "POST", path: `/${scope.wabaId}/subscribed_apps`,
      body: { override_callback_uri: scope.callback, verify_token: "<existing staging META_WEBHOOK_VERIFY_TOKEN; withheld>" },
    },
    rollback: {
      method: "POST", path: `/${scope.wabaId}/subscribed_apps`,
      instruction: "After separate approval, restore the securely captured prior WABA override and its verification token; if authoritatively absent, POST with no body to restore app fallback. Never DELETE the subscription. Re-read phone webhook_configuration before and after.",
      prerequisite: "Securely retain the exact prior WABA callback state before approval; sanitized URL categories are insufficient for exact restoration.",
    },
    unchanged: ["global_app_callback", "other_waba_subscriptions", "production_credentials", "recovery_flags"],
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

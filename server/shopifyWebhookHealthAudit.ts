import {
  SHOPIFY_APP_CONFIG_WEBHOOK_SPECS,
  SHOPIFY_GRAPHQL_WEBHOOK_SPECS,
  type ShopifyScopeVerification,
  type ShopifyWebhookHealthReport,
  type ShopifyWebhookHealthItem,
  type ShopifyWebhookRegistrationAttempt,
} from "../shared/shopifyWebhookHealth";

export type ListedWebhook = { id: string; topic: string; callbackUrl: string };
type GraphqlClient = { request: (query: string, options?: any) => Promise<any> };

// Bound read-only checks even when the SDK or network never settles.
export async function boundedRequest(client: GraphqlClient, query: string, options?: any, timeoutMs = 10_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      client.request(query, options),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Shopify verification timed out")), timeoutMs); }),
    ]);
    if (!response || response.errors) throw new Error("Shopify verification failed");
    return response;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function verifyShopScopes(getClient: () => GraphqlClient, timeoutMs = 10_000): Promise<ShopifyScopeVerification> {
  try {
    const response = await boundedRequest(getClient(), `query shopifyAppInstallationScopes {
      currentAppInstallation { accessScopes { handle } }
    }`, undefined, timeoutMs);
    const handles = response.data?.currentAppInstallation?.accessScopes;
    if (!Array.isArray(handles) || !handles.length || handles.some(s => typeof s?.handle !== "string" || !s.handle.trim())) {
      throw new Error("Shopify returned no usable scope verification");
    }
    return { status: "verified", grantedScopes: [...new Set<string>(handles.map(s => s.handle.trim()))] };
  } catch {
    return { status: "unknown", grantedScopes: [], reason: "Shopify permissions could not be verified. Retry the read-only check; check authentication if it continues to fail." };
  }
}

export async function listVerifiedWebhookSubscriptions(client: GraphqlClient, timeoutMs = 10_000): Promise<ListedWebhook[]> {
  const listed: ListedWebhook[] = [];
  let cursor: string | null = null;
  const cursors = new Set<string>();
  do {
    const response = await boundedRequest(client, `query listWebhookSubscriptions($cursor: String) {
      webhookSubscriptions(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges { node { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } }
      }
    }`, { variables: { cursor } }, timeoutMs);
    const connection = response.data?.webhookSubscriptions;
    if (!Array.isArray(connection?.edges) || typeof connection?.pageInfo?.hasNextPage !== "boolean") {
      throw new Error("Shopify subscription verification unavailable");
    }
    for (const edge of connection.edges) {
      const n = edge?.node;
      if (!n?.id || !n?.topic || !n?.endpoint) throw new Error("Incomplete Shopify subscription response");
      // Non-HTTP subscriptions still count as registrations with an incorrect callback.
      listed.push({ id: n.id, topic: n.topic, callbackUrl: n.endpoint.callbackUrl ?? "" });
    }
    if (!connection.pageInfo.hasNextPage) return listed;
    cursor = connection.pageInfo.endCursor;
    if (!cursor || cursors.has(cursor)) throw new Error("Incomplete Shopify subscription pagination");
    cursors.add(cursor);
  } while (cursor);
  throw new Error("Incomplete Shopify subscription pagination");
}

export function classifyRegistrationFailure(topic: string, message: string): ShopifyWebhookRegistrationAttempt["status"] {
  return ["ORDERS_CREATE", "CUSTOMERS_CREATE"].includes(topic) && /protected customer|protected data|customer data access|not approved for|\bpcd\b/i.test(message)
    ? "skipped_protected_data" : "failed";
}

// URL paths and query strings are case sensitive; only URL parsing normalizes the host.
function normalizeUrl(value: string) {
  try { return new URL(value.trim()).href; } catch { return value; }
}
function sameTopic(a: string, b: string) { return a.toUpperCase().replaceAll("/", "_") === b.toUpperCase().replaceAll("/", "_"); }

export function buildShopWebhookHealthReport(params: {
  shop: string;
  host: string;
  requestedScopes: readonly string[];
  scopes: ShopifyScopeVerification;
  subscriptions: { status: "verified" | "unknown"; listed: ListedWebhook[] };
  registrationAttempts?: ShopifyWebhookRegistrationAttempt[];
}): ShopifyWebhookHealthReport {
  const { shop, host, requestedScopes, scopes, subscriptions } = params;
  const grantedScopes: string[] = [...scopes.grantedScopes];
  const requiredScopes = [...new Set(SHOPIFY_GRAPHQL_WEBHOOK_SPECS.flatMap(s => s.requiredScopes ?? []))];
  const missingScopes = scopes.status === "verified" ? [...new Set([...requestedScopes, ...requiredScopes])].filter(s => !grantedScopes.includes(s)) : [];
  const failedRegistrations = (params.registrationAttempts ?? []).filter(a => !["registered", "already_registered"].includes(a.status));
  const webhooks: ShopifyWebhookHealthItem[] = SHOPIFY_GRAPHQL_WEBHOOK_SPECS.map(spec => {
    const expected = `${host.replace(/\/+$/, "")}${spec.pathSuffix}`;
    const matches = subscriptions.listed.filter(h => sameTopic(h.topic, spec.topic));
    const correct = matches.find(h => normalizeUrl(h.callbackUrl) === normalizeUrl(expected));
    const registered = correct ?? matches[0];
    const failure = failedRegistrations.find(a => a.topic === spec.topic);
    let status: ShopifyWebhookHealthItem["status"];
    if (spec.requiredScopes?.length && scopes.status === "unknown") status = "permissions_unknown";
    else if (spec.requiredScopes?.some(s => !grantedScopes.includes(s))) status = "blocked_scope";
    else if (subscriptions.status === "unknown") status = "registration_unknown";
    else if (registered) status = correct ? "registered" : "wrong_url";
    else if (failure?.status === "skipped_protected_data") status = "protected_data_unconfirmed";
    else if (failure?.status === "failed") status = "blocked_shopify";
    else status = "missing";
    return {
      topic: spec.topic, restTopic: spec.restTopic, label: spec.label,
      expectedCallbackUrl: expected, registeredCallbackUrl: registered?.callbackUrl ?? null,
      status, required: spec.required, registrationMethod: "graphql",
      scopeNotes: failure?.message ?? (status === "permissions_unknown" ? "Permissions not verified; no missing scope inferred." : spec.requiredScopes?.length ? `Requires ${spec.requiredScopes.join(", ")}.` : null),
    };
  });
  // The per-shop API cannot confirm app-level compliance subscriptions. TOML is intent, not deployment evidence.
  for (const spec of SHOPIFY_APP_CONFIG_WEBHOOK_SPECS) webhooks.push({
    topic: spec.topic, restTopic: spec.topic, label: spec.label,
    expectedCallbackUrl: `${host.replace(/\/+$/, "")}${spec.pathSuffix}`,
    registeredCallbackUrl: null, status: "app_config", required: true, registrationMethod: "app_toml",
    scopeNotes: "Declared in TOML; live app-level registration and callback are not verified. Confirm the active deployed app version in Shopify Partner Dashboard.",
  });
  const orders = webhooks.find(w => w.topic === "ORDERS_CREATE")!;
  const knownProblem = missingScopes.length > 0 || webhooks.some(w => ["missing", "wrong_url", "blocked_scope", "blocked_shopify", "protected_data_unconfirmed"].includes(w.status));
  const healthy = scopes.status === "verified" && missingScopes.length === 0 && webhooks.filter(w => w.required).every(w => w.status === "registered");
  const status = healthy ? "Healthy" : knownProblem ? "Action Required" : "Verification Unavailable";
  return {
    shop, host, configured: true, permissionVerification: scopes.status,
    oauthScopesRequested: [...requestedScopes], grantedScopes, missingScopes,
    unknownScopes: scopes.status === "unknown" ? [...new Set([...requestedScopes, ...requiredScopes])] : [],
    protectedCustomerData: { approval: "reported", reportedApprovalDate: "2026-06-25", liveConfirmation: "not_confirmed" },
    recommendedAction: scopes.status === "unknown" || subscriptions.status === "unknown"
      ? "Retry read-only verification and check Shopify authentication. Do not infer missing permissions or re-register during the audit."
      : missingScopes.length ? "Approve the missing OAuth scopes in Shopify Admin, then refresh verification."
      : "Confirm active app-level compliance subscriptions in Shopify Partner Dashboard. Review missing or incorrect callbacks and any explicit registration failures before a separately authorized correction.",
    failedRegistrations, webhooks,
    ordersCreateAudit: {
      requiredScopes: ["read_orders"], oauthScopesRequested: [...requestedScopes], grantedScopes,
      missingGrantedScopes: missingScopes, hasReadOrders: scopes.status === "verified" && grantedScopes.includes("read_orders"),
      requiresProtectedCustomerData: true, canRegister: scopes.status === "verified" && grantedScopes.includes("read_orders"),
      protectedCustomerDataApprovalRequired: true,
      registrationBlockedReason: orders.status === "permissions_unknown" ? "permissions_unknown" : orders.status === "registration_unknown" ? "registration_unknown" : orders.status === "blocked_scope" ? "missing_scope" : orders.status === "protected_data_unconfirmed" ? "protected_customer_data" : orders.status === "blocked_shopify" || orders.status === "wrong_url" ? "registration_failed" : orders.status === "registered" ? "none" : "not_attempted",
      note: orders.status === "registered" ? "ORDERS_CREATE registration and callback verified. Delivery is not tested by this audit." : `ORDERS_CREATE: ${orders.status.replaceAll("_", " ")}. Absence alone does not establish a protected-data rejection.`,
    },
    summary: {
      healthy, status,
      missingRequired: webhooks.filter(w => w.required && w.status === "missing").length,
      missingOptional: webhooks.filter(w => !w.required && w.status === "missing").length,
      blockedByScope: webhooks.filter(w => w.status === "blocked_scope").length,
      wrongUrl: webhooks.filter(w => w.status === "wrong_url").length,
    },
  };
}

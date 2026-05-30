import { and, isNotNull } from "drizzle-orm";
import type { Session } from "@shopify/shopify-api";
import { db } from "../drizzle/db";
import { users } from "../shared/schema";
import {
  SHOPIFY_APP_CONFIG_WEBHOOK_SPECS,
  SHOPIFY_APP_TOML_COMMERCE_WEBHOOK_SPECS,
  SHOPIFY_GRAPHQL_WEBHOOK_SPECS,
  SHOPIFY_ORDERS_CREATE_SCOPE,
  type ShopifyOrdersCreateAudit,
  type ShopifyOrdersCreateRegistrationBlockedReason,
  type ShopifyShopWebhookSummary,
  type ShopifyWebhookHealthItem,
  type ShopifyWebhookHealthReport,
  type ShopifyWebhookRegistrationAttempt,
} from "@shared/shopifyWebhookHealth";
import { getShopifyApi, SHOPIFY_SCOPES, HOST } from "./shopify";

type ListedWebhook = {
  id: string;
  topic: string;
  callbackUrl: string;
};

function normalizeCallbackUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function expectedCallbackUrl(pathSuffix: string): string {
  const base = HOST.replace(/\/+$/, "");
  return `${base}${pathSuffix}`;
}

function topicMatches(listedTopic: string, specTopic: string, restTopic: string): boolean {
  const t = listedTopic.trim().toUpperCase().replace(/\//g, "_");
  const spec = specTopic.trim().toUpperCase();
  const rest = restTopic.trim().toUpperCase().replace(/\//g, "_");
  return t === spec || t === rest;
}

export async function fetchShopGrantedScopes(shop: string, accessToken: string): Promise<string[]> {
  try {
    const shopify = getShopifyApi();
    if (!shopify) return [...SHOPIFY_SCOPES];

    const client = new shopify.clients.Graphql({
      session: { shop, accessToken } as Session,
    });

    const response = await client.request(`
      query shopifyAppInstallationScopes {
        currentAppInstallation {
          accessScopes {
            handle
          }
        }
      }
    `);

    const handles =
      (response.data as { currentAppInstallation?: { accessScopes?: Array<{ handle?: string }> } })
        ?.currentAppInstallation?.accessScopes ?? [];

    const scopes = handles
      .map((s) => (typeof s.handle === "string" ? s.handle.trim() : ""))
      .filter(Boolean);

    return scopes.length > 0 ? scopes : [...SHOPIFY_SCOPES];
  } catch (err) {
    console.warn("[Shopify Webhook Health] scope fetch failed", { shop, err });
    return [...SHOPIFY_SCOPES];
  }
}

export async function listShopWebhookSubscriptions(
  shop: string,
  accessToken: string,
): Promise<ListedWebhook[]> {
  const shopify = getShopifyApi();
  if (!shopify) return [];

  const client = new shopify.clients.Graphql({
    session: { shop, accessToken } as Session,
  });

  const listed: ListedWebhook[] = [];
  let cursor: string | null = null;
  let hasNext = true;

  while (hasNext) {
    const response = await client.request(
      `
      query listWebhookSubscriptions($cursor: String) {
        webhookSubscriptions(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              topic
              endpoint {
                __typename
                ... on WebhookHttpEndpoint {
                  callbackUrl
                }
              }
            }
          }
        }
      }
    `,
      { variables: { cursor } },
    );

    const data = response.data as {
      webhookSubscriptions?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        edges?: Array<{
          node?: {
            id?: string;
            topic?: string;
            endpoint?: { callbackUrl?: string };
          };
        }>;
      };
    };

    const edges = data?.webhookSubscriptions?.edges ?? [];
    for (const edge of edges) {
      const node = edge?.node;
      const callbackUrl = node?.endpoint?.callbackUrl;
      if (node?.id && node?.topic && callbackUrl) {
        listed.push({ id: node.id, topic: node.topic, callbackUrl });
      }
    }

    hasNext = Boolean(data?.webhookSubscriptions?.pageInfo?.hasNextPage);
    cursor = data?.webhookSubscriptions?.pageInfo?.endCursor ?? null;
    if (!hasNext) break;
  }

  return listed;
}

function isProtectedCustomerDataRegistrationError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("protected customer") ||
    m.includes("protected data") ||
    m.includes("customer data access") ||
    m.includes("not approved for") ||
    (m.includes("access") && m.includes("order")) ||
    m.includes("pcd")
  );
}

function classifyRegistrationFailure(
  topic: string,
  message: string,
): ShopifyWebhookRegistrationAttempt["status"] {
  if (
    topic === "ORDERS_CREATE" &&
    isProtectedCustomerDataRegistrationError(message)
  ) {
    return "skipped_protected_data";
  }
  return "failed";
}

function buildOrdersCreateAudit(
  grantedScopes: string[],
  listed: ListedWebhook[],
): ShopifyOrdersCreateAudit {
  const oauthScopesRequested = [...SHOPIFY_SCOPES];
  const hasReadOrders = grantedScopes.includes(SHOPIFY_ORDERS_CREATE_SCOPE);
  const missingGrantedScopes = oauthScopesRequested.filter(
    (scope) => !grantedScopes.includes(scope),
  );
  const spec = SHOPIFY_GRAPHQL_WEBHOOK_SPECS.find((s) => s.topic === "ORDERS_CREATE")!;
  const ordersRegistered = findRegisteredUrl(listed, spec);

  let registrationBlockedReason: ShopifyOrdersCreateRegistrationBlockedReason = "none";
  let note: string;

  if (!hasReadOrders) {
    registrationBlockedReason = "missing_scope";
    note =
      missingGrantedScopes.includes(SHOPIFY_ORDERS_CREATE_SCOPE)
        ? "This shop was installed before read_orders was added. Reinstall the app or approve the new scope in Shopify Admin to grant read_orders."
        : `read_orders is not granted on this shop. OAuth requests: ${oauthScopesRequested.join(", ")}.`;
  } else if (ordersRegistered) {
    registrationBlockedReason = "none";
    note = "ORDERS_CREATE is registered for this shop.";
  } else {
    registrationBlockedReason = "protected_customer_data";
    note =
      "read_orders is granted but ORDERS_CREATE is not registered. Request Protected Customer Data (order access) approval in Shopify Partner Dashboard, then click Re-register.";
  }

  return {
    requiredScopes: spec.requiredScopes ?? [SHOPIFY_ORDERS_CREATE_SCOPE],
    oauthScopesRequested,
    grantedScopes,
    missingGrantedScopes,
    hasReadOrders,
    requiresProtectedCustomerData: Boolean(spec.requiresProtectedCustomerData),
    canRegister: hasReadOrders,
    protectedCustomerDataApprovalRequired: Boolean(spec.requiresProtectedCustomerData),
    registrationBlockedReason,
    note,
  };
}

function findRegisteredUrl(
  listed: ListedWebhook[],
  spec: (typeof SHOPIFY_GRAPHQL_WEBHOOK_SPECS)[number],
): string | null {
  for (const hook of listed) {
    if (topicMatches(hook.topic, spec.topic, spec.restTopic)) {
      return hook.callbackUrl;
    }
  }
  return null;
}

export function buildShopWebhookHealthReport(params: {
  shop: string;
  listed: ListedWebhook[];
  grantedScopes: string[];
}): ShopifyWebhookHealthReport {
  const { shop, listed, grantedScopes } = params;
  const ordersCreateAudit = buildOrdersCreateAudit(grantedScopes, listed);
  const webhooks: ShopifyWebhookHealthItem[] = [];

  for (const spec of SHOPIFY_GRAPHQL_WEBHOOK_SPECS) {
    const expected = expectedCallbackUrl(spec.pathSuffix);
    const registered = findRegisteredUrl(listed, spec);
    const needsScope =
      spec.requiredScopes?.length &&
      !spec.requiredScopes.every((scope) => grantedScopes.includes(scope));

    let status: ShopifyWebhookHealthItem["status"] = "missing";
    let scopeNotes: string | null = null;

    if (needsScope) {
      status = "blocked_scope";
      scopeNotes = `Requires scope(s): ${spec.requiredScopes!.join(", ")}`;
    } else if (registered) {
      status =
        normalizeCallbackUrl(registered) === normalizeCallbackUrl(expected)
          ? "registered"
          : "wrong_url";
    }

    webhooks.push({
      topic: spec.topic,
      restTopic: spec.restTopic,
      label: spec.label,
      expectedCallbackUrl: expected,
      registeredCallbackUrl: registered,
      status,
      required: spec.required,
      registrationMethod: "graphql",
      scopeNotes,
    });
  }

  for (const spec of SHOPIFY_APP_TOML_COMMERCE_WEBHOOK_SPECS) {
    webhooks.push({
      topic: spec.topic,
      restTopic: spec.topic,
      label: spec.label,
      expectedCallbackUrl: expectedCallbackUrl(spec.pathSuffix),
      registeredCallbackUrl: null,
      status: "app_config",
      required: spec.topic === "orders/create",
      registrationMethod: "app_toml",
      scopeNotes:
        spec.topic === "orders/create"
          ? "App config + per-shop GraphQL. Requires read_orders and Protected Customer Data approval."
          : "App config + per-shop GraphQL on install.",
    });
  }

  for (const spec of SHOPIFY_APP_CONFIG_WEBHOOK_SPECS) {
    webhooks.push({
      topic: spec.topic,
      restTopic: spec.topic,
      label: spec.label,
      expectedCallbackUrl: expectedCallbackUrl(spec.pathSuffix),
      registeredCallbackUrl: null,
      status: "app_config",
      required: true,
      registrationMethod: "app_toml",
      scopeNotes: "Registered via shopify app deploy (Partner Dashboard), not per-shop GraphQL.",
    });
  }

  const graphqlItems = webhooks.filter((w) => w.registrationMethod === "graphql");
  const missingRequired = graphqlItems.filter(
    (w) => w.required && w.status === "missing",
  ).length;
  const missingOptional = graphqlItems.filter(
    (w) => !w.required && w.status === "missing",
  ).length;
  const blockedByScope = graphqlItems.filter((w) => w.status === "blocked_scope").length;
  const wrongUrl = graphqlItems.filter((w) => w.status === "wrong_url").length;

  const healthy =
    missingRequired === 0 &&
    wrongUrl === 0 &&
    graphqlItems
      .filter((w) => w.required)
      .every((w) => w.status === "registered" || w.status === "blocked_scope");

  return {
    shop,
    host: HOST,
    configured: true,
    oauthScopesRequested: [...SHOPIFY_SCOPES],
    grantedScopes,
    webhooks,
    ordersCreateAudit,
    summary: {
      healthy,
      missingRequired,
      missingOptional,
      blockedByScope,
      wrongUrl,
    },
  };
}

export async function auditShopWebhookHealth(
  shop: string,
  accessToken: string,
): Promise<ShopifyWebhookHealthReport> {
  const [listed, grantedScopes] = await Promise.all([
    listShopWebhookSubscriptions(shop, accessToken),
    fetchShopGrantedScopes(shop, accessToken),
  ]);

  return buildShopWebhookHealthReport({ shop, listed, grantedScopes });
}

export async function registerShopWebhooks(
  shop: string,
  accessToken: string,
): Promise<ShopifyWebhookRegistrationAttempt[]> {
  const shopify = getShopifyApi();
  if (!shopify) {
    return SHOPIFY_GRAPHQL_WEBHOOK_SPECS.map((spec) => ({
      topic: spec.topic,
      address: expectedCallbackUrl(spec.pathSuffix),
      status: "failed" as const,
      message: "Shopify API not configured",
    }));
  }

  const grantedScopes = await fetchShopGrantedScopes(shop, accessToken);
  const client = new shopify.clients.Graphql({
    session: { shop, accessToken } as Session,
  });

  const results: ShopifyWebhookRegistrationAttempt[] = [];

  for (const spec of SHOPIFY_GRAPHQL_WEBHOOK_SPECS) {
    const address = expectedCallbackUrl(spec.pathSuffix);

    if (
      spec.requiredScopes?.length &&
      !spec.requiredScopes.every((scope) => grantedScopes.includes(scope))
    ) {
      const message = `Missing scope(s): ${spec.requiredScopes.join(", ")}. OAuth requests: ${SHOPIFY_SCOPES.join(", ")}. Reinstall the app if this shop predates read_orders.`;
      results.push({
        topic: spec.topic,
        address,
        status: "skipped_scope",
        message,
      });
      console.warn("[Shopify Webhook Register] skipped_scope", { shop, topic: spec.topic, message });
      continue;
    }

    try {
      const response = await client.request(
        `
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
        {
          variables: {
            topic: spec.topic,
            webhookSubscription: {
              callbackUrl: address,
              format: "JSON",
            },
          },
        },
      );

      const data = response.data as {
        webhookSubscriptionCreate?: {
          userErrors?: Array<{ message?: string }>;
        };
      };
      const userErrors = data?.webhookSubscriptionCreate?.userErrors ?? [];
      const onlyAlreadyRegistered =
        userErrors.length > 0 &&
        userErrors.every((err) => /already been taken/i.test(String(err?.message || "")));

      if (onlyAlreadyRegistered) {
        results.push({ topic: spec.topic, address, status: "already_registered" });
      } else if (userErrors.length > 0) {
        const message = userErrors.map((e) => e.message).filter(Boolean).join("; ");
        const status = classifyRegistrationFailure(spec.topic, message);
        results.push({
          topic: spec.topic,
          address,
          status,
          message,
        });
        if (status === "skipped_protected_data") {
          console.warn("[Shopify Webhook Register] skipped_protected_data", {
            shop,
            topic: spec.topic,
            message,
            hint: "Request Protected Customer Data (order access) approval in Shopify Partner Dashboard.",
          });
        } else {
          console.warn("[Shopify Webhook Register Failed]", {
            shop,
            topic: spec.topic,
            userErrors,
          });
        }
      } else {
        results.push({ topic: spec.topic, address, status: "registered" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = classifyRegistrationFailure(spec.topic, message);
      results.push({
        topic: spec.topic,
        address,
        status,
        message,
      });
      if (status === "skipped_protected_data") {
        console.warn("[Shopify Webhook Register] skipped_protected_data", {
          shop,
          topic: spec.topic,
          message,
        });
      } else {
        console.error("[Shopify Webhook Register Failed]", { shop, topic: spec.topic, error: err });
      }
    }
  }

  return results;
}

/** Backward-compatible install hook — logs outcomes; does not throw. */
export async function registerMandatoryWebhooks(shop: string, accessToken: string): Promise<void> {
  const results = await registerShopWebhooks(shop, accessToken);
  for (const result of results) {
    if (result.status === "registered" || result.status === "already_registered") {
      console.log("[Shopify Webhook Register]", { shop, topic: result.topic, status: result.status });
    } else if (result.status === "skipped_scope") {
      console.warn("[Shopify Webhook Register] skipped_scope", {
        shop,
        topic: result.topic,
        message: result.message,
      });
    } else if (result.status === "skipped_protected_data") {
      console.warn("[Shopify Webhook Register] skipped_protected_data", {
        shop,
        topic: result.topic,
        message: result.message,
        hint: "Protected Customer Data approval required for ORDERS_CREATE.",
      });
    } else {
      console.warn("[Shopify Webhook Register Failed]", {
        shop,
        topic: result.topic,
        message: result.message,
      });
    }
  }
}

export async function auditAllShopifyShopsWebhookHealth(): Promise<ShopifyShopWebhookSummary[]> {
  const merchants = await db
    .select({
      userId: users.id,
      email: users.email,
      shop: users.shopifyShop,
      accessToken: users.shopifyAccessToken,
    })
    .from(users)
    .where(and(isNotNull(users.shopifyShop), isNotNull(users.shopifyAccessToken)));

  const summaries: ShopifyShopWebhookSummary[] = [];

  for (const merchant of merchants) {
    const shop = merchant.shop!;
    try {
      const report = await auditShopWebhookHealth(shop, merchant.accessToken!);
      summaries.push({
        userId: merchant.userId,
        email: merchant.email,
        shop,
        healthy: report.summary.healthy,
        missingRequired: report.summary.missingRequired,
        missingOptional: report.summary.missingOptional,
        blockedByScope: report.summary.blockedByScope,
      });
    } catch (err) {
      summaries.push({
        userId: merchant.userId,
        email: merchant.email,
        shop,
        healthy: false,
        missingRequired: -1,
        missingOptional: -1,
        blockedByScope: -1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summaries;
}

export async function runShopifyWebhookStartupAudit(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;

  try {
    const summaries = await auditAllShopifyShopsWebhookHealth();
    if (summaries.length === 0) {
      console.log("[shopify-webhooks] Startup audit: no connected Shopify shops.");
      return;
    }

    const unhealthy = summaries.filter((s) => !s.healthy);
    if (unhealthy.length === 0) {
      console.log(`[shopify-webhooks] Startup audit: ${summaries.length} shop(s), all required webhooks OK.`);
      return;
    }

    console.warn(
      `[shopify-webhooks] Startup audit: ${unhealthy.length}/${summaries.length} shop(s) missing required webhooks or have URL mismatches.`,
    );
    for (const row of unhealthy) {
      console.warn("[shopify-webhooks]", JSON.stringify(row));
    }
  } catch (err) {
    console.error("[shopify-webhooks] Startup audit failed:", err);
  }
}

import { and, isNotNull } from "drizzle-orm";
import type { Session } from "@shopify/shopify-api";
import { db } from "../drizzle/db";
import { users } from "../shared/schema";
import {
  SHOPIFY_GRAPHQL_WEBHOOK_SPECS,
  type ShopifyShopWebhookSummary,
  type ShopifyWebhookHealthReport,
  type ShopifyWebhookRegistrationAttempt,
} from "@shared/shopifyWebhookHealth";
import { getShopifyApi, SHOPIFY_SCOPES, HOST } from "./shopify";

import {
  buildShopWebhookHealthReport,
  verifyShopScopes,
  listVerifiedWebhookSubscriptions,
  classifyRegistrationFailure,
  type ListedWebhook,
} from "./shopifyWebhookHealthAudit";
export { buildShopWebhookHealthReport } from "./shopifyWebhookHealthAudit";

function expectedCallbackUrl(pathSuffix: string): string {
  return `${HOST.replace(/\/+$/, "")}${pathSuffix}`;
}

function clientFor(shop: string, accessToken: string) {
  const shopify = getShopifyApi();
  if (!shopify) throw new Error("Shopify API not configured");
  return new shopify.clients.Graphql({ session: { shop, accessToken } as Session });
}

export async function fetchShopGrantedScopes(shop: string, accessToken: string) {
  return verifyShopScopes(() => clientFor(shop, accessToken));
}

export async function listShopWebhookSubscriptions(shop: string, accessToken: string): Promise<ListedWebhook[]> {
  return listVerifiedWebhookSubscriptions(clientFor(shop, accessToken));
}

export async function auditShopWebhookHealth(
  shop: string,
  accessToken: string,
  registrationAttempts: ShopifyWebhookRegistrationAttempt[] = [],
): Promise<ShopifyWebhookHealthReport> {
  const [subscriptions, scopes] = await Promise.all([
    listShopWebhookSubscriptions(shop, accessToken).then(
      listed => ({ status: "verified" as const, listed }),
      () => ({ status: "unknown" as const, listed: [] }),
    ),
    fetchShopGrantedScopes(shop, accessToken),
  ]);
  return buildShopWebhookHealthReport({ shop, host: HOST, requestedScopes: SHOPIFY_SCOPES, scopes, subscriptions, registrationAttempts });
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

  const scopes = await fetchShopGrantedScopes(shop, accessToken);
  const grantedScopes: string[] = [...scopes.grantedScopes];
  const client = new shopify.clients.Graphql({
    session: { shop, accessToken } as Session,
  });

  const results: ShopifyWebhookRegistrationAttempt[] = [];

  for (const spec of SHOPIFY_GRAPHQL_WEBHOOK_SPECS) {
    const address = expectedCallbackUrl(spec.pathSuffix);

    if (scopes.status === "unknown" && spec.requiredScopes?.length) {
      results.push({ topic: spec.topic, address, status: "skipped_verification", message: "OAuth permissions could not be verified. Retry verification before registering." });
      continue;
    }

    if (
      spec.requiredScopes?.length &&
      !spec.requiredScopes.every((scope) => grantedScopes.includes(scope))
    ) {
      const message = `Missing scope(s): ${spec.requiredScopes.join(", ")}. OAuth requests: ${SHOPIFY_SCOPES.join(", ")}. Approve the missing permissions in Shopify Admin, then refresh verification.`;
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

      if (response.errors) throw new Error("Shopify did not confirm registration");
      const data = response.data as {
        webhookSubscriptionCreate?: {
          webhookSubscription?: { id?: string };
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
            hint: "Check the reported Partner Dashboard approval and Shopify rejection details; approval does not grant merchant OAuth scopes.",
          });
        } else {
          console.warn("[Shopify Webhook Register Failed]", {
            shop,
            topic: spec.topic,
            userErrors,
          });
        }
      } else if (data?.webhookSubscriptionCreate?.webhookSubscription?.id) {
        results.push({ topic: spec.topic, address, status: "registered" });
      } else {
        results.push({ topic: spec.topic, address, status: "failed", message: "Shopify did not confirm a created subscription." });
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
        status: report.summary.status,
        report,
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
        status: "Verification Unavailable",
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
      `[shopify-webhooks] Startup audit: ${unhealthy.length}/${summaries.length} shop(s) require action or have unverified permissions or registrations.`,
    );
    for (const row of unhealthy) {
      console.warn("[shopify-webhooks]", JSON.stringify({ shop: row.shop, status: row.status, missingRequired: row.missingRequired, blockedByScope: row.blockedByScope }));
    }
  } catch (err) {
    console.error("[shopify-webhooks] Startup audit failed:", err);
  }
}

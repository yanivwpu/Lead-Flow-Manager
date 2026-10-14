import { registerVerifiedShopWebhooks } from "./shopifyWebhookRegistration";
import { and, isNotNull } from "drizzle-orm";
import type { Session } from "@shopify/shopify-api";
import { db } from "../drizzle/db";
import { users } from "../shared/schema";
import {
  type ShopifyShopWebhookSummary,
  type ShopifyWebhookHealthReport,
  type ShopifyWebhookRegistrationAttempt,
} from "@shared/shopifyWebhookHealth";
import { getShopifyApi, SHOPIFY_SCOPES, HOST } from "./shopify";

import {
  buildShopWebhookHealthReport,
  verifyShopScopes,
  listVerifiedWebhookSubscriptions,
  type ListedWebhook,
} from "./shopifyWebhookHealthAudit";
export { buildShopWebhookHealthReport } from "./shopifyWebhookHealthAudit";

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

export async function registerShopWebhooks(shop: string, accessToken: string): Promise<ShopifyWebhookRegistrationAttempt[]> {
  return registerVerifiedShopWebhooks({
    getClient: () => clientFor(shop, accessToken), host: HOST,
    requestedScopes: SHOPIFY_SCOPES,
  });
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

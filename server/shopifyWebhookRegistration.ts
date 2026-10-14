import { SHOPIFY_GRAPHQL_WEBHOOK_SPECS, type ShopifyWebhookRegistrationAttempt } from "../shared/shopifyWebhookHealth";
import { boundedRequest, classifyRegistrationFailure, listVerifiedWebhookSubscriptions, verifyShopScopes, type ListedWebhook } from "./shopifyWebhookHealthAudit";

const STAGING_ORIGIN = "https://whachatcrm-staging-app-staging.up.railway.app";
type Client = Parameters<typeof listVerifiedWebhookSubscriptions>[0];
const sameTopic = (a: string, b: string) => a.toUpperCase().replaceAll("/", "_") === b.toUpperCase().replaceAll("/", "_");
const sameUrl = (a: string, b: string) => { try { return new URL(a).href === new URL(b).href; } catch { return false; } };

/** Read before creating. App-scoped staging commerce is owned by the staging TOML. */
export async function registerVerifiedShopWebhooks(options: {
  getClient: () => Client; host: string; requestedScopes: readonly string[];
}): Promise<ShopifyWebhookRegistrationAttempt[]> {
  const { getClient, host, requestedScopes } = options;
  const scopes = await verifyShopScopes(getClient);
  const grantedScopes: string[] = [...scopes.grantedScopes];
  let client: Client;
  let listed: ListedWebhook[];
  try {
    client = getClient();
    listed = await listVerifiedWebhookSubscriptions(client);
  } catch {
    return SHOPIFY_GRAPHQL_WEBHOOK_SPECS.map(spec => ({ topic: spec.topic,
      address: `${host.replace(/\/+$/, "")}${spec.pathSuffix}`, status: "skipped_verification",
      message: "Existing subscriptions could not be verified; no registrations created." }));
  }
  const results: ShopifyWebhookRegistrationAttempt[] = [];
  for (const spec of SHOPIFY_GRAPHQL_WEBHOOK_SPECS) {
    const address = `${host.replace(/\/+$/, "")}${spec.pathSuffix}`;
    const result = (status: ShopifyWebhookRegistrationAttempt["status"], message?: string) => results.push({ topic: spec.topic, address, status, ...(message ? { message } : {}) });
    if (spec.requiredScopes?.length && scopes.status === "unknown") {
      result("skipped_verification", "OAuth permissions could not be verified. Retry read-only verification."); continue;
    }
    if (spec.requiredScopes?.some(scope => !grantedScopes.includes(scope))) {
      result("skipped_scope", `Missing scope(s): ${spec.requiredScopes.join(", ")}. OAuth requests: ${requestedScopes.join(", ")}. Approve the missing permissions, then refresh verification.`); continue;
    }
    const matches = listed.filter(h => sameTopic(h.topic, spec.topic));
    if (matches.length) {
      if (matches.length === 1 && sameUrl(matches[0].callbackUrl, address)) result("already_registered");
      else result("failed", "Existing duplicate or conflicting subscriptions require operator review; no subscription created or deleted.");
      continue;
    }
    if (new URL(host).origin === STAGING_ORIGIN && spec.topic !== "APP_UNINSTALLED") {
      result("skipped_verification", "Staging commerce is app-managed. Confirm the active staging app version and delivery; do not create a parallel per-shop subscription."); continue;
    }
    try {
      const response = await boundedRequest(client, `mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription { id } userErrors { message }
        }
      }`, { variables: { topic: spec.topic, webhookSubscription: { callbackUrl: address, format: "JSON" } } });
      const payload = response.data?.webhookSubscriptionCreate;
      if (!Array.isArray(payload?.userErrors)) throw new Error("Shopify did not confirm registration.");
      const errors = payload.userErrors;
      const duplicate = errors.length > 0 && errors.every((e: { message?: string }) => /already been taken/i.test(e.message ?? ""));
      if (errors.length && !duplicate) throw new Error(errors.map((e: { message?: string }) => e.message || "Unknown Shopify rejection").join("; "));
      if (!duplicate && !payload.webhookSubscription?.id) throw new Error("Shopify did not confirm a created subscription.");
      // A conflict error or mutation ID alone does not verify the actual callback.
      listed = await listVerifiedWebhookSubscriptions(client);
      const confirmed = listed.filter(h => sameTopic(h.topic, spec.topic));
      if (confirmed.length !== 1 || !sameUrl(confirmed[0].callbackUrl, address)) throw new Error("Shopify did not verify one matching subscription after registration.");
      result(duplicate ? "already_registered" : "registered");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result(classifyRegistrationFailure(spec.topic, message), message);
    }
  }
  return results;
}

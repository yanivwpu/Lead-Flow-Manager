import { hashShopifyShopForLogs } from "./shopifyShopTrialService";

export type ShopifyActivationEvent = "oauth_completed" | "trial_activated" | "trial_failed" |
  "first_app_page_reached" | "first_successful_render" | "first_channel_setup" | "early_uninstall";

/** Structured runtime logs only. Never pass raw request data, tokens, names, or error messages. */
export function logShopifyActivation(
  shop: string,
  event: ShopifyActivationEvent,
  detail: { page?: "start" | "inbox" | "integrations" | "other";
    reason?: "ledger_not_ready" | "provisioning_failed" | "ineligible";
    source?: "oauth" | "recovery" | "browser" | "webhook" } = {},
): void {
  console.log("[ShopifyActivation]", JSON.stringify({
    event, shopHash: hashShopifyShopForLogs(shop), ...detail,
    occurredAt: new Date().toISOString(),
  }));
}

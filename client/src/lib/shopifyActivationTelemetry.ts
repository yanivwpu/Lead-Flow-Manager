import type { ShopifyBrowserActivationEvent } from "@shared/shopifyOnboarding";

const pending = new Set<string>();
const sent = new Set<string>();
export async function trackShopifyActivation(
  userId: string,
  event: ShopifyBrowserActivationEvent,
  page: "start" | "inbox" | "integrations" | "other",
): Promise<void> {
  const key = `${userId}:${event}`;
  if (pending.has(key) || sent.has(key)) return;
  pending.add(key);
  try {
    const response = await fetch("/api/shopify/activation-events", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      // Identity comes from the session. Never transmit the user id or current URL.
      body: JSON.stringify({ event, page }), signal: AbortSignal.timeout(8000),
    });
    if (response.ok) sent.add(key);
  } catch {
    // Telemetry must never block rendering or channel setup.
  } finally {
    pending.delete(key);
  }
}

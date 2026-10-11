import type { RequestHandler } from "express";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
export function createShopifyCustomerPrivacyHandler(kind: "customer_erasure" | "access_request", deps: {
  verify(body: Buffer | string, signature: string): boolean;
  dedupe(kind: string, shop: string, body: unknown): string;
  process(kind: "customer_erasure" | "access_request", shop: string, body: Record<string, any>, key: string): Promise<void>;
}): RequestHandler {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    const signature = req.get("x-shopify-hmac-sha256"), raw = (req as any).rawBody;
    if (!signature || !raw || !deps.verify(raw, signature)) return res.status(401).json({ error: "Invalid webhook signature" });
    const shop = normalizeShopifyShopDomain(req.get("x-shopify-shop-domain"));
    if (!shop || req.body?.shop_domain != null && normalizeShopifyShopDomain(req.body.shop_domain) !== shop)
      return res.status(400).json({ error: "Invalid shop domain" });
    try {
      // Access and deletion have distinct durable request kinds and cannot share a dedupe key.
      await deps.process(kind, shop, req.body, deps.dedupe(kind, shop, req.body));
      return res.status(200).json({ received: true, requestType: kind, status: kind === "access_request" ? "pending_access" : "pending_verification" });
    } catch {
      console.error("[ShopifyPrivacy] customer_request_failed");
      return res.status(503).json({ error: "Webhook processing failed" });
    }
  };
}

import type { Request, Response } from "express";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import type { ShopifyCustomerSnapshot } from "./shopifyCustomerSync";

type Topic = "orders/create";
/** Raw bytes are mandatory. Parse those same verified bytes, never a separately supplied body. */
export function createShopifyOrderWebhookHandler(topic: Topic, deps: {
  verify: (raw: Buffer, hmac: string) => boolean;
  process: (input: { shop: string; topic: Topic; eventId: string; body: ShopifyCustomerSnapshot }) => Promise<unknown>;
  emit?: (line: string) => void;
}) {
  return async (req: Request, res: Response) => {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    const hmac = req.headers["x-shopify-hmac-sha256"];
    const rawShop = req.headers["x-shopify-shop-domain"];
    if (!Buffer.isBuffer(raw) || typeof hmac !== "string" || !deps.verify(raw, hmac)) {
      res.status(401).json({ error: "Invalid webhook signature" }); return;
    }
    const shop = typeof rawShop === "string" ? normalizeShopifyShopDomain(rawShop) : null;
    const eventId = req.headers["x-shopify-event-id"] || req.headers["x-shopify-webhook-id"];
    if (!shop || req.headers["x-shopify-topic"] !== topic || typeof eventId !== "string" ||
        !eventId.trim() || eventId.length > 255) {
      res.status(400).json({ error: "Invalid webhook headers" }); return;
    }
    let body: ShopifyCustomerSnapshot;
    try {
      body = JSON.parse(raw.toString("utf8"));
      if (!body || typeof body !== "object" || Array.isArray(body) || !(typeof body.id === "number" ? Number.isSafeInteger(body.id) && body.id > 0 : typeof body.id === "string" && /^[1-9][0-9]{0,24}$/.test(body.id))) throw new Error("Invalid body");
    } catch { res.status(400).json({ error: "Invalid webhook payload" }); return; }
    try {
      const outcome = await deps.process({ shop, topic, eventId: eventId.trim(), body });
      (deps.emit || console.info)(JSON.stringify({ tag: "[CommerceIngest]", event: "shopify_order_sync", topic, outcome }));
      res.status(200).json({ received: true });
    } catch (error) {
      // No payload, identifiers, credentials or database errors enter logs or responses.
      const status = error instanceof Error && "status" in error &&
        [400, 403, 409].includes(Number(error.status)) ? Number(error.status) : 503;
      (deps.emit || console.error)(JSON.stringify({ tag: "[CommerceIngest]", event: "shopify_order_sync_failed", topic, status }));
      res.status(status).json({ error: status === 503 ? "Webhook processing failed; retry delivery" : "Customer event rejected" });
    }
  };
}

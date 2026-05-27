import type { Request, Response } from "express";
import crypto from "crypto";
import { storage } from "./storage";
import {
  processWooCommerceCustomerCreated,
  processWooCommerceCustomerUpdated,
  processWooCommerceOrderCreated,
  processWooCommerceOrderUpdated,
  scheduleWooCommerceCommerceProcessing,
} from "./woocommerceCommerceWebhooks";

export type WooCommerceIntegrationConfig = {
  storeUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
  webhookSecret?: string;
  syncOptions?: string[];
  status?: string;
};

/** Decrypt helper passed from routes — avoids circular import of decryptIntegrationConfig. */
export type DecryptConfigFn = (config: Record<string, unknown>) => Record<string, unknown>;

export function verifyWooCommerceWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader?.trim() || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const received = signatureHeader.trim();
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(received, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function loadWooWebhookSecret(
  userId: string,
  decryptConfig: DecryptConfigFn,
): Promise<string | null> {
  const integration = await storage.getIntegrationByUserAndType(userId, "woocommerce");
  if (!integration?.isActive) return null;
  const raw = (integration.config || {}) as Record<string, unknown>;
  const cfg = decryptConfig(raw) as WooCommerceIntegrationConfig;
  const secret = (cfg.webhookSecret || cfg.consumerSecret || "").trim();
  return secret || null;
}

export function createWooCommerceWebhookHandler(decryptConfig: DecryptConfigFn) {
  return async function handleWooCommerceWebhook(req: Request, res: Response): Promise<void> {
    const userId = typeof req.params.userId === "string" ? req.params.userId.trim() : "";
    if (!userId) {
      res.status(400).json({ error: "Missing userId" });
      return;
    }

    const rawBody: Buffer | undefined = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      console.warn(
        JSON.stringify({
          tag: "[CommerceIngest]",
          event: "woocommerce_webhook_rejected",
          reason: "missing_raw_body",
          userId,
        }),
      );
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    const secret = await loadWooWebhookSecret(userId, decryptConfig);
    if (!secret) {
      res.status(404).json({ error: "WooCommerce not connected" });
      return;
    }

    const signature = req.headers["x-wc-webhook-signature"];
    const sig =
      typeof signature === "string"
        ? signature
        : Array.isArray(signature)
          ? signature[0]
          : undefined;

    if (!verifyWooCommerceWebhookSignature(rawBody, sig, secret)) {
      console.warn(
        JSON.stringify({
          tag: "[CommerceIngest]",
          event: "woocommerce_hmac_invalid",
          userId,
        }),
      );
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    const topic =
      typeof req.headers["x-wc-webhook-topic"] === "string"
        ? req.headers["x-wc-webhook-topic"].trim().toLowerCase()
        : "";

    const body = (req.body || {}) as Record<string, unknown>;

    console.log(
      JSON.stringify({
        tag: "[CommerceIngest]",
        event: "woocommerce_webhook_received",
        userId,
        topic,
      }),
    );

    switch (topic) {
      case "order.created":
        scheduleWooCommerceCommerceProcessing(res, userId, () =>
          processWooCommerceOrderCreated(req, userId, body as Parameters<typeof processWooCommerceOrderCreated>[2]),
        );
        return;
      case "order.updated":
        scheduleWooCommerceCommerceProcessing(res, userId, () =>
          processWooCommerceOrderUpdated(req, userId, body as Parameters<typeof processWooCommerceOrderUpdated>[2]),
        );
        return;
      case "customer.created":
        scheduleWooCommerceCommerceProcessing(res, userId, () =>
          processWooCommerceCustomerCreated(
            req,
            userId,
            body as Parameters<typeof processWooCommerceCustomerCreated>[2],
          ),
        );
        return;
      case "customer.updated":
        scheduleWooCommerceCommerceProcessing(res, userId, () =>
          processWooCommerceCustomerUpdated(
            req,
            userId,
            body as Parameters<typeof processWooCommerceCustomerUpdated>[2],
          ),
        );
        return;
      default:
        res.status(200).json({ received: true, ignored: true, topic });
    }
  };
}

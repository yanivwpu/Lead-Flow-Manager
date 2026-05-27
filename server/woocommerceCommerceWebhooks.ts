import type { Request, Response } from "express";
import { storage } from "./storage";
import {
  formatWooCommerceOrderCreatedMessage,
  ingestCommerceEvent,
} from "./commerceEventPipeline";

type WooOrderPayload = {
  id?: number | string;
  number?: string;
  status?: string;
  currency?: string;
  total?: string;
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  customer_id?: number | string;
  line_items?: Array<{
    name?: string;
    quantity?: number;
    sku?: string;
  }>;
};

type WooCustomerPayload = {
  id?: number | string;
  email?: string;
  first_name?: string;
  last_name?: string;
  billing?: { phone?: string; email?: string; first_name?: string; last_name?: string };
};

function wooEventId(req: Request, fallback: string): string {
  const deliveryId = req.headers["x-wc-webhook-id"];
  if (typeof deliveryId === "string" && deliveryId.trim()) return deliveryId.trim();
  return fallback;
}

function customerName(c?: {
  first_name?: string;
  last_name?: string;
  billing?: { first_name?: string; last_name?: string };
}): string {
  const billing = c?.billing;
  return [c?.first_name || billing?.first_name, c?.last_name || billing?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function syncOptionEnabled(syncOptions: unknown[], key: string): boolean {
  return Array.isArray(syncOptions) && syncOptions.includes(key);
}

function orderStatusLabel(status?: string): string {
  if (!status) return "";
  const s = status.toLowerCase();
  if (s === "completed" || s === "processing") return "Paid";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, " ");
}

export async function resolveWooCommerceMerchantUser(userId: string): Promise<{
  userId: string;
  syncOptions: string[];
} | null> {
  const integration = await storage.getIntegrationByUserAndType(userId, "woocommerce");
  if (!integration?.isActive) return null;
  const cfg = (integration.config || {}) as Record<string, unknown>;
  const syncOptions = Array.isArray(cfg.syncOptions) ? (cfg.syncOptions as string[]) : [];
  return { userId, syncOptions };
}

export async function processWooCommerceOrderCreated(
  req: Request,
  userId: string,
  body: WooOrderPayload,
): Promise<void> {
  const merchant = await resolveWooCommerceMerchantUser(userId);
  if (!merchant) {
    console.log(
      JSON.stringify({ tag: "[CommerceIngest]", event: "woocommerce_ignored", reason: "no_merchant", userId }),
    );
    return;
  }
  if (!syncOptionEnabled(merchant.syncOptions, "new_orders")) {
    console.log(
      JSON.stringify({
        tag: "[CommerceIngest]",
        event: "woocommerce_ignored",
        reason: "sync_option_disabled",
        userId,
        option: "new_orders",
      }),
    );
    return;
  }

  const orderId = body.id != null ? String(body.id) : "";
  const eventId = wooEventId(req, `order-${orderId}-${Date.now()}`);
  const externalMessageId = `woocommerce:evt:${eventId}`;

  const billing = body.billing;
  const customerId = body.customer_id != null ? String(body.customer_id) : "";
  const name =
    customerName({ first_name: billing?.first_name, last_name: billing?.last_name }) ||
    billing?.email?.split("@")[0] ||
    "WooCommerce customer";

  const messageBody = formatWooCommerceOrderCreatedMessage({
    orderNumber: body.number,
    orderId,
    lineItems: body.line_items?.map((li) => ({ name: li.name, quantity: li.quantity })),
    total: body.total,
    currency: body.currency,
    status: orderStatusLabel(body.status),
  });

  await ingestCommerceEvent({
    userId: merchant.userId,
    source: "woocommerce",
    triggerType: "woocommerce_order_created",
    recordMode: "commerce_message",
    externalMessageId,
    messageBody,
    activityEventType: "woocommerce_order_created",
    metadata: {
      wooEventId: eventId,
      orderId,
      orderNumber: body.number,
      orderStatus: body.status,
      email: billing?.email,
      phone: billing?.phone,
      total: body.total,
      currency: body.currency,
      lineItems: body.line_items,
      customerId: customerId || null,
    },
    contactHints: {
      name,
      email: billing?.email,
      phone: billing?.phone,
      woocommerceCustomerId: customerId || undefined,
    },
  });
}

export async function processWooCommerceOrderUpdated(
  req: Request,
  userId: string,
  body: WooOrderPayload,
): Promise<void> {
  const merchant = await resolveWooCommerceMerchantUser(userId);
  if (!merchant) return;
  if (!syncOptionEnabled(merchant.syncOptions, "new_orders")) return;

  const orderId = body.id != null ? String(body.id) : "";
  const eventId = wooEventId(req, `order-upd-${orderId}-${Date.now()}`);
  const billing = body.billing;
  const customerId = body.customer_id != null ? String(body.customer_id) : "";

  await ingestCommerceEvent({
    userId: merchant.userId,
    source: "woocommerce",
    recordMode: "activity_only",
    activityEventType: "woocommerce_order_updated",
    metadata: {
      wooEventId: eventId,
      orderId,
      orderNumber: body.number,
      orderStatus: body.status,
      email: billing?.email,
      phone: billing?.phone,
      total: body.total,
      currency: body.currency,
      customerId: customerId || null,
    },
    contactHints: {
      name:
        customerName({ first_name: billing?.first_name, last_name: billing?.last_name }) ||
        billing?.email ||
        "WooCommerce customer",
      email: billing?.email,
      phone: billing?.phone,
      woocommerceCustomerId: customerId || undefined,
    },
  });
}

export async function processWooCommerceCustomerCreated(
  req: Request,
  userId: string,
  body: WooCustomerPayload,
): Promise<void> {
  const merchant = await resolveWooCommerceMerchantUser(userId);
  if (!merchant) {
    console.log(
      JSON.stringify({ tag: "[CommerceIngest]", event: "woocommerce_ignored", reason: "no_merchant", userId }),
    );
    return;
  }
  if (!syncOptionEnabled(merchant.syncOptions, "new_customers")) {
    console.log(
      JSON.stringify({
        tag: "[CommerceIngest]",
        event: "woocommerce_ignored",
        reason: "sync_option_disabled",
        userId,
        option: "new_customers",
      }),
    );
    return;
  }

  const customerId = body.id != null ? String(body.id) : "";
  const eventId = wooEventId(req, `customer-${customerId}-${Date.now()}`);
  const name = customerName(body) || body.email || "WooCommerce customer";

  await ingestCommerceEvent({
    userId: merchant.userId,
    source: "woocommerce",
    triggerType: "woocommerce_customer_created",
    recordMode: "quiet_thread",
    activityEventType: "woocommerce_customer_created",
    metadata: {
      wooEventId: eventId,
      customerId,
      email: body.email || body.billing?.email,
      phone: body.billing?.phone,
    },
    contactHints: {
      name,
      email: body.email || body.billing?.email,
      phone: body.billing?.phone,
      woocommerceCustomerId: body.id,
    },
  });
}

export async function processWooCommerceCustomerUpdated(
  req: Request,
  userId: string,
  body: WooCustomerPayload,
): Promise<void> {
  const merchant = await resolveWooCommerceMerchantUser(userId);
  if (!merchant) return;
  if (!syncOptionEnabled(merchant.syncOptions, "new_customers")) return;

  const customerId = body.id != null ? String(body.id) : "";
  const eventId = wooEventId(req, `customer-upd-${customerId}-${Date.now()}`);
  const name = customerName(body) || body.email || "WooCommerce customer";

  await ingestCommerceEvent({
    userId: merchant.userId,
    source: "woocommerce",
    recordMode: "activity_only",
    activityEventType: "woocommerce_customer_updated",
    metadata: {
      wooEventId: eventId,
      customerId,
      email: body.email || body.billing?.email,
      phone: body.billing?.phone,
    },
    contactHints: {
      name,
      email: body.email || body.billing?.email,
      phone: body.billing?.phone,
      woocommerceCustomerId: body.id,
    },
  });
}

export function scheduleWooCommerceCommerceProcessing(
  res: Response,
  userId: string,
  processor: () => Promise<void>,
): void {
  res.status(200).json({ received: true });
  setImmediate(() => {
    processor().catch((err) => {
      console.error(
        JSON.stringify({
          tag: "[CommerceIngest]",
          event: "woocommerce_async_error",
          userId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  });
}

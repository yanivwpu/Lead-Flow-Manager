import type { Request, Response } from "express";
import { storage } from "./storage";
import { formatShopifyOrderCreatedMessage, ingestCommerceEvent } from "./commerceEventPipeline";

type ShopifyOrderPayload = {
  id?: number | string;
  name?: string;
  email?: string;
  phone?: string;
  total_price?: string;
  currency?: string;
  financial_status?: string;
  customer?: {
    id?: number | string;
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
  };
  line_items?: Array<{
    title?: string;
    quantity?: number;
    price?: string;
    sku?: string;
    product_id?: number | string;
  }>;
};

type ShopifyCustomerPayload = {
  id?: number | string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  orders_count?: number;
  total_spent?: string;
};

function shopifyEventId(req: Request, fallback: string): string {
  const header = req.headers["x-shopify-event-id"];
  if (typeof header === "string" && header.trim()) return header.trim();
  return fallback;
}

function customerName(c?: { first_name?: string; last_name?: string }): string {
  return [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim();
}

function syncOptionEnabled(syncOptions: unknown[], key: string): boolean {
  return Array.isArray(syncOptions) && syncOptions.includes(key);
}

async function resolveShopifyMerchantUser(shop: string): Promise<{
  userId: string;
  integrationId: string;
  syncOptions: string[];
} | null> {
  const user = await storage.getUserByShopifyShop(shop);
  if (!user) return null;
  const integration = await storage.getIntegrationByUserAndType(user.id, "shopify");
  if (!integration?.isActive) return null;
  const cfg = (integration.config || {}) as Record<string, unknown>;
  const syncOptions = Array.isArray(cfg.syncOptions) ? (cfg.syncOptions as string[]) : [];
  return { userId: user.id, integrationId: integration.id, syncOptions };
}

export async function processShopifyOrderCreate(
  req: Request,
  shop: string,
  body: ShopifyOrderPayload,
): Promise<void> {
  const merchant = await resolveShopifyMerchantUser(shop);
  if (!merchant) {
    console.log(JSON.stringify({ tag: "[CommerceIngest]", event: "shopify_ignored", reason: "no_merchant", shop }));
    return;
  }
  if (!syncOptionEnabled(merchant.syncOptions, "new_orders")) {
    console.log(
      JSON.stringify({
        tag: "[CommerceIngest]",
        event: "shopify_ignored",
        reason: "sync_option_disabled",
        shop,
        option: "new_orders",
      }),
    );
    return;
  }

  const orderId = body.id != null ? String(body.id) : "";
  const eventId = shopifyEventId(req, `order-${orderId}-${Date.now()}`);
  const externalMessageId = `shopify:evt:${eventId}`;

  const customer = body.customer;
  const name =
    customerName(customer) ||
    customerName({ first_name: body.email?.split("@")[0] }) ||
    "Shopify customer";
  const messageBody = formatShopifyOrderCreatedMessage({
    orderName: body.name,
    orderId,
    lineItems: body.line_items,
    totalPrice: body.total_price,
    currency: body.currency,
    financialStatus: body.financial_status,
  });

  await ingestCommerceEvent({
    userId: merchant.userId,
    source: "shopify",
    triggerType: "shopify_order_created",
    recordMode: "commerce_message",
    externalMessageId,
    messageBody,
    activityEventType: "shopify_order_created",
    metadata: {
      shop,
      shopifyEventId: eventId,
      orderId,
      orderName: body.name,
      email: body.email || customer?.email,
      phone: body.phone || customer?.phone,
      totalPrice: body.total_price,
      currency: body.currency,
      financialStatus: body.financial_status,
      lineItems: body.line_items,
      customerId: customer?.id,
      cart: null,
    },
    contactHints: {
      name,
      email: body.email || customer?.email,
      phone: body.phone || customer?.phone,
      shopifyCustomerId: customer?.id,
    },
  });
}

export async function processShopifyCustomerCreate(
  req: Request,
  shop: string,
  body: ShopifyCustomerPayload,
): Promise<void> {
  const merchant = await resolveShopifyMerchantUser(shop);
  if (!merchant) {
    console.log(JSON.stringify({ tag: "[CommerceIngest]", event: "shopify_ignored", reason: "no_merchant", shop }));
    return;
  }
  if (!syncOptionEnabled(merchant.syncOptions, "new_customers")) {
    console.log(
      JSON.stringify({
        tag: "[CommerceIngest]",
        event: "shopify_ignored",
        reason: "sync_option_disabled",
        shop,
        option: "new_customers",
      }),
    );
    return;
  }

  const customerId = body.id != null ? String(body.id) : "";
  const eventId = shopifyEventId(req, `customer-${customerId}-${Date.now()}`);
  const name = customerName(body) || body.email || "Shopify customer";

  await ingestCommerceEvent({
    userId: merchant.userId,
    source: "shopify",
    triggerType: "shopify_customer_created",
    recordMode: "quiet_thread",
    activityEventType: "shopify_customer_created",
    metadata: {
      shop,
      shopifyEventId: eventId,
      customerId,
      email: body.email,
      phone: body.phone,
      ordersCount: body.orders_count,
      totalSpent: body.total_spent,
    },
    contactHints: {
      name,
      email: body.email,
      phone: body.phone,
      shopifyCustomerId: body.id,
    },
  });
}

export function scheduleShopifyCommerceProcessing(
  req: Request,
  res: Response,
  shop: string,
  processor: () => Promise<void>,
): void {
  res.status(200).json({ received: true });
  setImmediate(() => {
    processor().catch((err) => {
      console.error(
        JSON.stringify({
          tag: "[CommerceIngest]",
          event: "shopify_async_error",
          shop,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  });
}

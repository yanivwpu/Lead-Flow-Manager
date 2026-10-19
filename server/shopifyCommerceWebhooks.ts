import { eq, sql } from "drizzle-orm";
import { classifyCommerceWebhook } from "./ecommerce/eventIntake";
import { isStagingOrderSupportTaskExecutionEnabled, orderSupportTaskInsertQuery } from "./ecommerce/orderSupportTaskQueue";
import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { isShopifyContactInstallationActive } from "@shared/shopifyContactPrivacy";
import { syncShopifyCustomer } from "./shopifyCustomerSync";
import { customerPrivacyLocked } from "./shopifyPrivacyRequests";
import { withShopifyPrivacyFence } from "./shopifyContactService";
import type { Request } from "express";
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

function shopifyEventId(req: Pick<Request, "headers">, fallback: string): string {
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
  const merchants = await db.select().from(users).where(eq(users.shopifyShop, shop));
  if (merchants.length !== 1 || !isShopifyContactInstallationActive(merchants[0])) return null;
  const user = merchants[0];
  const integration = await storage.getIntegrationByUserAndType(user.id, "shopify");
  if (!integration?.isActive) return null;
  const cfg = (integration.config || {}) as Record<string, unknown>;
  if (cfg.shop != null && (typeof cfg.shop !== "string" || normalizeShopifyShopDomain(cfg.shop) !== shop)) return null;
  const syncOptions = Array.isArray(cfg.syncOptions) ? (cfg.syncOptions as string[]) : [];
  return { userId: user.id, integrationId: integration.id, syncOptions };
}

async function ingestShopifyOrderCreate(
  req: Pick<Request, "headers">,
  shop: string,
  body: ShopifyOrderPayload,
): Promise<void> {
  const merchant = await resolveShopifyMerchantUser(shop);
  if (!merchant) {
    console.log(JSON.stringify({ tag: "[CommerceIngest]", event: "shopify_ignored", reason: "no_merchant" }));
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

  const result = await ingestCommerceEvent({
    allowSideEffects: false,
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
  if (!result.ok) throw new Error("Order persistence failed");
  // Disabled by default; existing contact/order ingestion remains authoritative.
  // This is only called from the existing HMAC-verified /webhooks/orders-create route.
  // No customer details, payloads, or outgoing messages enter the event inbox.
  if (process.env.ECOMMERCE_EVENT_RECORDING_ENABLED === "true") {
    const decision = classifyCommerceWebhook({
      verified: true,
      accountId: merchant.userId,
      shopDomain: shop,
      topic: "orders/create",
      webhookId: shopifyEventId(req, ""),
    });
    if (decision.status === "candidate") {
      const [account, canonicalShop, topic, delivery] = JSON.parse(decision.dedupeKey) as string[];
      await db.execute(sql`INSERT INTO ecommerce_growth_event_inbox
        (account_id,shop,topic,delivery_id,journey,state)
        VALUES (${account},${canonicalShop},${topic},${delivery},${decision.journey},'pending')
        ON CONFLICT (account_id,shop,topic,delivery_id) DO NOTHING`);
      // Only HMAC-verified, owned, recorded orders with explicit merchant opt-in
      // can create one internal CRM-linked support task. No sender is imported.
      if (isStagingOrderSupportTaskExecutionEnabled({
        RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME,
        APP_URL: process.env.APP_URL,
        ECOMMERCE_EVENT_RECORDING_ENABLED: process.env.ECOMMERCE_EVENT_RECORDING_ENABLED,
        ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED: process.env.ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED,
      }) && result.contactId) {
        const taskQuery = orderSupportTaskInsertQuery({
          accountId: merchant.userId,
          canonicalShop,
          deliveryId: delivery,
          contactId: result.contactId,
        });
        if (taskQuery) await db.execute(taskQuery);
      }
    }
  }

}

export async function processShopifyOrderCreate(req: Pick<Request, "headers">, shop: string, body: ShopifyOrderPayload): Promise<void> {
  return withShopifyPrivacyFence(shop, async () => {
    if (await customerPrivacyLocked(shop, { ...body.customer, email: body.customer?.email || body.email, phone: body.customer?.phone || body.phone })) return;
    await ingestShopifyOrderCreate(req, shop, body);
  });
}
export async function processShopifyCustomerCreate(req: Request, shop: string, body: ShopifyCustomerPayload): Promise<void> {
  await syncShopifyCustomer({ shop, topic: "customers/create", body,
    eventId: shopifyEventId(req, "") });
}

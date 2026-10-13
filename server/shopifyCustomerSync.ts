import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts, conversations, activityEvents, integrations, users } from "@shared/schema";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { isShopifyContactInstallationActive } from "@shared/shopifyContactPrivacy";
import { customerPrivacyLocked } from "./shopifyPrivacyRequests";

export type ShopifyCustomerSnapshot = Record<string, unknown>;
type Database = typeof db;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 255): string | undefined =>
  typeof value === "string" && value.trim() && value.length <= max ? value.trim() : undefined;
export function shopifyCustomerId(value: unknown): string | undefined {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
  return typeof value === "string" && /^[1-9][0-9]{0,24}$/.test(value) ? value : undefined;
}
export function shopifyCustomerVersion(body: ShopifyCustomerSnapshot): string | undefined {
  const value = text(body.updated_at, 50) || text(body.created_at, 50);
  return value && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}
export class ShopifyCustomerSyncError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Customer snapshots share the shop-level privacy fence with orders, uninstall and erasure.
 * Contact, quiet thread, activity and version watermark commit together. Shopify retries failures.
 * No automation dispatcher, contact lifecycle hooks, outbound messages or external exports run here.
 */
export async function syncShopifyCustomer(input: {
  shop: string; topic: "customers/create" | "customers/update";
  eventId: string; body: ShopifyCustomerSnapshot;
}, database: Database = db): Promise<string> {
  const shop = normalizeShopifyShopDomain(input.shop);
  if (!shop) throw new ShopifyCustomerSyncError(400, "Invalid shop");
  return database.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))`);
    if (await customerPrivacyLocked(shop, input.body, tx)) return "suppressed";
    const merchants = await tx.select().from(users).where(eq(users.shopifyShop, shop)).for("update");
    if (merchants.length !== 1 || !isShopifyContactInstallationActive(merchants[0])) {
      throw new ShopifyCustomerSyncError(403, "Shop is not authorized");
    }
    const user = merchants[0];
    const [integration] = await tx.select().from(integrations).where(and(
      eq(integrations.userId, user.id), eq(integrations.type, "shopify"), eq(integrations.isActive, true))).for("share");
    const cfg = object(integration?.config);
    if (!integration || (cfg.shop != null && (typeof cfg.shop !== "string" || normalizeShopifyShopDomain(cfg.shop) !== shop))) {
      throw new ShopifyCustomerSyncError(403, "Shop is not authorized");
    }
    if (!Array.isArray(cfg.syncOptions) || !cfg.syncOptions.includes("new_customers")) return "disabled";
    const id = shopifyCustomerId(input.body.id);
    const version = shopifyCustomerVersion(input.body);
    if (!id || !version || !input.eventId || input.eventId.length > 255) {
      throw new ShopifyCustomerSyncError(400, "Invalid customer event");
    }
    // Legacy commerce contacts have no explicit shop; they are scoped to the owning installation.
    const matches = await tx.select().from(contacts).where(and(eq(contacts.userId, user.id),
      sql`COALESCE(${contacts.customFields}->>'shopifyCustomerId', ${contacts.sourceDetails}->>'shopifyCustomerId') = ${id}`,
      sql`COALESCE(${contacts.customFields}->>'shopifyShop', ${contacts.customFields}->'lastCommerceMetadata'->>'shop', ${contacts.sourceDetails}->>'shop', ${shop}) = ${shop}`
    )).for("update");
    if (matches.length > 1) throw new ShopifyCustomerSyncError(409, "Customer identity requires review");
    const existing = matches[0];
    const previous = object(existing?.customFields);
    const snapshot = object(previous.shopifyCustomerSync);
    // Equal timestamps are intentionally first-write-wins, including different delivery IDs.
    // An ID retry after a newer event is also rejected by the monotonic source timestamp.
    if (snapshot.eventId === input.eventId || (typeof snapshot.updatedAt === "string" &&
        Date.parse(snapshot.updatedAt) >= Date.parse(version))) return "duplicate_or_stale";
    const first = text(input.body.first_name), last = text(input.body.last_name);
    const emailValue = text(input.body.email, 254);
    const email = emailValue && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue) ? emailValue.toLowerCase() : undefined;
    const phoneValue = text(input.body.phone, 50)?.replace(/\D/g, "");
    const phone = phoneValue && phoneValue.length >= 8 && phoneValue.length <= 15 ? phoneValue : undefined;
    // Missing, null, blank and invalid values never erase CRM information. No clearing semantics assumed.
    const legacyNames = existing && existing.name !== "Shopify customer" && existing.name !== existing.email
      ? existing.name.split(" ") : undefined;
    const names = { firstName: first ?? text(snapshot.firstName) ?? legacyNames?.[0],
      lastName: last ?? text(snapshot.lastName) ?? legacyNames?.slice(1).join(" ") };
    const suppliedName = first || last;
    const name = suppliedName ? [names.firstName, names.lastName].filter(Boolean).join(" ") : undefined;
    const consent: Record<string, unknown> = { ...object(snapshot.consent) };
    for (const field of ["email_marketing_consent", "sms_marketing_consent"]) {
      if (!Object.prototype.hasOwnProperty.call(input.body, field)) continue;
      const source = object(input.body[field]);
      const states = ["subscribed", "not_subscribed", "unsubscribed", "pending", "redacted", "invalid"];
      if (typeof source.state === "string" && states.includes(source.state)) {
        consent[field] = { state: source.state,
          ...(text(source.opt_in_level, 50) ? { optInLevel: text(source.opt_in_level, 50) } : {}),
          ...(text(source.consent_updated_at, 50) ? { updatedAt: text(source.consent_updated_at, 50) } : {}) };
      }
    }
    if (typeof input.body.accepts_marketing === "boolean") consent.acceptsMarketing = input.body.accepts_marketing;
    const nextSnapshot = { ...snapshot, ...names, updatedAt: version, eventId: input.eventId, consent,
      ...(Number.isSafeInteger(input.body.orders_count) && Number(input.body.orders_count) >= 0 ? { ordersCount: input.body.orders_count } : {}),
      ...(typeof input.body.total_spent === "string" && /^\d+(\.\d+)?$/.test(input.body.total_spent) ? { totalSpent: input.body.total_spent } : {}),
    };
    const customFields = { ...previous, shopifyCustomerId: id, shopifyShop: shop,
      commerceThreadKey: previous.commerceThreadKey || `shopify:${id}`, shopifyCustomerSync: nextSnapshot };
    // Only customer data and Shopify's namespace change; all CRM preferences, tags and ownership survive.
    const patch = { ...(name ? { name } : {}), ...(email ? { email } : {}), ...(phone ? { phone } : {}),
      customFields, updatedAt: new Date() };
    const [contact] = existing ? await tx.update(contacts).set(patch).where(and(
      eq(contacts.id, existing.id), eq(contacts.userId, user.id))).returning() :
      await tx.insert(contacts).values({ userId: user.id, name: name || email || "Shopify customer",
        email, phone, primaryChannel: "shopify", source: "shopify", sourceDetails: { shopifyCustomerId: id, shop },
        customFields }).returning();
    let [conversation] = await tx.select().from(conversations).where(and(
      eq(conversations.userId, user.id), eq(conversations.contactId, contact.id), eq(conversations.channel, "shopify"))).limit(1);
    if (!conversation) [conversation] = await tx.insert(conversations).values({ userId: user.id,
      contactId: contact.id, channel: "shopify", externalThreadId: `shopify:${id}`, status: "open",
      windowActive: false, unreadCount: 0 }).returning();
    await tx.insert(activityEvents).values({ userId: user.id, contactId: contact.id, conversationId: conversation.id,
      eventType: input.topic === "customers/update" ? "shopify_customer_updated" : "shopify_customer_created",
      eventData: { source: "shopify", recordMode: "quiet_thread", shop, customerId: id,
        shopifyEventId: input.eventId, sourceUpdatedAt: version, summary: "Shopify customer synchronized" } });
    return existing ? "updated" : "created";
  });
}

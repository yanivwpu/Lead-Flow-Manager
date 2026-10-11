import { createHmac, randomBytes, createCipheriv } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { users, contacts, conversations, chats, workflowExecutions, workflows, flowJobs, webhooks, webhookDeliveries, activityEvents, messages, shopifyPrivacyErasureTasks, shopifyPrivacyCustomerLocks } from "@shared/schema";
import { deleteContactRecords } from "./contactDeleteService";
import { recordHasExplicitShop } from "@shared/shopifyPrivacyRedaction";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type CustomerIdentity = { id?: unknown; email?: unknown; phone?: unknown };
export function customerIdentityTokens(customer: CustomerIdentity): string[] {
  const out: string[] = [];
  if (typeof customer.id === "string" && /^[0-9]{1,25}$/.test(customer.id) || typeof customer.id === "number" && Number.isSafeInteger(customer.id) && customer.id > 0) out.push(`id:${customer.id}`);
  if (typeof customer.email === "string" && customer.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) out.push(`email:${customer.email.trim().toLowerCase()}`);
  if (typeof customer.phone === "string") { const phone = customer.phone.replace(/\D/g, ""); if (phone.length >= 7 && phone.length <= 15) out.push(`phone:${phone}`); }
  return out;
}
function hash(value: string) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("privacy_hash_key_missing");
  return createHmac("sha256", secret).update("shopify-privacy-v1:" + value).digest("hex");
}
export function privacyRequestDedupe(kind: string, shop: string, body: unknown) {
  // Request ID for access, stable customer identity/order set for redaction; no raw identifiers retained.
  return hash(JSON.stringify([kind, shop, body]));
}
export async function customerPrivacyLocked(shop: string, identity: CustomerIdentity): Promise<boolean> {
  const hashes = customerIdentityTokens(identity).map(token => hash(JSON.stringify([shop, token])));
  if (!hashes.length) return false;
  const rows = await db.select().from(shopifyPrivacyCustomerLocks).where(inArray(shopifyPrivacyCustomerLocks.identityHash, hashes)).limit(1);
  return rows.length > 0;
}
function encryptRequest(taskId: string, value: unknown) {
  const key = process.env.SHOPIFY_PRIVACY_REQUEST_KEY || "";
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("privacy_request_key_missing");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  cipher.setAAD(Buffer.from(taskId));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
}
export async function enqueuePrivacyRequest(tx: Tx, input: { kind: string; dedupeKey?: string; from?: Date | null; to?: Date; blocked?: boolean }) {
  const [task] = await tx.insert(shopifyPrivacyErasureTasks).values({ requestKind: input.kind, dedupeKey: input.dedupeKey,
    scopeFrom: input.from ?? null, scopeTo: input.to || new Date(),
    status: input.blocked ? "blocked" : "pending_external", errorCode: input.blocked ? "unsupported_provider" : null,
  }).onConflictDoNothing().returning({ id: shopifyPrivacyErasureTasks.id });
  if (task) return task.id;
  const [existing] = await tx.select({ id: shopifyPrivacyErasureTasks.id }).from(shopifyPrivacyErasureTasks).where(eq(shopifyPrivacyErasureTasks.dedupeKey, input.dedupeKey!));
  return existing.id;
}
function matchesSnapshot(value: unknown, tokens: string[], contactIds: string[], depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 12) return false;
  if (Array.isArray(value)) return value.some(v => matchesSnapshot(v, tokens, contactIds, depth+1));
  const row = value as Record<string, unknown>;
  for (const [key, val] of Object.entries(row)) {
    if (["contactId", "contact_id"].includes(key) && contactIds.includes(String(val))) return true;
    if (["customerId", "shopifyCustomerId", "customer_id"].includes(key) && tokens.includes(`id:${val}`)) return true;
    if (/email/i.test(key) && typeof val === "string" && tokens.includes(`email:${val.trim().toLowerCase()}`)) return true;
    if (/phone/i.test(key) && typeof val === "string" && tokens.includes(`phone:${val.replace(/\D/g, "")}`)) return true;
    if (matchesSnapshot(val, tokens, contactIds, depth+1)) return true;
  }
  return false;
}
export async function handleShopifyCustomerPrivacy(kind: "customer_erasure" | "access_request", shop: string, body: Record<string, any>, dedupeKey: string) {
  const rawCustomer = body.customer || {};
  const customer = { id: rawCustomer.id, email: rawCustomer.email, phone: rawCustomer.phone };
  if (JSON.stringify(customer).length > 2048) throw new Error("invalid_customer_request");
  const tokens = customerIdentityTokens(customer);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))`);
    const existing = await tx.select({ id: shopifyPrivacyErasureTasks.id }).from(shopifyPrivacyErasureTasks).where(eq(shopifyPrivacyErasureTasks.dedupeKey, dedupeKey));
    if (existing.length) return;
    const [user] = await tx.select().from(users).where(eq(users.shopifyShop, shop)).for("update");
    const taskId = await enqueuePrivacyRequest(tx, { kind, dedupeKey, from: user?.shopifyInstalledAt, blocked: !tokens.length || kind === "access_request" || !user });
    // A restricted encrypted support record allows access fulfilment / ambiguity review without recovering deleted records.
    // Deletion tasks retain selectors only when local matching cannot be verified, not for external stream processing.
    if (kind === "access_request" || !tokens.length || !user) {
      const orders = kind === "access_request" ? body.orders_requested : body.orders_to_redact;
      if (orders != null && (!Array.isArray(orders) || orders.length > 10000)) throw new Error("invalid_customer_request");
      const encrypted = encryptRequest(taskId, { shop, customer, requestId: body.data_request?.id, orders });
      await tx.execute(sql`INSERT INTO shopify_privacy_request_payloads(task_id, encrypted_payload) VALUES(${taskId},${encrypted}) ON CONFLICT DO NOTHING`);
    }
    if (kind === "access_request") return;
    for (const token of tokens) await tx.insert(shopifyPrivacyCustomerLocks).values({ identityHash: hash(JSON.stringify([shop, token])) }).onConflictDoNothing();
    if (!user || !tokens.length) return;
    const candidates = await tx.select().from(contacts).where(eq(contacts.userId, user.id)).for("update");
    const found = candidates.filter(c => {
      const custom = c.customFields as Record<string, any> | null;
      if (recordHasExplicitShop(custom, shop) === false && c.source !== "shopify" && custom?.shopifyCustomerId == null) return false;
      const id = custom?.shopifyCustomerId ?? custom?.lastCommerceMetadata?.customerId;
      // An explicit different customer ID wins over shared phone/email hints.
      if (id != null && tokens.some(t => t.startsWith("id:"))) return tokens.includes(`id:${id}`);
      return customerIdentityTokens({ email: c.email, phone: c.phone }).some(token => tokens.includes(token));
    });
    const ids = found.map(c => c.id);
    const threads = ids.length ? (await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.userId, user.id), inArray(conversations.contactId, ids)))).map(c => c.id) : [];
    if (threads.length) {
      await tx.delete(flowJobs).where(and(eq(flowJobs.userId, user.id), inArray(flowJobs.conversationId, threads)));
      await tx.delete(workflowExecutions).where(inArray(workflowExecutions.conversationId, threads));
    }
    const jobs = await tx.select().from(flowJobs).where(eq(flowJobs.userId, user.id));
    for (const row of jobs) if (matchesSnapshot(row.payload, tokens, ids)) await tx.delete(flowJobs).where(eq(flowJobs.id, row.id));
    const ownedFlows = (await tx.select({ id: workflows.id }).from(workflows).where(eq(workflows.userId, user.id))).map(w => w.id);
    if (ownedFlows.length) for (const row of await tx.select().from(workflowExecutions).where(inArray(workflowExecutions.workflowId, ownedFlows))) {
      if (matchesSnapshot(row.triggerData, tokens, ids)) await tx.delete(workflowExecutions).where(eq(workflowExecutions.id, row.id));
    }
    const hooks = (await tx.select({ id: webhooks.id }).from(webhooks).where(eq(webhooks.userId, user.id))).map(w => w.id);
    if (hooks.length) for (const row of await tx.select().from(webhookDeliveries).where(inArray(webhookDeliveries.webhookId, hooks))) {
      if (matchesSnapshot(row.payload, tokens, ids)) await tx.delete(webhookDeliveries).where(eq(webhookDeliveries.id, row.id));
    }
    for (const row of await tx.select().from(activityEvents).where(eq(activityEvents.userId, user.id))) {
      if (matchesSnapshot(row.eventData, tokens, ids)) await tx.delete(activityEvents).where(eq(activityEvents.id, row.id));
    }
    const ownedChats = await tx.select().from(chats).where(eq(chats.userId, user.id));
    for (const chat of ownedChats) if (ids.some(id => chat.whatsappPhone === `webchat:${id}`) ||
      found.some(c => c.phone && c.phone.replace(/\D/g, "") === (chat.whatsappPhone || "").replace(/\D/g, ""))) await tx.delete(chats).where(eq(chats.id, chat.id));
    if (ids.length) {
      await tx.delete(messages).where(and(eq(messages.userId, user.id), inArray(messages.contactId, ids)));
      await deleteContactRecords(ids, tx);
    }
    // Unattributable historical notes/exports remain local_review; no false claim of global completion.
  });
}

import crypto from "crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  users, integrations, contacts, chats, conversations, messages, activityEvents, workflowExecutions, workflows,
  webhookDeliveries, webhooks, flowJobs, shopifyShopTrials, shopifyMerchantContacts, shopifyPrivacyErasureTasks,
} from "@shared/schema";
import { normalizeShopifyShopDomain, shopifySyntheticMerchantEmail } from "@shared/shopifyBilling";
import { shopifyMerchantRedactionPatch, shopifyContactRedactionPatch, recordBelongsToShopify } from "@shared/shopifyPrivacyRedaction";
import { deleteContactRecords } from "./contactDeleteService";

/**
 * One transaction: erase application copies before acknowledging the signed webhook.
 * Trials are erased only here (not on uninstall); independent paid/global billing is preserved.
 * External processor/log erasure remains explicitly pending until verified by an operator.
 */
export async function redactShopifyStore(rawShop: string) {
  const shop = normalizeShopifyShopDomain(rawShop);
  if (!shop) throw new Error("Invalid Shopify privacy request");
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))`);
    // Lock active mappings so capture/support updates and fenced ingestion cannot recreate erased data.
    const merchantRows = await tx.select().from(users).where(or(eq(users.shopifyShop, shop), eq(users.email, shopifySyntheticMerchantEmail(shop)!))).for("update");
    const integrationRows = await tx.select().from(integrations).where(and(eq(integrations.type, "shopify"),
      sql`${integrations.config}->>'shopUrl' = ${shop}`));
    const retainedContacts = await tx.select({ userId: shopifyMerchantContacts.userId })
      .from(shopifyMerchantContacts).where(eq(shopifyMerchantContacts.canonicalShop, shop));
    const ids = [...new Set([...merchantRows.map(u => u.id), ...integrationRows.map(i => i.userId),
      ...retainedContacts.map(r => r.userId)])];
    let erasedContacts = 0;
    for (const userId of ids) {
      const [current] = await tx.select().from(users).where(eq(users.id, userId)).for("update").limit(1);
      // A delayed request for another store must not erase the merchant's new installation.
      const ownsShop = normalizeShopifyShopDomain(current?.shopifyShop) === shop;
      const [otherIntegration] = await tx.select({ id: integrations.id }).from(integrations)
        .where(and(eq(integrations.userId, userId), eq(integrations.type, "shopify"),
          sql`COALESCE(${integrations.config}->>'shopUrl', '') <> ${shop}`)).limit(1);
      if (current && (ownsShop || (!current.shopifyShop && !otherIntegration))) {
        await tx.update(users).set(shopifyMerchantRedactionPatch(current,
          `redacted-${crypto.randomUUID()}@shopify.whachatcrm.com`)).where(eq(users.id, userId));
      }

      // Contacts have legacy source markers without a domain. Only use them for this mapping.
      if (ownsShop || (!current?.shopifyShop && !otherIntegration)) {
        const threadIds = (await tx.select({ id: conversations.id }).from(conversations)
          .where(and(eq(conversations.userId, userId), eq(conversations.channel, "shopify")))).map(r => r.id);
        const imported = await tx.select().from(contacts).where(eq(contacts.userId, userId));
        for (const contact of imported) {
          const custom = (contact.customFields || {}) as Record<string, unknown>;
          const linked = contact.source === "shopify" || custom.shopifyCustomerId != null ||
            custom.lastCommerceSource === "shopify" || recordBelongsToShopify(custom.lastCommerceMetadata, shop);
          if (!linked) continue;
          const otherThreads = await tx.select({ id: conversations.id }).from(conversations)
            .where(and(eq(conversations.contactId, contact.id), sql`${conversations.channel} <> 'shopify'`)).limit(1);
          if (contact.source === "shopify" && !otherThreads.length &&
              !contact.whatsappId && !contact.instagramId && !contact.facebookId && !contact.telegramId && !contact.ghlId && !contact.webchatId) {
            // Workflow dispatch creates a legacy mirror by phone or contact UUID.
            await tx.delete(chats).where(and(eq(chats.userId, userId),
              or(eq(chats.whatsappPhone, `webchat:${contact.id}`),
                contact.phone ? eq(chats.whatsappPhone, contact.phone.replace(/\D/g, "")) : sql`false`)));
            erasedContacts += await deleteContactRecords([contact.id], tx);
          } else {
            await tx.update(contacts).set(shopifyContactRedactionPatch(contact, shop)).where(eq(contacts.id, contact.id));
            if (contact.source === "shopify") {
              await tx.update(chats).set({ name: "Contact" }).where(and(eq(chats.userId, userId),
                eq(chats.name, contact.name), or(eq(chats.whatsappPhone, `webchat:${contact.id}`),
                  contact.phone ? eq(chats.whatsappPhone, contact.phone.replace(/\D/g, "")) : sql`false`)));
            }
          }
        }
        if (threadIds.length) {
          await tx.delete(flowJobs).where(inArray(flowJobs.conversationId, threadIds));
          await tx.delete(workflowExecutions).where(inArray(workflowExecutions.conversationId, threadIds));
          await tx.delete(conversations).where(inArray(conversations.id, threadIds));
        }
        await tx.delete(messages).where(and(eq(messages.userId, userId), sql`${messages.externalMessageId} LIKE 'shopify:%'`));
        await tx.delete(activityEvents).where(and(eq(activityEvents.userId, userId),
          or(sql`${activityEvents.eventType} LIKE 'shopify_%'`, sql`${activityEvents.eventData}->>'source' = 'shopify'`,
            sql`${activityEvents.eventData}->>'shop' = ${shop}`)));
        const ownedWorkflows = (await tx.select({ id: workflows.id }).from(workflows).where(eq(workflows.userId, userId))).map(r => r.id);
        if (ownedWorkflows.length) {
          const executions = await tx.select().from(workflowExecutions).where(inArray(workflowExecutions.workflowId, ownedWorkflows));
          for (const row of executions) {
            const trigger = row.triggerData as Record<string, unknown> | null;
            if (recordBelongsToShopify(trigger, shop) || recordBelongsToShopify(trigger?.metadata, shop))
              await tx.delete(workflowExecutions).where(eq(workflowExecutions.id, row.id));
          }
        }
        const ownedHooks = (await tx.select({ id: webhooks.id }).from(webhooks).where(eq(webhooks.userId, userId))).map(r => r.id);
        if (ownedHooks.length) {
          const deliveries = await tx.select().from(webhookDeliveries).where(inArray(webhookDeliveries.webhookId, ownedHooks));
          for (const row of deliveries) {
            const payload = row.payload as Record<string, unknown>;
            if (row.event.startsWith("shopify_") || recordBelongsToShopify(payload, shop) ||
                recordBelongsToShopify(payload?.metadata, shop) || recordBelongsToShopify(payload?.data, shop))
              await tx.delete(webhookDeliveries).where(eq(webhookDeliveries.id, row.id));
          }
        }
        const jobs = await tx.select().from(flowJobs).where(eq(flowJobs.userId, userId));
        for (const job of jobs) {
          const payload = job.payload as Record<string, unknown>;
          if (recordBelongsToShopify(payload, shop) || recordBelongsToShopify(payload?.metadata, shop))
            await tx.delete(flowJobs).where(eq(flowJobs.id, job.id));
        }
      }
    }
    // Includes legacy partial redactions where users.shopifyShop was already cleared.
    await tx.delete(integrations).where(and(eq(integrations.type, "shopify"),
      or(sql`${integrations.config}->>'shopUrl' = ${shop}`,
        ids.length ? and(inArray(integrations.userId, ids), sql`COALESCE(${integrations.config}->>'shopUrl', '') = ''`) : sql`false`)));
    await tx.delete(shopifyMerchantContacts).where(eq(shopifyMerchantContacts.canonicalShop, shop));
    await tx.delete(shopifyShopTrials).where(eq(shopifyShopTrials.canonicalShop, shop));
    const dates = merchantRows.map(u => u.shopifyInstalledAt).filter((d): d is Date => !!d);
    // No address/domain/hash/user selector is retained in this task. Purge streams for the time window.
    await tx.insert(shopifyPrivacyErasureTasks).values({
      scopeFrom: dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null,
      scopeTo: new Date(),
    });
    return { databaseErased: true, externalErasurePending: true, erasedContacts };
  });
}

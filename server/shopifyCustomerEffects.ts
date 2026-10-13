import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { activityEvents, contacts, integrations, users, workflows, type Contact, type Workflow } from "@shared/schema";
import { isShopifyContactInstallationActive } from "@shared/shopifyContactPrivacy";
import { customerPrivacyLocked } from "./shopifyPrivacyRequests";
import { contactHasDoNotContact } from "./automationSendGuard";
import { decryptIntegrationConfig } from "./integrationConfigCrypto";

export type CustomerEffect = { kind: "workflow" | "hubspot"; targetId: string; fingerprint?: string;
  status: "pending" | "started" | "completed" | "skipped" | "reconciliation_required";
  attempts?: number; nextAttemptAt?: string; reason?: string };
export const customerWorkflowFingerprint = (workflow: Workflow) => createHash("sha256")
  .update(JSON.stringify([workflow.actions, workflow.triggerConditions])).digest("hex");
export function customerWorkflowSupported(workflow: Workflow): boolean {
  // Stage one restores CRM-only actions. The current executor cannot bind consent to its resolved
  // send channel/address, or safely checkpoint arbitrary partial outbound runs. Hold the whole run.
  const internal = new Set(["tag", "apply_tag", "set_pipeline", "set_pipeline_stage", "assign", "add_note", "set_followup", "create_or_update_lead"]);
  return Array.isArray(workflow.actions) && workflow.actions.length > 0 &&
    workflow.actions.every(action => action && typeof action === "object" && internal.has(String((action as { type?: string }).type)));
}
export function customerHubSpotAuthorized(config: Record<string, unknown>): boolean {
  return config.connectionStatus === "connected" && config.shopifyCustomerExportAuthorized === true &&
    Array.isArray(config.syncOptions) && config.syncOptions.includes("sync_contacts") &&
    typeof config.accessToken === "string" && !!config.accessToken.trim();
}

export function customerEffectsSuppressed(contact: Contact): boolean {
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  return contact.automationsPaused === true || contactHasDoNotContact(contact).blocked ||
    ["suppressed", "emailSuppressed", "smsSuppressed", "whatsappSuppressed"].some(key => cf[key] === true);
}

class EffectAlreadyClaimed extends Error {}
type Database = typeof db;
type Prepared = ((start: () => Promise<void>) => Promise<"completed" | "skipped">) | null;
export type CustomerEffectAdapters = { prepare: (effect: CustomerEffect, contact: Contact,
  conversationId: string | null, event: Record<string, unknown>, database: Database) => Promise<Prepared> };
export const customerEffectAdapters: CustomerEffectAdapters = {
  async prepare(effect, contact, conversationId, event, database) {
    if (effect.kind === "workflow") {
      const [workflow] = await database.select().from(workflows).where(and(eq(workflows.id, effect.targetId),
        eq(workflows.userId, contact.userId), eq(workflows.isActive, true), eq(workflows.triggerType, "shopify_customer_created")));
      if (!workflow || customerWorkflowFingerprint(workflow) !== effect.fingerprint || !customerWorkflowSupported(workflow)) return null;
      const { subscriptionService } = await import("./subscriptionService");
      if (!(await subscriptionService.getUserLimits(contact.userId))?.workflowsEnabled) return null;
      const { executeWorkflowActions } = await import("./workflowEngine");
      return async start => {
        await start();
        const result = await executeWorkflowActions(workflow, null, { trigger: "shopify_customer_created",
          shopifyEventId: event.shopifyEventId, metadata: event }, contact, conversationId || undefined, { durableShopify: true });
        if (!result.success) throw new Error("workflow_result_uncertain");
        return "completed";
      };
    }
    const [hub] = await database.select().from(integrations).where(and(eq(integrations.id, effect.targetId),
      eq(integrations.userId, contact.userId), eq(integrations.type, "hubspot"), eq(integrations.isActive, true)));
    if (!hub) return null;
    const config = decryptIntegrationConfig((hub.config || {}) as Record<string, unknown>);
    if (!customerHubSpotAuthorized(config)) return null;
    const { pushLeadsToHubSpot, normalizePhoneForHubSpot } = await import("./hubspotSync");
    const { hubspotValidatePrivateAppToken } = await import("./hubspotApi");
    const token = config.accessToken as string;
    if (!await hubspotValidatePrivateAppToken(token)) throw new Error("hubspot_authorization_unavailable");
    return async start => {
      const outcome = await pushLeadsToHubSpot(token, [{ email: contact.email || undefined,
        phone: normalizePhoneForHubSpot(contact.phone), name: contact.name,
        tag: contact.tag, pipelineStage: contact.pipelineStage }], { strictLookup: true, beforeWrite: start });
      if (outcome.failed) throw new Error("hubspot_result_uncertain");
      return outcome.pushed ? "completed" : "skipped";
    };
  },
};

/** Session lock, not a transaction: external APIs never execute inside a DB transaction.
 * The same shop lock prevents concurrent workers and serializes with erasure/uninstall.
 */
export async function customerEffectFence<T>(shop: string, run: () => Promise<T>, database: Database = db): Promise<T> {
  const connection = await database.$client.connect();
  try {
    await connection.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [shop]);
    return await run();
  } finally {
    try { await connection.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [shop]); }
    finally { connection.release(); }
  }
}

export async function processCustomerEffectEvent(id: string, database: Database = db,
  adapters: CustomerEffectAdapters = customerEffectAdapters,
  fence: typeof customerEffectFence = customerEffectFence): Promise<void> {
  const [initial] = await database.select().from(activityEvents).where(eq(activityEvents.id, id));
  const shop = (initial?.eventData as Record<string, unknown>)?.shop;
  if (typeof shop !== "string") return;
  await fence(shop, async () => {
    const [row] = await database.select().from(activityEvents).where(eq(activityEvents.id, id));
    const event = row?.eventData as Record<string, unknown>;
    if (!row || row.eventType !== "shopify_customer_created" || event.source !== "shopify" || !Array.isArray(event.customerEffects)) return;
    const jobs = event.customerEffects as CustomerEffect[];
    const save = async (job: CustomerEffect) => {
      const position = jobs.indexOf(job);
      const expected = job.status === "pending" || job.status === "skipped"
        ? sql`${activityEvents.eventData}->'customerEffects'->${position}::int->>'status' = 'pending'`
        : sql`${activityEvents.eventData}->'customerEffects'->${position}::int->>'status' IN ('started','reconciliation_required')`;
      const saved = await database.update(activityEvents).set({ eventData:
        sql`jsonb_set(${activityEvents.eventData}, ARRAY['customerEffects', ${String(position)}]::text[], ${JSON.stringify(job)}::jsonb)` })
        .where(and(eq(activityEvents.id, id), eq(activityEvents.userId, row.userId),
          expected))
        .returning({ id: activityEvents.id });
      if (saved.length !== 1) throw new Error("effect_event_changed");
    };
    for (const job of jobs) {
      if (job.status === "started") { job.status = "reconciliation_required"; job.reason = "interrupted_after_start"; await save(job); continue; }
      if (job.status !== "pending" || (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > Date.now())) continue;
      let executionStarted = false;
      try {
        const [contact] = await database.select().from(contacts).where(and(eq(contacts.id, row.contactId), eq(contacts.userId, row.userId)));
        const [user] = await database.select().from(users).where(and(eq(users.id, row.userId), eq(users.shopifyShop, shop)));
        const [installation] = await database.select().from(integrations).where(and(eq(integrations.userId, row.userId), eq(integrations.type, "shopify"), eq(integrations.isActive, true)));
        const cfg = installation?.config as Record<string, unknown> | undefined;
        if (!contact || !user || !isShopifyContactInstallationActive(user) || !installation ||
          (cfg?.shop != null && cfg.shop !== shop) || !Array.isArray(cfg?.syncOptions) || !cfg.syncOptions.includes("new_customers") ||
          customerEffectsSuppressed(contact) ||
          await customerPrivacyLocked(shop, { id: event.customerId, email: contact.email, phone: contact.phone }, database)) {
          job.status = "skipped"; job.reason = "authorization_or_suppression"; await save(job); continue;
        }
        const prepared = await adapters.prepare(job, contact, row.conversationId, event, database);
        if (!prepared) { job.status = "skipped"; job.reason = "disabled_or_unsupported"; await save(job); continue; }
        const outcome = await prepared(async () => {
          // A persisted start is a one-way safety barrier: never replay an ambiguous provider call.
          if (executionStarted) return;
          const [fresh] = await database.select().from(contacts).where(and(eq(contacts.id, row.contactId), eq(contacts.userId, row.userId)));
          if (!fresh || customerEffectsSuppressed(fresh) ||
            await customerPrivacyLocked(shop, { id: event.customerId, email: fresh.email, phone: fresh.phone }, database))
            throw new Error("authorization_changed");
          if (job.kind === "workflow") {
            const [current] = await database.select().from(workflows).where(and(eq(workflows.id, job.targetId), eq(workflows.userId, row.userId), eq(workflows.isActive, true)));
            if (!current || customerWorkflowFingerprint(current) !== job.fingerprint) throw new Error("workflow_changed");
          } else {
            const [current] = await database.select().from(integrations).where(and(eq(integrations.id, job.targetId), eq(integrations.userId, row.userId), eq(integrations.type, "hubspot"), eq(integrations.isActive, true)));
            if (!current || !customerHubSpotAuthorized((current.config || {}) as Record<string, unknown>)) throw new Error("integration_changed");
          }
          job.status = "started";
          const position = jobs.indexOf(job);
          const claimed = await database.update(activityEvents).set({ eventData:
            sql`jsonb_set(${activityEvents.eventData}, ARRAY['customerEffects', ${String(position)}]::text[], ${JSON.stringify(job)}::jsonb)` })
            .where(and(eq(activityEvents.id, id), eq(activityEvents.userId, row.userId),
              sql`${activityEvents.eventData}->'customerEffects'->${position}::int->>'status' = 'pending'`))
            .returning({ id: activityEvents.id });
          if (claimed.length !== 1) throw new EffectAlreadyClaimed();
          executionStarted = true;
        });
        job.status = outcome; job.reason = undefined; await save(job);
      } catch (error) {
        if (error instanceof EffectAlreadyClaimed) return;
        job.attempts = (job.attempts || 0) + 1;
        if (executionStarted || String(job.status) === "started") { job.status = "reconciliation_required"; job.reason = "outcome_uncertain"; }
        else { job.status = "pending"; job.reason = "preflight_retry";
          job.nextAttemptAt = new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7))).toISOString(); }
        await save(job);
      }
    }
  }, database);
}
let ticking = false;
export async function runShopifyCustomerEffectsTick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const rows = await db.select({ id: activityEvents.id }).from(activityEvents).where(sql`
      ${activityEvents.eventType} = 'shopify_customer_created' AND
      EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(${activityEvents.eventData}->'customerEffects','[]'::jsonb)) j
        WHERE j->>'status' IN ('pending','started') AND (j->>'nextAttemptAt' IS NULL OR (j->>'nextAttemptAt')::timestamp <= NOW()))
    `).orderBy(activityEvents.createdAt).limit(20);
    for (const row of rows) await processCustomerEffectEvent(row.id);
  } catch { console.error(JSON.stringify({ tag: "[CommerceIngest]", event: "customer_effect_tick_failed" })); }
  finally { ticking = false; }
}

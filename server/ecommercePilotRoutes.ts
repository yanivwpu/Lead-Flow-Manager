import { readPostPurchasePlans, parsePostPurchasePlanChange } from "../shared/postPurchase";
import { savePostPurchasePlanQuery } from "./ecommerce/postPurchasePlans";
import { postPurchaseTablesQuery, postPurchaseTables } from "./ecommerce/postPurchaseQueries";
import { parsePostPurchaseTemplateBindingChange, readPostPurchaseTemplateBindings, eligiblePostPurchaseLibraryTemplate, eligiblePostPurchaseTemplateLookupQuery, savePostPurchaseTemplateBindingQuery } from "./ecommerce/postPurchaseTemplateBinding";
import { pendingEventReviewQuery, markEventReviewedQuery } from "./ecommerce/reviewQueue";
import { readWorkflowDraftSettings, parseWorkflowDraftChange, saveWorkflowDraftQuery } from "./ecommerce/workflowDraftSettings";
import { parseSupportTaskChange, parseSupportTaskComplete, orderSupportTablesReadyQuery, orderSupportTablesReady, saveOrderTaskMerchantOptInQuery, readOrderTaskMerchantSettingsQuery, readOrderSupportTaskListQuery, markOrderSupportTaskCompleteQuery } from "./ecommerce/orderSupportMerchantControls";
import { parseOrderSupportQuickStart, orderSupportQuickStartAvailable } from "./ecommerce/orderSupportQuickStart";
import { parseTaskScheduleChange, taskScheduleReadyQuery, taskScheduleReady, readScheduledOrderSupportTaskListQuery, saveTaskScheduleQuery } from "./ecommerce/orderTaskSchedule";
import { users, integrations } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { isShopifyContactInstallationActive } from "@shared/shopifyContactPrivacy";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { Router, type Request, type Response } from "express";
import { storage } from "./storage";
import { parseReviewEventRequest } from "./ecommerce/reviewIntent";
import { requireEcommercePilot } from "./ecommerce/pilotMiddleware";
import {postPurchaseActivationReadiness,parsePostPurchaseActivation,savePostPurchaseActivationQuery} from './ecommerce/postPurchaseActivation';
import {postPurchaseDeliveryReadinessQuery} from './ecommerce/postPurchaseDeliveryReadiness';

const router = Router();
router.use(requireEcommercePilot);
router.get('/capabilities', (_req, res) => res.json({
  available: true, messagingEnabled: false, consentCaptureEnabled: false,
  checkoutObservationEnabled: false, recoveryEnabled: false,
}));

router.get('/event-inbox-preview', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const accountId = (req.user as { id: string }).id;
    const owner = await storage.getUserForSession(accountId);
    if (!owner || !isShopifyContactInstallationActive(owner))
      return res.status(403).json({ error: 'Active Shopify connection required' });
    const shop = normalizeShopifyShopDomain(owner.shopifyShop);
    const integration = await storage.getIntegrationByUserAndType(accountId, 'shopify');
    const cfg = (integration?.config ?? {}) as Record<string, unknown>;
    if (!shop || !integration?.isActive ||
        (cfg.shop != null && normalizeShopifyShopDomain(String(cfg.shop)) !== shop))
      return res.status(403).json({ error: 'Active Shopify connection required' });
    const result = await db.execute(sql`
      SELECT COUNT(*)::integer AS total,
             COUNT(*) FILTER (WHERE state = 'pending')::integer AS pending,
             COUNT(*) FILTER (WHERE journey = 'order_support')::integer AS order_support,
             COUNT(*) FILTER (WHERE journey = 'fulfillment_support')::integer AS fulfillment_support,
             COUNT(*) FILTER (WHERE journey = 'order_cancelled')::integer AS order_cancelled,
             MAX(received_at) AS last_event_at
      FROM ecommerce_growth_event_inbox
      WHERE account_id = ${accountId} AND shop = ${shop}
    `);
    // Only administrative event metadata; no contact payload, delivery ID or customer fields.
    const rows = await db.execute(pendingEventReviewQuery(accountId, shop));
    const reviewQueue = rows.rows.map(row => ({
      id: String(row.id),
      topic: String(row.topic),
      journey: String(row.journey),
      receivedAt: new Date(row.received_at as string | Date).toISOString(),
    }));
    // Do not block the existing event inbox when the opt-in migration is not applied.
    // Exact tenant/shop scope is enforced on every task read; no customer data returned.
    const taskTables = await db.execute(orderSupportTablesReadyQuery);
    const scheduleTables = await db.execute(taskScheduleReadyQuery);
    const scheduleReady = taskScheduleReady(scheduleTables.rows[0]);
    let internalTasks: { schemaReady: boolean; scheduleReady: boolean; merchantEnabled: boolean; operatorEnabled: boolean; openCount: number; completedCount: number; items: Array<{id: string;state: string;createdAt:string;contactId:string;contactName:string;orderActivityId:string|null;orderName:string|null;assigneeUserId:string|null;dueAt:string|null;reminderMinutes:number|null;reminderDue:boolean}> } = {
      schemaReady: false, scheduleReady, merchantEnabled: false,
      operatorEnabled: process.env.ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED === 'true' &&
        process.env.ECOMMERCE_EVENT_RECORDING_ENABLED === 'true',
      openCount: 0, completedCount: 0, items: []
    };
    if (orderSupportTablesReady(taskTables.rows[0])) {
      const [settings, tasks] = await Promise.all([
        db.execute(readOrderTaskMerchantSettingsQuery(accountId, shop)),
        db.execute(scheduleReady
          ? readScheduledOrderSupportTaskListQuery(accountId, shop)
          : readOrderSupportTaskListQuery(accountId, shop)),
      ]);
      const counts = settings.rows[0] as {enabled?:boolean;open_count?:number;completed_count?:number} | undefined;
      internalTasks = {
        ...internalTasks, schemaReady:true, merchantEnabled:counts?.enabled === true,
        openCount:Number(counts?.open_count ?? 0), completedCount:Number(counts?.completed_count ?? 0),
        items:tasks.rows.map(row => ({
          id:String(row.id),state:String(row.state),
          createdAt:new Date(row.created_at as Date|string).toISOString(),
          contactId:String(row.contact_id),contactName:String(row.contact_name),
          orderActivityId:row.order_activity_id ? String(row.order_activity_id) : null,
          orderName:row.order_name ? String(row.order_name) : null,
          assigneeUserId:row.assignee_user_id ? String(row.assignee_user_id) : null,
          dueAt:row.due_at ? new Date(row.due_at as string|Date).toISOString() : null,
          reminderMinutes:row.reminder_minutes == null ? null : Number(row.reminder_minutes),
          reminderDue:row.reminder_due === true,
        }))
      };
    }
    // Existing additive post-purchase schema check: reads only metadata.
    // Incomplete schema never authorizes sending or changes event preview semantics.
    let postPurchaseSchemaReady: boolean | null = null;
    try {
      const checked = await db.execute(postPurchaseTablesQuery);
      const tables = postPurchaseTables(checked.rows[0] as Record<string, unknown> | undefined);
      postPurchaseSchemaReady = tables.intents && tables.orders && tables.consents;
    } catch { postPurchaseSchemaReady = null; }
    const stats = result.rows[0] as { total?: number; pending?: number; order_support?: number; fulfillment_support?: number; order_cancelled?: number; last_event_at?: Date | string | null } | undefined;
    const deliverySchema=await db.execute(postPurchaseDeliveryReadinessQuery);
    const deliveryReady=deliverySchema.rows[0]?.outbox===true&&postPurchaseSchemaReady===true;
    postPurchaseSchemaReady=postPurchaseSchemaReady===null?null:deliveryReady;
    const deliveryActivation=postPurchaseActivationReadiness(process.env,accountId,cfg,deliveryReady);
    return res.json({ ok: true,
      deliveryActivation,
      mode: process.env.ECOMMERCE_EVENT_RECORDING_ENABLED === 'true' ? 'recording' : 'paused',
      total: Number(stats?.total ?? 0), pending: Number(stats?.pending ?? 0),
      journeys: { orderSupport: Number(stats?.order_support ?? 0), fulfillmentSupport: Number(stats?.fulfillment_support ?? 0), orderCancelled: Number(stats?.order_cancelled ?? 0) },
      lastEventAt: stats?.last_event_at ? new Date(stats.last_event_at).toISOString() : null,
      reviewQueue,
      workflowDrafts: readWorkflowDraftSettings(cfg),
      postPurchasePlans: readPostPurchasePlans(cfg),
      postPurchaseTemplates: readPostPurchaseTemplateBindings(cfg),
      postPurchaseSchemaReady,
      postPurchaseReadiness: { activationEligible: deliveryActivation.canActivate, reason: deliveryActivation.blockers[0]??"merchant_activation_required", messagingEnabled: deliveryActivation.deliveryEnabled },
      internalTasks,
      messagingEnabled: false, checkoutEnabled: false });
  } catch {
    return res.status(503).json({ error: 'E-commerce inbox preview unavailable' });
  }
});

router.post('/event-review', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  // Require a same-origin JSON request; no cross-site form or opaque-origin writes.
  const parsed = parseReviewEventRequest(req.body);
  if (!parsed) return res.status(400).json({ error: 'Invalid review request' });
  try {
    const accountId = (req.user as { id: string }).id;
    const owner = await storage.getUserForSession(accountId);
    if (!owner || !isShopifyContactInstallationActive(owner))
      return res.status(403).json({ error: 'Active Shopify connection required' });
    const shop = normalizeShopifyShopDomain(owner.shopifyShop);
    const integration = await storage.getIntegrationByUserAndType(accountId, 'shopify');
    const cfg = (integration?.config ?? {}) as Record<string, unknown>;
    if (!shop || !integration?.isActive ||
        (cfg.shop != null && normalizeShopifyShopDomain(String(cfg.shop)) !== shop))
      return res.status(403).json({ error: 'Active Shopify connection required' });
    const changed = await db.execute(markEventReviewedQuery(parsed.eventId, accountId, shop));
    if (changed.rows.length !== 1)
      return res.status(409).json({ error: 'Event not pending or unavailable' });
    return res.json({ ok: true, reviewed: true });
  } catch {
    return res.status(503).json({ error: 'E-commerce event review unavailable' });
  }
});

/** Existing owner-only, same-origin pilot boundary applies to activation as well. */
router.post('/post-purchase-activation', async (req:Request,res:Response)=>{
  const enabled=parsePostPurchaseActivation(req.body);
  if(enabled===null)return res.status(400).json({error:'Invalid activation request'});
  if(!req.user)return res.status(401).json({error:'Unauthorized'});
  const accountId=(req.user as {id:string}).id;
  try{
    const owner=await storage.getUserForSession(accountId);
    const shop=normalizeShopifyShopDomain(owner?.shopifyShop);
    if(!shop)return res.status(409).json({error:'Active Shopify connection required'});
    const outcome=await db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop},0))`);
      const [live]=await tx.select().from(users).where(and(eq(users.id,accountId),eq(users.shopifyShop,shop))).for('share').limit(1);
      if(!live||!isShopifyContactInstallationActive(live))return false;
      const installs=await tx.select().from(integrations).where(and(eq(integrations.userId,accountId),eq(integrations.type,'shopify'),eq(integrations.isActive,true))).for('share').limit(2);
      if(installs.length!==1)return false;
      const installation=installs[0],config=(installation.config??{}) as Record<string,unknown>;
      const schema=(await tx.execute(postPurchaseDeliveryReadinessQuery)).rows[0];
      if(enabled&&!postPurchaseActivationReadiness(process.env,accountId,config,
        schema?.outbox===true&&schema?.intents===true&&schema?.consents===true).canActivate)return false;
      const saved=await tx.execute(savePostPurchaseActivationQuery(accountId,shop,installation.id,enabled));
      return saved.rows.length===1;
    });
    if(!outcome)return res.status(409).json({error:'Activation prerequisites are incomplete'});
    return res.json({ok:true,merchantEnabled:enabled});
  }catch{return res.status(503).json({error:'Activation unavailable'});}
});

/** Merchant-owned pilot workflow DRAFTS only. An explicit flag does not activate a
 * workflow, enqueue tasks, authorize a channel, or permit outbound messages.
 */
router.post('/workflow-draft', async (req: Request, res: Response) => {
  res.set('Cache-Control','no-store');
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const change = parseWorkflowDraftChange(req.body);
  const planChange = parsePostPurchasePlanChange(req.body);
  const templateChange = parsePostPurchaseTemplateBindingChange(req.body);
  if (!change && !planChange && !templateChange) return res.status(400).json({ error: 'Invalid draft request' });
  try {
    const accountId = (req.user as { id: string }).id;
    const sessionOwner = await storage.getUserForSession(accountId);
    if (!sessionOwner || !isShopifyContactInstallationActive(sessionOwner))
      return res.status(403).json({ error: 'Active Shopify connection required' });
    const shop = normalizeShopifyShopDomain(sessionOwner.shopifyShop);
    if (!shop) return res.status(403).json({ error: 'Active Shopify connection required' });
    // Serialize configuration against uninstall/redaction using the same shop lock.
    const saved = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))`);
      const [liveOwner] = await tx.select().from(users).where(and(eq(users.id, accountId),
        eq(users.shopifyShop, shop))).limit(1);
      if (!liveOwner || !isShopifyContactInstallationActive(liveOwner)) return null;
      const installations = await tx.select().from(integrations).where(and(
        eq(integrations.userId, accountId), eq(integrations.type, 'shopify'),
        eq(integrations.isActive, true))).limit(2);
      // Ambiguous active Shopify installations must never be updated arbitrarily.
      if (installations.length !== 1) return null;
      const installation = installations[0];
      const cfg = (installation.config || {}) as Record<string, unknown>;
      if (cfg.shop != null && (typeof cfg.shop !== 'string' ||
          normalizeShopifyShopDomain(cfg.shop) !== shop)) return null;
      // Template selections cannot reference another account, unsynced messages,
      // or unsupported Meta formats. Selection is still NOT live approval.
      if (templateChange?.templateId) {
        const owned = await tx.execute(eligiblePostPurchaseTemplateLookupQuery(accountId, templateChange.templateId));
        if (owned.rows.length !== 1 || !eligiblePostPurchaseLibraryTemplate(
          owned.rows[0] as Record<string, unknown>, templateChange.journey,
        )) return 'template_unavailable';
      }
      const updated = await tx.execute(templateChange
        ? savePostPurchaseTemplateBindingQuery({ integrationId: installation.id, accountId, shop, ...templateChange })
        : planChange
          ? savePostPurchasePlanQuery({ integrationId: installation.id, accountId, shop, ...planChange })
          : saveWorkflowDraftQuery({ integrationId: installation.id, accountId, shop, ...change! }));
      return updated.rows.length === 1 ? updated.rows[0] : null;
    });
    if (saved === 'template_unavailable') return res.status(409).json({ error: 'Choose an approved matching template from your library' });
    if (!saved) return res.status(409).json({ error: 'Shopify installation changed; refresh' });
    return res.json({ ok: true, ...(templateChange ? { postPurchaseTemplates: readPostPurchaseTemplateBindings({
      ecommercePostPurchaseTemplates: saved.bindings
    }) } : planChange ? { postPurchasePlans: readPostPurchasePlans({
      ecommercePostPurchasePlans: saved.plans
    }) } : { workflowDrafts: readWorkflowDraftSettings({ ecommerceGrowthEngineDrafts: saved.drafts }) }),
      activationEligible: false, workflowActive: false, messagingEnabled: false });
  } catch {
    return res.status(503).json({ error: 'Workflow draft unavailable' });
  }
});

/** Single explicit action to prepare and start merchant-only order-support tasks.
 * Creates no outbound messaging workflow; never mutates Shopify orders.
 * Pilot-only until distinct production safety/release acceptance.
 */
router.post('/order-support-quick-start', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!parseOrderSupportQuickStart(req.body))
    return res.status(400).json({ error: 'Invalid request' });
  if (!orderSupportQuickStartAvailable(process.env))
    return res.status(409).json({ error: 'Order support is not available yet' });
  try {
    const accountId = (req.user as {id: string}).id;
    const result = await db.transaction(async tx => {
      const owner = await storage.getUserForSession(accountId);
      const shop = normalizeShopifyShopDomain(owner?.shopifyShop);
      if (!owner || !shop || !isShopifyContactInstallationActive(owner)) return 'disconnected';
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))`);
      const [liveOwner] = await tx.select().from(users).where(and(
        eq(users.id,accountId), eq(users.shopifyShop,shop))).limit(1);
      if (!liveOwner || !isShopifyContactInstallationActive(liveOwner)) return 'disconnected';
      const installations = await tx.select().from(integrations).where(and(
        eq(integrations.userId,accountId),eq(integrations.type,'shopify'),
        eq(integrations.isActive,true))).limit(2);
      if (installations.length !== 1) return 'disconnected';
      const integration = installations[0];
      const cfg = (integration.config ?? {}) as Record<string, unknown>;
      if (cfg.shop != null && (typeof cfg.shop !== 'string' ||
          normalizeShopifyShopDomain(cfg.shop) !== shop)) return 'disconnected';
      // Do not silently enable a separate Shopify order sync switch.
      if (!Array.isArray(cfg.syncOptions) || !cfg.syncOptions.includes('new_orders'))
        return 'sync_paused';
      const ready = await tx.execute(orderSupportTablesReadyQuery);
      if (!orderSupportTablesReady(ready.rows[0])) return 'not_ready';
      const draft = await tx.execute(saveWorkflowDraftQuery({
        integrationId:integration.id,accountId,shop,
        journey:'orderSupport',prepared:true,
      }));
      if (draft.rows.length !== 1) throw new Error('Draft update failed');
      const optIn = await tx.execute(saveOrderTaskMerchantOptInQuery(accountId,shop,true));
      if (optIn.rows.length !== 1) throw new Error('Merchant opt-in failed');
      return 'started';
    });
    if (result === 'disconnected') return res.status(409).json({error:'Reconnect Shopify to continue'});
    if (result === 'sync_paused') return res.status(409).json({error:'Turn on Shopify order sync first'});
    if (result === 'not_ready') return res.status(409).json({error:'Order support setup is not ready'});
    return res.json({ok:true,orderSupportRunning:true,messagingEnabled:false,checkoutEnabled:false});
  } catch {
    return res.status(503).json({error:'Could not start order support. Try again.'});
  }
});

/** Merchant opt-in/PAUSE for internal order-support tasks ONLY.
 * Requires reviewed schema, prepared orderSupport draft, active owned Shopify
 * installation and the same uninstall/redaction lock. Never enables customer sends.
 */
router.post('/order-support-settings', async (req: Request, res: Response) => {
  res.set('Cache-Control','no-store');
  if (!req.user) return res.status(401).json({error:'Unauthorized'});
  const input = parseSupportTaskChange(req.body);
  if (!input) return res.status(400).json({error:'Invalid task settings'});
  try {
    const accountId = (req.user as {id:string}).id;
    const saved = await db.transaction(async tx => {
      const owner = await storage.getUserForSession(accountId);
      const shop = normalizeShopifyShopDomain(owner?.shopifyShop);
      if (!owner || !shop || !isShopifyContactInstallationActive(owner)) return null;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))`);
      const [liveOwner] = await tx.select().from(users).where(and(eq(users.id,accountId),
        eq(users.shopifyShop,shop))).limit(1);
      if (!liveOwner || !isShopifyContactInstallationActive(liveOwner)) return null;
      const matches = await tx.select().from(integrations).where(and(
        eq(integrations.userId,accountId), eq(integrations.type,'shopify'),
        eq(integrations.isActive,true))).limit(2);
      if (matches.length !== 1) return null;
      const cfg = (matches[0].config ?? {}) as Record<string,unknown>;
      if (cfg.shop != null && (typeof cfg.shop !== 'string' ||
        normalizeShopifyShopDomain(cfg.shop) !== shop)) return null;
      const ready = await tx.execute(orderSupportTablesReadyQuery);
      if (!orderSupportTablesReady(ready.rows[0])) return 'schema_missing';
      if (input.enabled && (!readWorkflowDraftSettings(cfg).orderSupport ||
          !Array.isArray(cfg.syncOptions) || !cfg.syncOptions.includes('new_orders')))
        return 'draft_or_sync_missing';
      const result = await tx.execute(saveOrderTaskMerchantOptInQuery(accountId,shop,input.enabled));
      return result.rows.length === 1 ? input.enabled : null;
    });
    if (saved === 'schema_missing') return res.status(409).json({error:'Task schema not ready'});
    if (saved === 'draft_or_sync_missing') return res.status(409).json({error:'Prepare order-support draft and enable order sync first'});
    if (saved === null) return res.status(409).json({error:'Shopify installation changed; refresh'});
    return res.json({ok:true,merchantEnabled:saved,operatorEnabled: orderSupportQuickStartAvailable(process.env),
      messagingEnabled:false,checkoutEnabled:false});
  } catch {
    return res.status(503).json({error:'Order-support task settings unavailable'});
  }
});

/** Manual completion operates only on an already-created, owned internal task.
 * Does not acknowledge the separate original Shopify event or send messages.
 */
router.post('/order-support-task-complete', async (req: Request, res: Response) => {
  res.set('Cache-Control','no-store');
  if (!req.user) return res.status(401).json({error:'Unauthorized'});
  const input = parseSupportTaskComplete(req.body);
  if (!input) return res.status(400).json({error:'Invalid task'});
  try {
    const accountId = (req.user as {id:string}).id;
    const owner = await storage.getUserForSession(accountId);
    const shop = normalizeShopifyShopDomain(owner?.shopifyShop);
    if (!owner || !shop || !isShopifyContactInstallationActive(owner))
      return res.status(403).json({error:'Active Shopify connection required'});
    const integration = await storage.getIntegrationByUserAndType(accountId,'shopify');
    const cfg = (integration?.config ?? {}) as Record<string,unknown>;
    if (!integration?.isActive ||
      (cfg.shop != null && (typeof cfg.shop !== 'string' ||
        normalizeShopifyShopDomain(cfg.shop) !== shop)))
      return res.status(403).json({error:'Active Shopify connection required'});
    const result = await db.execute(markOrderSupportTaskCompleteQuery(input.taskId,accountId,shop));
    if (result.rows.length !== 1) return res.status(409).json({error:'Task unavailable or already completed'});
    return res.json({ok:true,completed:true,messagingEnabled:false});
  } catch {
    return res.status(503).json({error:'Task completion unavailable'});
  }
});

/** Owner-only, pilot-only schedule editing. No customer send or contact follow-up writes.
 * The SQL atomically validates task ownership AND live active team membership.
 */
router.post('/order-support-task-schedule', async (req: Request, res: Response) => {
  res.set('Cache-Control','no-store');
  if (!req.user) return res.status(401).json({error:'Unauthorized'});
  const change = parseTaskScheduleChange(req.body);
  if (!change) return res.status(400).json({error:'Invalid task schedule'});
  try {
    const accountId=(req.user as {id:string}).id;
    const owner=await storage.getUserForSession(accountId);
    const shop=normalizeShopifyShopDomain(owner?.shopifyShop);
    if (!owner || !shop || !isShopifyContactInstallationActive(owner))
      return res.status(403).json({error:'Active Shopify connection required'});
    const integration=await storage.getIntegrationByUserAndType(accountId,'shopify');
    const cfg=(integration?.config ?? {}) as Record<string,unknown>;
    if (!integration?.isActive ||
        (cfg.shop != null && (typeof cfg.shop !== 'string' ||
         normalizeShopifyShopDomain(cfg.shop) !== shop)))
      return res.status(403).json({error:'Active Shopify connection required'});
    const ready=await db.execute(taskScheduleReadyQuery);
    if (!taskScheduleReady(ready.rows[0]))
      return res.status(409).json({error:'Task schedule schema unavailable'});
    const changed=await db.execute(saveTaskScheduleQuery(change,accountId,shop));
    if (changed.rows.length !== 1)
      return res.status(409).json({error:'Task not open, not owned, or assignee not active'});
    return res.json({ok:true,messagingEnabled:false,checkoutEnabled:false});
  } catch {
    return res.status(503).json({error:'Task schedule unavailable'});
  }
});


export default router;

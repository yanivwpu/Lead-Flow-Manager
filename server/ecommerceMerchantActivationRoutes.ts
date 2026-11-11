import { Router, type Request, type Response } from "express";
import rateLimit,{ipKeyGenerator} from "express-rate-limit";
import {consumeRateLimit,inspectRateLimit,resetRateLimitKey,getClientIp} from "./rateLimitMiddleware";
import { isEcommerceOnboardingDocumentRequest } from "./ecommerce/onboardingDocumentAccess";
import { and, eq, sql } from "drizzle-orm";
import { users, integrations } from "@shared/schema";
import { db } from "../drizzle/db";
import { storage } from "./storage";
import { isEcommercePilotOwner } from "./ecommerce/pilotAccess";
import { isShopifyContactInstallationActive } from "@shared/shopifyContactPrivacy";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { getEffectivePlanForUser } from "@shared/trialEntitlements";
import { recoveryRuntimeSchemaReadyQuery } from "./ecommerce/checkoutRecoverySchema";
import { shopifyTemplateProvisioner } from "./ecommerce/shopifyTemplateProvisioningRuntime";
import { parseShopifyTemplateSetupAuthorization } from "../shared/shopifyGrowthTemplates";
import {parsePostPurchasePlanChange} from "../shared/postPurchase";
import { registerConsentEnrollmentRoutes } from './ecommerce/shopifyConsentEnrollmentRoutes';
import { registerConsentThemeRoutes } from './ecommerce/shopifyConsentStorefrontRoutes';
import { consentThemeSetup } from './ecommerce/shopifyConsentStorefrontRuntime';
import {
  canActivateMerchantWorkspace,
  merchantWorkspaceActivated,
  isMerchantActivationPost,
} from "./ecommerce/merchantActivationPolicy";

/**
 * Merchant workspace enrollment, NEVER an outbound automation, cart or order permission.
 * This router intentionally does not use the private Shopping pilot allowance.
 */
const router = Router();
/** Reuse the shared Redis counter (local fallback in tests/dev) across replicas.
 * Setup writes share one account budget; unauthed callers use the existing
 * trusted-client-IP resolver and IPv6 subnet normalization.
 */
const merchantSetupWriteLimiter=rateLimit({
  windowMs:60_000,limit:30,standardHeaders:true,legacyHeaders:false,
  keyGenerator:req=>{
    const id=(req.user as {id?:string}|undefined)?.id;
    return id?'account:'+id:ipKeyGenerator(getClientIp(req),56);
  },
  store:{
    localKeys:false,
    increment:async(key:string)=>{
      const counter='shopify-growth-setup:'+key;
      const {count}=await consumeRateLimit(counter,30,60_000);
      const {ttlMs}=await inspectRateLimit(counter);
      return {totalHits:count,resetTime:new Date(Date.now()+Math.max(ttlMs,1))};
    },
    decrement:async()=>{},
    resetKey:async(key:string)=>resetRateLimitKey('shopify-growth-setup:'+key),
  },
  message:{error:'Too many setup requests. Try again shortly.',code:'setup_rate_limited'},
});

/** Same owner/workspace and same-origin boundary as installation. These endpoints
 * reuse the saved plans and independent operator gates; no queue or sender runs.
 */
router.post("/journey-plan",merchantSetupWriteLimiter,async(req:Request,res:Response)=>{
  res.set({"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow"});
  const accountId=(req.user as {id?:string}|undefined)?.id;
  if(!accountId)return res.status(401).json({error:"Unauthorized"});
  const origin=(process.env.APP_URL||"https://app.whachatcrm.com").replace(/\/$/,"");
  if(!isMerchantActivationPost(req.get("origin"),req.get("content-type"),{},origin))return res.status(403).json({error:"Invalid request"});
  const parsed=parsePostPurchasePlanChange(req.body);
  if(!parsed)return res.status(400).json({error:"Invalid journey plan"});
  try{
    if(!await shopifyTemplateProvisioner.savePlan(accountId,parsed.journey,parsed.plan))return res.status(409).json({error:"Journey plan unavailable"});
    return res.json({ok:true,messagingEnabled:false});
  }catch{return res.status(503).json({error:"Journey plan unavailable"});}
});
router.post("/journey-activation",merchantSetupWriteLimiter,async(req:Request,res:Response)=>{
  res.set({"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow"});
  const accountId=(req.user as {id?:string}|undefined)?.id;
  if(!accountId)return res.status(401).json({error:"Unauthorized"});
  const origin=(process.env.APP_URL||"https://app.whachatcrm.com").replace(/\/$/,"");
  if(!isMerchantActivationPost(req.get("origin"),req.get("content-type"),{},origin))return res.status(403).json({error:"Invalid request"});
  const body=req.body;
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length!==3||
    body.action!=="set_journey_delivery"||!["postPurchase","checkoutRecovery"].includes(body.journey)||typeof body.enabled!=="boolean")
    return res.status(400).json({error:"Invalid activation request"});
  try{
    if(!await shopifyTemplateProvisioner.setDelivery(accountId,body.journey,body.enabled))return res.status(409).json({error:"Activation prerequisites are incomplete"});
    return res.json({ok:true,merchantEnabled:body.enabled});
  }catch{return res.status(503).json({error:"Journey activation unavailable"});}
});

router.get("/template-setup", async (req: Request, res: Response) => {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  const accountId = (req.user as { id?: string } | undefined)?.id;
  if (!accountId) return res.status(401).json({ error: "Unauthorized" });
  try { return res.json(await shopifyTemplateProvisioner.view(accountId)); }
  catch { return res.status(503).json({ error: "Template setup unavailable" }); }
});

registerConsentEnrollmentRoutes(router, { service: shopifyTemplateProvisioner, writeLimiter: merchantSetupWriteLimiter,
  appOrigin: () => (process.env.APP_URL || 'https://app.whachatcrm.com').replace(/\/$/, '') });
registerConsentThemeRoutes(router, { setup: consentThemeSetup, record: shopifyTemplateProvisioner.recordConsentThemeAction,
  limiter: merchantSetupWriteLimiter, appOrigin: () => (process.env.APP_URL || 'https://app.whachatcrm.com').replace(/\/$/, '') });

router.post("/template-setup",merchantSetupWriteLimiter, async (req: Request, res: Response) => {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  const accountId = (req.user as { id?: string } | undefined)?.id;
  if (!accountId) return res.status(401).json({ error: "Unauthorized" });
  const appOrigin = (process.env.APP_URL || "https://app.whachatcrm.com").replace(/\/$/, "");
  if (!isMerchantActivationPost(req.get("origin"), req.get("content-type"), {}, appOrigin))
    return res.status(403).json({ error: "Invalid setup request" });
  if (!parseShopifyTemplateSetupAuthorization(req.body)) return res.status(400).json({ error: "Invalid template authorization" });
  try {
    if (!await shopifyTemplateProvisioner.authorize(accountId))
      return res.status(409).json({ error: "Connect Shopify and WhatsApp, install the engine, and check rollout availability" });
    // The bounded restart-safe worker performs management calls after this commit.
    return res.status(202).json({ ok: true, messagingEnabled: false });
  } catch { return res.status(503).json({ error: "Template setup unavailable" }); }
});

type Current = {
  accountId: string;
  shop: string | null;
  integrationId: string | null;
  eligible: boolean;
  activated: boolean;
  connected: boolean;
  planEligible: boolean;
};

export async function currentForAccount(accountId: string): Promise<Current | null> {
  const owner = await storage.getUserForSession(accountId);
  if (!owner || owner.id !== accountId || owner.deletionRequestedAt) return null;
  const shop = normalizeShopifyShopDomain(owner.shopifyShop);
  const installations = await db.select().from(integrations).where(and(
    eq(integrations.userId, accountId), eq(integrations.type, "shopify"),
    eq(integrations.isActive, true),
  )).limit(2);
  const installation = installations.length === 1 ? installations[0] : null;
  const cfg = (installation?.config ?? {}) as Record<string, unknown>;
  const configMatches = [cfg.shop, cfg.shopUrl].every(value => value == null ||
    (typeof value === "string" && normalizeShopifyShopDomain(value) === shop));
  const hasToken = typeof owner.shopifyAccessToken === "string" &&
    owner.shopifyAccessToken.trim().length > 0;
  const connected = !!(shop && installation?.isActive && configMatches && hasToken &&
    isShopifyContactInstallationActive(owner));
  const planEligible = getEffectivePlanForUser(owner) === "pro";
  const eligible = canActivateMerchantWorkspace({
    accountId, sessionAccountId: owner.id, sessionAligned: true,
    connectedShop: connected ? shop : null,
    hasInstalledToken: connected && hasToken,
    isShopifyOwner: !!installation && installation.userId === accountId,
    planEligible,
  });
  return {
    accountId, shop, integrationId: installation?.id ?? null,
    connected, planEligible, eligible,
    activated: eligible && !!shop && !!installation && await (async () => {
      const records = await db.execute(sql`
        SELECT activated_at FROM ecommerce_shopify_workspace_activations
        WHERE account_id = ${accountId} AND installation_id = ${installation.id} AND shop = ${shop}
        LIMIT 1
      `);
      return merchantWorkspaceActivated(records.rows[0]?.activated_at as Date | string | null | undefined);
    })(),
  };
}

router.get("/status", async (req: Request, res: Response) => {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  const accountId = (req.user as { id?: string } | undefined)?.id;
  if (!accountId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const state = await currentForAccount(accountId);
    if (!state) return res.status(404).json({ error: "Account unavailable" });
    // Read-only infrastructure readiness. Missing reviewed migrations never
    // become active sends; an unavailable check is UNKNOWN, not ready.
    let recoverySchemaReady: boolean | null = null;
    if (state.connected) {
      try {
        const schema = await db.execute(recoveryRuntimeSchemaReadyQuery());
        recoverySchemaReady = schema.rows[0]?.ready === true;
      } catch { recoverySchemaReady = null; }
    }
    // Existing checkout observations, read-only and tenant scoped. This is
    // detection evidence only, not a prepared intent, consent or send queue.
    let recoveryObservations: { total: number; open: number; dueForReview: number; latestAt: string | null } | null = null;
    if (state.activated && state.connected && state.shop && recoverySchemaReady === true) {
      try {
        const observed = await db.execute(sql`
          SELECT COUNT(*)::integer AS total,
            COUNT(*) FILTER (WHERE completed = FALSE)::integer AS open,
            COUNT(*) FILTER (
              WHERE completed = FALSE AND recovery_url_available = TRUE
                AND next_review_at <= NOW()
            )::integer AS due_for_review,
            MAX(first_observed_at) AS latest_at
          FROM ecommerce_abandoned_checkout_observations
          WHERE account_id = ${accountId} AND shop = ${state.shop}
        `);
        const row = observed.rows[0];
        if (row) {
          const latest = row.latest_at ? new Date(String(row.latest_at)) : null;
          recoveryObservations = {
            total: Number(row.total ?? 0),
            open: Number(row.open ?? 0),
            dueForReview: Number(row.due_for_review ?? 0),
            latestAt: latest && Number.isFinite(latest.getTime()) ? latest.toISOString() : null,
          };
        }
      } catch {
        // Unknown is not zero: do not mask an unavailable checkout source.
        recoveryObservations = null;
      }
    }
    return res.json({
      activated: state.activated, eligible: state.eligible,
      connected: state.connected, planEligible: state.planEligible,
      cartExecutionEnabled: false, outboundMessagingEnabled: false,
      recoverySchemaReady, recoveryObservations,
    });
  } catch {
    return res.status(503).json({ error: "E-Commerce activation status unavailable" });
  }
});

router.post("/activate", async (req: Request, res: Response) => {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  const accountId = (req.user as { id?: string } | undefined)?.id;
  if (!accountId) return res.status(401).json({ error: "Unauthorized" });
  const appOrigin = (process.env.APP_URL || "https://app.whachatcrm.com").replace(/\/$/, "");
  if (!isMerchantActivationPost(req.get("origin"), req.get("content-type"), req.body, appOrigin)) {
    return res.status(403).json({ error: "Invalid activation request" });
  }

  try {
    const result = await db.transaction(async tx => {
      const owner = await storage.getUserForSession(accountId);
      const shop = normalizeShopifyShopDomain(owner?.shopifyShop);
      if (!owner || !shop || owner.deletionRequestedAt) return null;
      // Same lock used by OAuth uninstall/redaction and Shopify tenant workflows.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))`);
      const [liveOwner] = await tx.select().from(users).where(
        and(eq(users.id, accountId), eq(users.shopifyShop, shop)),
      ).for("update").limit(1);
      if (!liveOwner || !isShopifyContactInstallationActive(liveOwner)) return null;
      const installations = await tx.select().from(integrations).where(and(
        eq(integrations.userId, accountId), eq(integrations.type, "shopify"),
        eq(integrations.isActive, true),
      )).limit(2);
      if (installations.length !== 1 || !installations[0].isActive) return null;
      const installation = installations[0];
      const cfg = (installation.config ?? {}) as Record<string, unknown>;
      if (![cfg.shop, cfg.shopUrl].every(value => value == null ||
          (typeof value === "string" && normalizeShopifyShopDomain(value) === shop))) return null;
      if (!canActivateMerchantWorkspace({
        accountId, sessionAccountId: liveOwner.id, sessionAligned: true,
        isShopifyOwner: installation.userId === accountId,
        connectedShop: shop, hasInstalledToken: typeof liveOwner.shopifyAccessToken === "string" &&
          liveOwner.shopifyAccessToken.trim().length > 0,
        planEligible: getEffectivePlanForUser(liveOwner) === "pro",
      })) return null;
      // Idempotent for this exact installation. A new installation requires
      // a new, explicit merchant action; old activation is never transferred.
      const written = await tx.execute(sql`
        INSERT INTO ecommerce_shopify_workspace_activations
          (account_id, installation_id, shop)
        VALUES (${accountId}, ${installation.id}, ${shop})
        ON CONFLICT (account_id) DO UPDATE SET
          installation_id = EXCLUDED.installation_id,
          shop = EXCLUDED.shop,
          activated_at = CASE
            WHEN ecommerce_shopify_workspace_activations.installation_id = EXCLUDED.installation_id
             AND ecommerce_shopify_workspace_activations.shop = EXCLUDED.shop
            THEN ecommerce_shopify_workspace_activations.activated_at
            ELSE NOW() END
        RETURNING activated_at
      `);
      if (written.rows.length !== 1) return null;
      return { activated: true };
    });
    if (!result) return res.status(403).json({ error: "Eligible Shopify owner and Pro access required" });
    return res.json({ ...result, cartExecutionEnabled: false, outboundMessagingEnabled: false });
  } catch {
    return res.status(503).json({ error: "E-Commerce activation unavailable" });
  }
});

/** Actual server route authorization; do not trust the sidebar or persisted flag alone. */
export async function requireEcommerceWorkspace(req: Request, res: Response, next: () => void) {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  const accountId = (req.user as { id?: string } | undefined)?.id;
  if (!accountId) { res.status(401).end(); return; }
  try {
    const owner = await storage.getUserForSession(accountId);
    if (!owner || owner.id !== accountId || owner.deletionRequestedAt) {
      res.status(404).end(); return;
    }
    // The first Shopify install redirects to Setup before merchant activation.
    // Only GET/HEAD for the root document at these two fixed onboarding views
    // may pass without activation; all operational views remain gated below.
    if (isEcommerceOnboardingDocumentRequest(req.method, req.path, req.query.view)) {
      next(); return;
    }
    if (isEcommercePilotOwner(owner, process.env)) { next(); return; }
    const state = await currentForAccount(accountId);
    if (state?.activated) { next(); return; }
    res.status(404).end();
  } catch {
    res.status(503).end();
  }
}

export default router;

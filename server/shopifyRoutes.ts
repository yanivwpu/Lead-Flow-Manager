import { pendingEventReviewQuery, markEventReviewedQuery } from "./ecommerce/reviewQueue";
import { suppressPendingRecoveryDeliveryQuery } from "./ecommerce/checkoutRecoveryOutbox";
import { recheckShopifyCheckoutForRecovery } from "./ecommerce/checkoutFreshRecheck";
import { dueCheckoutObservationsQuery } from "./ecommerce/checkoutObservationQueries";
import { prepareCheckoutRecoveryIntentQuery, suppressCheckoutRecoveryIntentQuery, suppressCompletedCheckoutIntentQuery } from "./ecommerce/checkoutRecoveryIntents";
import { checkoutRecoveryPreparationEnabled, parsePrepareRecoveryRequest } from "./ecommerce/checkoutRecoveryPreparationGate";
import { fetchShopifyAbandonedCheckoutPage } from "./ecommerce/abandonedCheckoutSource";
import { upsertCheckoutObservationQuery } from "./ecommerce/checkoutObservationQueries";
import { checkoutObservationPreviewAvailable, parseCheckoutObservationSyncRequest } from "./ecommerce/checkoutObservationSyncGate";
import { readWorkflowDraftSettings, parseWorkflowDraftChange, saveWorkflowDraftQuery } from "./ecommerce/workflowDraftSettings";
import { parseSupportTaskChange, parseSupportTaskComplete, orderSupportTablesReadyQuery, orderSupportTablesReady, saveOrderTaskMerchantOptInQuery, readOrderTaskMerchantSettingsQuery, readOrderSupportTaskListQuery, markOrderSupportTaskCompleteQuery } from "./ecommerce/orderSupportMerchantControls";
import { parseOrderSupportQuickStart, orderSupportQuickStartAvailable } from "./ecommerce/orderSupportQuickStart";
import { parseTaskScheduleChange, taskScheduleReadyQuery, taskScheduleReady, readScheduledOrderSupportTaskListQuery, saveTaskScheduleQuery } from "./ecommerce/orderTaskSchedule";
import { users, integrations } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { parseReviewEventRequest } from "./ecommerce/reviewIntent";
import { db } from "../drizzle/db";
import { sql } from "drizzle-orm";
import { isShopifyContactInstallationActive } from "@shared/shopifyContactPrivacy";
import { createShopifyOrderWebhookHandler } from "./shopifyOrderWebhookHandler";
import { createShopifyCustomerWebhookHandler } from "./shopifyCustomerWebhookHandler";
import { syncShopifyCustomer } from "./shopifyCustomerSync";
import { requireAdmin as requireSalesAdmin } from "./adminAuth";
import { createShopifyCustomerPrivacyHandler } from "./shopifyCustomerPrivacyHandler";
import { handleShopifyCustomerPrivacy, privacyRequestDedupe } from "./shopifyPrivacyRequests";
import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { storage } from './storage';
import {
  isShopifyConfigured,
  generateShopifyInstallUrl,
  validateOAuthStateWithReason,
  exchangeShopifyCode,
  getActiveShopifySubscription,
  syncShopifyBillingToUser,
  shopifySessionMiddleware,
  registerMandatoryWebhooks,
  SHOPIFY_BILLING_PLANS,
  fetchShopifyShopOwnerEmailResult,
} from './shopify';
import { getAppOrigin } from './urlOrigins';
import { sendShopifyOAuthNavigation } from './shopifyOAuthNavigation';
import { resolveShopifyMerchantForBilling } from './shopifyMerchantResolver';
import { rawShopFromRequest, shopDomainFromRequest } from './shopifyBillingGuard';
import {
  getShopifyAppHandle,
  managedPricingPayloadForShop,
  respondSessionManagedPricing,
} from './shopifyManagedPricing';
import { SHOPIFY_MANAGED_PRICING_INSTRUCTIONS } from '@shared/shopifyManagedPricing';
import {
  shopifyMerchantHasUsableAppAccess,
  shopifyMerchantIsFirstTokenInstall,
} from '@shared/shopifyLaunchRouting';
import { normalizeShopifyShopDomain } from '@shared/shopifyBilling';
import {
  isUsersEmailUniqueViolation,
  resolveShopifyInstallUser,
} from './shopifyInstallUser';
import { shopifySyntheticMerchantEmail } from '@shared/shopifyBilling';
import { claimShopifyShopTrialForInstall, hashShopifyShopForLogs } from './shopifyShopTrialService';
import { trySendShopifyWelcomeEmailForUser } from './shopifyOnboardingEmailService';
import { shopifyInstallDestination } from '@shared/shopifyOnboarding';
import { getShopifyOnboardingSnapshot } from './shopifyOnboardingService';
import { createShopifyOnboardingRouter } from './shopifyOnboardingRoutes';
import { logShopifyActivation } from './shopifyActivationTelemetry';
import { establishShopifyLogin } from './shopifyLoginSession';
import {
  processShopifyOrderCreate,
} from './shopifyCommerceWebhooks';
import {
  auditAllShopifyShopsWebhookHealth,
  auditShopWebhookHealth,
  registerShopWebhooks,
} from './shopifyWebhookHealth';

import { withShopifyInstallPrivacyFence, captureCurrentShopifyOwnerEmail, readShopifySupportContact, saveShopifySupportContact, uninstallShopifyStore } from "./shopifyContactService";
import { createShopifySupportContactRouter } from "./shopifySupportContactRoutes";
import { redactShopifyStore } from "./shopifyPrivacyRedaction";
import { createShopifyStoreRedactionHandler } from "./shopifyStoreRedactionHandler";

const router = Router();

// Ensure JSON body is parsed for session-auth billing routes (checkout-web).
router.use(express.json());
router.use(createShopifySupportContactRouter({ read: readShopifySupportContact, save: saveShopifySupportContact }));
router.use(createShopifyOnboardingRouter({
  readMerchant: (id) => storage.getUserForSession(id),
  describe: getShopifyOnboardingSnapshot,
  claim: (user) => claimShopifyShopTrialForInstall({
    canonicalShop: user.shopifyShop!, user, requireInstalledShop: true,
  }),
  emit: logShopifyActivation,
  afterRecovery: async (user) => trySendShopifyWelcomeEmailForUser(user),
}));

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';

/** Prevent SSRF — only Shopify-owned hosts may be probed for App Store listing checks. */
function isSafeShopifyListingUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "apps.shopify.com" || host.endsWith(".shopify.com");
  } catch {
    return false;
  }
}

async function probeListingUrl(urlStr: string): Promise<{ ok: boolean; status: number }> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12_000);
  try {
    let r = await fetch(urlStr, {
      method: "HEAD",
      redirect: "follow",
      signal: ac.signal,
      headers: { "User-Agent": "WhachatCRM-listing-check/1.0" },
    });
    if (r.status === 405) {
      r = await fetch(urlStr, {
        method: "GET",
        redirect: "follow",
        signal: ac.signal,
        headers: {
          "User-Agent": "WhachatCRM-listing-check/1.0",
          Range: "bytes=0-0",
        },
      });
    }
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(tid);
  }
}

function verifyShopifyHmac(query: Record<string, any>): boolean {
  if (!SHOPIFY_API_SECRET) return false;

  const { hmac, ...params } = query;
  if (typeof hmac !== 'string' || !/^[a-f0-9]{64}$/i.test(hmac)) return false;

  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');

  const calculatedHmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(sortedParams)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(calculatedHmac)
  );
}

router.get('/status', (req: Request, res: Response) => {
  res.json({
    configured: isShopifyConfigured(),
    plans: Object.keys(SHOPIFY_BILLING_PLANS),
  });
});

/**
 * Public (no auth): checks whether an App Store listing URL responds as live.
 * Used by Integrations when VITE_SHOPIFY_APP_STORE_URL is set — avoids blind CORS from the browser.
 */
router.get("/listing-check", async (req: Request, res: Response) => {
  try {
    const target = typeof req.query.target === "string" ? req.query.target.trim() : "";
    if (!target || !isSafeShopifyListingUrl(target)) {
      return res.status(400).json({ error: "Invalid or disallowed target URL", available: false });
    }
    const { ok, status } = await probeListingUrl(target);
    const available = ok && status !== 404;
    res.json({ available, status });
  } catch (e) {
    console.error("[Shopify] listing-check error:", e);
    res.json({ available: false, status: 0 });
  }
});

router.get('/install', (req: Request, res: Response) => {
  const rawShop = req.query.shop;
  const shop = typeof rawShop === 'string' ? normalizeShopifyShopDomain(rawShop) : null;

  if (!shop) {
    return res.status(400).json({ error: 'Invalid shop domain' });
  }

  if (!isShopifyConfigured()) {
    return res.status(503).json({ error: 'Shopify integration not configured' });
  }

  // An existing authenticated merchant can reopen without another token exchange.
  const merchant = req.user as { shopifyShop?: string; shopifyAccessToken?: string } | undefined;
  if (merchant?.shopifyAccessToken && normalizeShopifyShopDomain(merchant.shopifyShop) === shop) {
    return sendShopifyOAuthNavigation(res, `/shopify/start?shop=${encodeURIComponent(shop)}`);
  }

  const { url } = generateShopifyInstallUrl(shop);
  if (!url) {
    return res.status(500).json({ error: 'Failed to generate install URL' });
  }
  sendShopifyOAuthNavigation(res, url);
});

router.get('/callback', async (req: Request, res: Response) => {
  console.log("[Shopify Callback] Host:", {
    host: req.get("host"),
    "x-forwarded-host": req.headers["x-forwarded-host"],
    "x-forwarded-proto": req.headers["x-forwarded-proto"],
  });
  const { shop, code, state, timestamp } = req.query;

  if (!shop || !code || !state || typeof shop !== 'string' || typeof code !== 'string' || typeof state !== 'string') {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  if (!verifyShopifyHmac(req.query as Record<string, any>)) {
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }

  const stateCheck = validateOAuthStateWithReason(state, shop);
  if (!stateCheck.ok) {
    console.warn('[Shopify Callback] Invalid OAuth state', {
      shopHash: hashShopifyShopForLogs(shop),
      reason: stateCheck.reason,
      appOrigin: getAppOrigin(),
    });
    return res.status(401).json({ error: 'Invalid or expired OAuth state' });
  }

  if (timestamp) {
    const requestTime = parseInt(timestamp as string, 10) * 1000;
    const now = Date.now();
    if (now - requestTime > 5 * 60 * 1000) {
      return res.status(401).json({ error: 'Request timestamp expired' });
    }
  }

  if (req.get('sec-fetch-dest') === 'iframe' || req.get('sec-fetch-dest') === 'frame') {
    return sendShopifyOAuthNavigation(res, req.originalUrl);
  }

  try {
    const { user, normalizedShop, accessToken, firstTokenInstall, usableAppAccess } = await withShopifyInstallPrivacyFence(shop, async () => {
      const accessToken = await exchangeShopifyCode(shop, code);

      if (!accessToken) {
        throw new Error("Shopify authorization exchange failed");
      }

      logShopifyActivation(shop, "oauth_completed", { source: "oauth" });
      const sessionUserId = (req as any).user?.id as string | undefined;
      const resolved = await resolveShopifyInstallUser({ shop, sessionUserId });
      const normalizedShop = resolved.normalizedShop;
      if (!normalizedShop) {
        throw new Error("Invalid Shopify domain");
      }

      let user = resolved.user;
      if (user) {
        console.log('[Shopify Callback] Reusing existing user', {
          shopHash: hashShopifyShopForLogs(normalizedShop),
          userId: user.id,
          resolution: resolved.resolution,
        });
      }

      if (!user) {
        const tempPassword = crypto.randomBytes(16).toString('hex');
        const hashedPassword = await import('bcryptjs').then(bcrypt => bcrypt.hash(tempPassword, 10));
        const merchantEmail = shopifySyntheticMerchantEmail(normalizedShop);
        if (!merchantEmail) {
          throw new Error("Invalid Shopify domain");
        }

        try {
          user = await storage.createUser({
            name: normalizedShop.replace('.myshopify.com', ''),
            email: merchantEmail,
            password: hashedPassword,
            trialStartedAt: null,
            trialEndsAt: null,
            trialStatus: 'none',
            trialPlan: null,
            emailVerifiedAt: new Date(),
          });
        } catch (createErr) {
          if (!isUsersEmailUniqueViolation(createErr)) {
            throw createErr;
          }
          const existing = await storage.getUserByEmail(merchantEmail);
          if (!existing) {
            throw createErr;
          }
          user = (await storage.getUserForSession(existing.id)) ?? existing;
          console.warn('[Shopify Callback] createUser raced or reinstall — reusing by email', {
            shop: normalizedShop,
            userId: user.id,
          });
        }
      }

      let trialClaim;
      try {
        trialClaim = await claimShopifyShopTrialForInstall({ canonicalShop: normalizedShop, user });
        if (trialClaim.granted) {
          logShopifyActivation(normalizedShop, "trial_activated", { source: "oauth" });
        } else if (!["ledger_exists", "user_ineligible"].includes(trialClaim.reason)) {
          logShopifyActivation(normalizedShop, "trial_failed", {
            source: "oauth", reason: trialClaim.reason === "ledger_not_ready" ? "ledger_not_ready" : "provisioning_failed",
          });
        }
      } catch {
        // Save the OAuth connection/session so recovery does not replay a single-use authorization code.
        logShopifyActivation(normalizedShop, "trial_failed", { source: "oauth", reason: "provisioning_failed" });
      }
      user = (await storage.getUserForSession(user.id)) ?? user;

      const priorShopifyStatus = (user.shopifySubscriptionStatus || '').toLowerCase();
      const shopAlreadyActive = priorShopifyStatus === 'active';
      const firstTokenInstall = shopifyMerchantIsFirstTokenInstall(user);
      const usableAppAccess = shopifyMerchantHasUsableAppAccess({ ...user, shopifyShop: normalizedShop });

      const installPatch: Parameters<typeof storage.updateUser>[1] = {
        shopifyShop: normalizedShop,
        shopifyAccessToken: accessToken,
        shopifyInstalledAt: user.shopifyInstalledAt ?? new Date(),
      };

      // A linked account switching shops must not carry forward the old owner's contact.
      if (user.shopifyShop && user.shopifyShop !== normalizedShop) installPatch.shopifyOwnerEmail = null;
      // Reconnect without resetting the original trial dates or paid entitlements.
      if (["uninstalled", "cancelled", "canceled"].includes(priorShopifyStatus)) {
        installPatch.shopifySubscriptionStatus = "pending";
      }
      if (!shopAlreadyActive && !usableAppAccess) {
        Object.assign(installPatch, {
          shopifySubscriptionStatus: 'pending',
          shopifyChargeId: null,
          billingPlan: 'free',
          subscriptionPlan: 'free',
          subscriptionStatus: 'active',
          shopifyAIBrainEnabled: false,
        });
      }

      await storage.updateUser(user.id, installPatch);
      const existingIntegration = await storage.getIntegrationByUserAndType(user.id, 'shopify');
      if (!existingIntegration) {
        await storage.createIntegration({
          userId: user.id,
          type: 'shopify',
          name: 'Shopify',
          config: { shopUrl: normalizedShop, syncOptions: ['new_orders', 'new_customers'], ...(firstTokenInstall ? { shopifyLastInstalledAt: new Date().toISOString() } : {}) },
          isActive: true,
        });
      } else {
        const existingConfig = (existingIntegration.config && typeof existingIntegration.config === 'object') ? existingIntegration.config as Record<string, any> : {};
        await storage.updateIntegration(existingIntegration.id, {
          config: { ...existingConfig, shopUrl: normalizedShop, ...(firstTokenInstall ? { shopifyLastInstalledAt: new Date().toISOString() } : {}) },
          isActive: true,
        });
      }
      return { user, normalizedShop, accessToken, firstTokenInstall, usableAppAccess };
    });

    const ownerCapture = await captureCurrentShopifyOwnerEmail({
      userId: user.id, shop: normalizedShop, accessToken,
    }, fetchShopifyShopOwnerEmailResult);
    const shopOwnerEmail = ownerCapture.email;

    try {
      const forWelcome = (await storage.getUserForSession(user.id)) ?? user;
      // Do not send trial welcome copy before usable access is confirmed.
      if (usableAppAccess) await trySendShopifyWelcomeEmailForUser({
        id: forWelcome.id,
        name: forWelcome.name,
        email: forWelcome.email,
        shopifyShop: forWelcome.shopifyShop ?? normalizedShop,
        shopifySubscriptionStatus: forWelcome.shopifySubscriptionStatus,
        shopifyOwnerEmail: forWelcome.shopifyOwnerEmail || shopOwnerEmail,
        shopifyWelcomeEmailSentAt: forWelcome.shopifyWelcomeEmailSentAt,
        deletionRequestedAt: forWelcome.deletionRequestedAt,
      });
    } catch (welcomeErr) {
      console.warn("[ShopifyContact] welcome_delivery_failed");
    }

    // Best-effort webhook registration — must not block install
    try {
      await registerMandatoryWebhooks(normalizedShop, accessToken);
    } catch (webhookErr) {
      console.error('[Shopify Webhook Register Failed]', { shop: normalizedShop, error: webhookErr });
    }

    // Persist login before redirecting; a successful OAuth exchange is not a rendered app session.
    await establishShopifyLogin(req, user);
    let destination = "/shopify/start";
    try {
      const current = await storage.getUserForSession(user.id);
      if (current) destination = shopifyInstallDestination((await getShopifyOnboardingSnapshot(current)).state, firstTokenInstall);
    } catch {
      // The start screen can retry a status read; never advertise an unverified trial.
    }
    // Keep only a validated recovery hint; a shop parameter never grants a session.
    if (destination === '/shopify/start') destination += `?shop=${encodeURIComponent(normalizedShop)}`;
    return res.redirect(destination);
  } catch (error) {
    console.error("[ShopifyContact] oauth_callback_failed");
    return res.redirect(`/shopify/start?installation_error=1&shop=${encodeURIComponent(shop)}`);
  }
});

router.get('/billing/callback', async (req: Request, res: Response) => {
  console.log("[Shopify Billing Callback] Host:", {
    host: req.get("host"),
    "x-forwarded-host": req.headers["x-forwarded-host"],
    "x-forwarded-proto": req.headers["x-forwarded-proto"],
  });
  const { shop, charge_id } = req.query;

  if (!shop || typeof shop !== 'string') {
    return res.status(400).json({ error: 'Missing shop parameter' });
  }

  try {
    const user = await storage.getUserByShopifyShop(shop);

    if (!user || !user.shopifyAccessToken) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const planHandle =
      typeof req.query.plan_handle === 'string' ? req.query.plan_handle.trim() : undefined;

    const synced = await syncShopifyBillingToUser(
      user.id,
      shop,
      user.shopifyAccessToken,
      planHandle,
    );

    if (synced.ok) {
      const planParam =
        synced.aiBrainAddon && synced.billingPlan !== 'free'
          ? 'ai-brain'
          : synced.billingPlan;
      return res.redirect(`/app/inbox?shopify_billing=success&plan=${encodeURIComponent(planParam)}`);
    }

    await storage.updateUser(user.id, {
      shopifySubscriptionStatus: 'cancelled',
    });

    res.redirect(`/app/inbox?shopify_billing=declined`);
  } catch (error) {
    console.error('Shopify billing callback error:', error);
    res.status(500).json({ error: 'Billing verification failed' });
  }
});

router.post('/billing/change-plan', shopifySessionMiddleware(), async (req: Request, res: Response) => {
  const { shop } = (req as any).shopifySession;

  try {
    const user = await storage.getUserByShopifyShop(shop);

    if (!user || !user.shopifyAccessToken) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const payload = managedPricingPayloadForShop(shop);
    if (!payload.planSelectionUrl) {
      return res.status(200).json({
        ...payload,
        error: payload.instructions,
      });
    }

    return res.json(payload);
  } catch (error) {
    console.error('Plan change error:', error);
    res.status(500).json({ error: 'Could not open Shopify plan selection' });
  }
});

router.get('/subscription', shopifySessionMiddleware(), async (req: Request, res: Response) => {
  const { shop } = (req as any).shopifySession;

  try {
    const user = await storage.getUserByShopifyShop(shop);

    if (!user || !user.shopifyAccessToken) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const subscription = await getActiveShopifySubscription(shop, user.shopifyAccessToken);

    res.json({
      hasActiveSubscription: subscription?.status === 'ACTIVE',
      subscription: subscription || null,
      plan: user.subscriptionPlan,
    });
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ error: 'Failed to check subscription' });
  }
});

function verifyWebhookHmac(rawBody: Buffer | string, hmac: string): boolean {
  if (!SHOPIFY_API_SECRET || !hmac) return false;

  const calculatedHmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac),
      Buffer.from(calculatedHmac)
    );
  } catch {
    return false;
  }
}

async function resolveSessionShopifyMerchant(userId: string) {
  const user = await storage.getUserForSession(userId);
  if (!user?.shopifyShop || !user.shopifyAccessToken) {
    return null;
  }
  return { shop: user.shopifyShop, accessToken: user.shopifyAccessToken };
}

router.get('/connection-status', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const userId = (req.user as { id: string }).id;
    const user = await storage.getUserForSession(userId);
    const shop = typeof user?.shopifyShop === 'string' ? user.shopifyShop.trim() : '';
    const hasToken = typeof user?.shopifyAccessToken === 'string' && user.shopifyAccessToken.trim().length > 0;
    const connected = !!(shop && hasToken);

    const integration = await storage.getIntegrationByUserAndType(userId, 'shopify');
    const shopFromIntegration =
      integration?.config && typeof integration.config === 'object'
        ? String((integration.config as Record<string, unknown>).shopUrl ?? '').trim()
        : '';

    res.json({
      connected,
      shop: connected ? shop : shop || shopFromIntegration || null,
      syncEnabled: connected && !!integration?.isActive,
      integrationId: integration?.id ?? null,
      uninstalled: !connected && !!(shop || shopFromIntegration),
    });
  } catch (error) {
    console.error('[Shopify Connection Status]', error);
    res.status(500).json({ error: 'Failed to load Shopify connection status' });
  }
});

/** Staging-only, authenticated, tenant-scoped E-commerce event inbox preview.
 * Does not expose webhook IDs or customer data and cannot send or activate workflows.
 */
router.get('/ecommerce/event-inbox-preview', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
      process.env.APP_URL?.replace(/[/]$/, '') !== 'https://whachatcrm-staging-app-staging.up.railway.app')
    return res.status(404).json({ error: 'Not available' });
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
    const stats = result.rows[0] as { total?: number; pending?: number; order_support?: number; fulfillment_support?: number; order_cancelled?: number; last_event_at?: Date | string | null } | undefined;
    return res.json({ ok: true,
      mode: process.env.ECOMMERCE_EVENT_RECORDING_ENABLED === 'true' ? 'recording' : 'paused',
      total: Number(stats?.total ?? 0), pending: Number(stats?.pending ?? 0),
      journeys: { orderSupport: Number(stats?.order_support ?? 0), fulfillmentSupport: Number(stats?.fulfillment_support ?? 0), orderCancelled: Number(stats?.order_cancelled ?? 0) },
      lastEventAt: stats?.last_event_at ? new Date(stats.last_event_at).toISOString() : null,
      reviewQueue,
      workflowDrafts: readWorkflowDraftSettings(cfg),
      internalTasks,
      messagingEnabled: false, checkoutEnabled: false });
  } catch {
    return res.status(503).json({ error: 'E-commerce inbox preview unavailable' });
  }
});

router.get('/webhooks/health', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const merchant = await resolveSessionShopifyMerchant((req.user as { id: string }).id);
    if (!merchant) {
      return res.status(400).json({
        error: 'No Shopify shop linked to this account.',
        configured: isShopifyConfigured(),
      });
    }

    const report = await auditShopWebhookHealth(merchant.shop, merchant.accessToken);
    res.json({ ok: true, report });
  } catch (error) {
    console.error('[Shopify Webhook Health]', error);
    res.status(500).json({ error: 'Failed to audit Shopify webhooks' });
  }
});


/** Staging-only merchant action: atomically acknowledge a single owned event.
 * This action has no message send, automation dispatch, Shopify API or checkout.
 */
router.post('/ecommerce/event-review', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  const origin = 'https://whachatcrm-staging-app-staging.up.railway.app';
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
      process.env.APP_URL?.replace(/[/]$/, '') !== origin)
    return res.status(404).json({ error: 'Not available' });
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  // Require a same-origin JSON request; no cross-site form or opaque-origin writes.
  if (req.get('origin') !== origin || req.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return res.status(403).json({ error: 'Invalid request origin or content type' });
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

/** Merchant-owned staging workflow DRAFTS only. An explicit flag does not activate a
 * workflow, enqueue tasks, authorize a channel, or permit outbound messages.
 */
router.post('/ecommerce/workflow-draft', async (req: Request, res: Response) => {
  res.set('Cache-Control','no-store');
  const origin = 'https://whachatcrm-staging-app-staging.up.railway.app';
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
      process.env.APP_URL?.replace(/[/]$/, '') !== origin)
    return res.status(404).json({ error: 'Not available' });
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.get('origin') !== origin ||
      req.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return res.status(403).json({ error: 'Invalid request origin or content type' });
  const change = parseWorkflowDraftChange(req.body);
  if (!change) return res.status(400).json({ error: 'Invalid draft request' });
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
      const updated = await tx.execute(saveWorkflowDraftQuery({
        integrationId: installation.id, accountId, shop, ...change
      }));
      return updated.rows.length === 1 ? updated.rows[0].drafts : null;
    });
    if (!saved) return res.status(409).json({ error: 'Shopify installation changed; refresh' });
    return res.json({ ok: true, workflowDrafts: readWorkflowDraftSettings({
      ecommerceGrowthEngineDrafts: saved
    }), workflowActive: false, messagingEnabled: false });
  } catch {
    return res.status(503).json({ error: 'Workflow draft unavailable' });
  }
});

/** Single explicit action to prepare and start merchant-only order-support tasks.
 * Creates no outbound messaging workflow; never mutates Shopify orders.
 * Staging-only until distinct production safety/release acceptance.
 */
router.post('/ecommerce/order-support-quick-start', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  const origin = 'https://whachatcrm-staging-app-staging.up.railway.app';
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
      process.env.APP_URL?.replace(/[/]$/, '') !== origin)
    return res.status(404).json({ error: 'Not available' });
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.get('origin') !== origin ||
      req.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return res.status(403).json({ error: 'Invalid origin or content type' });
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
router.post('/ecommerce/order-support-settings', async (req: Request, res: Response) => {
  res.set('Cache-Control','no-store');
  const origin = 'https://whachatcrm-staging-app-staging.up.railway.app';
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
      process.env.APP_URL?.replace(/[/]$/, '') !== origin)
    return res.status(404).json({error:'Not available'});
  if (!req.user) return res.status(401).json({error:'Unauthorized'});
  if (req.get('origin') !== origin ||
      req.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return res.status(403).json({error:'Invalid origin or content type'});
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
    return res.json({ok:true,merchantEnabled:saved,operatorEnabled:false,
      messagingEnabled:false,checkoutEnabled:false});
  } catch {
    return res.status(503).json({error:'Order-support task settings unavailable'});
  }
});

/** Manual completion operates only on an already-created, owned internal task.
 * Does not acknowledge the separate original Shopify event or send messages.
 */
router.post('/ecommerce/order-support-task-complete', async (req: Request, res: Response) => {
  res.set('Cache-Control','no-store');
  const origin = 'https://whachatcrm-staging-app-staging.up.railway.app';
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
      process.env.APP_URL?.replace(/[/]$/, '') !== origin)
    return res.status(404).json({error:'Not available'});
  if (!req.user) return res.status(401).json({error:'Unauthorized'});
  if (req.get('origin') !== origin ||
      req.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return res.status(403).json({error:'Invalid origin or content type'});
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

/** Owner-only, staging-only schedule editing. No customer send or contact follow-up writes.
 * The SQL atomically validates task ownership AND live active team membership.
 */
router.post('/ecommerce/order-support-task-schedule', async (req: Request, res: Response) => {
  res.set('Cache-Control','no-store');
  const origin='https://whachatcrm-staging-app-staging.up.railway.app';
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
      process.env.APP_URL?.replace(/[/]$/, '') !== origin)
    return res.status(404).json({error:'Not available'});
  if (!req.user) return res.status(401).json({error:'Unauthorized'});
  if (req.get('origin') !== origin ||
      req.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return res.status(403).json({error:'Invalid origin or content type'});
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
      return res.status(409).json({error:'Staging task schedule schema unavailable'});
    const changed=await db.execute(saveTaskScheduleQuery(change,accountId,shop));
    if (changed.rows.length !== 1)
      return res.status(409).json({error:'Task not open, not owned, or assignee not active'});
    return res.json({ok:true,messagingEnabled:false,checkoutEnabled:false});
  } catch {
    return res.status(503).json({error:'Task schedule unavailable'});
  }
});

/** Staging-only manual Shopify abandoned-checkout observation import.
 * A Shopify Admin authenticated read is the trusted source, not arbitrary browser data.
 * No recovery URL or customer PII is persisted, and no messages are queued or sent.
 */
router.post('/ecommerce/checkout-observation-preview-sync', async (req: Request, res: Response) => {
  res.set('Cache-Control','no-store');
  const origin='https://whachatcrm-staging-app-staging.up.railway.app';
  if (!checkoutObservationPreviewAvailable({
    RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME,
    APP_URL: process.env.APP_URL,
    ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED: process.env.ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED,
  }))
    return res.status(404).json({error:'Not available'});
  if (!req.user) return res.status(401).json({error:'Unauthorized'});
  if (req.get('origin') !== origin ||
      req.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return res.status(403).json({error:'Invalid origin or content type'});
  const input=parseCheckoutObservationSyncRequest(req.body);
  if(!input) return res.status(400).json({error:'Invalid checkout preview request'});
  try {
    const accountId=(req.user as {id:string}).id;
    const owner=await storage.getUserForSession(accountId);
    const shop=normalizeShopifyShopDomain(owner?.shopifyShop);
    if(!owner || !shop || !isShopifyContactInstallationActive(owner) || !owner.shopifyAccessToken)
      return res.status(403).json({error:'Active Shopify connection required'});
    const ready=await db.execute(sql`SELECT to_regclass('public.ecommerce_abandoned_checkout_observations') IS NOT NULL AS ready`);
    if(ready.rows[0]?.ready !== true)
      return res.status(409).json({error:'Staging checkout observation schema unavailable'});
    // Shopify verifies read_orders and manage_abandoned_checkouts permissions here.
    // This bounded call is read-only and never follows the customer's recovery URL.
    const page=await fetchShopifyAbandonedCheckoutPage({
      shop,accessToken:owner.shopifyAccessToken,after:input.after,
    });
    const recorded=await db.transaction(async tx=>{
      // Serialize against uninstall/redaction and recheck live tenant ownership.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))`);
      const [liveOwner]=await tx.select().from(users).where(and(
        eq(users.id,accountId),eq(users.shopifyShop,shop))).limit(1);
      if(!liveOwner || !isShopifyContactInstallationActive(liveOwner) ||
          liveOwner.shopifyAccessToken !== owner.shopifyAccessToken) return null;
      const installs=await tx.select().from(integrations).where(and(
        eq(integrations.userId,accountId),eq(integrations.type,'shopify'),
        eq(integrations.isActive,true))).limit(2);
      if(installs.length !== 1) return null;
      const cfg=(installs[0].config ?? {}) as Record<string,unknown>;
      for(const key of ['shop','shopUrl']) if(cfg[key] != null &&
        (typeof cfg[key] !== 'string' || normalizeShopifyShopDomain(cfg[key]) !== shop))
        return null;
      const stages=await tx.execute(sql`
        SELECT to_regclass('public.ecommerce_checkout_recovery_intents') IS NOT NULL AS intents,
               to_regclass('public.ecommerce_checkout_recovery_outbox') IS NOT NULL AS outbox`);
      const hasIntents=stages.rows[0]?.intents===true;
      const hasOutbox=stages.rows[0]?.outbox===true;
      for(const snapshot of page.observations) {
        await tx.execute(upsertCheckoutObservationQuery({accountId,shop,snapshot}));
        if(snapshot.completed) {
          if(hasIntents) await tx.execute(suppressCompletedCheckoutIntentQuery({
            accountId,shop,checkoutId:snapshot.checkoutId
          }));
          if(hasOutbox) await tx.execute(suppressPendingRecoveryDeliveryQuery({
            accountId,shop,checkoutId:snapshot.checkoutId
          }));
        }
      }
      return page.observations.length;
    });
    if(recorded === null)
      return res.status(409).json({error:'Shopify installation changed; refresh'});
    return res.json({ok:true,recordedCount:recorded,
      completedCount:page.observations.filter(x=>x.completed).length,
      hasNextPage:page.hasNextPage,nextCursor:page.nextCursor,
      messagingEnabled:false,recoveryEnabled:false});
  } catch {
    return res.status(503).json({error:'Shopify checkout observation sync unavailable'});
  }
});

/** Manually prepare up to five tenant-owned checkout recovery review records.
 * The Shopify API is re-read for each specific checkout immediately before the
 * intent is persisted. NO background polling, customer messages or URLs persisted.
 */
router.post('/ecommerce/checkout-recovery-prepare', async (req:Request,res:Response)=>{
  res.set('Cache-Control','no-store');
  const origin='https://whachatcrm-staging-app-staging.up.railway.app';
  if(!checkoutRecoveryPreparationEnabled({
      RAILWAY_ENVIRONMENT_NAME:process.env.RAILWAY_ENVIRONMENT_NAME,
      APP_URL:process.env.APP_URL,
      ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:process.env.ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED,
      ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:process.env.ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED,
  })) return res.status(404).json({error:'Not available'});
  if(!req.user) return res.status(401).json({error:'Unauthorized'});
  if(req.get('origin') !== origin ||
     req.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return res.status(403).json({error:'Invalid request origin'});
  if(!parsePrepareRecoveryRequest(req.body))
    return res.status(400).json({error:'Invalid preparation request'});
  try{
    const accountId=(req.user as {id:string}).id;
    const owner=await storage.getUserForSession(accountId);
    const shop=normalizeShopifyShopDomain(owner?.shopifyShop);
    if(!owner || !shop || !isShopifyContactInstallationActive(owner) || !owner.shopifyAccessToken)
      return res.status(403).json({error:'Active Shopify installation required'});
    const readiness=await db.execute(sql`
      SELECT to_regclass('public.ecommerce_checkout_recovery_intents') IS NOT NULL AS intents,
        to_regclass('public.ecommerce_abandoned_checkout_observations') IS NOT NULL AS observations`);
    if(readiness.rows[0]?.intents !== true || readiness.rows[0]?.observations !== true)
      return res.status(409).json({error:'Recovery preview schema unavailable'});
    const due=await db.execute(dueCheckoutObservationsQuery(accountId,shop));
    let checked=0, prepared=0, suppressed=0;
    for(const row of due.rows.slice(0,5)){
      const checkoutId=String(row.checkout_gid);
      const fresh=await recheckShopifyCheckoutForRecovery({
        shop,accessToken:owner.shopifyAccessToken,checkoutId
      });
      checked++;
      if(fresh.status==='blocked' && !fresh.completed) continue;
      const result=await db.transaction(async tx=>{
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))`);
        const [liveOwner]=await tx.select().from(users).where(and(
          eq(users.id,accountId),eq(users.shopifyShop,shop))).limit(1);
        if(!liveOwner || !isShopifyContactInstallationActive(liveOwner) ||
          liveOwner.shopifyAccessToken !== owner.shopifyAccessToken) return null;
        const matches=await tx.select().from(integrations).where(and(
          eq(integrations.userId,accountId),eq(integrations.type,'shopify'),
          eq(integrations.isActive,true))).limit(2);
        if(matches.length !== 1) return null;
        const cfg=(matches[0].config ?? {}) as Record<string,unknown>;
        for(const key of ['shop','shopUrl']) if(cfg[key]!=null &&
          (typeof cfg[key]!=='string'||normalizeShopifyShopDomain(cfg[key])!==shop))
          return null;
        if(fresh.status==='blocked'){
          await tx.execute(suppressCheckoutRecoveryIntentQuery({accountId,shop,checkoutId}));
          return 'suppressed';
        }
        const rows=await tx.execute(prepareCheckoutRecoveryIntentQuery({
          accountId,shop,checkoutId,verifiedLastActivityAt:fresh.lastActivityAt
        }));
        return rows.rows.length===1 ? 'prepared' : 'skipped';
      });
      if(result===null) return res.status(409).json({error:'Shopify installation changed'});
      if(result==='prepared') prepared++;
      if(result==='suppressed') suppressed++;
    }
    return res.json({ok:true,checked,prepared,suppressed,
      messagingEnabled:false,sendQueueEnabled:false,recoveryActive:false});
  }catch{
    return res.status(503).json({error:'Checkout recovery review unavailable'});
  }
});

router.get('/webhooks/health/all', requireSalesAdmin, async (_req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');

  try {
    const shops = await auditAllShopifyShopsWebhookHealth();
    res.json({
      ok: true,
      shopCount: shops.length,
      unhealthyCount: shops.filter((s) => !s.healthy).length,
      shops,
    });
  } catch (error) {
    console.error('[Shopify Webhook Health/all]', error);
    res.status(500).json({ error: 'Failed to audit Shopify shops' });
  }
});

router.post('/webhooks/reregister', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const merchant = await resolveSessionShopifyMerchant((req.user as { id: string }).id);
    if (!merchant) {
      return res.status(400).json({ error: 'No Shopify shop linked to this account.' });
    }

    const attempts = await registerShopWebhooks(merchant.shop, merchant.accessToken);
    const report = await auditShopWebhookHealth(merchant.shop, merchant.accessToken, attempts);

    res.json({
      ok: true,
      attempts,
      report,
    });
  } catch (error) {
    console.error('[Shopify Webhook Reregister]', error);
    res.status(500).json({ error: 'Failed to re-register Shopify webhooks' });
  }
});

router.post('/webhooks/app-uninstalled', async (req: Request, res: Response) => {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;
  const shop = req.headers['x-shopify-shop-domain'] as string;

  if (!hmac || !shop) {
    return res.status(401).json({ error: 'Missing webhook headers' });
  }

  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  try {
    await uninstallShopifyStore(shop);
    console.info("[ShopifyPrivacy] uninstall_processed");
    return res.status(200).json({ received: true });
  } catch {
    // A failed atomic cleanup must be retried by Shopify, not acknowledged as complete.
    console.error("[ShopifyPrivacy] uninstall_processing_failed");
    return res.status(503).json({ error: "Webhook processing failed" });
  }
});

router.post('/webhooks/subscription-update', async (req: Request, res: Response) => {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;
  const shop = req.headers['x-shopify-shop-domain'] as string;

  if (!hmac || !shop) {
    return res.status(401).json({ error: 'Missing webhook headers' });
  }

  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  try {
    const subscription = req.body;
    const user = await storage.getUserByShopifyShop(shop);

    if (user && user.shopifyAccessToken) {
      const rawStatus = String(subscription?.status || '').toUpperCase();
      if (rawStatus === 'ACTIVE') {
        await syncShopifyBillingToUser(user.id, shop, user.shopifyAccessToken);
      } else if (rawStatus === 'PENDING' || rawStatus === 'FROZEN') {
        await storage.updateUser(user.id, {
          shopifySubscriptionStatus: 'pending',
        });
      } else {
        await storage.updateUser(user.id, {
          shopifySubscriptionStatus: 'cancelled',
          subscriptionStatus: 'canceled',
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Subscription webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============= MANDATORY COMPLIANCE WEBHOOKS =============
// These are required by Shopify for app approval

// Access requests are durable support work; they never invoke the erasure worker.
router.post('/webhooks/customers/data_request', createShopifyCustomerPrivacyHandler("access_request", {
  verify: verifyWebhookHmac, dedupe: privacyRequestDedupe, process: handleShopifyCustomerPrivacy,
}));
router.post('/webhooks/customers/redact', createShopifyCustomerPrivacyHandler("customer_erasure", {
  verify: verifyWebhookHmac, dedupe: privacyRequestDedupe, process: handleShopifyCustomerPrivacy,
}));

// shop/redact - Shop data deletion (48 hours after uninstall)
router.post('/webhooks/shop/redact', createShopifyStoreRedactionHandler({
  verify: verifyWebhookHmac,
  redact: redactShopifyStore, dedupe: privacyRequestDedupe,
}));
router.post('/webhooks/orders-create', createShopifyOrderWebhookHandler("orders/create", {
  verify: verifyWebhookHmac,
  process: async ({ shop, eventId, body }) => {
    await processShopifyOrderCreate({ headers: { "x-shopify-event-id": eventId } },
      shop, body as Parameters<typeof processShopifyOrderCreate>[2]);
  },
}));

router.post('/webhooks/customers-create', createShopifyCustomerWebhookHandler("customers/create", {
  verify: verifyWebhookHmac, process: syncShopifyCustomer,
}));
router.post('/webhooks/customers-update', createShopifyCustomerWebhookHandler("customers/update", {
  verify: verifyWebhookHmac, process: syncShopifyCustomer,
}));

/** After Managed Pricing approval redirect (?plan_handle=) — sync Shopify → DB (session auth). */
router.get('/billing/sync-return', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = (req.user as { id: string }).id;
  const planHandle =
    typeof req.query.plan_handle === 'string' ? req.query.plan_handle.trim() : undefined;

  try {
    const user = await storage.getUserForSession(userId);
    if (!user?.shopifyShop || !user.shopifyAccessToken) {
      return res.status(400).json({ error: 'Shopify shop not linked' });
    }

    const synced = await syncShopifyBillingToUser(
      user.id,
      user.shopifyShop,
      user.shopifyAccessToken,
      planHandle,
    );

    res.json({
      ok: synced.ok,
      billingPlan: synced.billingPlan,
      shopifySubscriptionStatus: synced.shopifySubscriptionStatus,
      redirectTo: `/app/inbox?shopify_billing=success&plan=${encodeURIComponent(synced.billingPlan)}`,
    });
  } catch (error) {
    console.error('[ShopifyBilling] sync-return error:', error);
    res.status(500).json({ error: 'Failed to sync Shopify subscription' });
  }
});

/** Shopify App Pricing — plan selection URL for session-authenticated web app users. */
router.get('/billing/managed-pricing-url', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const { bodyShop, queryShop } = rawShopFromRequest(req);
  console.log('[ShopifyBilling] managed-pricing-url', {
    bodyShop,
    queryShop,
    resolvedShop: shopDomainFromRequest(req),
    appHandle: getShopifyAppHandle(),
  });

  try {
    await respondSessionManagedPricing(req, res, (req.user as any).id, 'managed-pricing-url');
  } catch (error: any) {
    console.error('[ShopifyBilling] managed-pricing-url error:', error);
    res.status(500).json({
      error: SHOPIFY_MANAGED_PRICING_INSTRUCTIONS,
      instructions: SHOPIFY_MANAGED_PRICING_INSTRUCTIONS,
    });
  }
});

/**
 * Legacy route — returns Managed Pricing URL only (appSubscriptionCreate disabled).
 * @deprecated Prefer GET /billing/managed-pricing-url
 */
router.post('/billing/checkout-web', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const { plan } = (req.body || {}) as { plan?: string };
  console.log('[ShopifyBilling] checkout-web (managed pricing redirect)', {
    plan: plan ?? null,
    bodyShop: rawShopFromRequest(req).bodyShop,
    queryShop: rawShopFromRequest(req).queryShop,
    resolvedShop: shopDomainFromRequest(req),
    appHandle: getShopifyAppHandle(),
  });

  try {
    await respondSessionManagedPricing(req, res, (req.user as any).id, 'checkout-web');
  } catch (error: any) {
    console.error('[ShopifyBilling] checkout-web error:', error);
    res.status(500).json({
      error: SHOPIFY_MANAGED_PRICING_INSTRUCTIONS,
      instructions: SHOPIFY_MANAGED_PRICING_INSTRUCTIONS,
    });
  }
});

export default router;

import { verifyWebhookHmac } from "./shopifyWebhookSignature";
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

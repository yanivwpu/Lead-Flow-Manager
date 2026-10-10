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
import { claimShopifyShopTrialForInstall, deleteShopifyShopTrialLedgerForCanonicalShop, hashShopifyShopForLogs } from './shopifyShopTrialService';
import { trySendShopifyWelcomeEmailForUser } from './shopifyOnboardingEmailService';
import { PRO_AI_TRIAL_DAYS } from '@shared/trialPolicy';
import {
  processShopifyCustomerCreate,
  processShopifyOrderCreate,
  scheduleShopifyCommerceProcessing,
} from './shopifyCommerceWebhooks';
import {
  auditAllShopifyShopsWebhookHealth,
  auditShopWebhookHealth,
  registerShopWebhooks,
} from './shopifyWebhookHealth';

import { captureShopifyOwnerEmail } from "./shopifyContactCapture";
import { persistShopifyOwnerEmailCapture, readShopifySupportContact, saveShopifySupportContact, uninstallShopifyStore } from "./shopifyContactService";
import { createShopifySupportContactRouter } from "./shopifySupportContactRoutes";
import { redactShopifyStore } from "./shopifyPrivacyRedaction";

const router = Router();

// Ensure JSON body is parsed for session-auth billing routes (checkout-web).
router.use(express.json());
router.use(createShopifySupportContactRouter({ read: readShopifySupportContact, save: saveShopifySupportContact }));

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
  if (!hmac) return false;

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

  const { url } = generateShopifyInstallUrl(shop);
  if (!url) {
    return res.status(500).json({ error: 'Failed to generate install URL' });
  }
  res.redirect(url);
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
      shop,
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

  try {
    const accessToken = await exchangeShopifyCode(shop, code);
    
    if (!accessToken) {
      return res.status(500).json({ error: 'Failed to exchange authorization code' });
    }

    const sessionUserId = (req as any).user?.id as string | undefined;
    const resolved = await resolveShopifyInstallUser({ shop, sessionUserId });
    const normalizedShop = resolved.normalizedShop;
    if (!normalizedShop) {
      return res.status(400).json({ error: 'Invalid shop domain' });
    }

    let user = resolved.user;
    if (user) {
      console.log('[Shopify Callback] Reusing existing user', {
        shop: normalizedShop,
        userId: user.id,
        resolution: resolved.resolution,
      });
    }

    if (!user) {
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await import('bcryptjs').then(bcrypt => bcrypt.hash(tempPassword, 10));
      const merchantEmail = shopifySyntheticMerchantEmail(normalizedShop);
      if (!merchantEmail) {
        return res.status(400).json({ error: 'Invalid shop domain' });
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

    const trialClaim = await claimShopifyShopTrialForInstall({
      canonicalShop: normalizedShop,
      user,
    });
    console.log("[Shopify Callback] Shop trial ledger", {
      shopHash: hashShopifyShopForLogs(normalizedShop),
      userId: user.id,
      claimed: trialClaim.claimed,
      granted: trialClaim.granted,
      status: trialClaim.status,
      reason: trialClaim.reason,
    });
    user = (await storage.getUserForSession(user.id)) ?? user;

    const priorShopifyStatus = (user.shopifySubscriptionStatus || '').toLowerCase();
    const shopAlreadyActive = priorShopifyStatus === 'active';
    const firstTokenInstall = shopifyMerchantIsFirstTokenInstall(user);
    const usableAppAccess = shopifyMerchantHasUsableAppAccess(user);

    const installPatch: Parameters<typeof storage.updateUser>[1] = {
      shopifyShop: normalizedShop,
      shopifyAccessToken: accessToken,
      shopifyInstalledAt: user.shopifyInstalledAt ?? new Date(),
    };

    // A linked account switching shops must not carry forward the old owner's contact.
    if (user.shopifyShop && user.shopifyShop !== normalizedShop) installPatch.shopifyOwnerEmail = null;
    if (!shopAlreadyActive && (firstTokenInstall || !usableAppAccess)) {
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
    const ownerCapture = await captureShopifyOwnerEmail({
      userId: user.id, shop: normalizedShop, accessToken,
    }, { fetch: fetchShopifyShopOwnerEmailResult, persist: persistShopifyOwnerEmailCapture });
    const shopOwnerEmail = ownerCapture.email;

    try {
      const forWelcome = (await storage.getUserForSession(user.id)) ?? user;
      await trySendShopifyWelcomeEmailForUser({
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

    const existingIntegration = await storage.getIntegrationByUserAndType(user.id, 'shopify');
    if (!existingIntegration) {
      await storage.createIntegration({
        userId: user.id,
        type: 'shopify',
        name: 'Shopify',
        config: { shopUrl: normalizedShop, syncOptions: ['new_orders', 'new_customers'] },
        isActive: true,
      });
    } else {
      const existingConfig = (existingIntegration.config && typeof existingIntegration.config === 'object') ? existingIntegration.config as Record<string, any> : {};
      await storage.updateIntegration(existingIntegration.id, {
        config: { ...existingConfig, shopUrl: normalizedShop },
        isActive: true,
      });
    }

    // Best-effort webhook registration — must not block install
    try {
      await registerMandatoryWebhooks(normalizedShop, accessToken);
    } catch (webhookErr) {
      console.error('[Shopify Webhook Register Failed]', { shop: normalizedShop, error: webhookErr });
    }

    // Log the merchant into the web app so they can choose Starter vs Pro on Pricing (Shopify Billing API).
    await new Promise<void>((resolve, reject) => {
      (req as any).login(user, (err: unknown) => (err ? reject(err) : resolve()));
    });

    if (shopAlreadyActive || (usableAppAccess && !firstTokenInstall)) {
      return res.redirect('/app/inbox');
    }

    const trialDays = PRO_AI_TRIAL_DAYS;
    res.redirect(
      `/pricing?shopify_installed=1&shop=${encodeURIComponent(normalizedShop)}&trial_days=${String(trialDays)}`,
    );
  } catch (error) {
    console.error("[ShopifyContact] oauth_callback_failed");
    if (isUsersEmailUniqueViolation(error)) {
      return res.status(409).json({
        error: 'Shopify merchant account already exists. Please open the app from Shopify admin to continue.',
      });
    }
    res.status(500).json({ error: 'Installation failed' });
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

function requireAdminSession(req: Request, res: Response): boolean {
  if ((req.session as { isAdmin?: boolean })?.isAdmin === true) return true;
  res.status(403).json({ error: "Forbidden" });
  return false;
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

router.get('/webhooks/health/all', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!requireAdminSession(req, res)) return;

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
    const report = await auditShopWebhookHealth(merchant.shop, merchant.accessToken);

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

// customers/data_request - Customer requests their data (GDPR/CCPA)
router.post('/webhooks/customers/data_request', async (req: Request, res: Response) => {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;
  const shop = req.headers['x-shopify-shop-domain'] as string;

  if (!hmac || !shop) {
    console.log('[Shopify Compliance] customers/data_request - Missing headers');
    return res.status(401).json({ error: 'Missing webhook headers' });
  }

  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  if (!verifyWebhookHmac(rawBody, hmac)) {
    console.log('[Shopify Compliance] customers/data_request - Invalid HMAC');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  try {
    const { shop_domain, customer, orders_requested } = req.body;
    console.info("[ShopifyPrivacy] signed_customer_data_request_received");
    
    // WhachatCRM stores conversation data linked to phone numbers, not Shopify customer IDs
    // We acknowledge the request - actual data export would be handled via support ticket
    // since we need to match by phone number which requires manual verification
    
    res.status(200).json({ 
      received: true,
      message: 'Data request acknowledged. Customer data export will be processed within 30 days.'
    });
  } catch (error) {
    console.error("[ShopifyPrivacy] compliance_processing_failed");
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// customers/redact - Customer requests data deletion (GDPR right to erasure)
router.post('/webhooks/customers/redact', async (req: Request, res: Response) => {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;
  const shop = req.headers['x-shopify-shop-domain'] as string;

  if (!hmac || !shop) {
    console.log('[Shopify Compliance] customers/redact - Missing headers');
    return res.status(401).json({ error: 'Missing webhook headers' });
  }

  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  if (!verifyWebhookHmac(rawBody, hmac)) {
    console.log('[Shopify Compliance] customers/redact - Invalid HMAC');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  try {
    const { shop_domain, customer, orders_to_redact } = req.body;
    console.info("[ShopifyPrivacy] signed_customer_redaction_received");
    
    // WhachatCRM stores conversation data linked to phone numbers
    // If we had a phone number, we would delete associated chats
    // For now, we acknowledge and log for manual processing if needed
    
    if (customer?.phone) {
      // Attempt to find and delete chats by phone number
      const user = await storage.getUserByShopifyShop(shop);
      if (user) {
        const chats = await storage.getChats(user.id);
        const matchingChats = chats.filter((chat: any) => 
          chat.whatsappPhone === customer.phone || 
          chat.whatsappPhone === customer.phone.replace(/\D/g, '')
        );
        
        for (const chat of matchingChats) {
          await storage.deleteChat(chat.id);
          console.info("[ShopifyPrivacy] customer_chat_erased");
        }
      }
    }
    
    res.status(200).json({ 
      received: true,
      message: 'Customer data redaction request processed.'
    });
  } catch (error) {
    console.error("[ShopifyPrivacy] compliance_processing_failed");
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// shop/redact - Shop data deletion (48 hours after uninstall)
router.post('/webhooks/shop/redact', async (req: Request, res: Response) => {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;
  const shop = req.headers['x-shopify-shop-domain'] as string;

  if (!hmac || !shop) {
    console.log('[Shopify Compliance] shop/redact - Missing headers');
    return res.status(401).json({ error: 'Missing webhook headers' });
  }

  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  if (!verifyWebhookHmac(rawBody, hmac)) {
    console.log('[Shopify Compliance] shop/redact - Invalid HMAC');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  try {
    const { shop_domain } = req.body;
    const canonicalShop = normalizeShopifyShopDomain(shop_domain || shop);
    const shopHash = hashShopifyShopForLogs(canonicalShop || shop_domain || shop);
    console.info("[ShopifyPrivacy] signed_redaction_received");

    if (!canonicalShop) return res.status(400).json({ error: "Invalid shop domain" });
    const result = await redactShopifyStore(canonicalShop);
    // Never log payloads, contact values, provider errors, or merchant selectors here.
    console.info(JSON.stringify({ tag: "[ShopifyPrivacy]", event: "database_erasure_completed",
      at: new Date().toISOString(), externalErasurePending: result.externalErasurePending }));
    res.status(200).json({ 
      received: true,
      databaseErased: true,
      externalErasurePending: true,
      message: 'Application store data erased. Governed external erasure queued.'
    });
  } catch (error) {
    console.error("[ShopifyPrivacy] compliance_processing_failed");
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

function verifyShopifyCommerceWebhook(req: Request, res: Response): { shop: string; body: Record<string, unknown> } | null {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;
  const shop = req.headers['x-shopify-shop-domain'] as string;
  if (!hmac || !shop) {
    res.status(401).json({ error: 'Missing webhook headers' });
    return null;
  }
  const rawBody = (req as { rawBody?: Buffer }).rawBody || Buffer.from(JSON.stringify(req.body ?? {}));
  if (!verifyWebhookHmac(rawBody, hmac)) {
    console.log(JSON.stringify({ tag: '[CommerceIngest]', event: 'shopify_hmac_invalid', shop }));
    res.status(401).json({ error: 'Invalid webhook signature' });
    return null;
  }
  return { shop, body: (req.body || {}) as Record<string, unknown> };
}

router.post('/webhooks/orders-create', (req: Request, res: Response) => {
  const verified = verifyShopifyCommerceWebhook(req, res);
  if (!verified) return;
  const topic = req.headers['x-shopify-topic'];
  console.log(
    JSON.stringify({
      tag: '[CommerceIngest]',
      event: 'shopify_webhook_received',
      topic: topic || 'orders/create',
      shop: verified.shop,
    }),
  );
  scheduleShopifyCommerceProcessing(req, res, verified.shop, () =>
    processShopifyOrderCreate(req, verified.shop, verified.body as Parameters<typeof processShopifyOrderCreate>[2]),
  );
});

router.post('/webhooks/customers-create', (req: Request, res: Response) => {
  const verified = verifyShopifyCommerceWebhook(req, res);
  if (!verified) return;
  const topic = req.headers['x-shopify-topic'];
  console.log(
    JSON.stringify({
      tag: '[CommerceIngest]',
      event: 'shopify_webhook_received',
      topic: topic || 'customers/create',
      shop: verified.shop,
    }),
  );
  scheduleShopifyCommerceProcessing(req, res, verified.shop, () =>
    processShopifyCustomerCreate(req, verified.shop, verified.body as Parameters<typeof processShopifyCustomerCreate>[2]),
  );
});

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

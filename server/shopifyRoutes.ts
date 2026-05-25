import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { storage } from './storage';
import {
  isShopifyConfigured,
  generateShopifyInstallUrl,
  validateOAuthState,
  exchangeShopifyCode,
  createShopifyRgeOneTimePurchase,
  getActiveShopifySubscription,
  syncShopifyBillingToUser,
  getAppPurchaseOneTimeStatus,
  shopifySessionMiddleware,
  registerMandatoryWebhooks,
  SHOPIFY_BILLING_PLANS,
} from './shopify';
import { getAppOrigin } from './urlOrigins';
import { ensureGrowthEnginePurchasedTask } from './growthEngineSetupService';
import { resolveShopifyMerchantForBilling } from './shopifyMerchantResolver';
import { rawShopFromRequest, shopDomainFromRequest } from './shopifyBillingGuard';
import {
  getShopifyAppHandle,
  managedPricingPayloadForShop,
  respondSessionManagedPricing,
} from './shopifyManagedPricing';
import { SHOPIFY_MANAGED_PRICING_INSTRUCTIONS } from '@shared/shopifyManagedPricing';

const router = Router();

// Ensure JSON body is parsed for session-auth billing routes (checkout-web).
router.use(express.json());

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
  const { shop } = req.query;

  if (!shop || typeof shop !== 'string') {
    return res.status(400).json({ error: 'Missing shop parameter' });
  }

  if (!shop.endsWith('.myshopify.com')) {
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

  if (!validateOAuthState(state, shop)) {
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

    let user = await storage.getUserByShopifyShop(shop);

    const sessionUserId = (req as any).user?.id as string | undefined;
    if (!user && sessionUserId) {
      const sessionUser = await storage.getUser(sessionUserId);
      if (sessionUser && !sessionUser.shopifyShop) {
        user = sessionUser;
        console.log("[Shopify Callback] Linking install to existing session user", {
          userId: sessionUser.id,
          shop,
        });
      }
    }

    if (!user) {
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await import('bcryptjs').then(bcrypt => bcrypt.hash(tempPassword, 10));
      const trialStartedAt = new Date();
      const trialEndsAt = new Date(trialStartedAt);
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      user = await storage.createUser({
        name: shop.replace('.myshopify.com', ''),
        email: `${shop.replace('.myshopify.com', '')}@shopify.whachatcrm.com`,
        password: hashedPassword,
        trialStartedAt,
        trialEndsAt,
        trialStatus: 'active',
        trialPlan: 'pro_ai',
      });
    }

    await storage.updateUser(user.id, {
      shopifyShop: shop,
      shopifyAccessToken: accessToken,
      shopifyInstalledAt: new Date(),
      shopifySubscriptionStatus: 'pending',
      shopifyChargeId: null,
      billingPlan: 'free',
      subscriptionPlan: 'free',
      subscriptionStatus: 'active',
      shopifyAIBrainEnabled: false,
    });

    const existingIntegration = await storage.getIntegrationByUserAndType(user.id, 'shopify');
    if (!existingIntegration) {
      await storage.createIntegration({
        userId: user.id,
        type: 'shopify',
        name: 'Shopify',
        config: { shopUrl: shop, syncOptions: ['new_orders', 'new_customers'] },
        isActive: true,
      });
    } else {
      const existingConfig = (existingIntegration.config && typeof existingIntegration.config === 'object') ? existingIntegration.config as Record<string, any> : {};
      await storage.updateIntegration(existingIntegration.id, {
        config: { ...existingConfig, shopUrl: shop },
        isActive: true,
      });
    }

    // Best-effort webhook registration — must not block install
    try {
      await registerMandatoryWebhooks(shop, accessToken);
    } catch (webhookErr) {
      console.error('[Shopify Webhook Register Failed]', { shop, error: webhookErr });
    }

    // Log the merchant into the web app so they can choose Starter vs Pro on Pricing (Shopify Billing API).
    await new Promise<void>((resolve, reject) => {
      (req as any).login(user, (err: unknown) => (err ? reject(err) : resolve()));
    });

    const trialDays = 14;
    res.redirect(
      `/pricing?shopify_installed=1&shop=${encodeURIComponent(shop)}&trial_days=${String(trialDays)}`,
    );
  } catch (error) {
    console.error('Shopify callback error:', error);
    res.status(500).json({ error: 'Installation failed' });
  }
});

const RGE_TEMPLATE_ID = 'realtor-growth-engine';

router.get('/billing/rge-onetime-callback', async (req: Request, res: Response) => {
  const shop = typeof req.query.shop === 'string' ? req.query.shop.trim() : '';
  const chargeRaw =
    (typeof req.query.charge_id === 'string' && req.query.charge_id.trim()) ||
    (typeof req.query.chargeId === 'string' && req.query.chargeId.trim()) ||
    '';

  if (!shop || !chargeRaw) {
    return res.status(400).json({ error: 'Missing shop or charge id' });
  }

  try {
    const user = await storage.getUserByShopifyShop(shop);
    if (!user || !user.shopifyAccessToken) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const st = await getAppPurchaseOneTimeStatus(shop, user.shopifyAccessToken, chargeRaw);
    if ((st || '').toUpperCase() === 'ACTIVE') {
      await storage.upsertTemplateEntitlement(user.id, RGE_TEMPLATE_ID, {
        status: 'purchased',
        purchasedAt: new Date(),
      });
      const existingInstall = await storage.getTemplateInstall(user.id, RGE_TEMPLATE_ID);
      if (!existingInstall) {
        await storage.createTemplateInstall({
          userId: user.id,
          templateId: RGE_TEMPLATE_ID,
          installStatus: 'pending',
        });
      }
      await ensureGrowthEnginePurchasedTask(user.id).catch((e) =>
        console.error('[Shopify RGE callback] GE setup task:', e),
      );
      const { getRgeOnboardingProgress, saveRgeOnboardingProgress } = await import('./rgeOnboardingProgress');
      const existingProgress = await getRgeOnboardingProgress(user.id);
      if (!existingProgress) {
        await saveRgeOnboardingProgress(user.id, { step: 1 }).catch(() => undefined);
      }
      return res.redirect(`/app/templates/realtor-growth-engine/onboarding?shopify_rge=success`);
    }

    res.redirect(`/app/templates/realtor-growth-engine?shopify_rge=declined`);
  } catch (error) {
    console.error('[Shopify RGE callback] error:', error);
    res.status(500).json({ error: 'RGE billing verification failed' });
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

  console.log('[Shopify Uninstall]', { shop });

  try {
    const user = await storage.getUserByShopifyShop(shop);

    if (!user) {
      console.log('[Shopify Uninstall Cleanup]', { shop, status: 'no_user_found' });
      return res.status(200).json({ received: true });
    }

    try {
      await storage.updateUser(user.id, {
        shopifyAccessToken: null,
        shopifyChargeId: null,
        shopifySubscriptionStatus: 'uninstalled',
        shopifyAIBrainEnabled: false,
        billingPlan: 'free',
        subscriptionPlan: 'free',
        subscriptionStatus: 'canceled',
      });
      console.log('[Shopify Uninstall Cleanup]', { shop, userId: user.id, status: 'user_updated' });
    } catch (userErr) {
      console.warn('[Shopify Uninstall Cleanup]', { shop, userId: user.id, status: 'user_update_skipped', error: userErr });
    }

    try {
      const integration = await storage.getIntegrationByUserAndType(user.id, 'shopify');
      if (integration) {
        await storage.updateIntegration(integration.id, { isActive: false });
        console.log('[Shopify Uninstall Cleanup]', { shop, userId: user.id, status: 'integration_deactivated' });
      } else {
        console.log('[Shopify Uninstall Cleanup]', { shop, userId: user.id, status: 'no_integration_found' });
      }
    } catch (integrationErr) {
      console.warn('[Shopify Uninstall Cleanup]', { shop, userId: user.id, status: 'integration_update_skipped', error: integrationErr });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Shopify Uninstall]', { shop, error });
    return res.status(200).json({ received: true });
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
    console.log(`[Shopify Compliance] Data request received for shop: ${shop_domain}, customer: ${customer?.email || customer?.id}`);
    
    // WhachatCRM stores conversation data linked to phone numbers, not Shopify customer IDs
    // We acknowledge the request - actual data export would be handled via support ticket
    // since we need to match by phone number which requires manual verification
    
    res.status(200).json({ 
      received: true,
      message: 'Data request acknowledged. Customer data export will be processed within 30 days.'
    });
  } catch (error) {
    console.error('[Shopify Compliance] customers/data_request error:', error);
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
    console.log(`[Shopify Compliance] Customer redact request for shop: ${shop_domain}, customer: ${customer?.email || customer?.id}`);
    
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
          console.log(`[Shopify Compliance] Deleted chat ${chat.id} for customer phone ${customer.phone}`);
        }
      }
    }
    
    res.status(200).json({ 
      received: true,
      message: 'Customer data redaction request processed.'
    });
  } catch (error) {
    console.error('[Shopify Compliance] customers/redact error:', error);
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
    console.log(`[Shopify Compliance] Shop redact request for: ${shop_domain}`);
    
    // Find the user associated with this shop and delete all their data
    const user = await storage.getUserByShopifyShop(shop_domain || shop);
    
    if (user) {
      // Delete all chats for this user
      const chats = await storage.getChats(user.id);
      for (const chat of chats) {
        await storage.deleteChat(chat.id);
      }
      console.log(`[Shopify Compliance] Deleted ${chats.length} chats for shop ${shop_domain}`);
      
      // Clear Shopify-related fields but keep basic account for audit trail
      // Full account deletion handled separately per retention policy
      await storage.updateUser(user.id, {
        shopifyShop: null,
        shopifyAccessToken: null,
        shopifyChargeId: null,
        shopifySubscriptionStatus: 'redacted',
        shopifyInstalledAt: null,
      });
      console.log(`[Shopify Compliance] Cleared Shopify data for user ${user.id}`);
    }
    
    res.status(200).json({ 
      received: true,
      message: 'Shop data redaction completed.'
    });
  } catch (error) {
    console.error('[Shopify Compliance] shop/redact error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
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

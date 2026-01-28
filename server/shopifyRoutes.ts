import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { storage } from './storage';
import {
  isShopifyConfigured,
  generateShopifyInstallUrl,
  validateOAuthState,
  exchangeShopifyCode,
  createShopifyBillingCharge,
  getActiveShopifySubscription,
  cancelShopifySubscription,
  shopifySessionMiddleware,
  SHOPIFY_BILLING_PLANS,
} from './shopify';

const router = Router();

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';

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
    
    if (!user) {
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await import('bcryptjs').then(bcrypt => bcrypt.hash(tempPassword, 10));
      
      user = await storage.createUser({
        name: shop.replace('.myshopify.com', ''),
        email: `${shop.replace('.myshopify.com', '')}@shopify.whachatcrm.com`,
        password: hashedPassword,
      });
    }

    await storage.updateUser(user.id, {
      shopifyShop: shop,
      shopifyAccessToken: accessToken,
      shopifyInstalledAt: new Date(),
      shopifySubscriptionStatus: 'pending',
    });

    const HOST = process.env.REPL_SLUG 
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : process.env.HOST || 'https://whachatcrm.com';

    const billingResult = await createShopifyBillingCharge(
      shop,
      accessToken,
      'Pro',
      `${HOST}/api/shopify/billing/callback?shop=${shop}`,
      process.env.NODE_ENV !== 'production'
    );

    if (billingResult?.confirmationUrl) {
      await storage.updateUser(user.id, {
        shopifyChargeId: billingResult.chargeId,
      });
      return res.redirect(billingResult.confirmationUrl);
    }

    res.redirect(`/dashboard?shopify_installed=true&shop=${shop}`);
  } catch (error) {
    console.error('Shopify callback error:', error);
    res.status(500).json({ error: 'Installation failed' });
  }
});

router.get('/billing/callback', async (req: Request, res: Response) => {
  const { shop, charge_id } = req.query;

  if (!shop || typeof shop !== 'string') {
    return res.status(400).json({ error: 'Missing shop parameter' });
  }

  try {
    const user = await storage.getUserByShopifyShop(shop);
    
    if (!user || !user.shopifyAccessToken) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const subscription = await getActiveShopifySubscription(shop, user.shopifyAccessToken);

    if (subscription && subscription.status === 'ACTIVE') {
      if (user.shopifyChargeId && subscription.id !== user.shopifyChargeId) {
        console.warn(`Charge ID mismatch: expected ${user.shopifyChargeId}, got ${subscription.id}`);
      }
      
      await storage.updateUser(user.id, {
        shopifySubscriptionStatus: 'active',
        shopifyChargeId: subscription.id,
        subscriptionPlan: 'pro',
        subscriptionStatus: 'active',
      });

      return res.redirect(`/dashboard?shopify_billing=success&plan=pro`);
    }

    await storage.updateUser(user.id, {
      shopifySubscriptionStatus: 'cancelled',
    });

    res.redirect(`/dashboard?shopify_billing=declined`);
  } catch (error) {
    console.error('Shopify billing callback error:', error);
    res.status(500).json({ error: 'Billing verification failed' });
  }
});

router.post('/billing/change-plan', shopifySessionMiddleware(), async (req: Request, res: Response) => {
  const { plan } = req.body;
  const { shop } = (req as any).shopifySession;

  if (!plan || !SHOPIFY_BILLING_PLANS[plan as keyof typeof SHOPIFY_BILLING_PLANS]) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  try {
    const user = await storage.getUserByShopifyShop(shop);
    
    if (!user || !user.shopifyAccessToken) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    if (user.shopifyChargeId) {
      await cancelShopifySubscription(shop, user.shopifyAccessToken, user.shopifyChargeId);
    }

    const HOST = process.env.REPL_SLUG 
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : process.env.HOST || 'https://whachatcrm.com';

    const billingResult = await createShopifyBillingCharge(
      shop,
      user.shopifyAccessToken,
      plan as keyof typeof SHOPIFY_BILLING_PLANS,
      `${HOST}/api/shopify/billing/callback?shop=${shop}`,
      process.env.NODE_ENV !== 'production'
    );

    if (billingResult?.confirmationUrl) {
      await storage.updateUser(user.id, {
        shopifyChargeId: billingResult.chargeId,
      });
      return res.json({ confirmationUrl: billingResult.confirmationUrl });
    }

    res.status(500).json({ error: 'Failed to create billing charge' });
  } catch (error) {
    console.error('Plan change error:', error);
    res.status(500).json({ error: 'Plan change failed' });
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

  try {
    const user = await storage.getUserByShopifyShop(shop);
    
    if (user) {
      await storage.updateUser(user.id, {
        shopifyAccessToken: null,
        shopifySubscriptionStatus: 'uninstalled',
        subscriptionStatus: 'canceled',
      });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Uninstall webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
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
    
    if (user) {
      const status = subscription.status === 'ACTIVE' ? 'active' : 'cancelled';
      await storage.updateUser(user.id, {
        shopifySubscriptionStatus: status,
        subscriptionStatus: status === 'active' ? 'active' : 'canceled',
      });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Subscription webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;

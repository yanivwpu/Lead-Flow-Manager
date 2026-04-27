import '@shopify/shopify-api/adapters/node';
import { shopifyApi, BillingInterval, Session, ApiVersion } from '@shopify/shopify-api';
import { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import crypto from 'crypto';
import { storage } from './storage';

const API_VERSION = ApiVersion.October24; // Maps to 2025-10 in Shopify dashboard

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || '';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';
const SHOPIFY_SCOPES = ['read_products', 'read_orders', 'read_customers'];
const HOST = process.env.APP_URL || process.env.SHOPIFY_APP_HOST || process.env.HOST || 'https://app.whachatcrm.com';

export const SHOPIFY_BILLING_PLANS = {
  'Starter': {
    amount: 0,
    currencyCode: 'USD',
    interval: BillingInterval.Every30Days,
    trialDays: 14,
  },
  'Pro': {
    amount: 49.0,
    currencyCode: 'USD',
    interval: BillingInterval.Every30Days,
    trialDays: 14,
  },
  'AI Brain Add-on': {
    amount: 29.0,
    currencyCode: 'USD',
    interval: BillingInterval.Every30Days,
  },
} as const;

let shopifyInstance: ReturnType<typeof shopifyApi> | null = null;

export function getShopifyApi() {
  if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
    return null;
  }
  
  if (!shopifyInstance) {
    shopifyInstance = shopifyApi({
      apiKey: SHOPIFY_API_KEY,
      apiSecretKey: SHOPIFY_API_SECRET,
      scopes: SHOPIFY_SCOPES,
      hostName: HOST.replace(/^https?:\/\//, ''),
      apiVersion: API_VERSION,
      isEmbeddedApp: false,
    });
  }
  
  return shopifyInstance;
}

export function isShopifyConfigured(): boolean {
  return !!(SHOPIFY_API_KEY && SHOPIFY_API_SECRET);
}

export async function verifyShopifySessionToken(token: string): Promise<{
  valid: boolean;
  shop?: string;
  userId?: string;
  error?: string;
}> {
  try {
    if (!SHOPIFY_API_SECRET || !SHOPIFY_API_KEY) {
      return { valid: false, error: 'Shopify not configured' };
    }

    const secret = new TextEncoder().encode(SHOPIFY_API_SECRET);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }
    if (payload.nbf && payload.nbf > now) {
      return { valid: false, error: 'Token not yet valid' };
    }

    if (payload.aud !== SHOPIFY_API_KEY) {
      return { valid: false, error: 'Invalid token audience' };
    }

    const dest = payload.dest as string;
    const shop = dest?.replace('https://', '');
    
    if (!shop || !shop.endsWith('.myshopify.com')) {
      return { valid: false, error: 'Invalid shop domain' };
    }

    const iss = payload.iss as string;
    const expectedIss = `https://${shop}/admin`;
    if (!iss || (iss !== expectedIss && iss !== `https://${shop}`)) {
      return { valid: false, error: 'Invalid token issuer' };
    }

    return {
      valid: true,
      shop,
      userId: payload.sub as string,
    };
  } catch (error) {
    console.error('Session token verification failed:', error);
    return { valid: false, error: 'Invalid session token' };
  }
}

export function shopifySessionMiddleware(required: boolean = true) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      if (required) {
        return res.status(401).json({ error: 'Missing session token' });
      }
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    const result = await verifyShopifySessionToken(token);

    if (!result.valid) {
      if (required) {
        res.set('X-Shopify-Retry-Invalid-Session-Request', '1');
        return res.status(401).json({ error: result.error });
      }
      return next();
    }

    (req as any).shopifySession = {
      shop: result.shop,
      userId: result.userId,
    };

    next();
  };
}

export async function createShopifyBillingCharge(
  shop: string,
  accessToken: string,
  plan: keyof typeof SHOPIFY_BILLING_PLANS,
  returnUrl: string,
  isTest: boolean = true
): Promise<{ confirmationUrl: string; chargeId: string } | null> {
  const shopify = getShopifyApi();
  if (!shopify) return null;

  const planConfig = SHOPIFY_BILLING_PLANS[plan];
  
  try {
    const client = new shopify.clients.Graphql({
      session: { shop, accessToken } as Session,
    });

    const trialDays = 'trialDays' in planConfig ? (planConfig as any).trialDays : 0;
    
    const response = await client.request(`
      mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $test: Boolean, $trialDays: Int) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          lineItems: $lineItems
          test: $test
          trialDays: $trialDays
        ) {
          appSubscription {
            id
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        name: `WhachatCRM ${plan}`,
        returnUrl,
        test: isTest,
        trialDays: trialDays > 0 ? trialDays : null,
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              price: { amount: planConfig.amount, currencyCode: planConfig.currencyCode },
              interval: planConfig.interval === BillingInterval.Every30Days ? 'EVERY_30_DAYS' : 'ANNUAL',
            },
          },
        }],
      },
    });

    const data = response.data as any;
    if (data?.appSubscriptionCreate?.userErrors?.length > 0) {
      console.error('Shopify billing errors:', data.appSubscriptionCreate.userErrors);
      return null;
    }

    return {
      confirmationUrl: data.appSubscriptionCreate.confirmationUrl,
      chargeId: data.appSubscriptionCreate.appSubscription.id,
    };
  } catch (error) {
    console.error('Failed to create Shopify billing charge:', error);
    return null;
  }
}

export async function getActiveShopifySubscription(
  shop: string,
  accessToken: string
): Promise<{ id: string; name: string; status: string } | null> {
  const shopify = getShopifyApi();
  if (!shopify) return null;

  try {
    const client = new shopify.clients.Graphql({
      session: { shop, accessToken } as Session,
    });

    const response = await client.request(`
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
          }
        }
      }
    `);

    const data = response.data as any;
    const subscriptions = data?.currentAppInstallation?.activeSubscriptions || [];
    
    if (subscriptions.length > 0) {
      return subscriptions[0];
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get Shopify subscription:', error);
    return null;
  }
}

export async function cancelShopifySubscription(
  shop: string,
  accessToken: string,
  subscriptionId: string
): Promise<boolean> {
  const shopify = getShopifyApi();
  if (!shopify) return false;

  try {
    const client = new shopify.clients.Graphql({
      session: { shop, accessToken } as Session,
    });

    const response = await client.request(`
      mutation appSubscriptionCancel($id: ID!) {
        appSubscriptionCancel(id: $id) {
          appSubscription {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: { id: subscriptionId },
    });

    const data = response.data as any;
    return !data?.appSubscriptionCancel?.userErrors?.length;
  } catch (error) {
    console.error('Failed to cancel Shopify subscription:', error);
    return false;
  }
}

const oauthStateStore = new Map<string, { shop: string; timestamp: number }>();

export function generateShopifyInstallUrl(shop: string): { url: string; state: string } {
  const shopify = getShopifyApi();
  if (!shopify) return { url: '', state: '' };
  
  const state = crypto.randomBytes(16).toString('hex');
  oauthStateStore.set(state, { shop, timestamp: Date.now() });
  
  setTimeout(() => oauthStateStore.delete(state), 10 * 60 * 1000);
  
  const redirectUri = `${HOST}/api/shopify/callback`;
  const scopes = SHOPIFY_SCOPES.join(',');
  
  const url = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  
  return { url, state };
}

export function validateOAuthState(state: string, shop: string): boolean {
  const stored = oauthStateStore.get(state);
  if (!stored) return false;
  
  if (Date.now() - stored.timestamp > 10 * 60 * 1000) {
    oauthStateStore.delete(state);
    return false;
  }
  
  if (stored.shop !== shop) {
    return false;
  }
  
  oauthStateStore.delete(state);
  return true;
}

export async function exchangeShopifyCode(
  shop: string,
  code: string
): Promise<string | null> {
  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!response.ok) {
      console.error('Failed to exchange Shopify code:', await response.text());
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Shopify code exchange error:', error);
    return null;
  }
}

export async function registerMandatoryWebhooks(
  shop: string,
  accessToken: string
): Promise<boolean> {
  const shopify = getShopifyApi();
  if (!shopify) return false;

  const webhookEndpoints = [
    { topic: 'CUSTOMERS_DATA_REQUEST', address: `${HOST}/api/shopify/webhooks/customers/data_request` },
    { topic: 'CUSTOMERS_REDACT', address: `${HOST}/api/shopify/webhooks/customers/redact` },
    { topic: 'SHOP_REDACT', address: `${HOST}/api/shopify/webhooks/shop/redact` },
    { topic: 'APP_UNINSTALLED', address: `${HOST}/api/shopify/webhooks/app-uninstalled` },
  ];

  try {
    const client = new shopify.clients.Graphql({
      session: { shop, accessToken } as Session,
    });

    for (const webhook of webhookEndpoints) {
      try {
        const response = await client.request(`
          mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
            webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
              webhookSubscription {
                id
                topic
                endpoint {
                  ... on WebhookHttpEndpoint {
                    callbackUrl
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `, {
          variables: {
            topic: webhook.topic,
            webhookSubscription: {
              callbackUrl: webhook.address,
              format: 'JSON',
            },
          },
        });

        const data = response.data as any;
        if (data?.webhookSubscriptionCreate?.userErrors?.length > 0) {
          console.warn(`[Shopify Webhooks] Warning for ${webhook.topic}:`, data.webhookSubscriptionCreate.userErrors);
        } else {
          console.log(`[Shopify Webhooks] Registered ${webhook.topic} webhook`);
        }
      } catch (webhookError) {
        console.error(`[Shopify Webhooks] Failed to register ${webhook.topic}:`, webhookError);
      }
    }

    return true;
  } catch (error) {
    console.error('[Shopify Webhooks] Failed to register webhooks:', error);
    return false;
  }
}

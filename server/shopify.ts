import '@shopify/shopify-api/adapters/node';
import { shopifyApi, BillingInterval, Session, ApiVersion } from '@shopify/shopify-api';
import { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import crypto from 'crypto';
import { storage } from './storage';

/** Align with shopify.app.whachatcrm.toml webhooks `api_version` (2026-01). */
const API_VERSION = ApiVersion.January26;

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || '';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';
/**
 * Shopify OAuth scopes (keep in sync with shopify.app.whachatcrm.toml).
 * We only request read_customers today: used for GDPR customer/redact flows (correlate phone ↔ chats)
 * and future CRM sync. Product/order REST reads are not implemented yet — do not add scopes until features ship.
 */
const SHOPIFY_SCOPES = ['read_customers'];
const HOST = process.env.APP_URL || process.env.SHOPIFY_APP_HOST || process.env.HOST || 'https://app.whachatcrm.com';

/** Amounts must match public pricing / App Store listing (Starter $19/mo, Pro $49/mo, AI Brain add-on +$29/mo). */
export const SHOPIFY_BILLING_PLANS = {
  'Starter': {
    amount: 19.0,
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
  /** Separate recurring charge — billed on top of Starter or Pro (App Store add-on disclosure). */
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

export type ShopifyBillingChargeSuccess = {
  ok: true;
  confirmationUrl: string;
  chargeId: string;
};

export type ShopifyBillingChargeFailure = {
  ok: false;
  code: string;
  message: string;
  shopifyUserErrors?: Array<{ field?: string[] | string; message: string }>;
  graphQLErrors?: unknown;
  rawResponse?: unknown;
};

export type ShopifyBillingChargeResult = ShopifyBillingChargeSuccess | ShopifyBillingChargeFailure;

function resolveShopifyBillingTestMode(explicitTest?: boolean): boolean {
  if (typeof explicitTest === "boolean") return explicitTest;
  const envFlag = process.env.SHOPIFY_BILLING_TEST?.trim().toLowerCase();
  if (envFlag === "1" || envFlag === "true" || envFlag === "yes") return true;
  if (envFlag === "0" || envFlag === "false" || envFlag === "no") return false;
  return process.env.NODE_ENV !== "production";
}

function formatShopifyRequestError(error: unknown): {
  message: string;
  graphQLErrors?: unknown;
  raw?: unknown;
} {
  if (!error || typeof error !== "object") {
    return { message: String(error ?? "Unknown Shopify API error") };
  }
  const err = error as Record<string, unknown>;
  const graphQLErrors =
    err.graphQLErrors ??
    (err.body as Record<string, unknown> | undefined)?.errors ??
    (err.response as Record<string, unknown> | undefined)?.errors;
  const message =
    (typeof err.message === "string" && err.message) ||
    (Array.isArray(graphQLErrors) &&
      graphQLErrors
        .map((e: any) => e?.message)
        .filter(Boolean)
        .join("; ")) ||
    "Shopify GraphQL request failed";
  return { message, graphQLErrors, raw: err };
}

/**
 * Manual Billing API (appSubscriptionCreate). Not used when the app uses Shopify App Pricing (Managed Pricing).
 */
export async function createShopifyBillingCharge(
  shop: string,
  accessToken: string,
  plan: keyof typeof SHOPIFY_BILLING_PLANS,
  returnUrl: string,
  isTest?: boolean,
): Promise<ShopifyBillingChargeResult> {
  const shopify = getShopifyApi();
  if (!shopify) {
    return {
      ok: false,
      code: "SHOPIFY_NOT_CONFIGURED",
      message: "Shopify API credentials are not configured on the server.",
    };
  }

  const planConfig = SHOPIFY_BILLING_PLANS[plan];
  const testMode = resolveShopifyBillingTestMode(isTest);
  const trialDays = "trialDays" in planConfig ? (planConfig as { trialDays?: number }).trialDays ?? 0 : 0;
  const subscriptionName =
    plan === "AI Brain Add-on" ? "WhachatCRM AI Brain add-on" : `WhachatCRM ${plan}`;

  const mutationVariables: Record<string, unknown> = {
    name: subscriptionName,
    returnUrl,
    test: testMode,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: planConfig.amount, currencyCode: planConfig.currencyCode },
            interval:
              planConfig.interval === BillingInterval.Every30Days ? "EVERY_30_DAYS" : "ANNUAL",
          },
        },
      },
    ],
  };
  if (trialDays > 0) mutationVariables.trialDays = trialDays;

  const logContext = {
    shop,
    plan,
    subscriptionName,
    returnUrl,
    test: testMode,
    trialDays: trialDays > 0 ? trialDays : 0,
    apiVersion: API_VERSION,
    scopes: SHOPIFY_SCOPES,
    hostName: HOST.replace(/^https?:\/\//, ""),
    isEmbeddedApp: false,
    lineItems: mutationVariables.lineItems,
  };
  console.log("[ShopifyBilling] appSubscriptionCreate request", logContext);

  try {
    const client = new shopify.clients.Graphql({
      session: { shop, accessToken } as Session,
    });

    const response = await client.request(
      `
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
    `,
      { variables: mutationVariables },
    );

    const data = (response as { data?: unknown }).data as Record<string, unknown> | undefined;
    const extensions = (response as { extensions?: unknown }).extensions;
    const topLevelErrors = (response as { errors?: unknown }).errors;

    const payload = data?.appSubscriptionCreate as
      | {
          appSubscription?: { id?: string };
          confirmationUrl?: string;
          userErrors?: Array<{ field?: string[] | string; message: string }>;
        }
      | undefined;

    console.log("[ShopifyBilling] appSubscriptionCreate response", {
      ...logContext,
      graphQLErrors: topLevelErrors ?? null,
      extensions: extensions ?? null,
      userErrors: payload?.userErrors ?? null,
      confirmationUrl: payload?.confirmationUrl ?? null,
      appSubscriptionId: payload?.appSubscription?.id ?? null,
      rawData: data ?? null,
    });

    if (topLevelErrors) {
      return {
        ok: false,
        code: "SHOPIFY_GRAPHQL_ERROR",
        message:
          Array.isArray(topLevelErrors) && topLevelErrors.length
            ? (topLevelErrors as Array<{ message?: string }>).map((e) => e.message).filter(Boolean).join("; ")
            : "Shopify returned a GraphQL error while creating the subscription.",
        graphQLErrors: topLevelErrors,
        rawResponse: data,
      };
    }

    const userErrors = payload?.userErrors ?? [];
    if (userErrors.length > 0) {
      const message = userErrors.map((e) => e.message).filter(Boolean).join("; ");
      return {
        ok: false,
        code: "SHOPIFY_USER_ERRORS",
        message: message || "Shopify rejected the billing charge.",
        shopifyUserErrors: userErrors,
        rawResponse: data,
      };
    }

    const confirmationUrl = payload?.confirmationUrl;
    const chargeId = payload?.appSubscription?.id;
    if (!confirmationUrl) {
      return {
        ok: false,
        code: "SHOPIFY_MISSING_CONFIRMATION_URL",
        message: "Shopify did not return a confirmation URL for this charge.",
        rawResponse: data,
      };
    }

    return {
      ok: true,
      confirmationUrl,
      chargeId: chargeId || confirmationUrl,
    };
  } catch (error) {
    const formatted = formatShopifyRequestError(error);
    console.error("[ShopifyBilling] appSubscriptionCreate failed", {
      ...logContext,
      errorMessage: formatted.message,
      graphQLErrors: formatted.graphQLErrors ?? null,
      raw: formatted.raw ?? null,
    });
    return {
      ok: false,
      code: "SHOPIFY_REQUEST_FAILED",
      message: formatted.message,
      graphQLErrors: formatted.graphQLErrors,
      rawResponse: formatted.raw,
    };
  }
}

/** One-time Realtor Growth Engine license (USD) — align with `templateRoutes` Stripe list price. */
export const SHOPIFY_RGE_ONETIME_USD = 199;

export async function createShopifyRgeOneTimePurchase(
  shop: string,
  accessToken: string,
  returnUrl: string,
  isTest: boolean = true
): Promise<{ confirmationUrl: string; purchaseId: string } | null> {
  const shopify = getShopifyApi();
  if (!shopify) return null;

  try {
    const client = new shopify.clients.Graphql({
      session: { shop, accessToken } as Session,
    });

    const response = await client.request(
      `
      mutation appPurchaseOneTimeCreate($name: String!, $returnUrl: URL!, $price: MoneyInput!, $test: Boolean) {
        appPurchaseOneTimeCreate(name: $name, returnUrl: $returnUrl, price: $price, test: $test) {
          appPurchaseOneTime { id }
          confirmationUrl
          userErrors { field message }
        }
      }
    `,
      {
        variables: {
          name: 'WhachatCRM Realtor Growth Engine (one-time)',
          returnUrl,
          test: isTest,
          price: { amount: SHOPIFY_RGE_ONETIME_USD, currencyCode: 'USD' },
        },
      },
    );

    const data = response.data as any;
    if (data?.appPurchaseOneTimeCreate?.userErrors?.length > 0) {
      console.error('[Shopify RGE] appPurchaseOneTimeCreate userErrors:', data.appPurchaseOneTimeCreate.userErrors);
      return null;
    }

    const purchaseId = data?.appPurchaseOneTimeCreate?.appPurchaseOneTime?.id as string | undefined;
    const confirmationUrl = data?.appPurchaseOneTimeCreate?.confirmationUrl as string | undefined;
    if (!purchaseId || !confirmationUrl) return null;

    return { confirmationUrl, purchaseId };
  } catch (error) {
    console.error('[Shopify RGE] appPurchaseOneTimeCreate failed:', error);
    return null;
  }
}

export async function getAppPurchaseOneTimeStatus(
  shop: string,
  accessToken: string,
  chargeIdOrGid: string
): Promise<string | null> {
  const shopify = getShopifyApi();
  if (!shopify) return null;

  const id = chargeIdOrGid.startsWith('gid://')
    ? chargeIdOrGid
    : `gid://shopify/AppPurchaseOneTime/${chargeIdOrGid}`;

  try {
    const client = new shopify.clients.Graphql({
      session: { shop, accessToken } as Session,
    });

    const response = await client.request(
      `
      query appPurchaseOneTimeStatus($id: ID!) {
        node(id: $id) {
          ... on AppPurchaseOneTime {
            status
          }
        }
      }
    `,
      { variables: { id } },
    );

    const status = (response.data as any)?.node?.status as string | undefined;
    return status || null;
  } catch (error) {
    console.error('[Shopify RGE] Failed to load one-time purchase status:', error);
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

/**
 * GA4 conversion events for WhachatCRM.
 * Uses gtag when loaded + analytics consent; fails silently otherwise.
 * Dedupes via localStorage so refresh / Strict Mode / return visits do not double-fire
 * the same successful action (keyed by event + uniqueId).
 */

import { hasAnalyticsConsent, isGoogleAnalyticsReady } from "@/lib/cookieConsent";

type GtagFn = (...args: unknown[]) => void;

function getGtag(): GtagFn | null {
  if (typeof window === "undefined") return null;
  const gtag = (window as Window & { gtag?: GtagFn }).gtag;
  return typeof gtag === "function" ? gtag : null;
}

function onceKey(eventName: string, uniqueId: string): string {
  return `ga4_once:${eventName}:${uniqueId}`;
}

function alreadyFired(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1" || sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markFired(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore quota / private mode */
    }
  }
}

/**
 * Fire a GA4 event once per uniqueId.
 * No-op when consent missing, gtag unavailable, or already fired.
 */
export function trackGa4Event(
  eventName: string,
  params: Record<string, unknown> = {},
  uniqueId: string,
): void {
  if (!uniqueId) return;
  if (!hasAnalyticsConsent()) return;

  const key = onceKey(eventName, uniqueId);
  if (alreadyFired(key)) return;

  const gtag = getGtag();
  if (!gtag) return;

  // Mark before calling so concurrent Strict Mode double-invokes still dedupe.
  markFired(key);

  try {
    gtag("event", eventName, params);
  } catch {
    /* fail silently */
  }
}

/** Wait briefly for gtag ready (post-consent) then fire once. */
export function trackGa4EventWhenReady(
  eventName: string,
  params: Record<string, unknown>,
  uniqueId: string,
  timeoutMs = 4000,
): void {
  if (!uniqueId || !hasAnalyticsConsent()) return;
  const key = onceKey(eventName, uniqueId);
  if (alreadyFired(key)) return;

  if (isGoogleAnalyticsReady() && getGtag()) {
    trackGa4Event(eventName, params, uniqueId);
    return;
  }

  const started = Date.now();
  const timer = window.setInterval(() => {
    if (alreadyFired(key)) {
      window.clearInterval(timer);
      return;
    }
    if ((isGoogleAnalyticsReady() && getGtag()) || Date.now() - started > timeoutMs) {
      window.clearInterval(timer);
      trackGa4Event(eventName, params, uniqueId);
    }
  }, 200);
}

// --- Named conversion helpers (call sites should pass a stable uniqueId) ---

export function trackSignUp(params: {
  method: string;
  plan?: string;
  source?: string;
  userId: string;
}): void {
  trackGa4EventWhenReady(
    "sign_up",
    {
      method: params.method,
      plan: params.plan || "free",
      ...(params.source ? { source: params.source } : {}),
    },
    params.userId,
  );
}

export function trackWhatsappConnected(params: {
  userId: string;
  embeddedSignup: boolean;
}): void {
  trackGa4EventWhenReady(
    "whatsapp_connected",
    { provider: "meta", embedded_signup: params.embeddedSignup },
    `${params.userId}:whatsapp`,
  );
}

export function trackFacebookConnected(params: { userId: string }): void {
  trackGa4EventWhenReady("facebook_connected", {}, `${params.userId}:facebook`);
}

export function trackInstagramConnected(params: { userId: string }): void {
  trackGa4EventWhenReady("instagram_connected", {}, `${params.userId}:instagram`);
}

export function trackGmailConnected(params: { userId: string }): void {
  trackGa4EventWhenReady("gmail_connected", {}, `${params.userId}:gmail`);
}

export function trackShopifyConnected(params: { userId: string }): void {
  trackGa4EventWhenReady(
    "shopify_connected",
    { platform: "shopify" },
    `${params.userId}:shopify`,
  );
}

export function trackDemoBooked(params: {
  source: string;
  bookingType?: string;
  bookingId?: string;
}): void {
  const unique = params.bookingId || `${params.source}:${Date.now()}`;
  trackGa4EventWhenReady(
    "demo_booked",
    {
      source: params.source,
      booking_type: params.bookingType || "marketing_demo",
    },
    unique,
  );
}

export function trackPurchase(params: {
  transactionId: string;
  value: number;
  currency: string;
  plan: string;
  billingInterval: string;
}): void {
  trackGa4EventWhenReady(
    "purchase",
    {
      transaction_id: params.transactionId,
      value: params.value,
      currency: params.currency,
      plan: params.plan,
      billing_interval: params.billingInterval,
    },
    params.transactionId,
  );
}

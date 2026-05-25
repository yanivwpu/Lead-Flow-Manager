import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";

const SHOPIFY_POST_INSTALL_STORAGE_KEY = "whachatcrm_shopify_post_install_pricing";
/** Set when merchant leaves for Shopify plan picker; cleared on post-approval app entry. */
export const SHOPIFY_PLAN_PICKER_OPENED_KEY = "whachatcrm_shopify_plan_picker_opened";

export function isShopifyBillingSuccessReturn(
  search: string = typeof window !== "undefined" ? window.location.search : "",
): boolean {
  return new URLSearchParams(search).get("shopify_billing") === "success";
}

export function shopifyPostApprovalInboxPath(
  search: string = typeof window !== "undefined" ? window.location.search : "",
): string {
  const params = new URLSearchParams(search);
  const plan = params.get("plan");
  const q = new URLSearchParams();
  q.set("shopify_billing", "success");
  if (plan) q.set("plan", plan);
  return `/app/inbox?${q.toString()}`;
}

function readPlanPickerOpened(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(SHOPIFY_PLAN_PICKER_OPENED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markShopifyPlanPickerOpened(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SHOPIFY_PLAN_PICKER_OPENED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearShopifyPlanPickerOpened(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SHOPIFY_PLAN_PICKER_OPENED_KEY);
  } catch {
    /* ignore */
  }
}

export type ShopifyBootstrapContext = {
  active: boolean;
  shop?: string;
  shopifyInstalled: boolean;
  embedded: boolean;
  needsInstallRedirect: boolean;
  pricingPath: string;
  /** Must land on Shopify pricing — never /app/inbox first. */
  postInstallFlow: boolean;
  persistedPostInstall: boolean;
};

function logBootstrap(event: string, detail?: Record<string, unknown>): void {
  if (detail && Object.keys(detail).length > 0) {
    console.log(`[ShopifyBootstrap] ${event}`, detail);
  } else {
    console.log(`[ShopifyBootstrap] ${event}`);
  }
}

function redirectParamIsShopify(redirect: string): boolean {
  if (!redirect) return false;
  return (
    redirect.includes("shopify_installed=1") ||
    redirect.includes("/pricing") ||
    /(?:\?|&)shop=/.test(redirect)
  );
}

function readPersistedPricingPath(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SHOPIFY_POST_INSTALL_STORAGE_KEY);
    return raw && raw.startsWith("/pricing") ? raw : null;
  } catch {
    return null;
  }
}

export function persistShopifyPostInstallPricingPath(pricingPath: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SHOPIFY_POST_INSTALL_STORAGE_KEY, pricingPath);
    logBootstrap("persisted_post_install", { pricingPath });
  } catch {
    /* ignore */
  }
}

export function clearShopifyPostInstallPricingPath(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SHOPIFY_POST_INSTALL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function buildPricingPath(
  pathname: string,
  search: string,
  shop: string | undefined,
  shopifyInstalled: boolean,
  embedded: boolean,
): string {
  if (pathname === "/pricing" || pathname.startsWith("/pricing/")) {
    const destination = `${pathname}${search}`;
    logBootstrap("preserving_query", { destination });
    return destination;
  }

  const params = new URLSearchParams();
  if (shop) params.set("shop", shop);
  if (shopifyInstalled) params.set("shopify_installed", "1");

  const existing = new URLSearchParams(search);
  const trialDays = existing.get("trial_days");
  if (trialDays) params.set("trial_days", trialDays);
  if (embedded) params.set("embedded", "1");

  const qs = params.toString();
  const destination = qs ? `/pricing?${qs}` : "/pricing";
  logBootstrap("preserving_query", { destination });
  return destination;
}

/**
 * Always pass `window.location.pathname` + `window.location.search` (not wouter path alone).
 */
export function getShopifyBootstrapContext(
  pathname: string = typeof window !== "undefined" ? window.location.pathname : "/",
  search: string = typeof window !== "undefined" ? window.location.search : "",
): ShopifyBootstrapContext {
  const params = new URLSearchParams(search);
  const shop = normalizeShopifyShopDomain(params.get("shop")) ?? undefined;
  const shopifyInstalled = params.get("shopify_installed") === "1";
  const embedded = params.get("embedded") === "1";
  const hmac = params.get("hmac");
  const redirect = params.get("redirect") ?? "";

  const path = pathname.replace(/\/$/, "") || "/";
  const onAuth = path === "/auth";
  const onPricing = path === "/pricing" || path.startsWith("/pricing/");
  const onHome = path === "/";
  const onApp = path === "/app" || path.startsWith("/app/");

  const persisted = readPersistedPricingPath();
  const pricingPath = persisted ?? buildPricingPath(pathname, search, shop, shopifyInstalled, embedded);

  if (shopifyInstalled) {
    persistShopifyPostInstallPricingPath(pricingPath);
  }

  const postInstallFlow = Boolean(
    shopifyInstalled || persisted || (path === "/pricing" && (!!shop || shopifyInstalled)),
  );

  const active = Boolean(
    postInstallFlow ||
      embedded ||
      shopifyInstalled ||
      (shop && hmac) ||
      (onAuth && (shop || redirectParamIsShopify(redirect))) ||
      (onPricing && (shop || shopifyInstalled)) ||
      (onHome && (shop || shopifyInstalled)) ||
      (onApp && (postInstallFlow || persisted)),
  );

  if (active && (shopifyInstalled || persisted)) {
    logBootstrap("detected", {
      path,
      shopifyInstalled,
      postInstallFlow,
      persisted: !!persisted,
      onApp,
    });
  }

  const needsInstallRedirect = Boolean(onHome && shop && !shopifyInstalled && !persisted);

  return {
    active,
    shop,
    shopifyInstalled,
    embedded,
    needsInstallRedirect,
    pricingPath,
    postInstallFlow,
    persistedPostInstall: !!persisted,
  };
}

/** Post-install must reach pricing with install query intact — not inbox. */
export function isShopifyBootstrapDestinationReached(
  ctx: ShopifyBootstrapContext,
  isAuthenticated: boolean,
): boolean {
  if (typeof window === "undefined") return false;

  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const params = new URLSearchParams(window.location.search);
  const current = `${path}${window.location.search}`;

  if (isAuthenticated && (isShopifyBillingSuccessReturn() || readPlanPickerOpened())) {
    return path === "/app/inbox" || path.startsWith("/app/inbox/");
  }

  if (ctx.postInstallFlow || ctx.shopifyInstalled || ctx.persistedPostInstall) {
    const shopOk = !!normalizeShopifyShopDomain(params.get("shop"));
    const installedFlag = params.get("shopify_installed") === "1";
    return path === "/pricing" && installedFlag && shopOk;
  }

  const dest = resolveShopifyBootstrapDestination(ctx, isAuthenticated, false);
  return current === dest;
}

export function resolveShopifyBootstrapDestination(
  ctx: ShopifyBootstrapContext,
  isAuthenticated: boolean,
  logRedirect = true,
): string {
  if (isAuthenticated && isShopifyBillingSuccessReturn()) {
    clearShopifyPostInstallPricingPath();
    clearShopifyPlanPickerOpened();
    return shopifyPostApprovalInboxPath();
  }

  if (isAuthenticated && readPlanPickerOpened()) {
    clearShopifyPostInstallPricingPath();
    clearShopifyPlanPickerOpened();
    if (logRedirect) {
      logBootstrap("redirecting_to_inbox_after_plan_picker");
    }
    return "/app/inbox";
  }

  if (ctx.postInstallFlow || ctx.shopifyInstalled || ctx.persistedPostInstall || ctx.embedded) {
    if (logRedirect) {
      logBootstrap("redirecting_to_pricing", { pricingPath: ctx.pricingPath });
    }
    return ctx.pricingPath;
  }
  if (isAuthenticated) {
    return "/app/inbox";
  }
  const redirect = encodeURIComponent(ctx.pricingPath);
  return `/auth?redirect=${redirect}`;
}

export function shouldSuppressAppRoutes(ctx: ShopifyBootstrapContext): boolean {
  if (isShopifyBillingSuccessReturn() || readPlanPickerOpened()) {
    return false;
  }
  return ctx.active && (ctx.postInstallFlow || ctx.shopifyInstalled || ctx.persistedPostInstall);
}

export function applyShopifyBootstrapDocumentFlags(active: boolean): void {
  if (typeof document === "undefined") return;
  if (active) {
    document.documentElement.classList.add(
      "wcs-shopify-preboot",
      "wcs-hide-static-marketing",
      "wcs-shopify-bootstrap",
    );
  } else {
    document.documentElement.classList.remove("wcs-shopify-preboot", "wcs-shopify-bootstrap");
  }
}

/** Read live URL on every router pass — avoids wouter path without query string. */
export function readShopifyBootstrapFromWindow(): ShopifyBootstrapContext {
  if (typeof window === "undefined") {
    return getShopifyBootstrapContext("/", "");
  }
  return getShopifyBootstrapContext(window.location.pathname, window.location.search);
}

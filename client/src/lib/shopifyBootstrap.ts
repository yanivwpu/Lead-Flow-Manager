import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";

const SHOPIFY_POST_INSTALL_STORAGE_KEY = "whachatcrm_shopify_post_install_pricing";

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
    return `${pathname}${search}`;
  }

  const params = new URLSearchParams();
  if (shop) params.set("shop", shop);
  if (shopifyInstalled) params.set("shopify_installed", "1");

  const existing = new URLSearchParams(search);
  const trialDays = existing.get("trial_days");
  if (trialDays) params.set("trial_days", trialDays);
  if (embedded) params.set("embedded", "1");

  const qs = params.toString();
  return qs ? `/pricing?${qs}` : "/pricing";
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
  const redirect = params.get("redirect") ?? "";

  const path = pathname.replace(/\/$/, "") || "/";
  const onAuth = path === "/auth";
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
      shop ||
      (onAuth && (shop || redirectParamIsShopify(redirect))) ||
      (onHome && shop) ||
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
  return ctx.active && (ctx.postInstallFlow || ctx.shopifyInstalled || ctx.persistedPostInstall);
}

export function applyShopifyBootstrapDocumentFlags(active: boolean): void {
  if (typeof document === "undefined") return;
  if (active) {
    document.documentElement.classList.add("wcs-hide-static-marketing", "wcs-shopify-bootstrap");
  } else {
    document.documentElement.classList.remove("wcs-shopify-bootstrap");
  }
}

/** Read live URL on every router pass — avoids wouter path without query string. */
export function readShopifyBootstrapFromWindow(): ShopifyBootstrapContext {
  if (typeof window === "undefined") {
    return getShopifyBootstrapContext("/", "");
  }
  return getShopifyBootstrapContext(window.location.pathname, window.location.search);
}

import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";

export type ShopifyBootstrapContext = {
  /** Merchant install / OAuth / embedded pricing flow — suppress marketing homepage. */
  active: boolean;
  shop?: string;
  shopifyInstalled: boolean;
  embedded: boolean;
  /** `/?shop=` before OAuth — full redirect to install API. */
  needsInstallRedirect: boolean;
  /** Canonical pricing URL with shop / install query params. */
  pricingPath: string;
  /** After session loads, land on pricing (post-install) vs app inbox. */
  postInstallFlow: boolean;
};

function redirectParamIsShopify(redirect: string): boolean {
  if (!redirect) return false;
  return (
    redirect.includes("shopify_installed=1") ||
    redirect.includes("/pricing") ||
    /(?:\?|&)shop=/.test(redirect)
  );
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

/** Synchronous URL parse — safe during first paint and in Router. */
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

  const active = Boolean(
    shopifyInstalled ||
      embedded ||
      shop ||
      (onAuth && (shop || redirectParamIsShopify(redirect))) ||
      (onHome && shop),
  );

  const pricingPath = buildPricingPath(pathname, search, shop, shopifyInstalled, embedded);
  const needsInstallRedirect = Boolean(onHome && shop && !shopifyInstalled);
  const postInstallFlow = shopifyInstalled || (path === "/pricing" && (!!shop || shopifyInstalled));

  return {
    active,
    shop,
    shopifyInstalled,
    embedded,
    needsInstallRedirect,
    pricingPath,
    postInstallFlow,
  };
}

export function resolveShopifyBootstrapDestination(
  ctx: ShopifyBootstrapContext,
  isAuthenticated: boolean,
): string {
  if (ctx.postInstallFlow || ctx.shopifyInstalled || ctx.embedded) {
    return ctx.pricingPath;
  }
  if (isAuthenticated) {
    return "/app/inbox";
  }
  const redirect = encodeURIComponent(ctx.pricingPath);
  return `/auth?redirect=${redirect}`;
}

export function pathMatches(location: string, target: string): boolean {
  const locPath = location.split("?")[0].replace(/\/$/, "") || "/";
  const targetPath = target.split("?")[0].replace(/\/$/, "") || "/";
  return locPath === targetPath;
}

/** Apply document classes before React hydrates (mirrored in index.html). */
export function applyShopifyBootstrapDocumentFlags(active: boolean): void {
  if (typeof document === "undefined") return;
  if (active) {
    document.documentElement.classList.add("wcs-hide-static-marketing", "wcs-shopify-bootstrap");
  } else {
    document.documentElement.classList.remove("wcs-shopify-bootstrap");
  }
}

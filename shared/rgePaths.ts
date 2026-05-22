/** In-app Realtor Growth Engine routes (shared by client + server). */
export const RGE_TEMPLATE_DETAIL_PATH = "/app/templates/realtor-growth-engine";
export const RGE_TEMPLATE_ONBOARDING_PATH = "/app/templates/realtor-growth-engine/onboarding";

export type RgeEntitlementStatus = "locked" | "purchased" | "submitted" | "installed";

/** Where the Growth Engines card / hub should route for the current entitlement. */
export function getRgeHubPath(status: RgeEntitlementStatus | null | undefined): string {
  if (status === "installed") return RGE_TEMPLATE_DETAIL_PATH;
  if (status === "purchased" || status === "submitted") return RGE_TEMPLATE_ONBOARDING_PATH;
  return RGE_TEMPLATE_DETAIL_PATH;
}

export function getRgeGalleryCtaLabel(status: RgeEntitlementStatus | null | undefined, fallback: string): string {
  if (status === "installed") return "Manage Growth Engine";
  if (status === "purchased" || status === "submitted") return "Open Growth Engine";
  return fallback;
}

export function getRgeGalleryStatusLabel(status: RgeEntitlementStatus | null | undefined): string | null {
  if (status === "installed") return "Activated";
  if (status === "submitted") return "Launch in progress";
  if (status === "purchased") return "Ready to launch";
  return null;
}

export function isRgeOwnedStatus(status: RgeEntitlementStatus | null | undefined): boolean {
  return status === "purchased" || status === "submitted" || status === "installed";
}

/** Stripe success / post-checkout should land on onboarding, not the sales detail page. */
export function normalizeRgePostPurchaseRedirect(path: string): string {
  if (!path.includes("realtor-growth-engine")) return path;

  try {
    const u = new URL(path, "https://placeholder.local");
    const pathname = u.pathname.replace(/\/$/, "") || "/";
    const detail = RGE_TEMPLATE_DETAIL_PATH;
    const onboarding = RGE_TEMPLATE_ONBOARDING_PATH;

    if (pathname === detail) {
      u.pathname = onboarding;
      if (!u.searchParams.has("paid")) u.searchParams.set("paid", "true");
      return u.pathname + u.search + u.hash;
    }

    if (pathname.startsWith(detail) && !pathname.includes("/onboarding")) {
      u.pathname = onboarding;
      if (!u.searchParams.has("paid")) u.searchParams.set("paid", "true");
      return u.pathname + u.search + u.hash;
    }
  } catch {
    return `${RGE_TEMPLATE_ONBOARDING_PATH}?paid=true`;
  }

  return path;
}

export function getRgeCheckoutReturnPaths(): {
  redirectTo: string;
  cancelTo: string;
} {
  return {
    redirectTo: `${RGE_TEMPLATE_ONBOARDING_PATH}?paid=true`,
    cancelTo: RGE_TEMPLATE_DETAIL_PATH,
  };
}

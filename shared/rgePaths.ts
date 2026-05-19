/** In-app Realtor Growth Engine routes (shared by client + server). */
export const RGE_TEMPLATE_DETAIL_PATH = "/app/templates/realtor-growth-engine";
export const RGE_TEMPLATE_ONBOARDING_PATH = "/app/templates/realtor-growth-engine/onboarding";

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

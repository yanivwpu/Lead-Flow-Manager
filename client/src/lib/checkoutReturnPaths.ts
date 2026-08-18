import { PLAN_CHECKOUT_SUCCESS_PATH } from "@/lib/upgradeSuccess";
import { stripPricingCheckoutParam } from "@/lib/pricingCheckoutIntent";

export { PLAN_CHECKOUT_SUCCESS_PATH };

/** Path (+ optional search) for Stripe cancel/success routing — must stay same-origin paths. */
export function getCheckoutReturnPaths(): { redirectTo: string; cancelTo: string } {
  if (typeof window === "undefined") {
    return { redirectTo: "/app/inbox", cancelTo: "/app/inbox" };
  }
  const path = `${window.location.pathname}${window.location.search}`;
  return { redirectTo: path, cancelTo: path };
}

/** Starter/Pro checkout: success enters Inbox; cancel returns to Pricing without relaunching Stripe. */
export function getPlanCheckoutReturnPaths(): { redirectTo: string; cancelTo: string } {
  if (typeof window === "undefined") {
    return { redirectTo: PLAN_CHECKOUT_SUCCESS_PATH, cancelTo: "/pricing" };
  }
  return {
    redirectTo: PLAN_CHECKOUT_SUCCESS_PATH,
    cancelTo: stripPricingCheckoutParam(`${window.location.pathname}${window.location.search}`),
  };
}

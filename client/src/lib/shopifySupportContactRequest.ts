import type { ShopifySupportContactAction } from "@shared/shopifyContactPrivacy";

/** Avoid www/apex → app POST redirects, which taint browser Origin and fail CSRF checks. */
export function shopifySupportContactUrl(origin = typeof window === "undefined" ? "" : window.location.origin) {
  return ["https://whachatcrm.com", "https://www.whachatcrm.com"].includes(origin)
    ? "https://app.whachatcrm.com/api/shopify/support-contact" : "/api/shopify/support-contact";
}
export type SupportContactFailure = "sessionExpired" | "permissionDenied" | "reconnectRequired" | "invalidEmail" | "error";
export class SupportContactRequestError extends Error {
  constructor(public readonly reason: SupportContactFailure) { super(reason); }
}
export async function saveSupportContact(action: ShopifySupportContactAction, request = fetch, signal?: AbortSignal) {
  const response = await request(shopifySupportContactUrl(), {
    method: "POST", credentials: "include", redirect: "error", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action), signal: signal || AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new SupportContactRequestError(response.status === 401 ? "sessionExpired" :
    response.status === 403 ? "permissionDenied" : response.status === 409 ? "reconnectRequired" :
    response.status === 400 ? "invalidEmail" : "error");
  if ((await response.json()).saved !== true) throw new SupportContactRequestError("error");
}

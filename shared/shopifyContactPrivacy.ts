import { sanitizeShopifyOwnerEmail } from "./shopifyBilling";

export type ShopifyEmailCaptureStatus = "success" | "missing" | "invalid" | "fetch_failed" | "persist_failed" | "installation_inactive";
export type ShopifyEmailCaptureResult = { status: ShopifyEmailCaptureStatus; email: string | null };
export type ShopifyContactSnapshot = { available: boolean; suggestedEmail: string | null; confirmed: boolean; dismissed: boolean };
export function classifyShopifyOwnerEmail(raw: unknown): ShopifyEmailCaptureResult {
  if (raw == null || (typeof raw === "string" && !raw.trim())) return { status: "missing", email: null };
  const email = typeof raw === "string" ? sanitizeShopifyOwnerEmail(raw) : null;
  return email ? { status: "success", email } : { status: "invalid", email: null };
}
export function isShopifyContactInstallationActive(user: {
  shopifyShop?: string | null; shopifyAccessToken?: string | null;
  shopifySubscriptionStatus?: string | null; deletionRequestedAt?: Date | string | null;
}): boolean {
  const status = (user.shopifySubscriptionStatus || "").toLowerCase();
  return !!user.shopifyShop && !!user.shopifyAccessToken && !user.deletionRequestedAt &&
    !["uninstalled", "redacted"].includes(status);
}
export type ShopifySupportContactAction =
  | { action: "confirm"; email: string }
  | { action: "dismiss" }
  | { action: "remove" };
export function parseShopifySupportContactAction(body: unknown): ShopifySupportContactAction | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (value.action === "dismiss" || value.action === "remove") return { action: value.action };
  if (value.action !== "confirm" || typeof value.email !== "string" || value.email.length > 254) return null;
  const email = sanitizeShopifyOwnerEmail(value.email);
  return email ? { action: "confirm", email } : null;
}
// Aggregate telemetry deliberately contains no merchant identifiers or contact data.
export function shopifyContactCaptureLog(status: ShopifyEmailCaptureStatus, at: Date): string {
  return JSON.stringify({ tag: "[ShopifyContact]", event: "owner_email_capture",
    status, source: "shop.email", at: at.toISOString() });
}

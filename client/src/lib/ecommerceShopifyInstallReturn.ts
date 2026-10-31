/**
 * Navigation hint for an E-Commerce setup launched from WhachatCRM.
 * This is never an entitlement, authentication claim, or authorization to send.
 * Shopify may reopen our app in another tab, so use short-lived same-origin localStorage.
 */
const KEY = "whachatcrm_ecommerce_shopify_setup_return_v1";
const MAX_AGE_MS = 30 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(storage?: Store): Store | null {
  if (storage) return storage;
  try { return typeof window === "undefined" ? null : window.localStorage; }
  catch { return null; }
}

export function rememberEcommerceShopifyInstallReturn(
  userId: string, storage?: Store, now = Date.now(),
): void {
  if (!userId) return;
  try { getStorage(storage)?.setItem(KEY, JSON.stringify({ userId, expiresAt: now + MAX_AGE_MS })); }
  catch { /* Browser storage is optional; server OAuth return still works. */ }
}

export function hasEcommerceShopifyInstallReturn(
  userId: string, storage?: Store, now = Date.now(),
): boolean {
  try {
    const s = getStorage(storage);
    const raw = s?.getItem(KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { userId?: unknown; expiresAt?: unknown };
    if (typeof parsed.userId !== "string" ||
        typeof parsed.expiresAt !== "number" ||
        !Number.isFinite(parsed.expiresAt) ||
        parsed.expiresAt <= now || parsed.expiresAt > now + MAX_AGE_MS) {
      s?.removeItem(KEY);
      return false;
    }
    // Never resume the installation in another signed-in workspace.
    return parsed.userId === userId;
  } catch {
    try { getStorage(storage)?.removeItem(KEY); } catch { /* ignore */ }
    return false;
  }
}

export function clearEcommerceShopifyInstallReturn(userId: string, storage?: Store): void {
  if (!hasEcommerceShopifyInstallReturn(userId, storage)) return;
  try { getStorage(storage)?.removeItem(KEY); } catch { /* ignore */ }
}

import { createHash,timingSafeEqual } from "node:crypto";
import type { ClaimedRecoveryDelivery } from "./checkoutRecoveryDeliveryWorker";

type Env = Record<string, string | undefined>;
export function commerceConnectionFingerprint(input:{accountId:string;shop:string;installationId:string;wabaId:string;phoneId:string;installedAt:unknown}):string{
  const installedAt=input.installedAt instanceof Date?input.installedAt.getTime():typeof input.installedAt==='number'?input.installedAt:Date.parse(String(input.installedAt));
  return createHash('sha256').update([input.accountId,input.shop,input.installationId,input.wabaId,input.phoneId,String(installedAt)].join('|')).digest('hex');
}
export type ProductionRecoveryScope = { accountId: string; shop: string; checkoutId: string; recipientHmac: string; expiresAt: number };
/** Receipt/consent scopes survive a send kill switch or expiry so late signed
 * receipts and STOP can still settle an already attempted message. */
export function productionRecoveryEvidenceScope(env: Env): Omit<ProductionRecoveryScope, "expiresAt"> | null {
  const accountId=env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID??"", shop=env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_SHOP??"";
  const checkoutId=env.ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID??"", recipientHmac=env.ECOMMERCE_RECOVERY_CONTROLLED_RECIPIENT_HMAC??"";
  return env.RAILWAY_ENVIRONMENT_NAME==="production"&&env.APP_URL?.replace(/\/$/,"")==="https://app.whachatcrm.com"&&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(accountId)&&
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)&&/^gid:\/\/shopify\/AbandonedCheckout\/[1-9][0-9]{0,19}$/.test(checkoutId)&&
    /^[a-f0-9]{64}$/.test(recipientHmac)?{accountId,shop,checkoutId,recipientHmac}:null;
}
/** Separate reviewed operator path. Existing staging and production observation
 * gates are unchanged. No wildcard, global cohort or merchant-supplied scope.
 */
export function readProductionRecoveryScope(env: Env, now = Date.now()): ProductionRecoveryScope | null {
  if (env.RAILWAY_ENVIRONMENT_NAME !== "production" || env.APP_URL?.replace(/\/$/, "") !== "https://app.whachatcrm.com" ||
      env.ECOMMERCE_RECOVERY_PRODUCTION_DELIVERY_APPROVED !== "true" ||
      env.ECOMMERCE_RECOVERY_WORKER_MODE !== "production-controlled-one-checkout" ||
      env.ECOMMERCE_RECOVERY_WORKER_ENABLED !== "true" || env.ECOMMERCE_RECOVERY_SEND_ENABLED !== "true" ||
      env.ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED !== "true" || env.ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED !== "true" ||
      env.ECOMMERCE_RECOVERY_RECEIPTS_ENABLED !== "true" || env.ECOMMERCE_RECOVERY_WEBHOOKS_VERIFIED !== "true" ||
      env.ECOMMERCE_RECOVERY_PRODUCTION_RECEIPTS_APPROVED !== "true" || env.ECOMMERCE_RECOVERY_PRODUCTION_CONSENT_APPROVED !== "true" ||
      env.ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED !== "true" ||
      (env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY?.length ?? 0) < 32) return null;
  const accountId = env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID ?? "";
  const shop = env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_SHOP ?? "";
  const checkoutId = env.ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID ?? "";
  const recipientHmac = env.ECOMMERCE_RECOVERY_CONTROLLED_RECIPIENT_HMAC ?? "";
  const expiry = env.ECOMMERCE_RECOVERY_CONTROLLED_EXPIRES_AT ?? "", expiresAt = Date.parse(expiry);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(accountId) ||
      !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ||
      !/^gid:\/\/shopify\/AbandonedCheckout\/[1-9][0-9]{0,19}$/.test(checkoutId) ||
      !/^[a-f0-9]{64}$/.test(recipientHmac) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(expiry) ||
      !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 60 * 60_000) return null;
  return { accountId, shop, checkoutId, recipientHmac, expiresAt };
}
export function productionRecoveryClaimAllowed(env: Env, claim: Pick<ClaimedRecoveryDelivery, "accountId" | "shop" | "checkoutId">): boolean {
  const scope = readProductionRecoveryScope(env);
  return !!scope && scope.accountId === claim.accountId && scope.shop === claim.shop && scope.checkoutId === claim.checkoutId;
}
export function productionRecoveryRecipientAllowed(env: Env, digest: string): boolean {
  const scope = readProductionRecoveryScope(env);
  return !!scope && /^[a-f0-9]{64}$/.test(digest) &&
    timingSafeEqual(Buffer.from(scope.recipientHmac, "hex"), Buffer.from(digest, "hex"));
}

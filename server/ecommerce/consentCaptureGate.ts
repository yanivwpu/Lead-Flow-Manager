import { commerceConnectionFingerprint } from './checkoutRecoveryProductionRelease';

type Env = Record<string, string | undefined>;
export type ConsentCaptureConnection = {
  accountId: string; shop: string; installationId: string; wabaId: string; phoneId: string; installedAt: unknown;
};
/** Operator-only, one merchant connection. No delivery, receipt, checkout or
 * preparation permission is implied. Reconnecting any identity invalidates it. */
export function productionConsentCaptureBlocker(env: Env, accountId: string, shop: string, connection?: string): string | null {
  if (env.RAILWAY_ENVIRONMENT_NAME !== 'production' || env.APP_URL?.replace(/\/$/, '') !== 'https://app.whachatcrm.com')
    return 'consent_capture_environment_required';
  if (env.ECOMMERCE_CONSENT_CAPTURE_PRODUCTION_APPROVED !== 'true') return 'consent_capture_pilot_required';
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.ECOMMERCE_CONSENT_CAPTURE_ACCOUNT_ID ?? '') ||
      !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(env.ECOMMERCE_CONSENT_CAPTURE_SHOP ?? '') ||
      env.ECOMMERCE_CONSENT_CAPTURE_ACCOUNT_ID !== accountId || env.ECOMMERCE_CONSENT_CAPTURE_SHOP !== shop)
    return 'consent_capture_merchant_required';
  if (!/^[a-f0-9]{64}$/.test(env.ECOMMERCE_CONSENT_CAPTURE_CONNECTION_SHA256 ?? '') ||
      !connection || env.ECOMMERCE_CONSENT_CAPTURE_CONNECTION_SHA256 !== connection)
    return 'consent_capture_connection_required';
  return null;
}
export function productionConsentCaptureAllowed(env: Env, current: ConsentCaptureConnection): boolean {
  const installedAt = current.installedAt instanceof Date ? current.installedAt.valueOf() :
    typeof current.installedAt === 'number' ? current.installedAt : Date.parse(String(current.installedAt));
  return (env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY?.length ?? 0) >= 32 && !!current.installationId && /^[1-9][0-9]{5,24}$/.test(current.wabaId) &&
    /^[1-9][0-9]{5,24}$/.test(current.phoneId) && Number.isFinite(installedAt) &&
    productionConsentCaptureBlocker(env, current.accountId, current.shop, commerceConnectionFingerprint(current)) === null;
}

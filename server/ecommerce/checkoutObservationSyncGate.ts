/**
 * Controlled staging-only manual preview sync. It is not an automation enablement.
 * No public endpoint, scheduled customer sends or additional Shopify subscription.
 */
export function checkoutObservationPreviewAvailable(env: {
  RAILWAY_ENVIRONMENT_NAME?: string;
  APP_URL?: string;
  ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED?: string;
}): boolean {
  return env.RAILWAY_ENVIRONMENT_NAME === 'staging' &&
    env.APP_URL?.replace(/\/$/, '') === 'https://whachatcrm-staging-app-staging.up.railway.app' &&
    env.ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED === 'true';
}
export function parseCheckoutObservationSyncRequest(value: unknown):
  { action: 'preview_sync'; after: string | null } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string,unknown>;
  if (obj.action !== 'preview_sync' ||
      !Object.keys(obj).every(k => k === 'action' || k === 'after') ||
      (obj.after !== undefined && obj.after !== null &&
      (typeof obj.after !== 'string' || obj.after.length < 1 || obj.after.length > 2048)))
    return null;
  return {action: 'preview_sync',after: typeof obj.after === 'string' ? obj.after : null};
}

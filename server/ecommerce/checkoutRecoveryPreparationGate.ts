/** Staging-only preparation of internal recovery REVIEW records.
 * No customer sends or recovery URL storage. Explicit opt-in at deployment
 * stays independent from merchant Shopify order-support activation.
 */
export function checkoutRecoveryPreparationEnabled(env: {
  RAILWAY_ENVIRONMENT_NAME?: string;
  APP_URL?: string;
  ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED?: string;
  ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED?: string;
}):boolean{
 return env.RAILWAY_ENVIRONMENT_NAME === 'staging' &&
   env.APP_URL?.replace(/\/$/,'') === 'https://whachatcrm-staging-app-staging.up.railway.app' &&
   env.ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED === 'true' &&
   env.ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED === 'true';
}
export function parsePrepareRecoveryRequest(body:unknown): boolean {
 if(!body || typeof body !== 'object' || Array.isArray(body)) return false;
 const o=body as Record<string,unknown>;
 return Object.keys(o).length===1 && o.action==='prepare_review';
}

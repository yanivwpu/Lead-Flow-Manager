/** Preparation-only, staging-only, one explicit workspace. No send flag exists. */
export function postPurchasePreparationEnabled(env:Record<string,string|undefined>,accountId?:string):boolean {
  return env.RAILWAY_ENVIRONMENT_NAME==='staging' &&
    env.APP_URL?.replace(/\/$/,'')==='https://whachatcrm-staging-app-staging.up.railway.app' &&
    env.ECOMMERCE_POST_PURCHASE_PREP_ENABLED==='true' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.ECOMMERCE_POST_PURCHASE_ACCOUNT_ID||'') &&
    (accountId===undefined || accountId===env.ECOMMERCE_POST_PURCHASE_ACCOUNT_ID);
}

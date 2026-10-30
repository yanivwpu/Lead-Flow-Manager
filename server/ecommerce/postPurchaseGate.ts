import {ecommercePilotAccountMatches} from './pilotAccess';
/** The production path is private and requires separate operator release approval.
 * Configuration alone is insufficient: merchant() also reloads the pinned owner.
 */
export function postPurchaseEnvironmentAllowed(env:Record<string,string|undefined>,accountId:string):boolean{
  return (env.RAILWAY_ENVIRONMENT_NAME==='staging'&&
    env.APP_URL?.replace(/\/$/,'')==='https://whachatcrm-staging-app-staging.up.railway.app') ||
    (env.ECOMMERCE_POST_PURCHASE_PRODUCTION_RELEASE_APPROVED==='true'&&
      ecommercePilotAccountMatches(accountId,env));
}
/** Preparation is independent of both merchant opt-in and the delivery switch. */
export function postPurchasePreparationEnabled(env:Record<string,string|undefined>,accountId?:string):boolean {
  return postPurchaseEnvironmentAllowed(env,env.ECOMMERCE_POST_PURCHASE_ACCOUNT_ID||'') &&
    env.ECOMMERCE_POST_PURCHASE_PREP_ENABLED==='true' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.ECOMMERCE_POST_PURCHASE_ACCOUNT_ID||'') &&
    (accountId===undefined || accountId===env.ECOMMERCE_POST_PURCHASE_ACCOUNT_ID);
}

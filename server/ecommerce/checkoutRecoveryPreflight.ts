/** Internal pilot read-only preflight. Never enables or executes a recovery. */
export type RecoveryPreflightEnv = {
  RAILWAY_ENVIRONMENT_NAME?:string;APP_URL?:string;
  ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED?:string;
  ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED?:string;
  ECOMMERCE_RECOVERY_AUTOPREP_ENABLED?:string;
  ECOMMERCE_RECOVERY_SEND_ENABLED?:string;
  ECOMMERCE_RECOVERY_WORKER_ENABLED?:string;
};
export const PILOT_RECOVERY_SHOP = 'whachatcrm.myshopify.com';
export function stagingRecoveryPreflightAllowed(env:RecoveryPreflightEnv,shop:string):boolean{
  return env.RAILWAY_ENVIRONMENT_NAME==='staging' &&
    env.APP_URL?.replace(/\/$/,'')==='https://whachatcrm-staging-app-staging.up.railway.app' &&
    shop===PILOT_RECOVERY_SHOP;
}
/** Expose booleans only, not credentials. A snapshot does not toggle these. */
export function recoveryAutomationFlags(env:RecoveryPreflightEnv){
  return {
    observationEnabled:env.ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED==='true',
    preparationEnabled:env.ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED==='true',
    autoprepEnabled:env.ECOMMERCE_RECOVERY_AUTOPREP_ENABLED==='true',
    sendEnabled:env.ECOMMERCE_RECOVERY_SEND_ENABLED==='true',
    workerEnabled:env.ECOMMERCE_RECOVERY_WORKER_ENABLED==='true',
  };
}

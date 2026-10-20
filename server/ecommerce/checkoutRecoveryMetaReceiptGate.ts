/** Pure staging-only delivery receipt flag; no database credentials needed. */
export function metaRecoveryReceiptCaptureEnabled(env:{
 RAILWAY_ENVIRONMENT_NAME?:string;APP_URL?:string;
 ECOMMERCE_RECOVERY_RECEIPTS_ENABLED?:string;
}):boolean{
 return env.RAILWAY_ENVIRONMENT_NAME==='staging' &&
   env.APP_URL?.replace(/\/$/,'')==='https://whachatcrm-staging-app-staging.up.railway.app' &&
   env.ECOMMERCE_RECOVERY_RECEIPTS_ENABLED==='true';
}

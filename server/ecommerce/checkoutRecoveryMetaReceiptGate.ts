import {productionRecoveryEvidenceScope} from './checkoutRecoveryProductionRelease';
/** Production evidence has its own operator approval and exact tenant scope. */
export function metaRecoveryReceiptCaptureEnabled(env:Record<string,string|undefined>):boolean{
 return (env.RAILWAY_ENVIRONMENT_NAME==='staging' &&
   env.APP_URL?.replace(/\/$/,'')==='https://whachatcrm-staging-app-staging.up.railway.app' &&
   env.ECOMMERCE_RECOVERY_RECEIPTS_ENABLED==='true')||
   (env.ECOMMERCE_RECOVERY_PRODUCTION_RECEIPTS_APPROVED==='true'&&env.ECOMMERCE_RECOVERY_RECEIPTS_ENABLED==='true'&&
    productionRecoveryEvidenceScope(env)!==null);
}

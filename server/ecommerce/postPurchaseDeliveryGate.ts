import {postPurchaseEnvironmentAllowed} from './postPurchaseGate';
/** Independent default-off gate; production additionally requires private release approval. */
export function postPurchaseDeliveryEnabled(
  env:Record<string,string|undefined>, accountId:string
):boolean{
  return postPurchaseEnvironmentAllowed(env,accountId)
    && env.ECOMMERCE_POST_PURCHASE_DELIVERY_ENABLED==='true'
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.ECOMMERCE_POST_PURCHASE_DELIVERY_ACCOUNT_ID||'')
    && accountId===env.ECOMMERCE_POST_PURCHASE_DELIVERY_ACCOUNT_ID;
}

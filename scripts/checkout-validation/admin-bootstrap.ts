import { SHOP, META, runValidation, selectionSchema, developmentStorefrontCredential } from './harness';
import { resolveReadOnlyCheckoutOwner } from './read-only-installation';
import { createCatalogRequest, type CatalogRequest } from '../../server/salesCatalog/shopify/api';
import { SHOPIFY_INVENTORY_BATCH_QUERY } from '../../server/salesCatalog/shopify/inventory';
import { VERIFY, STOREFRONT_API_VERSION } from '../../server/shopping/checkout/shopify';
import type { CatalogDb } from '../../server/salesCatalog/commerceStore';
import { railwayCheckoutModeAllowed } from './railway-guard';

export const BOOTSTRAP_PRODUCT='gid://shopify/Product/10108113912090';
export const BOOTSTRAP_VARIANT='gid://shopify/ProductVariant/51638768632090';

export function assertBootstrapCommand(args: string[], env: NodeJS.ProcessEnv=process.env) {
  // Emit only a fixed diagnostic code. Never log environment variable values.
  if(args.length!==1 || args[0]!=='--bootstrap-preflight') throw Error('preflight_guard_args');
  // Railway sets CI during deployments. Trust only the exact attested Railway service,
  // never CI alone; local/GitHub CI remains blocked by the mandatory service ID.
  if(!env.RAILWAY_SERVICE_ID) throw Error('preflight_guard_runtime_identity_missing');
  if(env.RAILWAY_SERVICE_ID !== 'cd3e14a1-c6a1-4532-8c67-8bc502d5aa07')
    throw Error('preflight_guard_runtime_identity_mismatch');
  if(env.CHECKOUT_TEST_RAILWAY_SERVICE_ID !== env.RAILWAY_SERVICE_ID)
    throw Error('preflight_guard_attestation_mismatch');
  if(env.CHECKOUT_TEST_PHASE !== 'PREFLIGHT') throw Error('preflight_guard_phase');
  if(!railwayCheckoutModeAllowed('--preflight',env)) throw Error('preflight_guard_not_allowed');
}

/** Exact read documents and variables only; no caller-supplied target or Admin mutation. */
export function bootstrapAdminRequest(shop: string, token: string, requestFetch: typeof fetch): CatalogRequest {
  if(shop!==SHOP || !token.trim() || token!==token.trim()) throw Error('admin_credentials_required');
  return createCatalogRequest({request:async(query,options)=>{
    const variables=options?.variables;
    if(!((query===META && variables===undefined) ||
      (query===SHOPIFY_INVENTORY_BATCH_QUERY && JSON.stringify(variables)===JSON.stringify({ids:[BOOTSTRAP_VARIANT]}))))
      throw Error('admin_read_not_allowed');
    const response=await requestFetch(`https://${SHOP}/admin/api/2026-01/graphql.json`,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},
      body:JSON.stringify({query,variables}),
    });
    if(!response.ok || response.headers.get('x-shopify-api-version')!=='2026-01') throw Error('admin_unavailable');
    return response.json();
  }});
}

/** Fence at dispatch: even an accidental provider mutation cannot reach Shopify. */
export function bootstrapStorefrontFetch(requestFetch: typeof fetch): typeof fetch {
  return (async(input,init)=>{
    if(input!==`https://${SHOP}/api/${STOREFRONT_API_VERSION}/graphql.json` ||
       init?.method!=='POST' || init.redirect!=='error' || typeof init.body!=='string')
      throw Error('storefront_read_not_allowed');
    const body=JSON.parse(init.body);
    if(Object.keys(body).sort().join(',')!=='query,variables' || body.query!==VERIFY ||
       JSON.stringify(body.variables)!==JSON.stringify({id:BOOTSTRAP_VARIANT}))
      throw Error('storefront_read_not_allowed');
    return requestFetch(input,init);
  }) as typeof fetch;
}

/** No approval parameter, no claim, no receipt. Save only after existing provider verification passes. */
export async function bootstrapAdminPreflight(deps: {
  database: CatalogDb;
  requestFetch: typeof fetch;
  env: NodeJS.ProcessEnv;
  saveSelection: (selection: import('./harness').Selection)=>Promise<void>;
}) {
  const credential=developmentStorefrontCredential(deps.env);
  const install=await resolveReadOnlyCheckoutOwner(deps.database);
  const request=bootstrapAdminRequest(install.shop,install.token,deps.requestFetch);
  const data=await request(SHOPIFY_INVENTORY_BATCH_QUERY,{ids:[BOOTSTRAP_VARIANT]});
  if(!Array.isArray(data?.nodes) || data.nodes.length!==1 || data.nodes[0]?.id!==BOOTSTRAP_VARIANT ||
     data.nodes[0]?.product?.id!==BOOTSTRAP_PRODUCT || data.shop?.myshopifyDomain!==SHOP)
    throw Error('bootstrap_selection_identity');
  const variant=data.nodes[0];
  // Parse the complete live selection; no cached amount, default currency or option fallback.
  const selection=selectionSchema.parse({shop:SHOP,userId:install.userId,productId:BOOTSTRAP_PRODUCT,
    variantId:BOOTSTRAP_VARIANT,quantity:1,price:variant.price,currency:data.shop.currencyCode,
    options:variant.selectedOptions});
  const denied=async()=>{throw Error('preflight_mutation_not_allowed');};
  const result=await runValidation(selection,{
    installation:async()=>{
      const current=await resolveReadOnlyCheckoutOwner(deps.database);
      if(current.userId!==install.userId || current.integrationId!==install.integrationId || current.token!==install.token)
        throw Error('installation_changed');
      return current;
    },
    requestFor:(shop,token)=>bootstrapAdminRequest(shop,token,deps.requestFetch),
    storefrontCredential:credential,storefrontFetch:bootstrapStorefrontFetch(deps.requestFetch),
    consume:denied,saveReceipt:denied,
  });
  await deps.saveSelection(selection);
  return {result:result.result,selectionSha256:result.selectionSha256};
}

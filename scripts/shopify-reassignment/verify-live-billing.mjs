// Run ONLY inside the existing production app service. No new service/credential export.
import pg from 'pg';
export const BILLING_QUERY = `query ReassignmentReadOnlyBilling {
  shop { myshopifyDomain }
  currentAppInstallation { app { apiKey } activeSubscriptions {
    id name status test currentPeriodEnd
    lineItems { plan { pricingDetails { ... on AppRecurringPricing { interval price { amount currencyCode } } } } }
  } }
}`;
export async function verifyBilling({token, expectedCharge, fetchImpl=fetch}) {
  const response=await fetchImpl('https://whachatcrm.myshopify.com/admin/api/2026-01/graphql.json',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},
    body:JSON.stringify({query:BILLING_QUERY})});
  if(!response.ok) throw Error('SHOPIFY_BILLING_HTTP_'+response.status);
  const body=await response.json();
  const installation=body.data?.currentAppInstallation;
  if(body.errors || body.data?.shop?.myshopifyDomain!=='whachatcrm.myshopify.com' ||
    installation?.app?.apiKey!=='e4585d4da1434c9e5649a2269e716076' || !Array.isArray(installation.activeSubscriptions))
    throw Error('SHOPIFY_BILLING_IDENTITY_OR_RESPONSE_INVALID');
  const subscriptions=installation.activeSubscriptions;
  if(subscriptions.some(s=>!s.id || s.status!=='ACTIVE' || typeof s.test!=='boolean' || !Array.isArray(s.lineItems)))
    throw Error('SHOPIFY_BILLING_INCOMPLETE');
  const expected=String(expectedCharge).split('/').at(-1);
  const primary=subscriptions.find(s=>s.id.split('/').at(-1)===expected);
  if(!primary) throw Error('SHOPIFY_BILLING_CHARGE_MISMATCH');
  if(!primary.lineItems.length || primary.lineItems.some(item=>{
    const price=item.plan?.pricingDetails;
    return !price?.interval || typeof price.price?.amount!=='string' || !price.price.currencyCode;
  })) throw Error('SHOPIFY_BILLING_PRICE_INCOMPLETE');
  return {verifiedAt:new Date().toISOString(),shop:'whachatcrm.myshopify.com',app:'production',subscriptions};
}
async function main(){
  if(process.env.RAILWAY_SERVICE_ID!=='a7b75139-5bf8-4a02-b4ab-b7d12e17e770' || process.env.RAILWAY_ENVIRONMENT_NAME!=='production')
    throw Error('EXISTING_PRODUCTION_SERVICE_REQUIRED');
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
  const client=await pool.connect();
  let token,expectedCharge;
  try{
    await client.query('BEGIN READ ONLY');
    const result=await client.query("SELECT shopify_access_token,shopify_charge_id FROM users WHERE id=$1 AND shopify_shop=$2",[
      '271c48f9-3515-4682-b391-2fead371593d','whachatcrm.myshopify.com']);
    if(result.rows.length!==1 || !result.rows[0].shopify_access_token || !result.rows[0].shopify_charge_id) throw Error('SOURCE_INSTALLATION_UNAVAILABLE');
    token=result.rows[0].shopify_access_token; expectedCharge=result.rows[0].shopify_charge_id;
    await client.query('ROLLBACK');
  }finally{client.release();await pool.end();}
  const verified=await verifyBilling({token,expectedCharge});
  token=undefined;
  console.log(JSON.stringify(verified,null,2));
}
if(process.argv[1]?.endsWith('/verify-live-billing.mjs')) main().catch(()=>{console.error('LIVE_BILLING_VERIFICATION_FAILED: no credentials or provider payload logged');process.exitCode=1;});

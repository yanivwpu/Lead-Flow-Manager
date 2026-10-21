/** READ-ONLY exact test-store Shopify+PostgreSQL probe. Never sends or creates carts. */
import {Pool} from 'pg';
import {fetchShopifyAbandonedCheckoutPage} from '../server/ecommerce/abandonedCheckoutSource';
import {recheckShopifyCheckoutForRecovery} from '../server/ecommerce/checkoutFreshRecheck';
const SHOP='whachatcrm.myshopify.com';
async function main(){
 if(process.env.RAILWAY_PROJECT_ID!=='1d22ff35-a259-4977-9375-377dda1cdd2b' ||
    process.env.RAILWAY_ENVIRONMENT_ID!=='43e4c163-6da9-4be5-ad93-0a3534234613' ||
    process.env.RAILWAY_ENVIRONMENT_NAME!=='staging' ||
    process.env.RECOVERY_TEST_SHOP!==SHOP ||
    process.env.RECOVERY_TEST_READONLY_APPROVED!=='true' ||
    !process.env.DATABASE_URL)throw Error('readonly_staging_test_guard_missing');
 const uri=new URL(process.env.DATABASE_URL);
 if(uri.pathname!=='/railway'||!uri.hostname.endsWith('.railway.internal'))
   throw Error('wrong_database_target');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,
   connectionTimeoutMillis:8000,max:1});
 const report={
   store:SHOP,mode:'read_only_no_send',merchantUnique:false,schemaReady:false,
   abandonedCheckoutAccess:'unverified',observedCheckouts:0,
   exactCheckoutStatus:'not_selected',purchaseStopped:null as boolean|null,
   signedWhatsAppConsent:'not_tested',outboundMessageSent:false,
   checkoutCreated:false
 };
 try{
   const owner=await pool.query('SELECT id,shopify_access_token FROM users WHERE shopify_shop=$1 AND shopify_access_token IS NOT NULL LIMIT 2',[SHOP]);
   if(owner.rows.length!==1)throw Error('test_merchant_identity_missing_or_ambiguous');
   report.merchantUnique=true;
   const accountId=String(owner.rows[0].id);
   const token=String(owner.rows[0].shopify_access_token);
   const schema=await pool.query("SELECT to_regclass('public.ecommerce_abandoned_checkout_observations') IS NOT NULL AS observations,to_regclass('public.ecommerce_checkout_recovery_intents') IS NOT NULL AS intents,to_regclass('public.ecommerce_whatsapp_recovery_consents') IS NOT NULL AS consents,to_regclass('public.ecommerce_checkout_recovery_outbox') IS NOT NULL AS outbox");
   report.schemaReady=Object.values(schema.rows[0]).every(v=>v===true);
   if(!report.schemaReady)throw Error('recovery_migrations_not_applied');
   // Shopify's access gate requires read_orders plus manage_abandoned_checkouts.
   const page=await fetchShopifyAbandonedCheckoutPage({shop:SHOP,accessToken:token});
   report.abandonedCheckoutAccess='confirmed';
   report.observedCheckouts=page.observations.length;
   const checkoutId=process.env.RECOVERY_TEST_CHECKOUT_GID;
   if(checkoutId){
     if(!/^gid:\/\/shopify\/AbandonedCheckout\/[1-9][0-9]{0,19}$/.test(checkoutId))
       throw Error('approved_checkout_id_invalid');
     const fresh=await recheckShopifyCheckoutForRecovery({shop:SHOP,accessToken:token,checkoutId});
     report.exactCheckoutStatus=fresh.status;
     report.purchaseStopped=fresh.status==='blocked'?fresh.completed:false;
     if(fresh.status==='eligible_for_review'){
       const consent=await pool.query("SELECT count(*)::int AS total FROM ecommerce_whatsapp_recovery_consents WHERE account_id=$1 AND shop=$2 AND shopify_customer_gid=$3 AND revoked_at IS NULL AND evidence_source='verified_whatsapp_explicit_opt_in'",[accountId,SHOP,fresh.shopifyCustomerId]);
       report.signedWhatsAppConsent=Number(consent.rows[0].total)===1?'present':'absent';
     }
   }
   console.log('ECOMMERCE_STAGING_READONLY_SMOKE '+JSON.stringify(report));
 }finally{await pool.end();}
}
main().catch(e=>{
 console.error('ECOMMERCE_STAGING_READONLY_BLOCKED',e instanceof Error?e.message:'unavailable');
 process.exitCode=1;
});

import {sql} from 'drizzle-orm';
import {getEffectivePlanForUser} from '../../shared/trialEntitlements';
import {commerceConnectionFingerprint} from './checkoutRecoveryProductionRelease';
import type {TemplateTx} from './shopifyTemplateProvisioning';

type Env=Record<string,string|undefined>;
export type MerchantConnection={accountId:string;shop:string;installationId:string;fingerprint:string;config:Record<string,unknown>};
export const record=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
/** Public merchants never inherit (or bypass) the internal store's operator release.
 * Existing deployment switches remain exclusively on the legacy pilot paths. */
export function merchantProductionAvailable(env:Env,accountId?:string,shop?:string):boolean{
  return env.RAILWAY_ENVIRONMENT_NAME==='production'&&env.APP_URL?.replace(/\/$/,'')==='https://app.whachatcrm.com'&&
    (env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY?.length??0)>=32&&
    (!accountId||accountId!==env.ECOMMERCE_PILOT_WORKSPACE_ID)&&shop!=='whachatcrm-live-test.myshopify.com';
}
export function merchantReleaseCurrent(env:Env,m:MerchantConnection):boolean{
  const release=record(m.config.ecommerceMerchantRelease);
  return merchantProductionAvailable(env,m.accountId,m.shop)&&release.version===1&&release.connection===m.fingerprint&&
    typeof release.authorizedAt==='string'&&Number.isFinite(Date.parse(release.authorizedAt))&&Date.parse(release.authorizedAt)<=Date.now();
}
/** Call under the existing shop advisory lock for mutations/provider IO. Reloads
 * ownership, entitlement, installation, engine activation and current Meta binding.
 * Never trusts an outbox snapshot or caller-supplied merchant configuration. */
export async function loadMerchantRelease(tx:TemplateTx,env:Env,accountId:string,kind?:'postPurchase'|'checkoutRecovery'):Promise<MerchantConnection|null>{
  if(!merchantProductionAvailable(env,accountId))return null;
  const owners=await tx.execute(sql`SELECT u.* FROM users u WHERE id=${accountId} FOR SHARE`);
  const u=owners.rows[0];if(owners.rows.length!==1||!u||u.deletion_requested_at||!u.shopify_access_token||
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(String(u.shopify_shop))||
    ['uninstalled','redacted'].includes(String(u.shopify_subscription_status).toLowerCase())||
    !merchantProductionAvailable(env,accountId,String(u.shopify_shop))||
    getEffectivePlanForUser({billingPlan:u.billing_plan,subscriptionStatus:u.subscription_status,planOverrideEnabled:u.plan_override_enabled,
      planOverride:u.plan_override,trialEndsAt:u.trial_ends_at,trialStatus:u.trial_status,trialPlan:u.trial_plan,shopifyShop:u.shopify_shop,
      shopifySubscriptionStatus:u.shopify_subscription_status} as Parameters<typeof getEffectivePlanForUser>[0])!=='pro'||
    u.meta_connected!==true||!u.meta_access_token||u.whatsapp_provider==='twilio'||
    !/^[1-9][0-9]{0,30}$/.test(String(u.meta_business_account_id))||!/^[1-9][0-9]{0,30}$/.test(String(u.meta_phone_number_id))||
    (u.meta_token_expires_at!=null&&!(new Date(String(u.meta_token_expires_at)).getTime()>Date.now())))return null;
  const installedAt=u.shopify_installed_at instanceof Date?u.shopify_installed_at.getTime():Date.parse(String(u.shopify_installed_at));
  if(!Number.isFinite(installedAt))return null;
  const installations=await tx.execute(sql`SELECT id,config FROM integrations WHERE user_id=${accountId} AND type='shopify' AND is_active IS TRUE LIMIT 2 FOR SHARE`);
  if(installations.rows.length!==1)return null;
  const installation=installations.rows[0],config=record(installation.config),shop=String(u.shopify_shop);
  if([config.shop,config.shopUrl].some(v=>v!=null&&v!==shop))return null;
  const activation=await tx.execute(sql`SELECT account_id FROM ecommerce_shopify_workspace_activations
    WHERE account_id=${accountId} AND installation_id=${installation.id} AND shop=${shop}
      AND (SELECT count(*) FROM users WHERE shopify_shop=${shop})=1 LIMIT 1`);
  if(activation.rows.length!==1)return null;
  const m={accountId,shop,installationId:String(installation.id),config,fingerprint:commerceConnectionFingerprint({accountId,shop,
    installationId:String(installation.id),wabaId:String(u.meta_business_account_id),phoneId:String(u.meta_phone_number_id),installedAt})};
  if(!merchantReleaseCurrent(env,m)||(kind&&!Number.isFinite(merchantActivationTime(config,kind)))||(kind&&config[kind==='postPurchase'?'ecommercePostPurchaseDeliveryEnabled':'ecommerceCheckoutRecoveryDeliveryEnabled']!==true)||
    (kind&&config[kind==='postPurchase'?'ecommercePostPurchaseDeliveryConnection':'ecommerceCheckoutRecoveryDeliveryConnection']!==m.fingerprint))return null;
  return m;
}

/** Consent and events from an older connection never authorize the new one. */
export function merchantActivationTime(config:Record<string,unknown>,kind:'postPurchase'|'checkoutRecovery'):number{
  const release=Date.parse(String(record(config.ecommerceMerchantRelease).authorizedAt));
  const enabled=Date.parse(String(config[kind==='postPurchase'?'ecommercePostPurchaseActivatedAt':'ecommerceCheckoutRecoveryActivatedAt']));
  return Number.isFinite(release)&&Number.isFinite(enabled)?Math.max(release,enabled):NaN;
}

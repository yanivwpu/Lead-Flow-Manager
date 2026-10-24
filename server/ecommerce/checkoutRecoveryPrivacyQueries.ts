import { sql } from 'drizzle-orm';

/** Optional tables: these migrations have not necessarily been applied.
 * Every query is tenant/shop scoped and intended to run under the existing
 * Shopify privacy advisory transaction lock (never from an unauthenticated route).
 */
export const checkoutRecoveryPrivacyTablesQuery=sql`
  SELECT
    to_regclass('public.ecommerce_abandoned_checkout_observations') IS NOT NULL AS observations,
    to_regclass('public.ecommerce_checkout_recovery_intents') IS NOT NULL AS intents,
    to_regclass('public.ecommerce_checkout_recovery_outbox') IS NOT NULL AS outbox,
    to_regclass('public.ecommerce_whatsapp_recovery_consents') IS NOT NULL AS consents
`;
export type RecoveryTableAvailability={
  observations:boolean;intents:boolean;outbox:boolean;consents:boolean;
};
export function parseRecoveryTableAvailability(row:Record<string,unknown>|undefined):RecoveryTableAvailability{
 return {observations:row?.observations===true,intents:row?.intents===true,
  outbox:row?.outbox===true,consents:row?.consents===true};
}
function validateShop(shop:string){
 if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw Error('invalid_recovery_privacy_shop');
}
/** HMAC-verified store redaction: erase pseudonymous identifiers as well as opt-in
 * records. Deletes child/outbox records before their parent intent rows.
 */
export function recoveryStoreErasureQueries(shop:string,tables:RecoveryTableAvailability){
 validateShop(shop);
 const results=[];
 if(tables.outbox)results.push(sql`DELETE FROM ecommerce_checkout_recovery_outbox WHERE shop=${shop}`);
 if(tables.consents)results.push(sql`DELETE FROM ecommerce_whatsapp_recovery_consents WHERE shop=${shop}`);
 if(tables.intents)results.push(sql`DELETE FROM ecommerce_checkout_recovery_intents WHERE shop=${shop}`);
 if(tables.observations)results.push(sql`DELETE FROM ecommerce_abandoned_checkout_observations WHERE shop=${shop}`);
 return results;
}
/** Uninstall immediately revokes all recovery opt-in and cancels unsent work.
 * Retained records remain eligible for later shop/redact, not reinstallation.
 */
export function recoveryUninstallQueries(accountId:string,shop:string,tables:RecoveryTableAvailability){
 validateShop(shop);
 if(!accountId?.trim()||accountId.length>128)throw Error('invalid_recovery_privacy_account');
 const results=[];
 if(tables.outbox)results.push(sql`
   UPDATE ecommerce_checkout_recovery_outbox SET state='suppressed',updated_at=NOW()
   WHERE account_id=${accountId} AND shop=${shop} AND state='pending'`);
 if(tables.consents)results.push(sql`
   UPDATE ecommerce_whatsapp_recovery_consents SET revoked_at=NOW()
   WHERE account_id=${accountId} AND shop=${shop} AND revoked_at IS NULL`);
 return results;
}
/** On signed customer/redact, delete matching consent + outbox data for a
 * verified Shopify customer GID and/or tenant-owned contact ID. No guessed
 * phone/email cross-matching is performed here.
 */
export function recoveryCustomerErasureQueries(input:{
 accountId:string;shop:string;contactIds:string[];shopifyCustomerIds:string[];
},tables:RecoveryTableAvailability){
 validateShop(input.shop);
 if(!input.accountId?.trim()||input.accountId.length>128)throw Error('invalid_recovery_privacy_account');
 const contactIds=[...new Set(input.contactIds.filter(id=>typeof id==='string'&&id.trim()&&id.length<=128))];
 const customerGids=[...new Set(input.shopifyCustomerIds.filter(
  id=>/^[1-9][0-9]{0,19}$/.test(id)).map(id=>'gid://shopify/Customer/'+id))];
 if(!contactIds.length&&!customerGids.length)return [];
 const idMatch=contactIds.length ? sql`o.contact_id IN (${sql.join(contactIds.map(id=>sql`${id}`),sql`, `)})` : sql`FALSE`;
 const customerMatch=tables.consents&&customerGids.length ? sql`EXISTS(
   SELECT 1 FROM ecommerce_whatsapp_recovery_consents c
   WHERE c.account_id=o.account_id AND c.shop=o.shop
     AND c.contact_id=o.contact_id
     AND c.shopify_customer_gid IN (${sql.join(customerGids.map(id=>sql`${id}`),sql`, `)})
 )` : sql`FALSE`;
 const results=[];
 if(tables.outbox)results.push(sql`
   DELETE FROM ecommerce_checkout_recovery_outbox o
   WHERE o.account_id=${input.accountId} AND o.shop=${input.shop}
     AND (${idMatch} OR ${customerMatch})`);
 if(tables.consents){
   const contactMatch=contactIds.length ? sql`contact_id IN (${sql.join(contactIds.map(id=>sql`${id}`),sql`, `)})` : sql`FALSE`;
   const customerConsentMatch=customerGids.length ? sql`shopify_customer_gid IN (${sql.join(customerGids.map(id=>sql`${id}`),sql`, `)})` : sql`FALSE`;
   results.push(sql`
     DELETE FROM ecommerce_whatsapp_recovery_consents
     WHERE account_id=${input.accountId} AND shop=${input.shop}
       AND (${contactMatch} OR ${customerConsentMatch})`);
 }
 return results;
}

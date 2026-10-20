import {sql} from 'drizzle-orm';
import {recoveryPhoneDigest} from './checkoutRecoveryMessagingEligibility';
const SHOP=/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const CUSTOMER=/^gid:\/\/shopify\/Customer\/[1-9][0-9]{0,19}$/;
type Base={
 accountId:string;shop:string;phone:string;eventAt:Date;wamid:string;secret:string
};
function checked(x:Base){
 if(!x.accountId?.trim()||x.accountId.length>128||!SHOP.test(x.shop)||
    !(x.eventAt instanceof Date)||!Number.isFinite(x.eventAt.valueOf())||
    !/^wamid\.[A-Za-z0-9._-]{8,250}$/.test(x.wamid))
   throw Error('invalid_recovery_inbound_consent_evidence');
 return recoveryPhoneDigest(x.secret,x.phone);
}
/** Only after a signed Meta webhook, exact ownership, canonical Shopify contact
 * mapping, distinct CRM phone and fresh timestamp. No merchant route creates this.
 * An older event or replay cannot undo a newer STOP.
 */
export function grantSignedRecoveryConsentQuery(x:Base &{
 contactId:string;shopifyCustomerId:string;whatsappId:string
}){
 const digest=checked(x);
 if(!x.contactId?.trim()||x.contactId.length>128 ||
    !CUSTOMER.test(x.shopifyCustomerId)||
    '+'+x.whatsappId!==x.phone) throw Error('invalid_recovery_consent_customer');
 const numericId=x.shopifyCustomerId.slice('gid://shopify/Customer/'.length);
 return sql`
 INSERT INTO ecommerce_whatsapp_recovery_consents AS existing
  (account_id,shop,contact_id,shopify_customer_gid,purpose,channel,
   evidence_source,recipient_hmac,granted_at,revoked_at,
   last_verified_inbound_at,last_verified_wamid)
 SELECT c.user_id,${x.shop},c.id,${x.shopifyCustomerId},
  'checkout_recovery','whatsapp','verified_whatsapp_explicit_opt_in',
  ${digest},${x.eventAt},NULL,${x.eventAt},${x.wamid}
 FROM contacts c
 WHERE c.id=${x.contactId} AND c.user_id=${x.accountId}
   AND c.phone=${x.phone} AND c.whatsapp_id=${x.whatsappId}
   AND COALESCE(c.custom_fields->>'shopifyCustomerId',
                c.source_details->>'shopifyCustomerId')=${numericId}
   AND COALESCE(c.custom_fields->>'shopifyShop',
                c.source_details->>'shop')=${x.shop}
   AND c.automations_paused=FALSE
   AND LOWER(COALESCE(c.custom_fields->>'doNotContact','false'))<>'true'
   AND LOWER(COALESCE(c.custom_fields->>'marketingOptIn','true'))<>'false'
 ON CONFLICT (account_id,shop,contact_id) DO UPDATE SET
   shopify_customer_gid=EXCLUDED.shopify_customer_gid,
   evidence_source=EXCLUDED.evidence_source,
   recipient_hmac=EXCLUDED.recipient_hmac,
   granted_at=EXCLUDED.granted_at,
   revoked_at=NULL,
   last_verified_inbound_at=EXCLUDED.last_verified_inbound_at,
   last_verified_wamid=EXCLUDED.last_verified_wamid
 WHERE existing.last_verified_inbound_at IS NULL OR
       existing.last_verified_inbound_at < EXCLUDED.last_verified_inbound_at
 RETURNING contact_id
 `;
}
/** STOP applies even when inbound CRM identity wasn't merged to Shopify.
 * The signed Meta sender number matches an HMAC of the original consent
 * recipient. Scope is still the verified Meta-owned tenant and Shopify shop.
 * No consent may be regranted from an old message delivered out-of-order.
 */
export function revokeSignedRecoveryConsentQuery(x:Base){
 const digest=checked(x);
 return sql`
 UPDATE ecommerce_whatsapp_recovery_consents
 SET revoked_at=${x.eventAt},
     last_verified_inbound_at=${x.eventAt},
     last_verified_wamid=${x.wamid}
 WHERE account_id=${x.accountId} AND shop=${x.shop}
   AND recipient_hmac=${digest}
   AND (last_verified_inbound_at IS NULL OR last_verified_inbound_at < ${x.eventAt})
 RETURNING contact_id
 `;
}
export function suppressRecoveryOutboxByContactQuery(x:{accountId:string;shop:string;contactIds:string[]}){
 if(!x.accountId?.trim()||!SHOP.test(x.shop)||
    !Array.isArray(x.contactIds)||x.contactIds.some(i=>typeof i!=='string'||!i||i.length>128))
   throw Error('invalid_recovery_stop_scope');
 if(!x.contactIds.length)return null;
 return sql`
 UPDATE ecommerce_checkout_recovery_outbox
 SET state='suppressed',updated_at=NOW()
 WHERE account_id=${x.accountId} AND shop=${x.shop}
   AND contact_id IN (${sql.join(x.contactIds.map(i=>sql`${i}`),sql`, `)})
   AND state='pending'
 RETURNING id
 `;
}

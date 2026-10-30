import {sql} from 'drizzle-orm';
import {POST_PURCHASE_JOURNEYS,type PostPurchaseJourney} from '../../shared/postPurchase';
import {verifiedCommerceConsentText,validRecoveryWamid,type VerifiedInboundConsentCandidate} from './checkoutRecoveryInboundConsentGate';
import {recoveryPhoneDigest} from './checkoutRecoveryMessagingEligibility';
export const POST_PURCHASE_CONSENT_PHRASES:Record<PostPurchaseJourney,string>={
  orderConfirmation:'YES WHATSAPP ORDER CONFIRMATIONS',fulfillmentUpdate:'YES WHATSAPP SHIPPING UPDATES',
  cancellation:'YES WHATSAPP CANCELLATION NOTICES',reviewRequest:'YES WHATSAPP REVIEW REQUESTS',
  repeatPurchase:'YES WHATSAPP REPEAT PURCHASE OFFERS',winBack:'YES WHATSAPP WIN BACK OFFERS',
};
export function classifyPostPurchaseConsent(candidate:VerifiedInboundConsentCandidate,now=Date.now()){
  const proof=verifiedCommerceConsentText(candidate,now);if(!proof)return null;
  if(['STOP','UNSUBSCRIBE','STOP POST PURCHASE MESSAGES'].includes(proof.normalized))return {...proof,action:'revoke' as const};
  const journey=POST_PURCHASE_JOURNEYS.find(j=>POST_PURCHASE_CONSENT_PHRASES[j]===proof.normalized);
  return journey?{...proof,action:'grant' as const,journey}:null;
}
export type SignedPostPurchaseConsent={accountId:string;shop:string;phone:string;secret:string;at:Date;wamid:string};
function digest(input:SignedPostPurchaseConsent){
  if(!input.accountId||!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(input.shop)||
    !Number.isFinite(input.at.valueOf())||!validRecoveryWamid(input.wamid))throw Error('invalid_post_purchase_consent');
  return recoveryPhoneDigest(input.secret,input.phone);
}
export function grantPostPurchaseConsentQuery(input:SignedPostPurchaseConsent&{journey:PostPurchaseJourney;contactId:string;customerId:string}){
  const hmac=digest(input);
  if(!POST_PURCHASE_JOURNEYS.includes(input.journey)||!/^gid:\/\/shopify\/Customer\/[1-9][0-9]{0,19}$/.test(input.customerId))throw Error('invalid_post_purchase_purpose');
  return sql`INSERT INTO ecommerce_post_purchase_consents AS current
    (account_id,shop,recipient_hmac,purpose,contact_id,customer_gid,granted_at,revoked_at,last_inbound_at,last_wamid)
    SELECT ${input.accountId},${input.shop},${hmac},${input.journey},c.id,${input.customerId},${input.at},NULL,${input.at},${input.wamid}
    FROM contacts c WHERE c.id=${input.contactId} AND c.user_id=${input.accountId}
      AND c.phone=${input.phone} AND c.whatsapp_id=substring(${input.phone} FROM 2)
      AND COALESCE(c.custom_fields->>'shopifyCustomerId',c.source_details->>'shopifyCustomerId')=${input.customerId.slice('gid://shopify/Customer/'.length)}
      AND COALESCE(c.custom_fields->>'shopifyShop',c.source_details->>'shop')=${input.shop}
    ON CONFLICT(account_id,shop,recipient_hmac,purpose) DO UPDATE SET
      contact_id=EXCLUDED.contact_id,customer_gid=EXCLUDED.customer_gid,granted_at=EXCLUDED.granted_at,
      revoked_at=NULL,last_inbound_at=EXCLUDED.last_inbound_at,last_wamid=EXCLUDED.last_wamid
    WHERE current.last_inbound_at<EXCLUDED.last_inbound_at RETURNING purpose`;
}
/** Includes a tombstone for purposes never granted; an older first grant cannot bypass STOP. */
export function revokePostPurchaseConsentQuery(input:SignedPostPurchaseConsent){
  const hmac=digest(input);
  return sql`INSERT INTO ecommerce_post_purchase_consents AS current
    (account_id,shop,recipient_hmac,purpose,revoked_at,last_inbound_at,last_wamid)
    SELECT ${input.accountId},${input.shop},${hmac},purpose,${input.at},${input.at},${input.wamid}
    FROM unnest(ARRAY[${sql.join(POST_PURCHASE_JOURNEYS.map(x=>sql`${x}::varchar`),sql`, `)}]) purpose
    ON CONFLICT(account_id,shop,recipient_hmac,purpose) DO UPDATE SET
      revoked_at=EXCLUDED.revoked_at,last_inbound_at=EXCLUDED.last_inbound_at,last_wamid=EXCLUDED.last_wamid
    WHERE current.last_inbound_at<=EXCLUDED.last_inbound_at RETURNING purpose,contact_id`;
}

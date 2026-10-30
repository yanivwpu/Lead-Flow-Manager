import {sql} from 'drizzle-orm';
import type {PostPurchaseJourney} from '../../shared/postPurchase';
import type {FreshPostPurchaseOrder,PostPurchaseOrderEvent} from './postPurchaseOrder';
export const postPurchaseTablesQuery=sql`SELECT
  to_regclass('ecommerce_post_purchase_intents') IS NOT NULL AS intents,
  to_regclass('ecommerce_post_purchase_orders') IS NOT NULL AS orders,
  to_regclass('ecommerce_post_purchase_consents') IS NOT NULL AS consents`;
export type PostPurchaseTables={intents:boolean;orders:boolean;consents:boolean};
export function postPurchaseTables(row:Record<string,unknown>|undefined):PostPurchaseTables{
  return {intents:row?.intents===true,orders:row?.orders===true,consents:row?.consents===true};
}
export type PostPurchaseMerchant={accountId:string;shop:string;installationId:string};
export function upsertPostPurchaseOrderQuery(m:PostPurchaseMerchant,order:FreshPostPurchaseOrder){
  return sql`INSERT INTO ecommerce_post_purchase_orders AS current
    (account_id,installation_id,shop,order_gid,customer_gid,status,source_updated_at)
    VALUES(${m.accountId},${m.installationId},${m.shop},${order.orderId},${order.customerId},${order.status},${new Date(order.updatedAt)})
    ON CONFLICT(account_id,shop,order_gid) DO UPDATE SET
      status=EXCLUDED.status,source_updated_at=EXCLUDED.source_updated_at
    WHERE current.installation_id=EXCLUDED.installation_id AND current.customer_gid=EXCLUDED.customer_gid
      AND current.source_updated_at<=EXCLUDED.source_updated_at
      AND (current.status<>'cancelled' OR EXCLUDED.status='cancelled')
      AND (current.status<>'fulfilled' OR EXCLUDED.status<>'open')
    RETURNING order_gid`;
}
/** Atomic unique order/journey fence, independent of delivery-ID retries. Never revive terminal work. */
export function insertPostPurchaseIntentQuery(m:PostPurchaseMerchant,event:PostPurchaseOrderEvent,input:{
  eventId:string;journey:PostPurchaseJourney;dueAt:number;contactId:string|null;
}){
  return sql`INSERT INTO ecommerce_post_purchase_intents
    (account_id,installation_id,shop,order_gid,customer_gid,contact_id,event_id,topic,occurred_at,journey,due_at,state,reasons)
    SELECT ${m.accountId},${m.installationId},${m.shop},${event.orderId},${event.customerId},${input.contactId},
      ${input.eventId}::bigint,${event.topic},${new Date(event.occurredAt)},${input.journey},${new Date(input.dueAt)},'blocked','["eligibility_recheck_required"]'::jsonb
    WHERE EXISTS(SELECT 1 FROM ecommerce_post_purchase_orders WHERE account_id=${m.accountId} AND shop=${m.shop}
      AND order_gid=${event.orderId} AND customer_gid=${event.customerId} AND installation_id=${m.installationId})
      AND EXISTS(SELECT 1 FROM ecommerce_growth_event_inbox WHERE id=${input.eventId}::bigint
        AND account_id=${m.accountId} AND shop=${m.shop} AND topic=${event.topic} AND delivery_id=${event.deliveryId})
    ON CONFLICT(account_id,shop,order_gid,journey) DO NOTHING RETURNING id`;
}
export function duePostPurchaseIntentsQuery(m:PostPurchaseMerchant){
  return sql`SELECT i.*,e.delivery_id FROM ecommerce_post_purchase_intents i
    JOIN ecommerce_growth_event_inbox e ON e.id=i.event_id AND e.account_id=i.account_id AND e.shop=i.shop
    WHERE i.account_id=${m.accountId} AND i.shop=${m.shop} AND i.installation_id=${m.installationId}
      AND i.state<>'suppressed' AND i.next_review_at<=NOW()
    ORDER BY i.next_review_at,i.id LIMIT 3 FOR UPDATE OF i SKIP LOCKED`;
}
export function suppressChangedPostPurchaseOrdersQuery(m:PostPurchaseMerchant,order:FreshPostPurchaseOrder){
  return sql`UPDATE ecommerce_post_purchase_intents SET state='suppressed',reasons='["order_status_changed"]'::jsonb
    WHERE account_id=${m.accountId} AND shop=${m.shop} AND order_gid=${order.orderId} AND state<>'suppressed'
      AND ((${order.status}='cancelled' AND journey<>'cancellation') OR
           (${order.status}='fulfilled' AND journey='orderConfirmation'))`;
}
/** All privacy calls run inside existing customer/shop/uninstall advisory locks.
 * Tables are independent so partial/optional migrations never skip available cleanup.
 */
export function postPurchasePrivacyQueries(input:{
  shop:string;accountId?:string;mode:'customer'|'store'|'uninstall';contactIds?:string[];customerIds?:string[];recipientDigests?:string[];
},tables:PostPurchaseTables){
  if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(input.shop))throw Error('invalid_post_purchase_privacy_shop');
  if(input.mode!=='store'&&!input.accountId)throw Error('missing_post_purchase_privacy_account');
  const scope=sql`shop=${input.shop} ${input.mode==='store'?sql``:sql`AND account_id=${input.accountId}`}`;
  const ids=(input.contactIds??[]).filter(x=>typeof x==='string'&&x.length>0&&x.length<=128);
  const customers=(input.customerIds??[]).filter(x=>/^[1-9][0-9]{0,19}$/.test(x)).map(x=>'gid://shopify/Customer/'+x);
  const digests=(input.recipientDigests??[]).filter(x=>/^[a-f0-9]{64}$/.test(x));
  const matches=(hasContact:boolean)=>sql`(${hasContact&&ids.length?sql`contact_id IN (${sql.join(ids.map(x=>sql`${x}`),sql`,`)})`:sql`FALSE`}
    OR ${customers.length?sql`customer_gid IN (${sql.join(customers.map(x=>sql`${x}`),sql`,`)})`:sql`FALSE`})`;
  const queries=[];
  if(tables.intents)queries.push(input.mode==='uninstall'
    ?sql`UPDATE ecommerce_post_purchase_intents SET state='suppressed',reasons='["installation_inactive"]'::jsonb WHERE ${scope}`
    :sql`DELETE FROM ecommerce_post_purchase_intents WHERE ${scope} ${input.mode==='customer'?sql`AND ${matches(true)}`:sql``}`);
  if(tables.consents)queries.push(input.mode==='uninstall'
    ?sql`UPDATE ecommerce_post_purchase_consents SET revoked_at=NOW(),last_inbound_at=GREATEST(last_inbound_at,NOW()) WHERE ${scope}`
    :sql`DELETE FROM ecommerce_post_purchase_consents WHERE ${scope} ${input.mode==='customer'?sql`AND (${matches(true)} OR ${digests.length?sql`recipient_hmac IN (${sql.join(digests.map(x=>sql`${x}`),sql`,`)})`:sql`FALSE`})`:sql``}`);
  if(tables.orders&&input.mode!=='uninstall')queries.push(sql`DELETE FROM ecommerce_post_purchase_orders WHERE ${scope}
    ${input.mode==='customer'?sql`AND ${matches(false)}`:sql``}`);
  return queries;
}

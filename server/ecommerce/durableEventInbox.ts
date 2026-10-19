/**
 * Durable, payload-free Shopify event inbox. This service never sends messages.
 * Call only AFTER authenticating Shopify HMAC, resolving a unique active tenant
 * installation, and classifying the event. Not wired into production routes.
 */
import type { CommerceEventDecision } from './eventIntake';

export type InboxQuery = {
  query: (text:string, values?:readonly unknown[])=>Promise<{rows: Array<{id:string|number;state:string}>}>;
};
export type EventInboxResult =
 | { status:'inserted'; id:string }
 | { status:'duplicate' }
 | { status:'ignored' };

export async function recordCommerceEvent(
  db:InboxQuery,
  event:CommerceEventDecision,
):Promise<EventInboxResult> {
  if(event.status!=='candidate') return {status:'ignored'};
  const tuple: unknown=JSON.parse(event.dedupeKey);
  if(!Array.isArray(tuple) || tuple.length!==4 ||
      tuple.some(x=>typeof x!=='string' || !x.trim()))
    throw Error('invalid_delivery_identity');
  const [account,shop,topic,delivery]=tuple as string[];
  if(account.length>128 || shop.length>255 || topic.length>64 || delivery.length>256 ||
     !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ||
     !['orders/create','orders/fulfilled','orders/cancelled'].includes(topic))
    throw Error('invalid_delivery_identity');
  const expectedJourney={
    'orders/create':'order_support',
    'orders/fulfilled':'fulfillment_support',
    'orders/cancelled':'order_cancelled',
  }[topic]!;
  if(event.journey!==expectedJourney) throw Error('invalid_delivery_journey');
  const row=await db.query(
    `INSERT INTO ecommerce_growth_event_inbox
       (account_id,shop,topic,delivery_id,journey,state)
     VALUES ($1,$2,$3,$4,$5,'pending')
     ON CONFLICT (account_id,shop,topic,delivery_id) DO NOTHING
     RETURNING id::text AS id, state`,
     [account,shop,topic,delivery,expectedJourney]);
  if(row.rows.length===0) return {status:'duplicate'};
  if(row.rows.length!==1 || typeof row.rows[0].id!=='string') throw Error('invalid_inbox_insert_result');
  return {status:'inserted',id:row.rows[0].id};
}

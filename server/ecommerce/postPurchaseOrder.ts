import type { ShopifyOrderTopic } from '../shopifyOrderWebhookHandler';
export type PostPurchaseOrderEvent={
  topic:ShopifyOrderTopic;deliveryId:string;orderId:string;customerId:string;occurredAt:number;
};
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
function gid(value:unknown,kind:'Order'|'Customer'):string|null {
  const id=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  return typeof id==='string'&&/^[1-9][0-9]{0,19}$/.test(id)?'gid://shopify/'+kind+'/'+id:null;
}
/** IDs in signed payload and GraphQL IDs, if present, must agree. Never infer from email/phone. */
export function parsePostPurchaseOrderEvent(topic:ShopifyOrderTopic,deliveryId:string,body:unknown,now=Date.now()):PostPurchaseOrderEvent|null {
  const row=obj(body),customer=obj(row.customer);
  const orderId=gid(row.id,'Order'),customerId=gid(customer.id,'Customer');
  const occurredAt=typeof row.updated_at==='string'?Date.parse(row.updated_at):NaN;
  if(!orderId||!customerId||!deliveryId.trim()||deliveryId.length>255||!Number.isSafeInteger(occurredAt)||occurredAt>now ||
    (row.admin_graphql_api_id!=null&&row.admin_graphql_api_id!==orderId)||
    (customer.admin_graphql_api_id!=null&&customer.admin_graphql_api_id!==customerId))return null;
  return {topic,deliveryId,orderId,customerId,occurredAt};
}
export type FreshPostPurchaseOrder={orderId:string;customerId:string;status:'open'|'fulfilled'|'cancelled';updatedAt:number;latestPurchaseAt:number|null};
const QUERY=`query PostPurchaseOrder($id:ID!){order(id:$id){id updatedAt cancelledAt displayFulfillmentStatus customer{id orders(first:1,sortKey:PROCESSED_AT,reverse:true){nodes{id createdAt}}}}}`;
/** Bounded, read-only Admin query. Null/partial/error/guest/mismatched evidence fails closed. */
export async function recheckPostPurchaseOrder(input:{shop:string;accessToken:string;orderId:string;customerId:string;now?:number;fetchImpl?:typeof fetch}):Promise<FreshPostPurchaseOrder|null>{
  if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(input.shop)||!input.accessToken||
    !/^gid:\/\/shopify\/Order\/[1-9][0-9]{0,19}$/.test(input.orderId)||
    !/^gid:\/\/shopify\/Customer\/[1-9][0-9]{0,19}$/.test(input.customerId))return null;
  try{
    const response=await (input.fetchImpl??fetch)('https://'+input.shop+'/admin/api/2026-10/graphql.json',{
      method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':input.accessToken},
      body:JSON.stringify({query:QUERY,variables:{id:input.orderId}}),signal:AbortSignal.timeout(8000),
    });
    if(!response.ok)return null;
    const root=obj(await response.json());if(root.errors!=null&&(!Array.isArray(root.errors)||root.errors.length))return null;
    const row=obj(obj(root.data).order),customer=obj(row.customer);
    const now=input.now??Date.now(),updatedAt=typeof row.updatedAt==='string'?Date.parse(row.updatedAt):NaN;
    if(row.id!==input.orderId||customer.id!==input.customerId||!Number.isSafeInteger(updatedAt)||updatedAt>now||
      !(row.cancelledAt===null||(typeof row.cancelledAt==='string'&&Number.isFinite(Date.parse(row.cancelledAt))&&Date.parse(row.cancelledAt)<=now)))return null;
    const fulfillment=row.displayFulfillmentStatus;
    if(!['UNFULFILLED','PARTIALLY_FULFILLED','FULFILLED','IN_PROGRESS','ON_HOLD','SCHEDULED','RESTOCKED','PENDING_FULFILLMENT','OPEN','REQUEST_DECLINED'].includes(String(fulfillment)))return null;
    const nodes=obj(customer.orders).nodes;
    let latestPurchaseAt:number|null=null;
    if(Array.isArray(nodes)&&nodes.length===1){const latest=obj(nodes[0]);
      const date=typeof latest.createdAt==='string'?Date.parse(latest.createdAt):NaN;
      if(/^gid:\/\/shopify\/Order\/[1-9][0-9]{0,19}$/.test(String(latest.id))&&Number.isSafeInteger(date)&&date<=now)latestPurchaseAt=date;
    }
    return {orderId:input.orderId,customerId:input.customerId,updatedAt,latestPurchaseAt,
      status:row.cancelledAt!==null?'cancelled':fulfillment==='FULFILLED'?'fulfilled':'open'};
  }catch{return null;}
}

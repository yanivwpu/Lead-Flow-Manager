import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchShopifyAbandonedCheckoutPage, parseAbandonedCheckoutSnapshot } from '../server/ecommerce/abandonedCheckoutSource';

const node = {
  id: 'gid://shopify/AbandonedCheckout/123',
  updatedAt: '2026-10-20T10:00:00Z',
  completedAt: null,
  abandonedCheckoutUrl: 'https://www.example-store.com/123/checkouts/token/recover?key=SECRET',
};
const page = (nodes: unknown[]) => ({
  data:{abandonedCheckouts:{nodes,pageInfo:{hasNextPage:false,endCursor:null}}},
});
test('reads a scoped, bounded Shopify Admin snapshot without exposing recovery token', async () => {
  let count=0;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    count++;
    assert.equal(String(url), 'https://shop.myshopify.com/admin/api/2026-10/graphql.json');
    assert.equal(init?.method,'POST');
    assert.equal(JSON.parse(String(init?.body)).variables.first,25);
    return new Response(JSON.stringify(page([node])),{status:200});
  }) as typeof fetch;
  const result=await fetchShopifyAbandonedCheckoutPage({
    shop:'shop.myshopify.com',accessToken:'private-token',fetchImpl,
    now:Date.parse('2026-10-20T12:00:00Z'),
  });
  assert.equal(count,1);
  assert.deepEqual(result.observations,[{
    checkoutId:node.id,lastActivityAt:node.updatedAt,
    completed:false,hasRecoveryUrl:true,
  }]);
  assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('recovered Shopify checkouts are completed and cannot remain scheduled',()=>{
  const completed=parseAbandonedCheckoutSnapshot({...node,completedAt:'2026-10-20T11:00:00Z'},
    Date.parse('2026-10-20T12:00:00Z'));
  assert.equal(completed.completed,true);
});
test('malformed IDs, status, future timestamps, Shopify URLs and permissions fail closed',async()=>{
  const now=Date.parse('2026-10-20T12:00:00Z');
  for(const patch of [
    {id:'gid://shopify/Order/123'}, {id:'gid://shopify/AbandonedCheckout/abc'},
    {updatedAt:'invalid'},{updatedAt:'2030-10-20T10:00:00Z'},
    {completedAt:undefined},
  ]) assert.throws(()=>parseAbandonedCheckoutSnapshot({...node,...patch},now));
  assert.equal(parseAbandonedCheckoutSnapshot({...node,abandonedCheckoutUrl:'javascript:alert(1)'},now).hasRecoveryUrl,false);
  assert.equal(parseAbandonedCheckoutSnapshot({...node,abandonedCheckoutUrl:'http://attacker.test'},now).hasRecoveryUrl,false);
  await assert.rejects(fetchShopifyAbandonedCheckoutPage({
    shop:'attacker.example',accessToken:'secret',fetchImpl:(async()=>new Response('{}')) as typeof fetch,
  }));
  await assert.rejects(fetchShopifyAbandonedCheckoutPage({
    shop:'shop.myshopify.com',accessToken:'secret',
    fetchImpl:(async()=>new Response(JSON.stringify({errors:[{message:'private permissions'}]}))) as typeof fetch,
  }),/shopify_checkout_permission_or_query_error/);
  await assert.rejects(fetchShopifyAbandonedCheckoutPage({
    shop:'shop.myshopify.com',accessToken:'secret',
    fetchImpl:(async()=>new Response(JSON.stringify(page(new Array(26).fill(node))))) as typeof fetch,
  }),/shopify_checkout_source_invalid/);
});

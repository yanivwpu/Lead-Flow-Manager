import assert from 'node:assert/strict';
import test from 'node:test';
import { requestOfflinePair, parseOfflinePair, sealOfflinePair, openOfflinePair, classifyShopifyAdminFailure } from '../server/shopifyOfflineGrant';
import { offlineGraphqlClient } from '../server/shopifyAdminClient';
const shop = 'fixture.myshopify.com';
process.env.SHOPIFY_API_KEY = 'fixture-client';
process.env.SHOPIFY_API_SECRET = 'fixture-secret';
process.env.SHOPIFY_OFFLINE_TOKEN_KEY = '12'.repeat(32);
const response = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', scope: 'read_orders', expires_in: 1234, refresh_token_expires_in: 98765 };

test('authorization code acquisition requests expiring offline pair and uses provider TTLs from request start', async () => {
  const pair = await requestOfflinePair(shop, {code:'fixture-code'}, async (url, init) => {
    assert.equal(url, `https://${shop}/admin/oauth/access_token`);
    assert.equal(init?.redirect, 'error');
    const params = new URLSearchParams(init?.body as URLSearchParams);
    assert.equal(params.get('expiring'), '1'); assert.equal(params.get('code'),'fixture-code');
    assert.equal(params.has('grant_type'),false);
    return Response.json(response);
  }, () => 1000);
  assert.equal(pair.accessExpiresAt.getTime(), 1235000);
  assert.equal(pair.refreshExpiresAt.getTime(), 98766000);
});
test('refresh presents latest refresh token without a code or legacy exchange', async () => {
  await requestOfflinePair(shop,{refresh_token:'latest-fixture'},async (_url,init) => {
    const p = new URLSearchParams(init?.body as URLSearchParams);
    assert.equal(p.get('grant_type'),'refresh_token');assert.equal(p.get('refresh_token'),'latest-fixture');
    assert.equal(p.has('code'),false);assert.equal(p.has('subject_token'),false);
    return Response.json(response);
  });
});
test('full response validation rejects incomplete, online and malformed grants', () => {
  for (const patch of [{refresh_token:null},{expires_in:0},{expires_in:'3600'},{expires_in:Infinity},
    {refresh_token_expires_in:-1},{scope:''},{associated_user:{id:1}},{access_token:'bad token'}])
    assert.throws(()=>parseOfflinePair({...response,...patch},Date.now()),/invalid_response/);
});
test('transport, rate limit, server, terminal and configuration failures remain distinct and sanitized', async () => {
  for (const [status,code] of [[401,'reauthorization_required'],[403,'configuration'],[400,'configuration'],[429,'retry_later'],[503,'retry_later']] as const) {
    let calls=0;
    await assert.rejects(requestOfflinePair(shop,{refresh_token:'private'},async()=>{
      calls++;return new Response('SECRET_PROVIDER_BODY',{status});
    }), {message:`shopify_token_${code}`});
    assert.equal(calls,1);
  }
  await assert.rejects(requestOfflinePair(shop,{code:'private'},async()=>{throw Error('SECRET_NETWORK_ERROR');}),{message:'shopify_token_retry_later'});
  await assert.rejects(requestOfflinePair('evil.example',{code:'private'},async()=>{throw Error('called');}),/configuration/);
});
test('AEAD encrypts both credentials and binds ciphertext to tenant, shop and installation',()=>{
  const pair=parseOfflinePair(response,Date.now());
  const encrypted=sealOfflinePair(pair,'owner',shop,'ref');
  assert.ok(!encrypted.includes(pair.accessToken));assert.ok(!encrypted.includes(pair.refreshToken));
  assert.deepEqual(openOfflinePair(encrypted,'owner',shop,'ref'),pair);
  for (const [owner,domain,ref] of [['other',shop,'ref'],['owner','other.myshopify.com','ref'],['owner',shop,'other']])
    assert.throws(()=>openOfflinePair(encrypted,owner,domain,ref),/configuration/);
  const prior=process.env.SHOPIFY_OFFLINE_TOKEN_KEY;delete process.env.SHOPIFY_OFFLINE_TOKEN_KEY;
  assert.throws(()=>sealOfflinePair(pair,'owner',shop,'ref'),/configuration/);process.env.SHOPIFY_OFFLINE_TOKEN_KEY=prior;
});
test('long-lived GraphQL clients resolve on every call and never replay Admin mutations',async()=>{
  let resolves=0, requests=0;
  const client=offlineGraphqlClient(shop,'tenant-ref',{
    resolve:async(s,r)=>{assert.equal(s,shop);assert.equal(r,'tenant-ref');return `access-${++resolves}`;},
    client:async(token)=>({request:async()=>{requests++;return {data:{token}};}}) as any,
  });
  assert.equal((await client.request('query one')).data.token,'access-1');
  assert.equal((await client.request('query two')).data.token,'access-2');
  const failing=offlineGraphqlClient(shop,'ref',{resolve:async()=> 'access',client:async()=>({request:async()=>{
    requests++;throw {response:{code:403},body:{errors:'Non-expiring access tokens are no longer accepted for the Admin API: link'}};
  }}) as any});
  await assert.rejects(failing.request('mutation billing'),/legacy_rejected/);assert.equal(requests,3);
  assert.equal(classifyShopifyAdminFailure(403,'missing read_orders').code,'scope_denied');
});

test('direct HTTP Admin transport resolves the current credential, bounds URL and never retries',async()=>{
  const { createOfflineAdminFetch }=await import('../server/shopifyAdminClient');let calls=0;
  const transport=createOfflineAdminFetch(async(s,r)=>{assert.equal(s,shop);assert.equal(r,'tenant-ref');return 'current-access';},async(url,init)=>{
    calls++;assert.equal(new Headers(init?.headers).get('X-Shopify-Access-Token'),'current-access');
    assert.equal(init?.redirect,'error');return new Response('missing scope',{status:403});
  });
  await assert.rejects(transport(`https://${shop}/admin/api/2026-10/graphql.json`,{headers:{'X-Shopify-Access-Token':'tenant-ref'}}),/scope_denied/);
  assert.equal(calls,1);
  await assert.rejects(transport('https://evil.example/elsewhere'),/url_invalid/);assert.equal(calls,1);
});
test('SDK errors cannot expose raw request headers or provider bodies',async()=>{
  const client=offlineGraphqlClient(shop,'ref',{resolve:async()=> 'private-access',client:async()=>({request:async()=>{
    throw {response:{code:500,headers:{'X-Shopify-Access-Token':'private-access'}},body:{errors:[{message:'private-refresh',extensions:{code:'THROTTLED'}}]}};
  }}) as any});
  await assert.rejects(client.request('query catalog'),(error:any)=>{
    assert.equal(error.response.code,500);assert.equal(error.body.errors[0].extensions.code,'THROTTLED');
    assert.ok(!JSON.stringify(error).includes('private-'));return true;
  });
});


test('explicit legacy migration uses the documented exchange grant; never an install or client-secret rotation',async()=>{
  await requestOfflinePair(shop,{legacy_token:'authorized-legacy-fixture'},async(_url,init)=>{
    const p=new URLSearchParams(init?.body as URLSearchParams);
    assert.equal(p.get('grant_type'),'urn:ietf:params:oauth:grant-type:token-exchange');
    assert.equal(p.get('subject_token'),'authorized-legacy-fixture');
    assert.equal(p.get('subject_token_type'),'urn:shopify:params:oauth:token-type:offline-access-token');
    assert.equal(p.get('requested_token_type'),'urn:shopify:params:oauth:token-type:offline-access-token');
    assert.equal(p.get('expiring'),'1');assert.equal(p.has('code'),false);
    return Response.json(response);
  });
});

test('SDK and HTTP auth errors retain only sanitized status and token code', async () => {
  const { createOfflineAdminFetch } = await import('../server/shopifyAdminClient');
  const { inspect } = await import('node:util');
  const secret = 'private-provider-token';
  for (const status of [401, 403] as const) {
    const verify = (error: any) => {
      assert.equal(error.status, status);
      assert.equal(error.code, status === 401 ? 'reauthorization_required' : 'scope_denied');
      assert.ok(!inspect(error, { showHidden: true }).includes(secret));
      return true;
    };
    const client = offlineGraphqlClient(shop, 'ref', {
      resolve: async () => secret,
      client: async () => ({ request: async () => {
        throw { response: { code: status, headers: { authorization: secret } }, body: { errors: secret }, cause: Error(secret) };
      } }) as any,
    });
    await assert.rejects(client.request('query catalog'), verify);
    const transport = createOfflineAdminFetch(async () => secret, async () => new Response(secret, { status }));
    await assert.rejects(transport(`https://${shop}/admin/api/2026-10/graphql.json`), verify);
  }
});

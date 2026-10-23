#!/usr/bin/env node
/**
 * One read-only developer Storefront inventory-scope probe.
 * Run only in an isolated server-side environment with a rotated Headless private token.
 * Never log a credential, variant quantity, request body, or provider response body.
 */
const token=process.env.SHOPIFY_CHECKOUT_DEV_STOREFRONT_PRIVATE_TOKEN;
const approved=process.env.SHOPIFY_READONLY_INVENTORY_PROBE_ONCE==='yes';
if (!token || !token.trim() || !approved) {
  console.error('Private Storefront credential and explicit read-only opt-in required.');
  process.exitCode=2;
} else {
  const shop='whachatcrm.myshopify.com';
  const apiVersion='2026-10';
  const id='gid://shopify/ProductVariant/51638768632090';
  const query='query InventoryScopeProbe($id:ID!) { node(id:$id) { ... on ProductVariant { id quantityAvailable currentlyNotInStock } } }';
  try {
    const response=await fetch(`https://${shop}/api/${apiVersion}/graphql.json`,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{'Content-Type':'application/json','Shopify-Storefront-Private-Token':token},
      body:JSON.stringify({query,variables:{id}}),
    });
    const reader=response.body?.getReader();
    let bytes=0, chunks=[], oversize=!reader;
    if(reader) {
      try {
        for(;;) {
          const {done,value}=await reader.read();
          if(done)break;
          bytes+=value.byteLength;
          if(bytes>16384){oversize=true;await reader.cancel();break;}
          chunks.push(Buffer.from(value));
        }
      } finally {reader.releaseLock();}
    }
    let data=null,parseError=false;
    if(!oversize){try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{parseError=true;}}
    const match=data?.data?.node?.id===id;
    const availability=data?.data?.node?.quantityAvailable;
    const stockFieldValid=Number.isSafeInteger(availability)&&availability>=0;
    const backorderFieldValid=typeof data?.data?.node?.currentlyNotInStock==='boolean';
    const ok=response.status===200&&response.headers.get('x-shopify-api-version')===apiVersion&&match&&stockFieldValid&&backorderFieldValid&&!data?.errors?.length;
    console.log(JSON.stringify({
      status:response.status,apiVersionMatch:response.headers.get('x-shopify-api-version')===apiVersion,
      variantIdMatches:match,quantityAvailableAccessible:stockFieldValid,
      currentlyNotInStockAccessible:backorderFieldValid,
      graphqlErrorPresent:!!data?.errors?.length,responseOverLimit:oversize,invalidJson:parseError,passed:ok,
    }));
    if(!ok)process.exitCode=1;
  } catch {
    console.log(JSON.stringify({category:'transport_or_timeout',passed:false}));
    process.exitCode=1;
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { mkdtemp, readFile, rm, stat, mkdir, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapAdminPreflight, bootstrapAdminRequest, bootstrapStorefrontFetch,
  BOOTSTRAP_PRODUCT, BOOTSTRAP_VARIANT, assertBootstrapCommand } from '../scripts/checkout-validation/admin-bootstrap';
import { resolveReadOnlyCheckoutOwner } from '../scripts/checkout-validation/read-only-installation';
import { savePrivateSelection } from '../scripts/checkout-validation/private-files';
import { META, SHOP, selectionDigest } from '../scripts/checkout-validation/harness';
import { SHOPIFY_INVENTORY_BATCH_QUERY } from '../server/salesCatalog/shopify/inventory';
import { VERIFY } from '../server/shopping/checkout/shopify';

const env={SHOPIFY_CHECKOUT_DEV_STOREFRONT_PRIVATE_TOKEN:'fixture-private'};
function transport(change: {variant?:(v:any,n:number)=>any;meta?:(m:any)=>any;storefront?:(v:any)=>any}={}) {
  let inventoryReads=0;
  const calls:{url:string;query:string}[]=[];
  const variant={id:BOOTSTRAP_VARIANT,selectedOptions:[{name:'Title',value:'Default Title'}],price:'613.25',
    availableForSale:true,requiresComponents:false,inventoryQuantity:3,inventoryPolicy:'DENY',
    inventoryItem:{tracked:true},product:{id:BOOTSTRAP_PRODUCT,status:'ACTIVE',publishedAt:'2026-01-01T00:00:00Z',requiresSellingPlan:false}};
  const requestFetch=(async(input,init)=>{
    const {query,variables}=JSON.parse(init!.body as string);
    calls.push({url:String(input),query});
    assert.equal(init!.method,'POST');assert.equal(init!.redirect,'error');
    assert.equal(query.startsWith('mutation'),false);
    const headers=new Headers(init!.headers);
    let data:any;
    if(String(input).includes('/admin/')) {
      assert.equal(headers.get('X-Shopify-Access-Token'),'fixture-admin');
      assert.equal(headers.has('Shopify-Storefront-Private-Token'),false);
      if(query===META){
        const meta={shop:{myshopifyDomain:SHOP,plan:{partnerDevelopment:true}},currentAppInstallation:{
          app:{apiKey:'e4585d4da1434c9e5649a2269e716076'},accessScopes:[{handle:'read_products'},{handle:'read_inventory'}]}};
        data=change.meta?.(meta)??meta;
      } else {
        assert.equal(query,SHOPIFY_INVENTORY_BATCH_QUERY);assert.deepEqual(variables,{ids:[BOOTSTRAP_VARIANT]});
        data={shop:{myshopifyDomain:SHOP,currencyCode:'CAD'},nodes:[change.variant?.(variant,++inventoryReads)??variant]};
      }
    } else {
      assert.equal(query,VERIFY);assert.deepEqual(variables,{id:BOOTSTRAP_VARIANT});
      assert.equal(headers.get('Shopify-Storefront-Private-Token'),'fixture-private');
      assert.equal(headers.has('X-Shopify-Access-Token'),false);
      const v={...variant,quantityAvailable:3,currentlyNotInStock:false,
        price:{amount:'613.25',currencyCode:'CAD'},quantityRule:{minimum:1,maximum:null,increment:1}};
      data={node:change.storefront?.(v)??v};
    }
    return new Response(JSON.stringify({data}),{headers:{'x-shopify-api-version':String(input).includes('/admin/')?'2026-01':'2026-10'}});
  }) as typeof fetch;
  return {requestFetch,calls};
}

test('bootstrap uses restricted SELECT columns, exact live selection and existing verifier; fails closed for owners, credentials, metadata, inventory and drift',async()=>{
  const pg=new PGlite();
  // Only approved columns exist. Broad user/integration reads cannot pass this fixture.
  await pg.exec(`CREATE TABLE users(id varchar PRIMARY KEY,shopify_shop text,shopify_access_token text,
    shopify_subscription_status text,deletion_requested_at timestamp);
    CREATE TABLE integrations(id varchar PRIMARY KEY,user_id varchar,type text,is_active boolean,config jsonb);
    INSERT INTO users VALUES('owner','${SHOP}','fixture-admin','active',NULL);
    INSERT INTO integrations VALUES('installation','owner','shopify',true,'{}');`);
  const database=drizzle(pg) as any;
  let saved:any;
  async function run(f=transport(),credentials:NodeJS.ProcessEnv=env) {
    saved=undefined;
    await pg.exec('BEGIN READ ONLY');
    try {return await bootstrapAdminPreflight({database,requestFetch:f.requestFetch,env:credentials,saveSelection:async s=>{saved=s;}});}
    finally {await pg.exec('ROLLBACK');}
  }
  try {
    const f=transport(), result=await run(f);
    assert.deepEqual(saved,{shop:SHOP,userId:'owner',productId:BOOTSTRAP_PRODUCT,variantId:BOOTSTRAP_VARIANT,
      quantity:1,price:'613.25',currency:'CAD',options:[{name:'Title',value:'Default Title'}]});
    assert.deepEqual(result,{result:'preflight_passed',selectionSha256:selectionDigest(saved)});
    assert.equal(f.calls.length,4);assert.equal(f.calls.filter(c=>c.query===VERIFY).length,1);
    assert.equal(JSON.stringify(result).includes('owner'),false);

    const missing=transport();await assert.rejects(run(missing,{}),/private_token_missing/);
    assert.equal(missing.calls.length,0);assert.equal(saved,undefined);
    await pg.exec(`INSERT INTO users VALUES('other','${SHOP}',NULL,'uninstalled',NULL)`);
    const ambiguous=transport();await assert.rejects(run(ambiguous),/owner_not_unique/);
    assert.equal(ambiguous.calls.length,0);
    await pg.exec("DELETE FROM users WHERE id='other'; UPDATE users SET shopify_access_token=NULL");
    await assert.rejects(run(),/installation_unavailable/);
    await pg.exec("UPDATE users SET shopify_access_token='fixture-admin'; INSERT INTO integrations VALUES('second','owner','shopify',true,'{}')");
    await assert.rejects(run(),/installation_unavailable/);
    await pg.exec("DELETE FROM integrations WHERE id='second'; UPDATE integrations SET config='{\"shop\":\"other.myshopify.com\"}'");
    await assert.rejects(resolveReadOnlyCheckoutOwner(database),/installation_unavailable/);
    await pg.exec("UPDATE integrations SET config='{}'");

    for(const variant of [
      (v:any)=>({...v,id:'gid://shopify/ProductVariant/9'}),
      (v:any)=>({...v,product:{...v.product,id:'gid://shopify/Product/9'}}),
      (v:any)=>({...v,inventoryQuantity:0}),
      (v:any)=>({...v,inventoryQuantity:null}),
      (v:any)=>({...v,inventoryItem:{}}),
      (v:any)=>({...v,selectedOptions:undefined}),
      (v:any)=>({...v,price:undefined}),
      (v:any)=>({...v,price:'NaN'}),
      (v:any)=>({...v,availableForSale:false}),
      (v:any)=>({...v,product:{...v.product,publishedAt:null}}),
      (v:any,n:number)=>({...v,price:n===1?'613.25':'614.25'}),
    ]) {
      const bad=transport({variant});await assert.rejects(run(bad));assert.equal(saved,undefined);
      assert.equal(bad.calls.some(c=>c.query===VERIFY),false);
    }
    for(const meta of [
      (m:any)=>({...m,shop:{...m.shop,plan:{partnerDevelopment:false}}}),
      (m:any)=>({...m,currentAppInstallation:{...m.currentAppInstallation,app:{apiKey:'wrong'}}}),
      (m:any)=>({...m,currentAppInstallation:{...m.currentAppInstallation,accessScopes:[]}}),
    ]) {await assert.rejects(run(transport({meta})));assert.equal(saved,undefined);}
    for(const storefront of [(v:any)=>({...v,price:{amount:'614.25',currencyCode:'CAD'}}),
      (v:any)=>({...v,price:{amount:'613.25',currencyCode:'USD'}}),(v:any)=>({...v,quantityAvailable:0})]) {
      await assert.rejects(run(transport({storefront})));assert.equal(saved,undefined);
    }
    await pg.exec('BEGIN READ ONLY');
    await assert.rejects(pg.exec("UPDATE users SET shopify_access_token='forbidden'"));
    await pg.exec('ROLLBACK');
  } finally {await pg.close();}
});

test('HTTP fences reject mutations, other hosts, queries and variant variables before dispatch',async()=>{
  let calls=0;const requestFetch=(async()=>{calls++;throw Error('must not dispatch');}) as typeof fetch;
  const admin=bootstrapAdminRequest(SHOP,'fixture-admin',requestFetch);
  for(const [query,variables] of [ ['mutation { anything }',undefined],[META,{}],
    [SHOPIFY_INVENTORY_BATCH_QUERY,{ids:['gid://shopify/ProductVariant/9']}],
    [SHOPIFY_INVENTORY_BATCH_QUERY,{ids:[BOOTSTRAP_VARIANT],extra:true}] ] as const)
    await assert.rejects(admin(query,variables));
  assert.throws(()=>bootstrapAdminRequest('other.myshopify.com','fixture-admin',requestFetch));
  const storefront=bootstrapStorefrontFetch(requestFetch);
  for(const query of ['mutation PrepareCheckout { cartCreate { cart { id } } }','query Other { shop { name } }'])
    await assert.rejects(storefront(`https://${SHOP}/api/2026-10/graphql.json`,{method:'POST',redirect:'error',body:JSON.stringify({query,variables:{id:BOOTSTRAP_VARIANT}})}));
  await assert.rejects(storefront(`https://other.myshopify.com/api/2026-10/graphql.json`,{method:'POST',redirect:'error',body:JSON.stringify({query:VERIFY,variables:{id:BOOTSTRAP_VARIANT}})}));
  await assert.rejects(storefront(`https://${SHOP}/api/2026-10/graphql.json`,{method:'POST',redirect:'error',body:JSON.stringify({query:VERIFY,variables:{id:'other'}})}));
  assert.equal(calls,0);
});

test('selection file is private, durable and exclusive; symlinks and permissive directories fail closed',async()=>{
  const root=await mkdtemp(join(tmpdir(),'bootstrap-selection-'));
  try {
    const directory=join(root,'private');await savePrivateSelection(directory,{fixture:true});
    assert.equal((await stat(directory)).mode & 0o777,0o700);
    const path=join(directory,'selection.private.json');
    assert.equal((await stat(path)).mode & 0o777,0o600);
    assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{fixture:true});
    await assert.rejects(savePrivateSelection(directory,{overwrite:true}));
    await symlink(directory,join(root,'link'));await assert.rejects(savePrivateSelection(join(root,'link'),{}));
    await mkdir(join(root,'public'));await chmod(join(root,'public'),0o755);
    await assert.rejects(savePrivateSelection(join(root,'public'),{}));
  } finally {await rm(root,{recursive:true,force:true});}
});

test('bootstrap command requires attested Railway preflight even when Railway supplies CI; rejects unauthorized runtimes and arguments',()=>{
  const runtime={RAILWAY_SERVICE_ID:'cd3e14a1-c6a1-4532-8c67-8bc502d5aa07',
    CHECKOUT_TEST_RAILWAY_SERVICE_ID:'cd3e14a1-c6a1-4532-8c67-8bc502d5aa07',CHECKOUT_TEST_PHASE:'PREFLIGHT'};
  assert.doesNotThrow(()=>assertBootstrapCommand(['--bootstrap-preflight'],runtime));
  assert.doesNotThrow(()=>assertBootstrapCommand(['--bootstrap-preflight'],{...runtime,CI:'true'}));
  for(const args of [[],['--create-one-cart'],['--bootstrap-preflight','selection.json'],['--bootstrap-preflight','selection.json','approval.json']])
    assert.throws(()=>assertBootstrapCommand(args,runtime));
  for(const bad of [{},{CI:'true'},{...runtime,RAILWAY_SERVICE_ID:'staging-app'},
    {...runtime,CHECKOUT_TEST_PHASE:'AUTHORIZED_ONE_CART'}])
    assert.throws(()=>assertBootstrapCommand(['--bootstrap-preflight'],bad));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';

test('real Meta adapter rechecks dispatch authorization after awaited credentials and DNC, before fetch',async t=>{
  await mkdir('work',{recursive:true});const dir=await mkdtemp(resolve('work/ecommerce-dispatch-'));
  let fetches=0,queries=0,authorized=true,checks=0;
  const fakeFetch=t.mock.method(globalThis,'fetch',async()=>{fetches++;return new Response(JSON.stringify({messages:[{id:'wamid.fixture_deadline'}]}),{status:200});});
  try{
    await build({entryPoints:['server/userMeta.ts'],outfile:join(dir,'adapter.mjs'),bundle:true,
      platform:'node',format:'esm',packages:'external',plugins:[{name:'isolated-credentials-db',setup(b){
        b.onLoad({filter:/[/\\]drizzle[/\\]db\.ts$/},()=>({loader:'ts',contents:
          'export const db={transaction:async()=>{throw Error("unexpected_database_access")}};'}));
        b.onLoad({filter:/[/\\]server[/\\]storage\.ts$/},()=>({loader:'ts',contents:
          'export const storage={getUserForSession:async()=>({metaConnected:true,metaAccessToken:"fixture-token",metaPhoneNumberId:"fixture-sender"})};'}));
      }}]});
    const {sendMetaWhatsAppTemplate}=await import(pathToFileURL(join(dir,'adapter.mjs')).href);
    const options={suppressionExecutor:{execute:async()=>{queries++;if(queries===2)authorized=false;return {rows:[]};}},
      authorizeDispatch:()=>{checks++;assert.equal(queries%2,0);return authorized;}};
    await assert.rejects(()=>sendMetaWhatsAppTemplate('fixture','+15551234567','fixture','en',[],options),/ambiguous_provider_delivery/);
    assert.equal(checks,1);assert.equal(queries,2);assert.equal(fetches,0);
    authorized=true;
    assert.equal((await sendMetaWhatsAppTemplate('fixture','+15551234567','fixture','en',[],options)).messageId,'wamid.fixture_deadline');
    assert.equal(checks,2);assert.equal(queries,4);assert.equal(fetches,1);
  }finally{fakeFetch.mock.restore();await rm(dir,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';

test('real global DNC adapter reuses delivery transaction and still rejects suppression and ambiguous sends',async()=>{
  await mkdir('work',{recursive:true});const dir=await mkdtemp(resolve('work/ecommerce-dnc-'));
  let suppressed=false,sends=0,queries=0;
  try{
    await build({entryPoints:['server/marketingCompliance/store.ts'],outfile:join(dir,'boundary.mjs'),bundle:true,
      platform:'node',format:'esm',packages:'external',plugins:[{name:'isolated-db',setup(b){
        b.onLoad({filter:/[/\\]drizzle[/\\]db\.ts$/},()=>({loader:'ts',contents:
          'export const db={transaction:async()=>{throw Error("unexpected_nested_transaction")}};'}));
      }}]});
    const {withGlobalDncPhoneBoundary}=await import(pathToFileURL(join(dir,'boundary.mjs')).href);
    const tx={execute:async()=>{queries++;return {rows:queries%2===0&&suppressed?[{exists:1}]:[]};}};
    const send=async()=>{sends++;return {messageId:'wamid.fixture_boundary'};};
    await withGlobalDncPhoneBoundary('fixture','+15551234567',send,tx);assert.equal(sends,1);
    suppressed=true;
    await assert.rejects(()=>withGlobalDncPhoneBoundary('fixture','+15551234567',send,tx),/do-not-contact/);
    assert.equal(sends,1);
    suppressed=false;
    await assert.rejects(()=>withGlobalDncPhoneBoundary('fixture','+15551234567',async()=>{throw Error('timeout');},tx),/ambiguous_provider_delivery/);
    await assert.rejects(()=>withGlobalDncPhoneBoundary('fixture','+15551234567',send),/unexpected_nested_transaction/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

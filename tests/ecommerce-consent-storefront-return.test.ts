import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { parseHTML } from 'linkedom';
import { build } from 'esbuild';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('work', {recursive:true});
const scratch=await mkdtemp(resolve('work/consent-return-'));
const fixture='__consentThemeReturn';
after(async()=>{await rm(scratch,{recursive:true,force:true});delete (globalThis as any)[fixture];});
await build({entryPoints:['client/src/components/ecommerce/ShopifyConsentThemeSetup.tsx'],outfile:join(scratch,'component.mjs'),
  bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'account-fixture',setup(b){
    b.onResolve({filter:/^@\/lib\/auth-context$/},()=>({path:'auth',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const useAuth=()=>globalThis.${fixture}.auth`,loader:'js'}));
  }}]});
const {ShopifyConsentThemeSetup:Component}=await import(pathToFileURL(join(scratch,'component.mjs')).href);

test('mount/return checks are automatic, coalesced and read-only; setup routes required approval/editor without a save declaration', async () => {
  const previous=Object.fromEntries(['window','document','fetch','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,(globalThis as any)[key]]));
  const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
  Object.assign(globalThis,{window,document,IS_REACT_ACT_ENVIRONMENT:true});
  Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true,writable:true});
  let state='configured', owner='owner', reads=0, posts=0, pending: (()=>void)|undefined;
  const tabs: any[]=[];
  (window as any).open=()=>{const tab={opener:{},location:{href:''},closed:false,close(){this.closed=true;}};tabs.push(tab);return tab;};
  const auth={user:{id:owner},sessionAligned:true};(globalThis as any)[fixture]={auth};
  const setup=()=>({state,editorUrl:state==='proxy_permission_required'?null:'https://first.myshopify.com/admin/themes/current/editor',
    approvalUrl:state==='proxy_permission_required'?'https://admin.shopify.com/store/first/oauth/install':null,
    releasedVersion:'reviewed',checkedAt:null,editorOpenedAt:null,merchantConfirmedAt:null});
  globalThis.fetch=(async (_url,options)=>{
    assert.equal(options?.credentials,'include');
    if(options?.method==='POST'){
      posts++;assert.deepEqual(JSON.parse(String(options.body)),{action:'open_editor'});
      if(pending) await new Promise<void>(resolve=>{pending=resolve;});
      return {ok:true,json:async()=>({...setup(),consentGranted:false,messagingEnabled:false})};
    }
    reads++;assert.equal(options?.cache,'no-store');return {ok:true,json:async()=>setup()};
  }) as typeof fetch;
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  const root=createRoot(document.getElementById('root')!);
  const flush=()=>new Promise(resolve=>setTimeout(resolve,25));
  const render=()=>root.render(React.createElement(QueryClientProvider,{client},React.createElement(Component,{locale:'en',blocked:false})));
  const click=()=>document.querySelector<HTMLButtonElement>('[data-testid="consent-add-storefront"]')!.click();
  try{
    await act(async()=>{render();await flush();});await act(flush);
    assert.equal(reads,1);assert.equal(posts,0);
    assert.ok(document.body.textContent.includes('Ready to install'));
    await act(async()=>{click();await flush();});
    assert.equal(posts,1);assert.ok(tabs[0].location.href.includes('/themes/current/editor'));assert.equal(tabs[0].opener,null);
    state='enabled_verified';
    await act(async()=>{window.dispatchEvent(new window.Event('focus'));document.dispatchEvent(new window.Event('visibilitychange'));await flush();});
    await act(flush);
    assert.equal(reads,2,'focus and visibility are one return');assert.equal(posts,1);
    assert.ok(document.body.textContent.includes('Live on store'));
    state='proxy_permission_required';
    await act(async()=>{await client.invalidateQueries();await flush();});await act(flush);
    await act(async()=>{click();await flush();});
    assert.equal(posts,2);assert.ok(tabs[1].location.href.startsWith('https://admin.shopify.com/'));
    pending=()=>{};
    await act(async()=>{click();await flush();});
    owner='other';auth.user={id:owner};
    await act(async()=>{render();await flush();});await act(flush);
    await act(async()=>{pending!();await flush();});
    assert.ok(tabs[2].closed,'account change discards in-flight setup destination');
    assert.equal(tabs[2].location.href,'');
    const before=reads;
    await act(async()=>root.unmount());
    window.dispatchEvent(new window.Event('focus'));assert.equal(reads,before,'return listener is removed');
  } finally {
    await act(async()=>{try{root.unmount();}catch{}});client.clear();
    for(const [key,value] of Object.entries(previous)) (globalThis as any)[key]=value;
  }
});

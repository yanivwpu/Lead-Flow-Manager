import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('draft baseline loads safely, survives cached remounts, and stays fixed across real newer replies', {timeout:30000}, async()=>{
  const source = resolve(process.env.INBOX_DRAFT_HOOK_SOURCE || 'client/src/lib/useInboxCollaboration.ts');
  const bundle = await build({stdin:{contents:`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {useInboxDraftClaim} from ${JSON.stringify(source)};
    import {useInboxReplySnapshot,replySnapshotKey} from './client/src/lib/useInboxCollaboration';
    const client=new QueryClient(),root=createRoot(document.getElementById('root'));
    let props={actorId:'support',scope:'webchat:customer',text:'',conversationId:'conversation'},mounted=true;
    function Draft(){const snapshot=useInboxReplySnapshot(props.conversationId);
      const claim=useInboxDraftClaim({...props,snapshot,getSnapshot:()=>snapshot});
      window.claim=claim;window.currentText=props.text;
      return React.createElement('div',{'data-ready':Boolean(snapshot)},props.text);}
    function render(){root.render(React.createElement(QueryClientProvider,{client},mounted?React.createElement(Draft):null));}
    window.fixture={set:p=>{props={...props,...p};render()},snapshot:s=>client.setQueryData(replySnapshotKey(props.conversationId),s),
      mount:value=>{mounted=value;render()},seed:(key,value)=>sessionStorage.setItem(key,JSON.stringify(value))};render();
  `,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic'});
  const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>');});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>console.error('draft fixture:',e.message));await page.goto(`http://127.0.0.1:${(server.address() as any).port}`);
    await page.waitForFunction(()=>Boolean((window as any).claim));
    // The old hook persisted "unobserved" here and kept it after data arrived.
    assert.equal(await page.evaluate(()=>{try{(window as any).claim.prepare();return 'sent';}catch(e:any){return e.message;}}),'reply_state_unavailable');
    await page.evaluate(()=>(window as any).fixture.snapshot({revision:'0/historical',aiEpoch:4}));
    await page.waitForSelector('[data-ready="true"]',{state:'attached'});
    // Simulate a fresh component receiving a still-fresh cached conversation.
    await page.evaluate(()=>(window as any).fixture.mount(false));await page.waitForSelector('[data-ready]',{state:'detached'});
    await page.evaluate(()=>(window as any).fixture.mount(true));await page.waitForSelector('[data-ready="true"]',{state:'attached'});
    await page.evaluate(()=>(window as any).fixture.set({text:'Test 1 no refresh'}));
    await page.waitForFunction(()=>(window as any).currentText==='Test 1 no refresh');
    const first=await page.evaluate(()=>(window as any).claim.prepare());
    assert.equal(first.replyRevision,'0/historical');
    // Viewing/typing rerenders and identical snapshots must not alter the claim.
    await page.evaluate(()=>(window as any).fixture.snapshot({revision:'0/historical',aiEpoch:4}));
    assert.deepEqual(await page.evaluate(()=>(window as any).claim.prepare()),first);
    await page.evaluate(()=>(window as any).fixture.snapshot({revision:'1/new-human-reply',aiEpoch:5}));
    await page.waitForTimeout(30);
    const stale=await page.evaluate(()=>(window as any).claim.prepare());
    assert.equal(stale.replyRevision,'0/historical');assert.equal(stale.sendAttemptId,first.sendAttemptId);
    assert.equal(await page.evaluate(()=>(window as any).currentText),'Test 1 no refresh');
    // A submitted claim survives remount/retry; do not silently rebase uncertain sends.
    await page.evaluate(()=>(window as any).fixture.mount(false));await page.waitForSelector('[data-ready]',{state:'detached'});
    await page.evaluate(()=>(window as any).fixture.mount(true));await page.waitForSelector('[data-ready="true"]',{state:'attached'});
    assert.deepEqual(await page.evaluate(()=>(window as any).claim.prepare()),first);
    await page.evaluate(()=>(window as any).claim.reviewed({revision:'1/new-human-reply',aiEpoch:5}));
    const reviewed=await page.evaluate(()=>(window as any).claim.prepare());
    assert.equal(reviewed.reviewedRevision,'1/new-human-reply');assert.equal(reviewed.sendAttemptId,first.sendAttemptId);
    // An empty reloaded composer must not reuse an abandoned never-submitted claim.
    await page.evaluate(()=>{(window as any).fixture.seed('inbox-claim:support:other',{storageKey:'inbox-claim:support:other',sendAttemptId:'abandoned',replyRevision:'0/old',aiEpoch:0});(window as any).fixture.set({scope:'other',text:''});});
    await page.waitForFunction(()=>(window as any).claim.storageKey==='inbox-claim:support:other');
    const fresh=await page.evaluate(()=>(window as any).claim.prepare('New draft'));
    assert.equal(fresh.replyRevision,'1/new-human-reply');assert.notEqual(fresh.sendAttemptId,'abandoned');
  }finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

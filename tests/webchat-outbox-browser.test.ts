import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('real browser outbox survives reload with text, media, stable IDs and visitor isolation', {timeout:60000}, async()=>{
 const bundle=await build({entryPoints:['client/src/lib/webchatOutbox.ts'],bundle:true,write:false,format:'iife',globalName:'outbox'});
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><script>'+bundle.outputFiles[0].text+'</script>');});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),address=server.address() as any;await page.goto(`http://127.0.0.1:${address.port}`);
  await page.evaluate(async()=>{
   const o=(window as any).outbox;
   await o.saveWebchatPending({id:'same-stable-id',widgetId:'widget-a',visitorId:'visitor-a',text:'Hello / Hola / שלום',body:{clientMessageId:'same-stable-id',parentUrl:'https://customer.example/original'},createdAt:new Date().toISOString(),attempts:1,nextAttemptAt:0,file:new File(['retained media bytes'],'photo.png',{type:'image/png'})});
   await o.saveWebchatPending({id:'same-stable-id',widgetId:'widget-b',visitorId:'visitor-b',text:'Other tenant draft',body:{clientMessageId:'same-stable-id'},createdAt:new Date().toISOString(),attempts:0,nextAttemptAt:0});
  });
  await page.reload();
  const data=await page.evaluate(async()=>{
   const o=(window as any).outbox,[row]=await o.listWebchatPending('widget-a','visitor-a');
   return {count:(await o.listWebchatPending('widget-a','visitor-a')).length,text:row.text,id:row.id,requestId:row.body.clientMessageId,parent:row.body.parentUrl,file:await row.file.text(),name:row.file.name,other:(await o.listWebchatPending('widget-b','visitor-b')).length,wrong:(await o.listWebchatPending('widget-a','visitor-b')).length,delay:o.webchatRetryDelay(0,30),cap:o.webchatRetryDelay(100)};
  });
  assert.deepEqual(data,{count:1,text:'Hello / Hola / שלום',id:'same-stable-id',requestId:'same-stable-id',parent:'https://customer.example/original',file:'retained media bytes',name:'photo.png',other:1,wrong:0,delay:30000,cap:300000});
  await page.evaluate(async()=>{const o=(window as any).outbox;await o.removeWebchatPending('widget-a','visitor-a','same-stable-id');});
  await page.reload();
  assert.deepEqual(await page.evaluate(async()=>{const o=(window as any).outbox;return [(await o.listWebchatPending('widget-a','visitor-a')).length,(await o.listWebchatPending('widget-b','visitor-b')).length];}),[0,1]);
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});

test('actual widget retries the same failed send after reload in English, Spanish and Hebrew RTL', {timeout:90000}, async()=>{
 const {readdir,readFile}=await import('node:fs/promises');
 const cssName=(await readdir('dist/public/assets')).find(name=>name.endsWith('.css'))!;
 const css=await readFile('dist/public/assets/'+cssName);
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{WebchatWidget}from'./client/src/pages/WidgetFrame';import*as outbox from'./client/src/lib/webchatOutbox';window.outbox=outbox;createRoot(document.getElementById('root')).render(React.createElement(WebchatWidget,{widgetId:'fixturewidget'}));`,resolveDir:process.cwd(),loader:'tsx'},jsx:'automatic',bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'}});
 let requests:any[]=[],messages:any[]=[];
 const server=createServer((req,res)=>{
  if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(req.url?.includes('/api/webchat/')){
   res.setHeader('Content-Type','application/json');
   if(req.method==='POST'){
    let body='';req.on('data',data=>body+=data);req.on('end',()=>{
     const parsed=JSON.parse(body);requests.push(parsed);
     if(requests.length===1){res.statusCode=503;res.setHeader('Retry-After','30');return res.end(JSON.stringify({retryable:true}));}
     messages=[{id:'persisted-fixture',direction:'inbound',content:parsed.message,contentType:'text',mediaUrl:null,createdAt:new Date().toISOString()}];
     res.end(JSON.stringify({success:true,visitorId:parsed.visitorId}));
    });return;
   }
   return res.end(JSON.stringify(req.url.includes('/settings')?{businessName:'Fixture business',widgetEnabled:true,suggestedQuestions:[]}:messages));
  }
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html class="wcw-embed wcs-hide-static-marketing"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>');
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  for(const [locale,width,text]of [['en',1366,'Keep my draft'],['es',390,'Conservar mi mensaje'],['he',390,'לשמור את ההודעה שלי']] as const){
   requests=[];messages=[];const context=await browser.newContext({viewport:{width,height:768}}),page=await context.newPage();
   page.on('pageerror',error=>console.error('widget fixture:',error.message));
   await page.goto(`http://127.0.0.1:${(server.address() as any).port}/widget?locale=${locale}`);
   await page.getByTestId('input-chat-message').fill(text);
   await page.getByTestId('btn-send-chat').click();
   await page.getByTestId('text-delivery-error').waitFor();
   assert.equal(requests.length,1);const originalId=requests[0].clientMessageId;assert.ok(originalId);
   // Advance only the fixture's browser retry clock; production code retains the server backoff.
   await page.evaluate(async()=>{
    const o=(window as any).outbox,request=indexedDB.open('whachat-unsent-v1',1);
    await new Promise<void>((resolve,reject)=>{request.onsuccess=()=>{const db=request.result,tx=db.transaction('messages','readwrite'),s=tx.objectStore('messages'),all=s.getAll();all.onsuccess=()=>{for(const row of all.result){row.nextAttemptAt=0;s.put(row);}};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
   });
   const retried=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().includes('/api/webchat/')&&response.status()===200);
   await page.reload();await retried;await page.getByText(text,{exact:true}).first().waitFor();
   assert.equal(requests.length,2);assert.equal(requests[1].clientMessageId,originalId);assert.equal(requests[1].visitorId,requests[0].visitorId);assert.equal(requests[1].message,text);
   if(locale==='he')assert.ok(await page.locator('[dir="rtl"]').count());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   await context.close();
  }
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});

// Run with Vite on localhost:5000 and Playwright installed. API responses are mocked.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const results=[];
 for (const mobile of [false,true]) for (const returning of [false,true]) for (const locale of ['en','es','he']) {
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900}});
  const page=await context.newPage(); let posts=0;
  const greeting={en:'Unified Inbox help',es:'Ayuda con la bandeja',he:'עזרה עם תיבת ההודעות'}[locale];
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=req.url();
   if(req.method()==='POST') posts++;
   let body={};
   if(url.includes('/settings')) body={enabled:true,headerTitle:'Meet Your AI Sales Team',welcomeMessage:greeting,chatGreeting:greeting,chatPrefill:'Starter draft',suggestedQuestions:['Features & pricing'],pageRuleKey:'pathname:/unified-inbox',locale};
   if(url.includes('/settings') && (new URL(url).searchParams.get('href')||'').includes('/unknown')) body={welcomeMessage:'Default greeting',chatGreeting:'Default greeting',locale};
   if(url.includes('/messages')) {await new Promise(r=>setTimeout(r,400)); body=returning?[{id:'saved-1',direction:'inbound',content:'Genuine saved question',contentType:'text',createdAt:new Date().toISOString()}]:[];}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://localhost:5000/widget-frame/wgt_3c14a2d2a3f30565406e0a2a395c7dcc0903e0f4fba9d188?parentUrl='+encodeURIComponent('https://www.whachatcrm.com/'+(locale==='en'?'':locale+'/')+'unified-inbox')+'&prefill=Stale%20homepage%20draft');
  await page.locator('[data-testid="input-chat-message"]').waitFor();
  await page.waitForTimeout(1200);
  assert.equal(posts,0,'opening must not submit');
  const input=page.locator('[data-testid="input-chat-message"]');
  assert.equal(await input.inputValue(),returning?'':'Starter draft');
  if(returning) assert.equal(await page.getByText('Genuine saved question',{exact:true}).count(),1);
  else assert.equal(await page.getByText(greeting,{exact:true}).count(),1);
  assert.equal(await page.locator('html').getAttribute('dir'),locale==='he'?'rtl':'ltr');
  await page.reload(); await page.locator('[data-testid="input-chat-message"]').waitFor();
  await page.getByText(returning?'Genuine saved question':greeting,{exact:true}).waitFor(); assert.equal(posts,0);
  await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://www.whachatcrm.com',source:window,data:{source:'wcw-parent',type:'wcw-page-context',widgetId:'wgt_3c14a2d2a3f30565406e0a2a395c7dcc0903e0f4fba9d188',href:'https://www.whachatcrm.com/unknown'}})));
  await page.waitForTimeout(1000); assert.equal(posts,0);
  if(returning) assert.equal(await page.getByText('Genuine saved question',{exact:true}).count(),1);
  else await page.getByText('Default greeting',{exact:true}).waitFor({timeout:5000});
  results.push({mobile,returning,locale,navigation:true,result:'PASS'}); await context.close();
 }
 // Third-party storage denial must not prevent history loading or sending initialization.
 const context=await browser.newContext(); const page=await context.newPage();
 await page.addInitScript(()=>{for(const method of ['getItem','setItem']) {const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){if(key.startsWith('wchat_')||key.startsWith('wcw-pr-'))throw new DOMException('Denied','SecurityError');return original.call(this,key,...args)}}});
 let polls=0;
 await page.route('**/api/**',async route=>{const messages=route.request().url().includes('/messages'); if(messages)polls++;await route.fulfill({json:messages?[]:{welcomeMessage:'Storage restricted greeting',chatGreeting:'Storage restricted greeting'}})});
 await page.goto('http://localhost:5000/widget-frame/wgt_3c14a2d2a3f30565406e0a2a395c7dcc0903e0f4fba9d188');
 await page.locator('[data-testid="input-chat-message"]').waitFor(); await page.waitForTimeout(1000); assert.ok(polls>0, 'storage denial must not block visitor initialization');
 results.push({storageDenied:true,result:'PASS'});
 console.log(JSON.stringify(results,null,2)); await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

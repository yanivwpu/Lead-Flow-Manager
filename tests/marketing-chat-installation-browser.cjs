/** Local integration test: real official loader + React iframe; mocked transport, no live AI.
 * Run with Vite on localhost:5000: node tests/marketing-chat-installation-browser.cjs
 */
require('tsx/cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { buildWebchatPublicScript } = require('../server/webchatPublicScript.ts');
const { buildWebchatChromeLayout } = require('../shared/webchatWidgetChrome.ts');
const { resolvePublicWebchatPresentation } = require('../shared/webchatWidgetBranding.ts');
const { toVisitorSafeWebchatPublicBody } = require('../shared/webchatWidgetLauncher.ts');
const { matchWidgetPageRule } = require('../shared/webchatPageRuleMatch.ts');
const { HOMEPAGE_PAGE_RULE_FIXTURE, PRICING_PAGE_RULE_FIXTURE } = require('../shared/webchatPageRuleFixtures.ts');
const { proposeMarketingChatPageCoverage } = require('../shared/marketingChatPageCoverage.ts');
const { MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID: widgetId } = require('../shared/marketingWebsiteChatWidget.ts');
const origin = 'http://localhost:5000';
const settings = proposeMarketingChatPageCoverage({ownerEmail:'marketing@whachatcrm.com',widgetPublicId:widgetId,
 settings:{enabled:true,panelHeading:'Meet Your AI Sales Team',welcomeMessage:'Default marketing greeting',openBehavior:'none',triggerType:'always',
 pageRules:[HOMEPAGE_PAGE_RULE_FIXTURE,PRICING_PAGE_RULE_FIXTURE]}});
const loader = buildWebchatPublicScript({origin});
const results=[];
async function waitUntil(fn, message) {
 for(let i=0;i<100;i++) {if(await fn()) return; await new Promise(r=>setTimeout(r,50));}
 throw new Error(message);
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox'],headless:true});
 try {
  for(const mobile of [false,true]) {
   const context=await browser.newContext({isMobile:mobile,hasTouch:mobile,viewport:mobile?{width:390,height:844}:{width:1280,height:900}});
   try {
    const histories=new Map(); const posts=[]; const polls=[]; let releaseHistory; let releasePricing;
    const historyGate=new Promise(resolve=>{releaseHistory=resolve});
    const pricingGate=new Promise(resolve=>{releasePricing=resolve});
    let holdHistory=true,holdPricing=false,pricingRequests=0;
    await context.route('**/*',async route=>{
     const req=route.request(),url=new URL(req.url());
     if(url.origin!==origin) return route.abort();
     if(url.pathname==='/widget.js') return route.fulfill({contentType:'application/javascript',body:loader});
     if(req.isNavigationRequest() && req.frame()===req.frame().page().mainFrame()) {
      return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><head><title>Local marketing fixture</title></head><body><h1>Marketing fixture</h1><script src="/widget.js?id=${widgetId}"></script></body></html>`});
     }
     if(url.pathname.startsWith('/api/webchat/')) {
      if(url.pathname.endsWith('/settings')) {
       const href=url.searchParams.get('href')||origin+'/';
       if(holdPricing && new URL(href).pathname==='/pricing') {pricingRequests++; await pricingGate;}
       const path=new URL(href).pathname,locale=path.startsWith('/he/')?'he':path.startsWith('/es/')?'es':'en';
       const matched=matchWidgetPageRule(settings,href,locale);
       const presentation=resolvePublicWebchatPresentation({settings,chatGreeting:matched?.greeting,chatPrefill:matched?.prefilledMessage||'',suggestedQuestions:matched?.suggestedQuestions||[],appOrigin:origin});
       const body=toVisitorSafeWebchatPublicBody(presentation,settings,buildWebchatChromeLayout(settings),{locale,...(matched?{pageRuleKey:matched.ruleKey}:{})});
       return route.fulfill({json:body});
      }
      if(url.pathname.endsWith('/messages')) {
       const visitorId=url.pathname.split('/').at(-2);polls.push(visitorId);
       if(holdHistory) await historyGate;
       return route.fulfill({json:histories.get(visitorId)||[]});
      }
      if(req.method()==='POST') {
       const data=req.postDataJSON();posts.push(data);
       const rows=histories.get(data.visitorId)||[];
       rows.push({id:'in-'+posts.length,direction:'inbound',content:data.message,contentType:'text',createdAt:new Date().toISOString()});
       rows.push({id:'out-'+posts.length,direction:'outbound',content:'Mock transport acknowledgement',contentType:'text',createdAt:new Date().toISOString()});
       histories.set(data.visitorId,rows);return route.fulfill({json:{success:true}});
      }
     }
     if(url.pathname.startsWith('/api/')) return route.fulfill({json:{}});
     return route.continue();
    });
    const page=await context.newPage();
    await page.goto(origin+'/');
    await page.locator('[data-wcw="toggle"]').click();
    const frame=page.frameLocator('[data-wcw="frame-container"] iframe');
    await frame.locator('[data-testid="input-chat-message"]').waitFor();
    await waitUntil(()=>polls.length>0,'history request must start');
    await frame.locator('[data-testid="webchat-panel-header"]').getByText('Meet Your AI Sales Team',{exact:true}).waitFor();
    assert.equal(await frame.getByText(HOMEPAGE_PAGE_RULE_FIXTURE.greeting,{exact:true}).count(),0,'no empty-thread greeting before history resolves');
    assert.equal(posts.length,0);
    assert.equal(await frame.locator('[data-testid="webchat-page-rule-action-0"]').count(),0,'do not offer page actions before history loads');
    releaseHistory();holdHistory=false;
    await frame.getByText(HOMEPAGE_PAGE_RULE_FIXTURE.greeting,{exact:true}).waitFor();
    await frame.locator('[data-testid="webchat-page-rule-action-0"]').click();
    await waitUntil(()=>posts.length===1,'explicit click must submit exactly once');
    const visitor=posts[0].visitorId;
    assert.equal(posts[0].message,'Features & pricing');
    assert.deepEqual(posts[0].pageRuleAction,{actionIndex:0});
    await frame.getByText('Mock transport acknowledgement',{exact:true}).waitFor();
    await page.evaluate(()=>history.pushState({},'', '/unified-inbox'));
    await waitUntil(async()=>await frame.getByText('Have questions about Unified Inbox? Ask me about this product, pricing, or requesting a demo.',{exact:true}).count()===1,'navigation updates page card');
    assert.equal(await frame.getByText('Features & pricing',{exact:true}).count(),1,'genuine suggestion submission remains in history');
    assert.equal(posts.length,1,'navigation never submits');
    const bubble=frame.locator('[data-testid="msg-in-1"]');
    assert.ok((await bubble.getAttribute('class')).includes('justify-end'),'restored inbound text uses visitor alignment');
    await page.reload();await page.locator('[data-wcw="toggle"]').click();
    await frame.getByText('Features & pricing',{exact:true}).waitFor();
    assert.equal(posts.length,1,'reload restores without submitting');assert.ok(polls.every(id=>id===visitor),'reload retains the same UUID');
    const input=frame.locator('[data-testid="input-chat-message"]');assert.equal(await input.inputValue(),'');
    await input.fill('My unfinished follow-up');
    for(const [path,locale] of [['/es/ai-copilot','es'],['/he/realtor-growth-engine','he'],['/unknown','en']]) {
     await page.evaluate(p=>history.pushState({},'',p),path);
     await waitUntil(async()=>await frame.locator('html').getAttribute('lang')===locale,'live language updates');
     assert.equal(await input.inputValue(),'My unfinished follow-up');
     assert.equal(await frame.getByText('Features & pricing',{exact:true}).count(),1);assert.equal(posts.length,1);
    }
    // While a slow old settings response is outstanding, old actions cannot be clicked.
    holdPricing=true;await page.evaluate(()=>history.pushState({},'', '/pricing'));
    await waitUntil(()=>pricingRequests>0,'slow page request must start');
    await waitUntil(async()=>await frame.locator('[data-testid="webchat-page-rule-action-0"]').count()===0,'hide stale page actions');
    await page.evaluate(()=>{document.title='Campaigns page';history.pushState({},'', '/campaigns')});
    await waitUntil(async()=>await frame.getByText('Have questions about Campaigns? Ask me about this product, pricing, or requesting a demo.',{exact:true}).count()===1,'latest page wins');
    releasePricing();await page.waitForTimeout(200);
    assert.equal(await input.inputValue(),'My unfinished follow-up');assert.equal(posts.length,1);
    assert.equal(await frame.getByText(PRICING_PAGE_RULE_FIXTURE.greeting,{exact:true}).count(),0,'late old response does not overwrite current page');
    await frame.locator('[data-testid="btn-send-chat"]').click();
    await waitUntil(()=>posts.length===2,'typed follow-up submits only on explicit send');
    assert.equal(posts[1].message,'My unfinished follow-up');
    assert.equal(posts[1].visitorId,visitor);
    assert.equal(posts[1].parentUrl,origin+'/campaigns');
    assert.equal(posts[1].pageTitle,'Campaigns page');
    assert.equal(posts[1].locale,'en');
    await frame.locator('[data-testid="msg-in-2"]').waitFor();
    await page.evaluate(()=>{document.title='';history.pushState({},'', '/integrations')});
    await waitUntil(async()=>await frame.getByText('Have questions about Integrations? Ask me about this product, pricing, or requesting a demo.',{exact:true}).count()===1,'empty-title navigation loads current context');
    await input.fill('Which integrations are supported?');
    await frame.locator('[data-testid="btn-send-chat"]').click();
    await waitUntil(()=>posts.length===3,'explicit integrations follow-up sends');
    assert.equal(posts[2].parentUrl,origin+'/integrations');
    assert.equal(posts[2].pageTitle,undefined,'neither the previous parent title nor the iframe title is sent');
    results.push({mobile,followupContext:true,officialInstallation:true,deliberateClick:true,persistedUuid:true,historyBubbleReproduced:true,navigation:true,delayedSettings:true,result:'PASS'});
   } finally {await context.close();}
  }
  console.log(JSON.stringify(results,null,2));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

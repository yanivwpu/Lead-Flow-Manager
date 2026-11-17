import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {once} from 'node:events';
import express,{Router} from 'express';
import {chromium} from 'playwright';
import {registerConsentProxyRoute} from '../server/ecommerce/shopifyConsentStorefrontRoutes';
import {CONSENT_PURPOSES,emptyEnrollment,enrollmentLink,enrollmentNotice,type ConsentLocale,type EnrollmentView} from '../shared/shopifyConsentEnrollment';

// Real browser -> fixture Shopify/password gate -> signed real application
// proxy -> actual extension JS/CSS. No real shop, identity, consent or sender.
test('published-theme browser fixture renders safely through Shopify proxy/session and recovers boundedly',
  {skip:process.env.SHOPIFY_CONSENT_BROWSER_TESTS!=='1',timeout:90000},async t=>{
  const script=await readFile(process.env.SHOPIFY_CONSENT_BROWSER_SCRIPT||'extensions/whachat-consent/assets/consent.js','utf8');
  const css=await readFile('extensions/whachat-consent/assets/consent.css','utf8');
  const secret='fixture-shopify-proxy-key',shop='fixture.myshopify.com';
  let locale:ConsentLocale='en',mode='ok',attempts=0,forwards=0;
  const selected=['orderConfirmation','fulfillmentUpdate','cancellation','checkoutRecovery'];
  const view=():EnrollmentView=>{
    const draft=emptyEnrollment(locale);draft.merchantName='Fixture Store';draft.sourceUrl=`https://${shop}/`;
    for(const p of CONSENT_PURPOSES)draft.purposes[p].selected=selected.includes(p);
    return {shop,draft,revision:'a'.repeat(64),savedAt:null,connectionCurrent:true,phoneAvailable:true,
      rows:CONSENT_PURPOSES.map(purpose=>({purpose,selected:selected.includes(purpose),templateReady:false,merchantEnabled:false,operatorReleased:false,
        captureReady:true,activationBlocked:true,recipientConsent:'required_per_recipient',blockers:['operator_release_required'],
        notice:selected.includes(purpose)?enrollmentNotice(shop,purpose,draft):null,link:selected.includes(purpose)?enrollmentLink('+15551234567',purpose):null}))};
  };
  const backend=express(),proxy=Router();
  registerConsentProxyRoute(proxy,{secret:()=>secret,enrollmentForShop:async domain=>{assert.equal(domain,shop);return view();}});
  backend.use((req,_res,next)=>{assert.equal(req.headers.cookie,undefined,'Shopify forwarder never sends browser cookies to app');forwards++;next();});
  backend.use(proxy);
  const api=backend.listen(0,'127.0.0.1');await once(api,'listening');
  const apiRoot=`http://127.0.0.1:${(api.address() as any).port}`;
  const liquid=await readFile('extensions/whachat-consent/blocks/whatsapp-consent.liquid','utf8');
  const schema=JSON.parse(liquid.split('{% schema %}')[1].split('{% endschema %}')[0]);
  assert.equal(schema.target,'body');assert.equal(schema.javascript,'consent.js');assert.equal(schema.stylesheet,'consent.css');
  const host=liquid.slice(0,liquid.indexOf('>')+1).replace(/{{(.*?)}}/g,(_match,expression:string)=>{
    if(expression.includes('block.settings.placement'))return schema.settings[0].default;
    if(expression.trim()==='block.shopify_attributes')return 'data-shopify-editor-block="fixture"';
    throw Error('unexpected Liquid host interpolation');
  })+'</div>';
  assert.ok(host.includes('data-whachat-consent'));

  const store=express();
  store.get('/assets/consent.js',(_q,r)=>r.type('js').send(script));store.get('/assets/consent.css',(_q,r)=>r.type('css').send(css));
  store.get('/password',(_q,r)=>r.type('html').send('<h1>Password protected store</h1><form><input type="password"></form>'));
  store.get('/apps/whachat-consent',async(req,res)=>{
    attempts++;
    if(mode==='temporary'&&attempts===1){res.status(503).end();return;}
    if(mode==='empty'){res.status(204).end();return;}
    if(mode==='denied'){res.status(403).end();return;}
    if(mode==='password_html'){res.type('html').send('<form action="/password"><h1>Password</h1></form>');return;}
    if(mode==='hostile'){
      res.type('html').send('<section class="whachat-consent" onclick="window.evil=true"><h2>Preferences</h2><article><h3>Order</h3><p>STOP</p><script>window.evil=true</script><img src="https://evil.invalid/track"><a href="javascript:window.evil=true">bad</a><a href="https://wa.me/15551234567?text=YES%20WHATSAPP%20ORDER%20CONFIRMATIONS" onfocus="window.evil=true">Choose</a></article></section>');return;
    }
    if(mode==='gate'&&!req.headers.cookie?.includes('storefront_password=accepted')){res.redirect('/password');return;}
    // Shopify's signed forwarding contract, with no browser-supplied identity.
    const params=new URLSearchParams({shop,path_prefix:'/apps/whachat-consent',timestamp:String(Math.floor(Date.now()/1000))});
    params.set('signature',createHmac('sha256',secret).update([...params].map(([k,v])=>`${k}=${v}`).sort().join('')).digest('hex'));
    const response=await fetch(apiRoot+'/consent-storefront?'+params);
    res.status(response.status).type('html').send(await response.text());
  });
  store.get('/',(_req,res)=>{if(mode==='csp')res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'");res.type('html').send(`<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/consent.css"><script defer src="/assets/consent.js"></script><style>body{margin:0;font:16px/1.6 Arial,sans-serif;color:#17332c;background:#f8faf9}header,main,footer{padding:24px}main{max-width:1100px;margin:auto}footer{background:#e8efeb}h1{font-size:32px}</style></head><body><header>Fixture Shopify storefront</header><main id="MainContent"><h1>Welcome to our store</h1><p>Theme main content</p></main><footer>Store footer</footer>${mode==='late'?'':mode==='hidden'?'<div hidden>'+host+'</div>':host}</body></html>`);});
  const themeServer=store.listen(0,'127.0.0.1');await once(themeServer,'listening');
  const origin=`http://127.0.0.1:${(themeServer.address() as any).port}`;
  const browser=await chromium.launch({headless:true,...(process.env.SHOPIFY_CONSENT_BROWSER_EXECUTABLE?{executablePath:process.env.SHOPIFY_CONSENT_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox']});
  const diag=(page:any)=>page.evaluate(()=> (window as any).WhachatConsentDiagnostics?.());
  async function pageFor(nextMode:string,nextLocale:ConsentLocale='en',width=1280,cookie=false){
    mode=nextMode;locale=nextLocale;attempts=0;forwards=0;
    const context=await browser.newContext({viewport:{width,height:950}});
    if(cookie)await context.addCookies([{name:'storefront_password',value:'accepted',url:origin,httpOnly:true,sameSite:'Lax'}]);
    const external:string[]=[];const posts:string[]=[];
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/assets/consent.js' && mode==='missing_asset')return route.abort();
      if(url.pathname==='/apps/whachat-consent' && (mode==='offline'||mode==='network'&&attempts===0)){attempts++;return route.abort('failed');}
      if(url.origin!==origin){external.push(url.origin);return route.abort();}
      if(route.request().method()!=='GET')posts.push(route.request().method());
      return route.continue();
    });
    const page=await context.newPage();page.setDefaultTimeout(8000);await page.goto(origin);
    return {page,context,external,posts};
  }
  try{
    for(const lang of ['en','es','he'] as const)for(const width of [1280,390])await t.test(`${lang} ${width}px: selected notices, safe message previews, focus, placement and RTL`,async()=>{
      const f=await pageFor('ok',lang,width);
      try{
        const section=f.page.locator('section.whachat-consent');await section.waitFor();
        assert.equal(await section.locator('article').count(),4);assert.equal(await section.getAttribute('dir'),lang==='he'?'rtl':'ltr');
        assert.ok((await section.textContent())?.includes('STOP'));
        assert.equal(await f.page.locator('[data-whachat-consent]').evaluate(e=>e.nextElementSibling?.tagName),'FOOTER');
        assert.equal(await section.locator('input[type=checkbox]').count(),4);
        assert.equal(await section.locator('input:checked').count(),0);
        assert.equal(await section.locator('button:disabled').count(),1);
        assert.equal(await section.locator('a:visible').count(),0);
        assert.ok((await section.boundingBox())!.height < (width===390?750:550),'compact collapsed section');
        if(process.env.SHOPIFY_CONSENT_SCREENSHOTS){await mkdir('work/compact-previews',{recursive:true});await f.page.screenshot({path:`work/compact-previews/${lang}-${width}.png`,fullPage:true});}
        await section.locator('input').first().check();
        await section.locator('button').click();
        assert.equal(await section.locator('a:visible').count(),1);
        assert.equal(await section.locator('details[open]').count(),1);
        await section.locator('summary').nth(1).focus();await f.page.keyboard.press('Enter');assert.ok(await section.locator('details[open] code').count());
        const link=section.locator('a').first();await link.focus();assert.equal(await link.evaluate(e=>e===document.activeElement),true);
        assert.ok((await link.getAttribute('href'))?.startsWith('https://wa.me/'));assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
        assert.ok((await link.boundingBox())!.height>=44);assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        const firstBox=(await section.locator('article').nth(0).boundingBox())!;
        const secondBox=(await section.locator('article').nth(1).boundingBox())!;
        assert.equal(Math.round(firstBox.y)===Math.round(secondBox.y),width!==390);
        assert.deepEqual(await diag(f.page),{scriptLoaded:true,containers:1,state:'ready',reason:'notices_rendered',attempts:1,rendered:true});
        const before=attempts;await f.page.evaluate(()=>{for(let i=0;i<8;i++)document.dispatchEvent(new Event('shopify:section:load'));});
        await f.page.addScriptTag({url:origin+'/assets/consent.js'});await f.page.waitForTimeout(100);
        assert.equal(attempts,before);assert.equal(await section.count(),1);
        await f.page.evaluate(()=>{document.querySelector('[data-whachat-consent]')!.replaceChildren();document.dispatchEvent(new Event('shopify:section:load'));});
        await section.waitFor();assert.equal(await section.locator('article').count(),4);assert.equal(attempts,before,'DOM re-render uses the sanitized cache');assert.deepEqual(f.external,[]);assert.deepEqual(f.posts,[]);
        if(process.env.SHOPIFY_CONSENT_SCREENSHOTS){await mkdir('work/issue295',{recursive:true});await f.page.screenshot({path:`work/issue295/storefront-${lang}-${width}.png`,fullPage:true});}
      }finally{await f.context.close();}
    });
    await t.test('preferences remain independent and review preserves each exact-purpose link without consent writes',async()=>{
      const f=await pageFor('ok');
      try {
        const section=f.page.locator('section.whachat-consent');await section.waitFor();
        const original=await section.locator('article a').evaluateAll(links=>links.map(a=>a.getAttribute('href')));
        assert.equal(new Set(original).size,4);
        await section.locator('input').nth(0).check();
        await section.locator('input').nth(3).check();
        await section.locator('button').click();
        assert.deepEqual(await section.locator('a:visible').evaluateAll(links=>links.map(a=>a.getAttribute('href'))),[original[0],original[3]]);
        await section.locator('input').nth(0).uncheck();
        assert.equal(await section.locator('input').nth(3).isChecked(),true);
        assert.equal(await section.locator('a:visible').count(),0);
        await section.locator('button').click();
        assert.deepEqual(await section.locator('a:visible').evaluateAll(links=>links.map(a=>a.getAttribute('href'))),[original[3]]);
        for(const article of await section.locator('article').all()) {
          const exact=await article.locator('code').textContent();
          assert.equal(new URL((await article.locator('a').getAttribute('href'))!).searchParams.get('text'),exact);
        }
        assert.deepEqual(f.posts,[]);assert.deepEqual(f.external,[]);assert.equal(attempts,1);
        await f.page.reload();
        await section.waitFor();assert.equal(await section.locator('input:checked').count(),0);
      } finally {await f.context.close();}
    });
    await t.test('password session stays on Shopify origin and is not forwarded to application',async()=>{
      const f=await pageFor('gate','en',390,true);
      try{await f.page.locator('section.whachat-consent').waitFor();assert.equal(attempts,1);assert.equal(forwards,1);assert.equal((await diag(f.page)).state,'ready');}
      finally{await f.context.close();}
    });
    await t.test('missing storefront password fails closed and retries at most three times',async()=>{
      const f=await pageFor('gate');
      try{await f.page.waitForFunction(()=> (window as any).WhachatConsentDiagnostics?.().state==='failed');assert.equal(attempts,3);assert.equal(forwards,0);assert.equal(await f.page.locator('section.whachat-consent').count(),0);}
      finally{await f.context.close();}
    });
    await t.test('late insertion renders; repeated events and duplicate hosts do not duplicate requests or notices',async()=>{
      const f=await pageFor('late');
      try{
        assert.equal(attempts,0);assert.equal((await diag(f.page)).state,'missing_container');
        await f.page.evaluate(h=>document.body.insertAdjacentHTML('beforeend',h),host);
        await f.page.locator('section.whachat-consent').waitFor();
        await f.page.evaluate(h=>{document.body.insertAdjacentHTML('beforeend',h);for(let i=0;i<5;i++)document.dispatchEvent(new Event('shopify:section:load'));},host);
        await f.page.waitForTimeout(100);assert.equal(attempts,1);assert.equal(await f.page.locator('section.whachat-consent').count(),1);
      }finally{await f.context.close();}
    });
    await t.test('merchant original placement and vintage footer fallback stay in normal page flow',async()=>{
      let f=await pageFor('late');
      try{await f.page.evaluate(h=>document.body.insertAdjacentHTML('beforeend',h.replace('before_footer','original')),host);await f.page.locator('body > [data-whachat-consent] section').waitFor();assert.equal(await f.page.locator('main [data-whachat-consent]').count(),0);}
      finally{await f.context.close();}
      f=await pageFor('late');
      try{await f.page.evaluate(h=>{document.querySelector('main')!.remove();document.body.insertAdjacentHTML('beforeend',h);},host);await f.page.locator('section.whachat-consent').waitFor();assert.equal(await f.page.locator('[data-whachat-consent]').evaluate(e=>e.nextElementSibling?.tagName), 'FOOTER');}
      finally{await f.context.close();}
    });
    for(const transient of ['network','temporary'])await t.test(`${transient} recovers without an early loaded marker`,async()=>{
      const f=await pageFor(transient);
      try{
        await f.page.waitForFunction(()=> (window as any).WhachatConsentDiagnostics?.().state==='retrying');
        assert.equal(await f.page.locator('[data-whachat-consent]').getAttribute('data-loaded'),null);
        await f.page.locator('section.whachat-consent').waitFor();assert.equal(attempts,2);assert.equal((await diag(f.page)).state,'ready');
      }finally{await f.context.close();}
    });
    for(const terminal of ['empty','denied','password_html','offline'])await t.test(`${terminal} stays blank and bounded`,async()=>{
      const f=await pageFor(terminal);
      try{
        await f.page.waitForFunction(()=> ['empty','blocked','failed'].includes((window as any).WhachatConsentDiagnostics?.().state));
        await f.page.evaluate(()=>{for(let i=0;i<8;i++)document.dispatchEvent(new Event('shopify:section:load'));});await f.page.waitForTimeout(100);
        assert.equal(attempts,terminal==='offline'?3:1);assert.equal(await f.page.locator('section.whachat-consent').count(),0);assert.equal(await f.page.locator('[data-loaded=true]').count(),0);assert.equal(forwards,0);
      }finally{await f.context.close();}
    });
    await t.test('a hidden theme injection wrapper is escaped by inline main-content placement',async()=>{
      const f=await pageFor('hidden');
      try{await f.page.locator('section.whachat-consent').waitFor();assert.equal(await f.page.locator('[hidden] [data-whachat-consent]').count(),0);}
      finally{await f.context.close();}
    });
    await t.test('CSP denial and missing assets have safe distinguishable runtime evidence',async()=>{
      let f=await pageFor('csp');
      try{await f.page.waitForFunction(()=> (window as any).WhachatConsentDiagnostics?.().state==='failed');assert.equal((await diag(f.page)).attempts,3);assert.equal(attempts,0);assert.equal((await diag(f.page)).rendered,false);}
      finally{await f.context.close();}
      f=await pageFor('missing_asset');
      try{assert.equal(await diag(f.page),undefined);assert.equal(await f.page.locator('[data-whachat-consent]').count(),1);assert.equal(await f.page.locator('section.whachat-consent').count(),0);assert.equal(attempts,0);}
      finally{await f.context.close();}
    });
    await t.test('hostile proxy markup is rebuilt without executable attributes or unsafe links',async()=>{
      const f=await pageFor('hostile');
      try{await f.page.locator('section.whachat-consent').waitFor();assert.equal(await f.page.locator('section.whachat-consent script,section.whachat-consent img,[onclick],[onfocus]').count(),0);assert.equal(await f.page.locator('section.whachat-consent a').count(),1);assert.equal(await f.page.evaluate(()=> (window as any).evil),undefined);assert.deepEqual(f.external,[]);}
      finally{await f.context.close();}
    });
  }finally{await browser.close();await new Promise<void>(resolve=>themeServer.close(()=>resolve()));await new Promise<void>(resolve=>api.close(()=>resolve()));}
});

const {createServer}=require("node:http");
const assert=require("node:assert/strict");
const path=require("node:path");
const test=require("node:test");
const root=process.cwd();
const load=n=>require(require.resolve(n,{paths:[root]}));
const {build}=load("esbuild"),{chromium}=load("playwright");
test("login locale survives session hydration and reload without rendering a wrong-language dashboard", {timeout:120000}, async () => {
  const virtual=path.resolve(root,"fixture-output");
  const result=await build({absWorkingDir:root,entryPoints:["client/src/bootstrap.tsx"],outdir:virtual,write:false,bundle:true,splitting:true,format:"esm",jsx:"automatic",define:{"import.meta.env":"{}"},loader:{".css":"empty",".png":"empty",".svg":"empty",".webp":"empty"},plugins:[{name:"app fixture",setup(b){
    b.onResolve({filter:/^\.\/App$/},args=>args.importer.endsWith("bootstrap.tsx")?{path:"fixture-app",namespace:"fixture"}:undefined);
    b.onLoad({filter:/.*/,namespace:"fixture"},()=>({resolveDir:root,loader:"tsx",contents:`
      import {AuthProvider,useAuth} from "./client/src/lib/auth-context";
      import {AuthPage} from "./client/src/pages/Auth";
      import {QueryClientProvider} from "@tanstack/react-query";
      import {queryClient} from "./client/src/lib/queryClient";
      import {useTranslation} from "react-i18next";
      import {LanguageSelector} from "./client/src/components/LanguageSelector";
      import {Toaster} from "./client/src/components/ui/toaster";
      function Screen(){
        const {user,isLoading,sessionAligned,logout}=useAuth();
        const {t,i18n}=useTranslation();
        if(location.pathname==="/auth")return <AuthPage/>;
        if(!location.pathname.startsWith("/app/"))return <><LanguageSelector navigateOnChange/><a href="/auth?mode=login">Sign in fixture</a></>;
        if(isLoading||!sessionAligned||!user)return null;
        window.dashboardFrames??=[];
        window.dashboardFrames.push([user.id,i18n.language,document.documentElement.lang,document.documentElement.dir]);
        return <main data-testid="dashboard"><h1>{t("nav.inbox")}</h1><button onClick={logout}>Exit</button></main>;
      }
      export default function App(){return <QueryClientProvider client={queryClient}><AuthProvider><Screen/><Toaster/></AuthProvider></QueryClientProvider>}
    `}));
  }}]});
  const files=new Map(result.outputFiles.map(f=>["/"+path.relative(virtual,f.path),f.contents]));
  let fixture;
  const server=createServer(async (req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname;
    const port=server.address().port;
    const marketing="http://www.whachatcrm.test:"+port;
    const appOrigin="http://app.whachatcrm.test:"+port;
    const isMarketing=req.headers.host==="www.whachatcrm.test:"+port;
    const isApp=req.headers.host==="app.whachatcrm.test:"+port;
    if(req.headers.host==="whachatcrm.test:"+port)return res.writeHead(301,{location:marketing+req.url}).end();
    if(req.headers.origin===marketing) {
      res.setHeader("Access-Control-Allow-Origin",marketing);
      res.setHeader("Access-Control-Allow-Credentials","true");
      res.setHeader("Access-Control-Allow-Headers","content-type,cache-control,pragma");
      res.setHeader("Access-Control-Allow-Methods","GET,POST,PATCH,OPTIONS");
    }
    if(req.method==="OPTIONS")return res.writeHead(204).end();
    if(isMarketing&&(pathname.startsWith("/api/")||pathname.startsWith("/app/"))) {
      res.writeHead(pathname.startsWith("/api/")?307:301,{location:appOrigin+req.url}).end();
      return;
    }
    if(pathname.startsWith("/api/")){
      const payload=[];
      for await(const chunk of req)payload.push(chunk);
      const body=payload.length?JSON.parse(Buffer.concat(payload).toString()):{};
      const send=(value,status=200)=>res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"}).end(JSON.stringify(value));
      const cookie=req.headers.cookie?.includes("fixture_session=1");
      if(pathname==="/api/auth/login"){
        if (fixture.slow) await new Promise(done=>setTimeout(done,250));
        fixture.active=body.email;
        fixture.loginLanguage=["en","he","es"].includes(body.loginLanguage)&&body.loginLanguage!==fixture.saved ? body.loginLanguage : undefined;
        res.setHeader("Set-Cookie","fixture_session=1; Path=/; HttpOnly; SameSite=Lax");
        return send({});
      }
      if(pathname==="/api/auth/logout"){
        fixture.active=null;
        fixture.loginLanguage=undefined;
        res.setHeader("Set-Cookie","fixture_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
        return send({});
      }
      if(pathname==="/api/auth/me")return cookie&&fixture.active
        ?send({id:fixture.active,name:"Fixture",email:fixture.active,language:fixture.saved,loginLanguage:fixture.loginLanguage,emailVerifiedAt:"2026-01-01"})
        :send({},401);
      if(pathname==="/api/user/language"){
        if(!cookie||body.expectedAccountId!==fixture.active)return send({},409);
        fixture.writes.push({origin:isApp?appOrigin:null,...body});
        if(!fixture.fail){fixture.saved=body.language;fixture.loginLanguage=undefined;}
        return send({},fixture.fail?500:200);
      }
      return send({});
    }
    const contents=files.get(pathname);
    if(contents){
      if(/\/(he|es)-[A-Z0-9]+\.js/.test(pathname))await new Promise(done=>setTimeout(done,400));
      res.writeHead(200,{"Content-Type":"application/javascript"}).end(contents);
      return;
    }
    res.writeHead(200,{"Content-Type":"text/html"}).end('<!doctype html><html lang="en" dir="ltr"><div id="root"></div><script type="module" src="/bootstrap.js"></script></html>');
  });
  await new Promise(done=>server.listen(0,"127.0.0.1",done));
  const port=server.address().port;
  const origin="http://127.0.0.1:"+port;
  const marketing="http://www.whachatcrm.test:"+port;
  const appOrigin="http://app.whachatcrm.test:"+port;
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH || undefined,headless:true,args:["--no-sandbox","--no-proxy-server","--host-resolver-rules=MAP *.whachatcrm.test 127.0.0.1, MAP whachatcrm.test 127.0.0.1"]});
  try {
    const cases=[
      {choice:"he",account:"en",want:"he",write:true,crossOrigin:true,slow:true},
      {choice:"es",account:"en",want:"es",write:true,crossOrigin:true},
      {choice:"en",account:"he",want:"en",write:true,crossOrigin:true},
      {marketingChoice:"he",account:"en",want:"he",write:true,crossOrigin:true},
      {marketingPath:"/he",account:"es",want:"es",crossOrigin:true},
      {choice:"he",account:"en",want:"he",write:true,fail:true,crossOrigin:true},
      {choice:"he",account:"en",want:"he",write:true},
      {choice:"es",account:"en",want:"es",write:true},
      {choice:"en",account:"he",want:"en",write:true},
      {account:"es",want:"es",browser:"he"},
      {account:null,want:"he",browser:"he"},
      {account:null,want:"en",browser:"he",untrusted:true},
      {choice:"he",account:"en",want:"he",write:true,fail:true},
    ];
    for(const [n,scenario] of cases.entries()){
      const context=await browser.newContext();
      const page=await context.newPage();
      page.setDefaultTimeout(8000);
      fixture={active:null,saved:scenario.account,fail:scenario.fail,slow:scenario.slow,writes:[]};
      const {writes}=fixture;
      if(scenario.browser)await page.addInitScript(({browser,untrusted})=>{
        localStorage.setItem("whachatcrm_language",browser);
        if (!untrusted) localStorage.setItem("whachatcrm_language_source","user");
      },scenario);
      const check=async (id,lang)=>{
        await page.getByTestId("dashboard").waitFor();
        const frames=await page.evaluate(()=>window.dashboardFrames);
        assert.ok(frames.length);
        for(const frame of frames)assert.deepEqual(frame,[id,lang,lang,lang==="he"?"rtl":"ltr"]);
      };
      const signIn=async(id,choice)=>{
        if(scenario.marketingChoice||scenario.marketingPath){
          await page.goto("http://whachatcrm.test:"+port+(scenario.marketingPath??"/"));
          if(scenario.marketingChoice){
            await page.getByTestId("language-selector").click();
            await page.getByTestId("language-option-"+scenario.marketingChoice).click();
            await page.waitForFunction(l=>document.documentElement.lang===l,scenario.marketingChoice);
          }
          await page.getByRole("link",{name:"Sign in fixture"}).click();
        } else {
          await page.goto((scenario.crossOrigin?marketing:origin)+"/auth?mode=login");
        }
        if(choice){
          await page.getByTestId("language-selector").click();
          await page.getByTestId("language-option-"+choice).click();
          await page.waitForFunction(lang=>document.documentElement.lang===lang,choice);
        }
        await page.locator("#email").fill(id);
        await page.locator("#password").fill("synthetic-fixture-only");
        await page.locator('form button[type="submit"]').click();
      };
      const id="fixture"+n+"@example.test";
      await signIn(id,scenario.choice);
      await check(id,scenario.want);
      await new Promise(done=>setTimeout(done,120));
      assert.equal(writes.length,scenario.write?1:0);
      if(scenario.crossOrigin)assert.equal(new URL(page.url()).origin,appOrigin);
      if(scenario.write){
        assert.equal(writes[0].language,scenario.want);
        assert.equal(writes[0].expectedAccountId,id);
        if(scenario.crossOrigin)assert.equal(writes[0].origin,appOrigin);
      }
      assert.equal(fixture.saved,scenario.write&&!scenario.fail?scenario.want:scenario.account);
      await page.reload();
      await check(id,scenario.want);
      if(scenario.fail) {
        await page.getByRole("button",{name:"Exit"}).click();
        await page.waitForURL((scenario.crossOrigin?appOrigin:origin)+"/");
        fixture.saved="es";
        const other="other@example.test";
        await signIn(other);
        await check(other,"es");
        assert.equal(writes.length,1);
      }
      console.log("Passed",JSON.stringify(scenario));
      await context.close();
    }
  }finally{await browser.close();server.close();}
});

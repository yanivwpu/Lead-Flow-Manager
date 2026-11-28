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
      import {Toaster} from "./client/src/components/ui/toaster";
      function Screen(){
        const {user,isLoading,sessionAligned,logout}=useAuth();
        const {t,i18n}=useTranslation();
        if(location.pathname==="/auth")return <AuthPage/>;
        if(isLoading||!sessionAligned||!user)return null;
        window.dashboardFrames??=[];
        window.dashboardFrames.push([user.id,i18n.language,document.documentElement.lang,document.documentElement.dir]);
        return <main data-testid="dashboard"><h1>{t("nav.inbox")}</h1><button onClick={logout}>Exit</button></main>;
      }
      export default function App(){return <QueryClientProvider client={queryClient}><AuthProvider><Screen/><Toaster/></AuthProvider></QueryClientProvider>}
    `}));
  }}]});
  const files=new Map(result.outputFiles.map(f=>["/"+path.relative(virtual,f.path),f.contents]));
  const server=createServer((req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname;
    const contents=files.get(pathname);
    if(contents){res.writeHead(200,{"Content-Type":"application/javascript"}).end(contents);return;}
    res.writeHead(200,{"Content-Type":"text/html"}).end('<!doctype html><html lang="en" dir="ltr"><div id="root"></div><script type="module" src="/bootstrap.js"></script></html>');
  });
  await new Promise(done=>server.listen(0,"127.0.0.1",done));
  const origin="http://127.0.0.1:"+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH || undefined,headless:true,args:["--no-sandbox"]});
  try {
    const cases=[
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
      let active=null,saved=scenario.account;
      const writes=[];
      if(scenario.browser)await page.addInitScript(({browser,untrusted})=>{
        localStorage.setItem("whachatcrm_language",browser);
        if (!untrusted) localStorage.setItem("whachatcrm_language_source","user");
      },scenario);
      await page.route("**/*.js",async route=>{
        if(/\/(he|es)-[A-Z0-9]+\.js/.test(new URL(route.request().url()).pathname))await new Promise(done=>setTimeout(done,400));
        await route.continue();
      });
      await page.route("**/api/**",async route=>{
        const req=route.request(),p=new URL(req.url()).pathname;
        if(p==="/api/auth/login"){active=req.postDataJSON().email;return route.fulfill({json:{}});}
        if(p==="/api/auth/logout"){active=null;return route.fulfill({json:{}});}
        if(p==="/api/auth/me")return active
          ?route.fulfill({json:{id:active,name:"Fixture",email:active,language:saved,emailVerifiedAt:"2026-01-01"}})
          :route.fulfill({status:401,json:{}});
        if(p==="/api/user/language"){const body=req.postDataJSON();writes.push(body);assert.equal(body.expectedAccountId,active);if(!scenario.fail)saved=body.language;return route.fulfill({status:scenario.fail?500:200,json:{}});}
        return route.fulfill({json:{}});
      });
      const check=async (id,lang)=>{
        await page.getByTestId("dashboard").waitFor();
        const frames=await page.evaluate(()=>window.dashboardFrames);
        assert.ok(frames.length);
        for(const frame of frames)assert.deepEqual(frame,[id,lang,lang,lang==="he"?"rtl":"ltr"]);
      };
      const signIn=async(id,choice)=>{
        await page.goto(origin+"/auth?mode=login");
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
      if(scenario.write)assert.equal(writes[0].language,scenario.want);
      await page.reload();
      await check(id,scenario.want);
      if(scenario.fail) {
        await page.getByRole("button",{name:"Exit"}).click();
        await page.waitForURL(origin+"/");
        saved="es";
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

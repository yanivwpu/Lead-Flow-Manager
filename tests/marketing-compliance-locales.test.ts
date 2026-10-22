/** Render actual Phase 1 controls in each supported authenticated locale. No network. */
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { build } from "esbuild";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
await mkdir("work",{recursive:true});
const scratch = await mkdtemp(join(process.cwd(),"work","marketing-locales-"));
try {
  const outfile = join(scratch,"controls.mjs");
  await build({stdin:{contents:'export {MarketingSenderSetup} from "./client/src/components/settings/MarketingSenderSetup"; export {MarketingEmailPreview} from "./client/src/components/settings/MarketingEmailPreview"; export {ContactSuppressionStatus} from "./client/src/components/ContactSuppressionStatus";',resolveDir:process.cwd(),loader:"tsx"},outfile,bundle:true,platform:"node",format:"esm",packages:"external",jsx:"automatic",plugins:[{name:"no-network-query",setup(b){
    b.onResolve({filter:/^@tanstack\/react-query$/},()=>({path:"query",namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"js",contents:`export const useQueryClient=()=>({invalidateQueries(){}});export const useMutation=()=>({isPending:false});export const useQuery=({queryKey})=>({isPending:false,isFetching:false,data:queryKey[0]==='marketing-preview'?{subject:'שלום <script>',text:'Hola שלום https://example.com',html:'<p dir="rtl">שלום</p>'}:queryKey[0]==='marketing-sender-profiles'?{profiles:[],mailboxes:[{id:'m',email:'sender@example.com'}]}:{canSuppress:true,history:[]}});` }));
  }}]});
  const controls = await import(pathToFileURL(outfile).href);
  const resources = Object.fromEntries(await Promise.all(["en","es","he"].map(async lang=>[lang,{translation:JSON.parse(await readFile(`client/src/locales/${lang}.json`,"utf8"))}])));
  const instance = createInstance(); await instance.init({resources,lng:"en",fallbackLng:"en",interpolation:{escapeValue:false}});
  for (const lang of ["en","es","he"]) {
    await instance.changeLanguage(lang);
    const copy = resources[lang].translation.marketingCompliance;
    assert.deepEqual(Object.keys(copy).sort(),Object.keys(resources.en.translation.marketingCompliance).sort());
    for (const [component,props,key] of [[controls.MarketingSenderSetup,{},"senderTitle"],[controls.MarketingEmailPreview,{itemId:"q",revision:"1"},"previewTitle"],[controls.ContactSuppressionStatus,{contactId:"c"},"preferences"]] as const) {
      const html = renderToStaticMarkup(React.createElement(I18nextProvider,{i18n:instance},React.createElement(component,props)));
      assert(html.includes(`lang="${lang}"`));
      assert(html.includes(`dir="${lang==='he'?'rtl':'ltr'}"`));
      assert(html.includes(copy[key]),`${lang}: ${key}`);
      assert(!html.includes('marketingCompliance.'));
      if(key==='previewTitle') {assert(html.includes('sandbox=""'));assert(html.includes('dir="auto"'));assert(!html.includes('<script>'));}
      if(key==='senderTitle') assert(html.includes(copy.senderHold));
    }
  }
  console.log("ok - actual English, Spanish and Hebrew RTL sender, suppression and safe recipient-preview controls");
} finally {await rm(scratch,{recursive:true,force:true});}

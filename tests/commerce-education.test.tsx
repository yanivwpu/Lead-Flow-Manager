import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import i18next from "i18next";
import { Router } from "wouter";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { rememberCommerceWelcome, hasPendingCommerceWelcome, hasSeenCommerceWelcome, finishCommerceWelcome, shouldShowCommerceWelcome } from "../client/src/lib/commerceWelcome";

const resources=Object.fromEntries(['en','es','he'].map(lang=>[lang,{translation:JSON.parse(readFileSync(`client/src/locales/${lang}.json`,'utf8'))}]));
function storage(){const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}
test('welcome waits for a fresh successful install, isolates workspaces/stores and persists dismissal',()=>{
 const session=storage(), persistent=storage(), now=1000;
 assert.equal(hasPendingCommerceWelcome('a',session,now),false);
 rememberCommerceWelcome('a',session,now);
 assert.equal(hasPendingCommerceWelcome('a',session,now+1),true);
 assert.equal(hasPendingCommerceWelcome('b',session,now+1),false);
 assert.equal(hasPendingCommerceWelcome('a',session,now-1),false);
 assert.equal(hasPendingCommerceWelcome('a',session,now+24*60*60*1000),false);
 const ready={pending:true,connected:true,activated:false,seen:false};
 assert.equal(shouldShowCommerceWelcome(ready),true);
 for(const blocked of [{pending:false},{connected:false},{activated:true},{seen:true}]) assert.equal(shouldShowCommerceWelcome({...ready,...blocked}),false);
 finishCommerceWelcome('a','one.myshopify.com',persistent,session);
 assert.equal(hasPendingCommerceWelcome('a',session,now),false);
 assert.equal(hasSeenCommerceWelcome('a','one.myshopify.com',persistent),true);
 assert.equal(hasSeenCommerceWelcome('b','one.myshopify.com',persistent),false);
 assert.equal(hasSeenCommerceWelcome('a','two.myshopify.com',persistent),false);
 rememberCommerceWelcome('a',session,now+1);
 assert.equal(shouldShowCommerceWelcome({...ready,seen:hasSeenCommerceWelcome('a','one.myshopify.com',persistent)}),false);
 const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');},removeItem:()=>{throw Error('blocked');}};
 assert.doesNotThrow(()=>rememberCommerceWelcome('a',blocked));
 assert.equal(hasPendingCommerceWelcome('a',blocked),false);
 assert.doesNotThrow(()=>finishCommerceWelcome('a','store',blocked,blocked));
});

test('guide renders all eight sections and navigation in EN/ES/HE and switches language and RTL',async()=>{
 const dir=await mkdtemp(resolve('work/commerce-guide-'));
 try {
  await build({entryPoints:['client/src/components/ecommerce/CommerceGuide.tsx'],outfile:join(dir,'guide.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic'});
  const {CommerceGuide,CommerceGuideLink}=await import(pathToFileURL(join(dir,'guide.mjs')).href);
  const instance=i18next.createInstance();await instance.use(initReactI18next).init({resources,lng:'en',fallbackLng:false,interpolation:{escapeValue:false}});
  for(const lang of ['en','es','he','en']) {
   await instance.changeLanguage(lang);
   const markup=renderToStaticMarkup(<I18nextProvider i18n={instance}><Router ssrPath="/app/ecommerce-growth-engine?view=guide"><CommerceGuide/><CommerceGuideLink/></Router></I18nextProvider>);
   const {document}=parseHTML(markup), main=document.querySelector('main')!;
   assert.equal(main.getAttribute('dir'),lang==='he'?'rtl':'ltr');
   assert.equal(main.getAttribute('lang'),lang);
   assert.equal(main.querySelectorAll('section').length,8);
   assert.equal(main.querySelectorAll('nav a').length,8);
   const source=resources[lang].translation.commerceEducation;
   assert.equal(main.querySelector('h1')?.textContent,source.guide);
   for(const section of source.sections){
    const rendered=main.querySelector(`#${section.id}`)!;
    assert.equal(rendered.querySelector('h2')?.textContent,section.title);
    assert.equal(rendered.querySelectorAll('p').length,section.paragraphs.length);
    for(const [i,p] of section.paragraphs.entries())assert.equal(rendered.querySelectorAll('p')[i].textContent,p);
   }
   assert.equal(main.querySelectorAll('#faq p').length,10);
   assert.ok(main.querySelector('a[href="/app/ecommerce-growth-engine?view=setup"]'));
   assert.ok(document.querySelector('a[href="/app/ecommerce-growth-engine?view=guide"]'));
   assert.ok(main.querySelector('bdi[dir="ltr"]'));
   assert.ok(!markup.includes('commerceEducation.'));
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('all new locale keys and guide content are complete without English fallback',()=>{
 function shape(value:unknown):unknown {return Array.isArray(value)?value.map(shape):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,shape(v)])):typeof value;}
 const base=resources.en.translation;
 for(const lang of ['es','he']){
  const locale=resources[lang].translation;
  assert.deepEqual(shape(locale.commerceEducation),shape(base.commerceEducation));
  assert.deepEqual(shape(locale.shopping),shape(base.shopping));
  for(const key of ['guide','intro','welcomeTitle','welcomeBody','explore','later','learn','close','welcomeSafe']) {
   assert.ok(locale.commerceEducation[key]?.trim());assert.notEqual(locale.commerceEducation[key],base.commerceEducation[key]);
  }
  for(const section of locale.commerceEducation.sections){
   const english=base.commerceEducation.sections.find(s=>s.id===section.id)!;
   assert.notEqual(section.title,english.title);
   for(const [i,p] of section.paragraphs.entries())assert.notEqual(p,english.paragraphs[i]);
  }
 }
});

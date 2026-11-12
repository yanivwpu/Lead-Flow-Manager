import test from 'node:test';
import assert from 'node:assert/strict';
import express, {Router} from 'express';
import {once} from 'node:events';
import {createConsentThemeService} from '../server/ecommerce/shopifyConsentThemeService';
import {registerConsentThemeRoutes} from '../server/ecommerce/shopifyConsentStorefrontRoutes';

const uid='490ef38e-bb3d-fa92-4a1e-2c4bc52c21d8d951047c';
const type=`shopify://apps/whachatcrm/blocks/whatsapp-consent/${uid}`;

test('diagnostic GET uses only the authenticated current connection; returns the minimal allowlist and never records setup', async () => {
  let records=0, reads=0, limited=false, changed=false, stage='theme';
  let install:any={shop:'first.myshopify.com',token:'PRIVATE_TOKEN',connection:'PRIVATE_FINGERPRINT',setup:{}};
  const service=createConsentThemeService({
    env:{SHOPIFY_API_KEY:'a'.repeat(32),SHOPIFY_CONSENT_EXTENSION_RELEASED_VERSION:'reviewed',SHOPIFY_CONSENT_EXTENSION_ID:uid},
    installation:async id=>id==='owner'?install:null,
    request:async(shop,token,query)=>{
      reads++;assert.equal(shop,'first.myshopify.com');assert.equal(token,'PRIVATE_TOKEN');assert.ok(query.startsWith('query '));
      if(stage==='error') throw Error('PRIVATE_TOKEN customer@example.test full-theme-settings');
      if(query.includes('ConsentThemeAccess'))return {shop:{myshopifyDomain:shop},currentAppInstallation:{accessScopes:[{handle:'write_app_proxy'},{handle:'read_themes'}]}};
      if(changed)install={...install,connection:'changed'};
      return {themes:{nodes:[{role:'MAIN',processing:false,processingFailed:false,files:{nodes:[{filename:'config/settings_data.json',body:{content:JSON.stringify({
        current:{blocks:{embed:{type,disabled:false,settings:{token:'PRIVATE_TOKEN',customer:'customer@example.test'}}}},
        presets:{secret:{PRIVATE_FIELD:'full-theme-settings'}},
      })}}]}}]}};
    },
  });
  const app=express(),router=Router();
  app.use((req,_res,next)=>{const id=req.get('x-fixture-owner');if(id)req.user={id} as any;next();});
  registerConsentThemeRoutes(router,{setup:service,record:async()=>{records++;return true;},appOrigin:()=> 'https://app.whachatcrm.com',
    limiter:(_req,res,next)=>limited?void res.status(429).end():next()});
  app.use('/api/shopify/merchant-engine',router);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const root=`http://127.0.0.1:${(server.address() as any).port}/api/shopify/merchant-engine/consent-theme`;
  const get=(path='/diagnostic',id='owner')=>fetch(root+path,{headers:{'x-fixture-owner':id}});
  try{
    assert.equal((await fetch(root+'/diagnostic')).status,401);assert.equal(reads,0);
    assert.equal((await get('/diagnostic','other')).status,409);assert.equal(reads,0);
    for(const query of ['?accountId=other','?shop=second.myshopify.com','?extensionId=other','?diagnostic=true']){
      assert.equal((await get('/diagnostic'+query)).status,400);assert.equal(reads,0);
    }
    const response=await get();assert.equal(response.status,200);
    assert.ok(response.headers.get('cache-control')?.includes('no-store'));
    assert.ok(response.headers.get('cache-control')?.includes('private'));
    assert.equal(response.headers.get('access-control-allow-origin'),null);
    const body=await response.json();
    assert.deepEqual(body,{state:'enabled_verified',verificationReason:'block_enabled',blocks:[{type,disabled:false}]});
    assert.equal(reads,2,'one scope query and one MAIN-theme query, with no additional provider request');
    for(const secret of ['PRIVATE_TOKEN','PRIVATE_FINGERPRINT','PRIVATE_FIELD','customer@example.test','full-theme-settings','editorUrl','approvalUrl','settings'])assert.ok(!JSON.stringify(body).includes(secret));
    const normal=await (await get('')).json();assert.equal(normal.blockDiagnostic,undefined,'normal setup never includes diagnostic types');
    limited=true;const before=reads;assert.equal((await get()).status,429);assert.equal(reads,before);limited=false;
    assert.equal((await fetch(root+'/diagnostic',{method:'POST',headers:{'x-fixture-owner':'owner'}})).status,404);
    stage='error';assert.deepEqual(await (await get()).json(),{state:'unverified',verificationReason:'provider_unavailable',blocks:[]});
    stage='theme';changed=true;assert.equal((await get()).status,409,'in-flight connection change discards the diagnostic');
    assert.equal(records,0,'read-only diagnosis never records editor opening, confirmation, consent or messaging');
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

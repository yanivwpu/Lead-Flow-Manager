import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  validateRecoveryMetaTemplate,
  recoveryTemplateBodyComponents,
  type RecoveryTemplateShape,
} from '../server/ecommerce/checkoutRecoveryMetaSender';

const local:RecoveryTemplateShape={
 name:'shopify_checkout_recovery',language:'en_US',category:'marketing',
 status:'approved',
 bodyText:'You can resume your checkout here: {{1}}',
 headerType:null,templateType:'text',buttons:[],carouselCards:[]
};
const live={name:local.name,language:local.language,category:'MARKETING',
 status:'APPROVED',components:[
  {type:'BODY',text:local.bodyText},
  {type:'FOOTER',text:'Reply STOP to opt out'}
 ]};
const validated=()=>validateRecoveryMetaTemplate(local,live);

test('a synced and live-approved marketing template allows exactly one Shopify recovery link',()=>{
  const decision=validated();
  assert.equal(decision.ok,true);
  if(!decision.ok)return;
  const url='https://store.myshopify.com/checkouts/abc/recover?key=sensitive';
  assert.deepEqual(recoveryTemplateBodyComponents(decision,url),[
    {type:'body',parameters:[{type:'text',text:url}]}
  ]);
});

test('no static status or local marketing permission can overrule live Meta rejection',()=>{
 for(const input of [
  {local:null,live},{local,live:null},
  {local,live:{...live,status:'PENDING'}},
  {local,live:{...live,category:'UTILITY'}},
  {local,live:{...live,name:'other_template'}},
  {local,live:{...live,language:'es'}},
  {local,live:{...live,components:[{type:'BODY',text:'Changed: {{1}}'}]}},
  {local,live:{...live,components:[{type:'BODY',text:local.bodyText},{type:'BUTTONS',buttons:[{type:'URL'}]}]}},
  {local:{...local,status:'pending'},live},
  {local:{...local,category:'utility'},live},
  {local:{...local,bodyText:'Hello {{1}}'},live},
  {local:{...local,headerType:'image'},live},
  {local:{...local,templateType:'carousel'},live},
  {local:{...local,buttons:[{type:'URL',url:'https://test.local/{{1}}'}]},live},
  {local:{...local,carouselCards:[{}]},live},
  {local:{...local,bodyText:'See {{1}} and {{2}}'},live:{...live,components:[{type:'BODY',text:'See {{1}} and {{2}}'}]}},
 ]) assert.equal(validateRecoveryMetaTemplate(input.local,input.live).ok,false,
    JSON.stringify(input));
});

test('reject malformed recovery URLs before entering a Meta component',()=>{
 const decision=validated();
 assert.equal(decision.ok,true);
 if(!decision.ok)return;
 for(const url of [
  'http://store.myshopify.com/checkouts/abc/recover',
  'https://evil.test/',
  'https://a:secret@store.myshopify.com/checkouts/abc/recover',
  'https://store.myshopify.com/checkouts/abc/recover#secret',
  'https://store.myshopify.com/cart',
  'javascript:alert(1)',
  'https://store.myshopify.com/checkouts/abc/recover?'+'x'.repeat(3000),
 ]) assert.throws(()=>recoveryTemplateBodyComponents(decision,url),
   undefined,'expected invalid URL rejection: '+url.slice(0,70));
});

test('server adapter stays unwired, demands lock-held claim and final Shopify/consent checks',()=>{
 const source=readFileSync('server/ecommerce/checkoutRecoveryMetaSender.ts','utf8');
 for(const required of [
  'recoveryDeliveryExecutionEnabled','pg_advisory_xact_lock',
  'ecommerce_checkout_recovery_outbox','claim_token=CAST',
  "o.state='claimed'","i.status='ready'","for('share')",
  'recheckShopifyCheckoutForRecovery','getMetaMessageTemplates',
  'evaluateRecoveryMessagingEligibility','sendMetaWhatsAppTemplate',
 ]) assert.equal(source.includes(required),true,required);
 const routes=readFileSync('server/shopifyRoutes.ts','utf8');
 assert.equal(routes.includes('sendRecoveryViaMeta('),false,
   'no recovery sender may be invoked from merchant HTTP routes');
});

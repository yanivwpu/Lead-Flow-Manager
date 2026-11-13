import assert from 'node:assert/strict';
import test from 'node:test';
import { proposeMarketingChatPageCoverage, MARKETING_CHAT_PRODUCT_PAGES } from '../shared/marketingChatPageCoverage';
import { MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID as widgetPublicId } from '../shared/marketingWebsiteChatWidget';
import { HOMEPAGE_PAGE_RULE_FIXTURE, PRICING_PAGE_RULE_FIXTURE } from '../shared/webchatPageRuleFixtures';
import { matchWidgetPageRule } from '../shared/webchatPageRuleMatch';
import { resolveTrustedPageRuleInboundAction } from '../shared/webchatPageRuleAction';
import { readFileSync } from 'node:fs';
const ownerEmail='marketing@whachatcrm.com';
test('scoped proposal preserves existing rules and covers actual product routes in supported locales',()=>{
 const existing=[HOMEPAGE_PAGE_RULE_FIXTURE,PRICING_PAGE_RULE_FIXTURE,{urlContains:'/prospect-ai',matchType:'pathname',greeting:'Preserved',localized:{he:{greeting:'נשמר'}}}];
 const settings={pageRules:existing,headerTitle:'Keep me',aiMode:'suggest'};
 const next=proposeMarketingChatPageCoverage({ownerEmail,widgetPublicId,settings});
 assert.deepEqual((next.pageRules as unknown[]).slice(0,3),existing);
 assert.deepEqual(settings.pageRules,existing); assert.equal(next.aiMode,'suggest');
 for(const [path,,translated] of MARKETING_CHAT_PRODUCT_PAGES) for(const locale of ['en','es','he']) {
  const href=`https://www.whachatcrm.com${translated&&locale!=='en'?'/'+locale:''}${path}?utm_source=test`;
  const match=matchWidgetPageRule(next,href,locale); assert.ok(match?.greeting); assert.equal(match?.matchType,'pathname'); assert.equal(match?.prefilledMessage,'');
  for (const [actionIndex,kind] of [[1,'features_pricing'],[2,'book_demo']] as const) {
   const action=resolveTrustedPageRuleInboundAction({originAuthorized:true,settings:next,parentUrl:href,locale,message:match!.suggestedQuestions[actionIndex],actionIndex});
   assert.equal(action?.kind,kind,'localized actions must preserve their semantic route');
  }
 }
 assert.equal(matchWidgetPageRule(next,'https://www.whachatcrm.com/unknown'),null);
 assert.deepEqual(proposeMarketingChatPageCoverage({ownerEmail,widgetPublicId,settings:next}),next);
});
test('preserves custom exact rules and adds only missing locale coverage on real routes',()=>{
 const custom={urlContains:'/unified-inbox',matchType:'pathname',greeting:'Custom greeting',localized:{he:{greeting:'מותאם'}},suggestedQuestions:['Custom action']};
 const next=proposeMarketingChatPageCoverage({ownerEmail,widgetPublicId,settings:{pageRules:[custom]}});
 assert.deepEqual((next.pageRules as unknown[])[0],custom);
 assert.equal(matchWidgetPageRule(next,'https://www.whachatcrm.com/unified-inbox')?.greeting,'Custom greeting');
 assert.ok(matchWidgetPageRule(next,'https://www.whachatcrm.com/es/unified-inbox','es')?.greeting);
 assert.equal(matchWidgetPageRule(next,'https://www.whachatcrm.com/he/ecommerce-growth-engine','he'),null);
 const routes=readFileSync('client/src/App.tsx','utf8');
 for(const [path,,translated] of MARKETING_CHAT_PRODUCT_PAGES) {
  assert.ok(routes.includes(translated?`localeRoutes("${path}"`:`path="${path}"`),`coverage must name an actual route: ${path}`);
 }
});
test('rejects unrelated workspace or widget',()=>{
 assert.throws(()=>proposeMarketingChatPageCoverage({ownerEmail:'customer@example.com',widgetPublicId,settings:{}}));
 assert.throws(()=>proposeMarketingChatPageCoverage({ownerEmail,widgetPublicId:'other',settings:{}}));
});
test('rejects an oversized or invalid export without dropping existing configurations',()=>{
 const pageRules=Array.from({length:30},(_,i)=>({urlContains:`/custom-${i}`,matchType:'pathname',greeting:'Keep'}));
 assert.throws(()=>proposeMarketingChatPageCoverage({ownerEmail,widgetPublicId,settings:{pageRules}}),/Too many page rules/);
 assert.equal(pageRules.length,30);
 assert.throws(()=>proposeMarketingChatPageCoverage({ownerEmail,widgetPublicId,settings:{pageRules:[{urlContains:'/one'},{urlContains:'/one'}]}}),/same URL fragment/);
});

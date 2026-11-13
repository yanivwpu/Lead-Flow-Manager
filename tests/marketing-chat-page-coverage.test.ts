import assert from 'node:assert/strict';
import test from 'node:test';
import { proposeMarketingChatPageCoverage, MARKETING_CHAT_PRODUCT_PAGES } from '../shared/marketingChatPageCoverage';
import { MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID as widgetPublicId } from '../shared/marketingWebsiteChatWidget';
import { HOMEPAGE_PAGE_RULE_FIXTURE, PRICING_PAGE_RULE_FIXTURE } from '../shared/webchatPageRuleFixtures';
import { matchWidgetPageRule } from '../shared/webchatPageRuleMatch';
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
 }
 assert.equal(matchWidgetPageRule(next,'https://www.whachatcrm.com/unknown'),null);
 assert.deepEqual(proposeMarketingChatPageCoverage({ownerEmail,widgetPublicId,settings:next}),next);
});
test('rejects unrelated workspace or widget',()=>{
 assert.throws(()=>proposeMarketingChatPageCoverage({ownerEmail:'customer@example.com',widgetPublicId,settings:{}}));
 assert.throws(()=>proposeMarketingChatPageCoverage({ownerEmail,widgetPublicId:'other',settings:{}}));
});

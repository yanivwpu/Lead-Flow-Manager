/**
 * Page-specific crawlable SSR body for selected marketing routes.
 * Run: npx tsx tests/marketing-page-ssr-body.test.ts
 */
import assert from "node:assert/strict";
import {
  generateMarketingPageSsrHtml,
  getMarketingSsrBodyRoutes,
  injectPageMeta,
  PAGE_META,
} from "../server/seo";
import { shouldServeSpaFallback } from "../server/spaRouting";

const shell = `<!DOCTYPE html><html><head><title>Home</title><link rel="canonical" href="https://www.whachatcrm.com/" /></head><body><div id="root"></div></body></html>`;

const requiredRoutes = [
  "/realtor-growth-engine",
  "/waba360-alternative",
  "/wati-alternative",
  "/manychat-alternative",
  "/respond-io-alternative",
  "/interakt-alternative",
  "/zoko-alternative",
  "/pabbly-alternative",
  "/best-whatsapp-crm-2026",
  "/crm-for-whatsapp-business",
  "/prospect-ai",
  "/real-estate-crm",
  "/solutions/ecommerce",
  "/solutions/local-service-businesses",
  "/solutions/marketing-agencies",
  "/solutions/med-spas",
  "/ai-brain",
  "/ai-copilot",
  "/automations",
  "/chatbot-builder",
  "/campaigns",
  "/integrations",
  "/unified-inbox",
  "/shared-team-inbox",
] as const;

const expectedH1: Record<(typeof requiredRoutes)[number], RegExp> = {
  "/realtor-growth-engine": /<h1>Realtor Growth Engine<\/h1>/,
  "/waba360-alternative": /<h1>360dialog Alternative for WhatsApp CRM and Automation<\/h1>/,
  "/wati-alternative": /<h1>WATI Alternative:/,
  "/manychat-alternative": /<h1>ManyChat Alternative:/,
  "/respond-io-alternative": /<h1>Respond\.io Alternative:/,
  "/interakt-alternative": /<h1>Interakt Alternative:/,
  "/zoko-alternative": /<h1>Zoko Alternative:/,
  "/pabbly-alternative": /<h1>Pabbly Alternative:/,
  "/best-whatsapp-crm-2026": /<h1>Best WhatsApp CRM in 2026:/,
  "/crm-for-whatsapp-business": /<h1>CRM for WhatsApp Business:/,
  "/prospect-ai": /<h1>Meet Your AI Sales Team<\/h1>/,
  "/real-estate-crm": /<h1>Capture, Qualify, and Convert Real Estate Leads/,
  "/solutions/ecommerce": /<h1>Turn Every Shopper Conversation Into More Revenue<\/h1>/,
  "/solutions/local-service-businesses": /<h1>From Finding Local Customers to Booking the Next Job<\/h1>/,
  "/solutions/marketing-agencies": /<h1>Deliver Smarter Messaging and AI Automation for Your Clients<\/h1>/,
  "/solutions/med-spas": /<h1>Turn More Med Spa Inquiries Into Booked Consultations<\/h1>/,
  "/ai-brain": /<h1>AI That Understands How Your Business Works<\/h1>/,
  "/ai-copilot": /<h1>Know What to Say and What to Do Next<\/h1>/,
  "/automations": /<h1>Automate the Follow-Up Work That Moves Leads Forward<\/h1>/,
  "/chatbot-builder": /<h1>Build Customer Journeys Without Writing Code<\/h1>/,
  "/campaigns": /<h1>Create Personalized Campaigns That Continue the Conversation<\/h1>/,
  "/integrations": /<h1>Connect WhachatCRM to the Tools Your Business Already Uses<\/h1>/,
  "/unified-inbox": /<h1>All Your Customer Conversations\. One Intelligent Inbox\.<\/h1>/,
  "/shared-team-inbox": /<h1>Collaborate on Every Conversation Without Losing Context<\/h1>/,
};

const ssrRoutes = getMarketingSsrBodyRoutes();
for (const route of requiredRoutes) {
  assert.ok(ssrRoutes.includes(route), `SSR route registered: ${route}`);
  const body = generateMarketingPageSsrHtml(route);
  assert.ok(body, `SSR body exists for ${route}`);
  assert.match(body!, /data-ssr-content="true"/);
  assert.match(body!, expectedH1[route]);
  assert.match(body!, /<ul>/);
  assert.match(body!, /<li>/);
  assert.doesNotMatch(body!, /One Inbox\. Every Channel/);
  assert.doesNotMatch(body!, /Via Twilio/i);

  const html = injectPageMeta(shell, route).replace(
    '<div id="root"></div>',
    `<div id="root">${body}</div>`,
  );
  assert.ok(html.includes(PAGE_META[route].canonical), `canonical for ${route}`);
  assert.match(html, expectedH1[route]);
  assert.equal(html.includes('<div id="root"></div>'), false, `root filled for ${route}`);
}

assert.equal(generateMarketingPageSsrHtml("/pricing"), null, "pricing still meta-only");
assert.equal(generateMarketingPageSsrHtml("/contact"), null, "contact still meta-only");

const marketing = Object.keys(PAGE_META);
assert.equal(shouldServeSpaFallback("/this-page-should-not-exist", marketing), false);
assert.equal(shouldServeSpaFallback("/wati-alternative", marketing), true);
assert.equal(shouldServeSpaFallback("/prospect-ai", marketing), true);

console.log(`PASS marketing-page-ssr-body.test.ts (${requiredRoutes.length} routes)`);

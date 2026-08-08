/**
 * Page-specific crawlable SSR body for selected marketing routes.
 * Run: npx tsx tests/marketing-page-ssr-body.test.ts
 */
import assert from "node:assert/strict";
import {
  generateMarketingPageSsrHtml,
  injectPageMeta,
  PAGE_META,
} from "../server/seo";
import { shouldServeSpaFallback } from "../server/spaRouting";

const shell = `<!DOCTYPE html><html><head><title>Home</title><link rel="canonical" href="https://www.whachatcrm.com/" /></head><body><div id="root"></div></body></html>`;

const rge = generateMarketingPageSsrHtml("/realtor-growth-engine");
assert.ok(rge, "RGE SSR body exists");
assert.match(rge!, /<h1>Realtor Growth Engine<\/h1>/);
assert.match(rge!, /booked showing/i);
assert.match(rge!, /Unified Inbox/i);
assert.match(rge!, /data-ssr-content="true"/);
assert.equal(generateMarketingPageSsrHtml("/pricing"), null, "other routes unchanged");

const waba = generateMarketingPageSsrHtml("/waba360-alternative");
assert.ok(waba, "360dialog SSR body exists");
assert.match(waba!, /360dialog Alternative/i);
assert.match(waba!, /BSP/i);
assert.match(waba!, /Embedded Signup/i);
assert.doesNotMatch(waba!, /Via Twilio/i);

const rgeHtml = injectPageMeta(shell, "/realtor-growth-engine").replace(
  '<div id="root"></div>',
  `<div id="root">${rge}</div>`,
);
assert.ok(rgeHtml.includes(PAGE_META["/realtor-growth-engine"].title));
assert.ok(
  rgeHtml.includes(`rel="canonical" href="${PAGE_META["/realtor-growth-engine"].canonical}"`),
);
assert.match(rgeHtml, /<h1>Realtor Growth Engine<\/h1>/);
assert.doesNotMatch(rgeHtml, /One Inbox\. Every Channel/);

const wabaHtml = injectPageMeta(shell, "/waba360-alternative").replace(
  '<div id="root"></div>',
  `<div id="root">${waba}</div>`,
);
assert.ok(wabaHtml.includes(PAGE_META["/waba360-alternative"].canonical));
assert.match(wabaHtml, /<h1>360dialog Alternative for WhatsApp CRM and Automation<\/h1>/);

const marketing = Object.keys(PAGE_META);
assert.equal(shouldServeSpaFallback("/this-page-should-not-exist", marketing), false);
assert.equal(shouldServeSpaFallback("/realtor-growth-engine", marketing), true);
assert.equal(shouldServeSpaFallback("/waba360-alternative", marketing), true);

console.log("PASS marketing-page-ssr-body.test.ts");

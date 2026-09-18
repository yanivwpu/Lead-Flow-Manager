/**
 * Blog SSR must not throw ReferenceError on BLOG_POSTS alias.
 * Run: npx tsx tests/blog-ssr-seo.test.ts
 */
import assert from "node:assert/strict";
import { generateBlogListHtml, generateBlogPostHtml, injectSeoMeta, markdownToHtml } from "../server/seo";

const shell =
  '<html><head><title>old</title></head><body><div id="root"></div></body></html>';

assert.doesNotThrow(() => generateBlogListHtml(), "generateBlogListHtml must not throw");
assert.ok(generateBlogListHtml().includes("WhatsApp CRM Blog"));

assert.doesNotThrow(
  () => injectSeoMeta(shell, "/blog/realtor-growth-engine-complete-guide"),
  "injectSeoMeta for blog post must not throw",
);
const injected = injectSeoMeta(shell, "/blog/realtor-growth-engine-complete-guide");
assert.match(injected, /og:image/);
assert.match(injected, /realtor-growth-engine-complete-guide\.png/);

const postHtml = generateBlogPostHtml("realtor-growth-engine-complete-guide");
assert.ok(postHtml);
assert.match(postHtml!, /realtor-growth-engine-complete-guide/);
assert.match(postHtml!, /What Is the Realtor Growth Engine\?/);
assert.match(postHtml!, /Unified Messaging Inbox/);
assert.match(postHtml!, /<a href="\/whatsapp-crm">WhachatCRM<\/a>/);
assert.match(postHtml!, /<ul[^>]*>.*<li[^>]*>Follow Up Boss<\/li>/s);
assert.match(postHtml!, /<table[^>]*>.*<th[^>]*>Capability<\/th>/s);
assert.doesNotMatch(postHtml!, /\[WhachatCRM\]\(\/whatsapp-crm\)/);
assert.ok(postHtml!.length > 10_000, "RGE SSR renders the article body, not the excerpt fallback");

const twilioHtml = generateBlogPostHtml("twilio-whatsapp-setup-guide");
assert.ok(twilioHtml);
assert.match(twilioHtml!, /Meta Embedded Signup/);
assert.match(twilioHtml!, /Select your WhatsApp Business Account/);
assert.doesNotMatch(twilioHtml!, /Create a Twilio Account|Get WhatsApp Sandbox/);

const pricingChangeHtml = generateBlogPostHtml("whatsapp-service-message-pricing-october-2026");
assert.ok(pricingChangeHtml);
assert.match(pricingChangeHtml!, /<a href="https:\/\/whatsappbusiness\.com\/products\/platform-pricing\/" rel="noopener noreferrer">/);
assert.match(pricingChangeHtml!, /<ul[^>]*>.*<li[^>]*>Service messages will be charged per delivered message\.<\/li>/s);
assert.doesNotMatch(pricingChangeHtml!, /\[WhatsApp Business Platform pricing\]\(/);

const unsafe = markdownToHtml('<script>alert("x")</script> [bad](javascript:alert(1))');
assert.doesNotMatch(unsafe, /<script|href="javascript:/i);
assert.match(unsafe, /&lt;script&gt;/);

console.log("PASS blog-ssr-seo.test.ts");

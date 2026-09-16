/**
 * October 2026 WhatsApp service-message pricing blog post.
 * Run: npx tsx tests/blog-whatsapp-service-pricing-october-2026.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  WHATSAPP_SERVICE_PRICING_OCT_2026_CONTENT,
  WHATSAPP_SERVICE_PRICING_OCT_2026_FAQ,
} from "../client/src/content/blog/whatsapp-service-message-pricing-october-2026";
import { BLOG_POSTS } from "../shared/blogPosts";
import { generateBlogListHtml, generateBlogPostHtml, injectSeoMeta } from "../server/seo";
import { shouldServeSpaFallback } from "../server/spaRouting";

const SLUG = "whatsapp-service-message-pricing-october-2026";
const TITLE = "Meta Will Begin Charging for WhatsApp Service Messages on October 1, 2026";
const SEO_TITLE = "WhatsApp Service Message Pricing Changes October 2026";
const DESCRIPTION =
  "Starting October 1, 2026, Meta will charge for WhatsApp service messages. Learn what changes, what remains free, and how to prepare.";
const CANONICAL = `https://www.whachatcrm.com/blog/${SLUG}`;
const SERVICE_DOC =
  "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages";
const PLATFORM_PRICING = "https://whatsappbusiness.com/products/platform-pricing/";
const FORBIDDEN_BILLING = [
  /Meta bills you directly/i,
  /bills you directly/i,
  /no markup/i,
  /0%\s*(WhachatCRM\s+)?markup/i,
];
const FORBIDDEN_PRICE = /\$\s*\d+(\.\d+)?\s*(USD|per message|\/message)/i;

const post = BLOG_POSTS.find((p) => p.slug === SLUG);
assert.ok(post, "post metadata must exist");
assert.equal(post.title, TITLE);
assert.equal(post.seoTitle, SEO_TITLE);
assert.equal(post.excerpt, DESCRIPTION);
assert.equal(post.date, "2026-09-16");
assert.equal(post.readTime, "6 min read");
assert.equal(post.category, "Guides");
assert.equal(post.featured, undefined);
assert.equal(post.featuredImage, undefined, "regular cards have no hero image");

const firstRegular = BLOG_POSTS.find((p) => !p.featured);
assert.equal(firstRegular?.slug, SLUG, "newest non-featured index card");

assert.match(WHATSAPP_SERVICE_PRICING_OCT_2026_CONTENT, new RegExp(SERVICE_DOC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(
  WHATSAPP_SERVICE_PRICING_OCT_2026_CONTENT,
  new RegExp(PLATFORM_PRICING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
);
assert.match(
  WHATSAPP_SERVICE_PRICING_OCT_2026_CONTENT,
  /These charges are set by Meta and are separate from your WhachatCRM subscription/,
);
for (const pattern of FORBIDDEN_BILLING) {
  assert.doesNotMatch(WHATSAPP_SERVICE_PRICING_OCT_2026_CONTENT, pattern);
}
assert.doesNotMatch(WHATSAPP_SERVICE_PRICING_OCT_2026_CONTENT, FORBIDDEN_PRICE);

assert.equal(WHATSAPP_SERVICE_PRICING_OCT_2026_FAQ["@type"], "FAQPage");
assert.ok(Array.isArray(WHATSAPP_SERVICE_PRICING_OCT_2026_FAQ.mainEntity));
assert.equal(WHATSAPP_SERVICE_PRICING_OCT_2026_FAQ.mainEntity.length, 7);

const shell =
  '<html><head><title>old</title></head><body><div id="root"></div></body></html>';
const injected = injectSeoMeta(shell, `/blog/${SLUG}`);
assert.match(injected, new RegExp(`<title>${SEO_TITLE}</title>`));
assert.match(injected, new RegExp(`content="${DESCRIPTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
assert.match(injected, new RegExp(`rel="canonical" href="${CANONICAL}"`));
assert.match(injected, /property="og:type" content="article"/);
assert.match(injected, new RegExp(`property="og:url" content="${CANONICAL}"`));
assert.match(injected, /property="og:image" content="https:\/\/www\.whachatcrm\.com\/og\/og-whachatcrm\.png\?v=5"/);
assert.match(injected, /name="twitter:card" content="summary_large_image"/);
assert.match(injected, /"@type": "BlogPosting"/);
assert.match(injected, /"datePublished": "2026-09-16"/);

const listHtml = generateBlogListHtml();
assert.match(listHtml, new RegExp(TITLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(listHtml, new RegExp(`/blog/${SLUG}`));

const postHtml = generateBlogPostHtml(SLUG);
assert.ok(postHtml);
assert.match(postHtml, /Sep 16, 2026/);
assert.match(postHtml, new RegExp(SERVICE_DOC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(postHtml, new RegExp(PLATFORM_PRICING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(postHtml, /Meta bills you directly/i);
assert.doesNotMatch(postHtml, /no markup/i);

const sitemap = fs.readFileSync(path.join(process.cwd(), "client/public/sitemap.xml"), "utf8");
assert.match(
  sitemap,
  /<loc>https:\/\/www\.whachatcrm\.com\/blog\/whatsapp-service-message-pricing-october-2026<\/loc>/,
);
assert.match(sitemap, /<loc>https:\/\/www\.whachatcrm\.com\/blog<\/loc>\s*<lastmod>2026-09-16<\/lastmod>/);

assert.equal(
  shouldServeSpaFallback(`/blog/${SLUG}`, []),
  true,
  "direct /blog/:slug navigation must use SPA fallback",
);

console.log("PASS blog-whatsapp-service-pricing-october-2026.test.ts");

/**
 * Blog SSR must not throw ReferenceError on BLOG_POSTS alias.
 * Run: npx tsx tests/blog-ssr-seo.test.ts
 */
import assert from "node:assert/strict";
import { generateBlogListHtml, generateBlogPostHtml, injectSeoMeta } from "../server/seo";

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

console.log("PASS blog-ssr-seo.test.ts");

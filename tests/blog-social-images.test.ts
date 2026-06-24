/**
 * Blog featured image + OG resolution.
 * Run: npx tsx tests/blog-social-images.test.ts
 */
import assert from "node:assert/strict";
import {
  BLOG_POSTS,
  DEFAULT_BLOG_OG_IMAGE_PATH,
  resolveBlogFeaturedImagePath,
  resolveBlogFeaturedImageUrl,
  resolveBlogImageAlt,
  resolveBlogOgImage,
  resolveBlogOgImagePath,
} from "../shared/blogPosts";

const BASE = "https://www.whachatcrm.com";

const rge = BLOG_POSTS.find((p) => p.slug === "realtor-growth-engine-complete-guide");
assert.ok(rge?.featuredImage, "RGE post should define featuredImage");

assert.equal(
  resolveBlogOgImagePath(rge!),
  "/og/blog/realtor-growth-engine-complete-guide.png",
  "ogImage path defaults to featuredImage",
);

assert.equal(
  resolveBlogOgImage(rge!, BASE),
  `${BASE}/og/blog/realtor-growth-engine-complete-guide.png`,
);

assert.equal(
  resolveBlogOgImage({ slug: "x", title: "t", excerpt: "e", category: "c", readTime: "1", date: "2026-01-01" }, BASE),
  `${BASE}${DEFAULT_BLOG_OG_IMAGE_PATH}`,
  "posts without images fall back to default OG",
);

assert.equal(resolveBlogFeaturedImagePath(rge!), rge!.featuredImage);
assert.equal(
  resolveBlogFeaturedImageUrl(rge!, BASE),
  `${BASE}/og/blog/realtor-growth-engine-complete-guide.png`,
);

const customOg = {
  slug: "custom",
  title: "Custom",
  excerpt: "e",
  category: "c",
  readTime: "1",
  date: "2026-01-01",
  featuredImage: "/og/blog/a.png",
  ogImage: "/og/blog/b.png",
};
assert.equal(resolveBlogOgImagePath(customOg), "/og/blog/b.png", "explicit ogImage wins");

assert.equal(
  resolveBlogImageAlt({ title: "Title", imageAlt: "Alt override" }),
  "Alt override",
);
assert.equal(resolveBlogImageAlt({ title: "Title only" }), "Title only");

console.log("PASS blog-social-images.test.ts");

/** Run: npx tsx --test tests/seo-registry-sync.test.ts */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { BLOG_POSTS } from "../shared/blogPosts";
import { PHASE2_LOCALIZED_PATHS, getCanonicalUrl, getHreflangLinks } from "../shared/localeRoutes";
import { SEO_LOCALIZED_PATHS } from "../shared/seoPolicy";
import { BLOG_CONTENT_SSR, PAGE_META } from "../server/seo";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function objectLiteralKeys(sourceText: string, variableName: string): Set<string> {
  const source = ts.createSourceFile("registry.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let keys: Set<string> | undefined;
  source.forEachChild(function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      keys = new Set(
        node.initializer.properties.flatMap((property) => {
          if (!ts.isPropertyAssignment(property)) return [];
          if (ts.isStringLiteral(property.name) || ts.isIdentifier(property.name)) return [property.name.text];
          return [];
        }),
      );
      return;
    }
    ts.forEachChild(node, visit);
  });
  assert.ok(keys, `${variableName} object literal exists`);
  return keys;
}

test("every public blog slug has deliberate client, SSR, and sitemap coverage", () => {
  const sitemap = read("client/public/sitemap.xml");
  const clientSource = read("client/src/pages/BlogPost.tsx");
  const clientSlugs = objectLiteralKeys(clientSource, "BLOG_CONTENT");
  for (const post of BLOG_POSTS) {
    assert.ok(clientSlugs.has(post.slug), `client body: ${post.slug}`);
    assert.ok(BLOG_CONTENT_SSR[post.slug]?.trim().length > post.excerpt.length, `SSR body: ${post.slug}`);
    assert.match(sitemap, new RegExp(`<loc>https://www\\.whachatcrm\\.com/blog/${post.slug}</loc>`));
  }
});

test("localized SEO policy aliases the canonical Phase 2 route registry", () => {
  assert.equal(SEO_LOCALIZED_PATHS, PHASE2_LOCALIZED_PATHS);
  for (const path of PHASE2_LOCALIZED_PATHS) {
    if (path !== "/") assert.ok(PAGE_META[path], `PAGE_META: ${path}`);
    for (const locale of ["en", "es", "he"] as const) {
      assert.ok(getCanonicalUrl(path, locale));
    }
    assert.deepEqual(getHreflangLinks(path).map((link) => link.hreflang), ["en", "es", "he", "x-default"]);
  }
});

test("hydrated RGE metadata uses locale-aware canonical and hreflang helpers", () => {
  const source = read("client/src/pages/RealtorLanding.tsx");
  assert.match(source, /const locale = useMarketingUrlLocale\(\)/);
  assert.match(source, /getCanonicalUrl\(REALTOR_GROWTH_ENGINE_PATH, locale, MARKETING_URL\)/);
  assert.match(source, /getHreflangLinks\(REALTOR_GROWTH_ENGINE_PATH, MARKETING_URL\)/);
  assert.match(source, /property="og:url" content=\{canonicalUrl\}/);
  assert.match(source, /url: canonicalUrl/);
  assert.doesNotMatch(source, /canonical" href=\{`\$\{MARKETING_URL\}\/realtor-growth-engine`\}/);
});

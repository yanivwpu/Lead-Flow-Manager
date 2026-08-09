/**
 * Localized marketing screenshots must stay root-absolute (never /es/images or /he/images).
 * Run: npx tsx --test tests/localized-marketing-screenshots.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeMarketingContent } from "../shared/marketingLocale";
import {
  ensureRootAbsoluteAssetPath,
  MARKETING_SCREENSHOTS,
} from "../shared/marketingScreenshots";
import {
  isNonLocalizedAssetOrApiPath,
  localizedInternalHref,
} from "../shared/localeRoutes";
import {
  PROSPECT_AI_LANDING,
  PROSPECT_AI_LANDING_SEO,
} from "../client/src/content/prospectAiLandingContent";
import { getLocalizedProspectAiContent } from "../shared/prospectAiLandingLocales";
import { getLocalizedProductPage } from "../shared/localizeMarketingContent";
import { ALL_PRODUCT_PAGES } from "../shared/productPages";
import { getLocalizedSolutionPage } from "../shared/localizeMarketingContent";
import { ALL_SOLUTION_PAGES } from "../shared/solutionPages";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "client/public");

test("mergeMarketingContent preserves image.src when overlay array only translates alt", () => {
  const base = {
    featureSections: [
      {
        id: "discover",
        title: "Discover",
        image: {
          src: "/images/screenshots/prospect-ai-discover.webp",
          alt: "EN",
          width: 983,
          height: 442,
          size: "content",
        },
      },
    ],
  };
  const overlay = {
    featureSections: [
      {
        title: "גלו",
        image: { alt: "HE alt", caption: "HE caption" },
      },
    ],
  };
  const merged = mergeMarketingContent(base, overlay);
  assert.equal(merged.featureSections[0].id, "discover");
  assert.equal(
    merged.featureSections[0].image.src,
    "/images/screenshots/prospect-ai-discover.webp",
  );
  assert.equal(merged.featureSections[0].image.alt, "HE alt");
  assert.equal(merged.featureSections[0].image.width, 983);
  assert.equal(merged.featureSections[0].title, "גלו");
});

test("string arrays still replace (paragraphs/bullets)", () => {
  const merged = mergeMarketingContent(
    { paragraphs: ["a", "b"] },
    { paragraphs: ["א"] },
  );
  assert.deepEqual(merged.paragraphs, ["א"]);
});

test("localized Prospect AI keeps root-absolute screenshot srcs for en/es/he", () => {
  for (const locale of ["en", "es", "he"] as const) {
    const C = getLocalizedProspectAiContent(
      PROSPECT_AI_LANDING,
      PROSPECT_AI_LANDING_SEO,
      locale,
    );
    assert.ok(C.meetTeam.image.src.startsWith("/images/screenshots/"));
    assert.doesNotMatch(C.meetTeam.image.src, /^\/(es|he)\//);
    for (const section of C.featureSections) {
      assert.ok(
        section.image?.src?.startsWith("/images/"),
        `${locale} ${section.id || section.title} missing root-absolute src: ${section.image?.src}`,
      );
      assert.doesNotMatch(section.image.src, /^\/(es|he)\//);
      assert.equal(
        section.image.src,
        ensureRootAbsoluteAssetPath(section.image.src),
      );
    }
  }

  const en = getLocalizedProspectAiContent(PROSPECT_AI_LANDING, PROSPECT_AI_LANDING_SEO, "en");
  const he = getLocalizedProspectAiContent(PROSPECT_AI_LANDING, PROSPECT_AI_LANDING_SEO, "he");
  const es = getLocalizedProspectAiContent(PROSPECT_AI_LANDING, PROSPECT_AI_LANDING_SEO, "es");
  assert.equal(en.meetTeam.image.src, he.meetTeam.image.src);
  assert.equal(en.meetTeam.image.src, es.meetTeam.image.src);
  for (let i = 0; i < en.featureSections.length; i++) {
    assert.equal(en.featureSections[i].image.src, he.featureSections[i].image.src);
    assert.equal(en.featureSections[i].image.src, es.featureSections[i].image.src);
  }
});

test("localizedInternalHref never prefixes asset paths", () => {
  for (const locale of ["es", "he"] as const) {
    assert.equal(
      localizedInternalHref("/images/screenshots/prospect-ai-discover.webp", locale),
      "/images/screenshots/prospect-ai-discover.webp",
    );
    assert.equal(localizedInternalHref("/og/prospect-ai-growth-engine.png", locale), "/og/prospect-ai-growth-engine.png");
    assert.equal(localizedInternalHref("/api/auth/me", locale), "/api/auth/me");
    assert.equal(localizedInternalHref("/assets/app.js", locale), "/assets/app.js");
    // Page links still localize
    assert.equal(localizedInternalHref("/prospect-ai", locale), `/${locale}/prospect-ai`);
  }
  assert.equal(isNonLocalizedAssetOrApiPath("/images/screenshots/x.webp"), true);
  assert.equal(isNonLocalizedAssetOrApiPath("/prospect-ai"), false);
});

test("every MARKETING_SCREENSHOTS file exists under client/public", () => {
  for (const [key, src] of Object.entries(MARKETING_SCREENSHOTS)) {
    assert.ok(src.startsWith("/"), `${key} must be root-absolute`);
    const filePath = path.join(publicDir, src.replace(/^\//, ""));
    assert.ok(fs.existsSync(filePath), `missing public asset for ${key}: ${src}`);
  }
});

test("product/solution localized pages keep screenshotKey assets resolvable", () => {
  for (const product of ALL_PRODUCT_PAGES) {
    for (const locale of ["en", "es", "he"] as const) {
      const page = getLocalizedProductPage(product, locale);
      if (page.screenshotKey) {
        const src = MARKETING_SCREENSHOTS[page.screenshotKey as keyof typeof MARKETING_SCREENSHOTS];
        assert.ok(src?.startsWith("/images/"), `${locale} ${page.path} screenshotKey`);
      }
      for (const section of page.visualSections || []) {
        if (!section.screenshotKey) continue;
        const src =
          MARKETING_SCREENSHOTS[section.screenshotKey as keyof typeof MARKETING_SCREENSHOTS];
        assert.ok(
          src?.startsWith("/images/"),
          `${locale} ${page.path} visual ${section.screenshotKey}`,
        );
      }
    }
  }
  assert.ok(ALL_SOLUTION_PAGES.length > 0);
  for (const solution of ALL_SOLUTION_PAGES) {
    const he = getLocalizedSolutionPage(solution, "he");
    assert.ok(he.h1.length > 0);
  }
});

test("no locale-prefixed image paths in marketing screenshot catalog or Prospect overlays", () => {
  const catalog = fs.readFileSync(
    path.join(root, "shared/marketingScreenshots.ts"),
    "utf8",
  );
  assert.doesNotMatch(catalog, /\/(es|he)\/images\//);
  const locales = fs.readFileSync(
    path.join(root, "shared/prospectAiLandingLocales.ts"),
    "utf8",
  );
  assert.doesNotMatch(locales, /src:\s*[\"']\/?(es|he)\//);
  assert.doesNotMatch(locales, /\/(es|he)\/images\//);
});

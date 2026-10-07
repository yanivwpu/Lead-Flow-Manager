import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { parseHTML } from "linkedom";
import { syncStaticHomepageHero } from "../client/src/lib/marketingShell";
import { syncDocumentLanguage } from "../client/src/lib/documentLanguage";
import { getLocalizedHomepage } from "../shared/localizeMarketingContent";

test("retained homepage hero follows repeated locale changes without replacing its image", () => {
  const { document } = parseHTML(fs.readFileSync("client/index.html", "utf8"));
  const doc = document as unknown as Document;
  const image = doc.querySelector(".wcs-hero-image");
  const title = doc.querySelector(".wcs-hero-h1");
  for (const locale of ["en", "he", "en", "es", "he", "es", "en"] as const) {
    syncStaticHomepageHero(doc, locale, false);
    const copy = getLocalizedHomepage(locale).staticShell;
    assert.equal(title?.textContent, copy.h1);
    assert.equal(doc.querySelector(".wcs-hero-sub")?.textContent, copy.subtitle);
    assert.equal(doc.querySelector(".wcs-hero-channels")?.textContent, copy.channels);
    assert.equal(doc.querySelector(".wcs-hero-note")?.textContent, copy.noCreditCard);
    assert.equal(doc.querySelector("[data-testid='button-hero-cta']")?.textContent, copy.ctaTrial);
    assert.equal(doc.querySelector("[data-testid='button-book-demo']")?.textContent, copy.ctaDemo);
    assert.equal(doc.querySelector("[data-testid='button-hero-pricing']")?.getAttribute("href"), locale === "en" ? "/pricing" : `/${locale}/pricing`);
    assert.equal(doc.getElementById("whachat-static-shell")?.dir, locale === "he" ? "rtl" : "ltr");
    assert.equal(doc.querySelector(".wcs-hero-image"), image);
    assert.equal(doc.querySelector(".wcs-hero-h1"), title);
  }
  syncStaticHomepageHero(doc, "he", true);
  assert.equal(doc.querySelector("[data-testid='button-hero-cta']")?.getAttribute("href"), "/app/inbox");
  syncStaticHomepageHero(doc, "en", false);
  assert.equal(doc.querySelector("[data-testid='button-hero-cta']")?.getAttribute("href"), "/auth");
});

test("public route changes reset both RTL classes even when i18n still has the old locale", () => {
  const { document } = parseHTML("<html><head></head><body></body></html>");
  const doc = document as unknown as Document;
  for (const [pathname, language, expected] of [
    ["/he/", "en", "he"], ["/", "he", "en"],
    ["/es/", "en", "es"], ["/he/", "es", "he"],
    ["/es/pricing", "he", "es"], ["/pricing", "he", "en"],
    ["/app/inbox", "he", "he"], ["/app/inbox", "en", "en"],
  ]) {
    syncDocumentLanguage(doc, pathname, language);
    assert.equal(doc.documentElement.lang, expected);
    assert.equal(doc.documentElement.dir, expected === "he" ? "rtl" : "ltr");
    assert.equal(doc.documentElement.classList.contains("rtl"), expected === "he");
    assert.equal(doc.body.classList.contains("rtl"), expected === "he");
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import en from "../client/src/locales/en.json";
import he from "../client/src/locales/he.json";
import es from "../client/src/locales/es.json";

const owner = "e3078bc6-e9a0-4bf3-ad73-b849e1a84a44";
const photoId = "2e089653-eaa7-4bee-abce-a3f6f4aa99b3";
const photoUrl = "https://images.example.test/media/" + owner + "/neighborhood-guide/" + photoId + ".jpg";

for (const [language, dictionary] of Object.entries({ en, he, es })) {
  test(`real article editor inserts and resizes authored images in ${language}`, { timeout: 120_000 }, async (t) => {
    if (process.env.AGENT_PAGE_BROWSER_TEST !== "1") { t.skip("Browser checks run in Agent Page CI"); return; }
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH });
    t.after(() => browser.close());
    const harness = [
      'import React from "react";',
      'import i18n from "i18next";',
      'import { initReactI18next } from "react-i18next";',
      'import en from "./client/src/locales/en.json";',
      'import he from "./client/src/locales/he.json";',
      'import es from "./client/src/locales/es.json";',
      'const changeLanguage = async (lang) => { await i18n.changeLanguage(lang); document.documentElement.lang = lang; document.documentElement.dir = i18n.dir(lang); };',
      'window.__changeLanguage = changeLanguage;',
      'i18n.use(initReactI18next).init({ lng: ' + JSON.stringify(language) + ', resources: { en: { translation: en }, he: { translation: he }, es: { translation: es } } });',
      'void changeLanguage(' + JSON.stringify(language) + ');',
      'import { createRoot } from "react-dom/client";',
      'import { NeighborhoodGuideVisualEditor } from "./client/src/components/agentPage/NeighborhoodGuideVisualEditor.tsx";',
      'import { NeighborhoodBoundaryEditor } from "./client/src/components/agentPage/NeighborhoodBoundaryEditor.tsx";',
      'window.__mapQueries = [];',
      'window.fetch = async (url) => { window.__mapQueries.push(String(url)); return new Response(JSON.stringify({ latitude: 32.06, longitude: 34.77, precision: "neighborhood" })); };',
      'function MapFixture() { return <NeighborhoodBoundaryEditor persistedBoundary={null} persistedVersion={null} name="נווה צדק" city="Tel Aviv" state="Tel Aviv" country="IL" sessionKey="fixture-map" disabled={false} stale={false} onChange={(shape) => { window.__shape = shape; }} />; }',
      'const photo = { url: ' + JSON.stringify(photoUrl) + ', alt: "Victoria Park street view" };',
      'function Harness() {',
      ' const [value, setValue] = React.useState("Victoria Park has an inviting mix of homes near downtown.\\n\\n## Around the block");',
      ' const [visible, setVisible] = React.useState(true);',
      ' window.__switchArticleTab = () => setVisible((previous) => !previous);',
      ' return visible ? <NeighborhoodGuideVisualEditor content={value} photos={[photo]} disabled={false} canUpload={true} uploading={false}',
      ' onChange={(next) => { window.__guideContent = next; setValue(next); }}',
      ' onPhotoAltChange={() => {}} onUploadPhoto={async () => {}} />',
      ' : <p id="alternative-page">Another dashboard tab</p>;',
      '}',
      'createRoot(document.getElementById("root")).render(<><MapFixture /><Harness /></>);',
    ].join("\n");
    const result = await build({
      stdin: { contents: harness, resolveDir: process.cwd(), sourcefile: "neighborhood-editor-harness.tsx", loader: "tsx" },
      bundle: true, write: false, format: "iife", platform: "browser",
      jsx: "automatic", alias: { "@": "./client/src", "@shared": "./shared" },
      define: { "process.env.NODE_ENV": '"production"' },
      loader: { ".css": "empty" }, logLevel: "silent",
    });
    const js = result.outputFiles.find((file) => file.path.endsWith(".js")) ?? result.outputFiles[0];
    assert.ok(js, "browser harness bundled successfully");
    const page = await browser.newPage({ viewport: { width: language === "en" ? 1280 : 390, height: 900 } });
    t.after(() => page.close());
    await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
    await page.addScriptTag({ content: js.text });
    const editor = page.getByRole("textbox", { name: dictionary.rgeNeighborhood.article });
    await editor.waitFor();
    assert.equal(await page.locator("html").getAttribute("dir"), language === "he" ? "rtl" : "ltr");
    await page.locator("[data-rge-map-toggle]").click();
    await page.getByRole("button", { name: dictionary.rgeMap.find, exact: true }).click();
    await page.getByText(dictionary.rgeMap.located, { exact: true }).waitFor();
    await page.getByRole("button", { name: dictionary.rgeMap.more, exact: true }).click();
    assert.equal(await page.getByLabel(dictionary.rgeMap.latitude).inputValue(), "32.06000");
    assert.equal(await page.getByLabel(dictionary.rgeMap.longitude).inputValue(), "34.77000");
    const queries = await page.evaluate(() => (window as any).__mapQueries);
    assert.equal(queries.length, 1);
    assert.deepEqual(Object.fromEntries(new URL(queries[0], "https://fixture.test").searchParams), {
      name: "נווה צדק", city: "Tel Aviv", state: "Tel Aviv", country: "IL",
    });
    await page.locator("[data-rge-map-toggle]").click();

    await editor.locator("h3").click();
    await page.getByRole("button", { name: dictionary.rgeNeighborhood.insert }).click();
    assert.equal(await editor.locator('[data-inline-photo-picker="true"]').count(), 1, "picker is inside the article, not above it");
    await editor.getByRole("region", { name: dictionary.rgeNeighborhood.picker }).locator("button:has(img)").click();
    const figure = editor.locator("figure[data-photo-id]");
    await figure.waitFor();
    assert.equal(await figure.count(), 1, "image appears immediately inside the editor");
    assert.equal(await editor.locator('[data-inline-photo-picker="true"]').count(), 0, "picker is replaced with image");
    assert.equal(await figure.locator("img").getAttribute("alt"), "Victoria Park street view");
    assert.ok((await page.evaluate(() => (window as unknown as { __guideContent?: string }).__guideContent ?? "")).includes("[[photo:" + photoId + "]]"), "inline image reference was saved");
    const tagNames = await editor.locator("h3, figure").evaluateAll((elements) => elements.map((element) => element.tagName));
    assert.deepEqual(tagNames, ["H3", "FIGURE"], "photo lands below the selected heading");
    const widthSlider = page.getByRole("slider", { name: dictionary.rgeNeighborhood.resize });
    await widthSlider.focus();
    await widthSlider.press("Home");
    for (let i = 0; i < 4; i++) await widthSlider.press("ArrowUp");
    assert.equal(await figure.evaluate((node) => (node as HTMLElement).style.width), "60%");
    assert.ok((await page.evaluate(() => (window as unknown as { __guideContent?: string }).__guideContent ?? "")).includes("[[photo:" + photoId + "|60]]"), "width persists in the saved article marker");

    // Regression: returning to an inactive dashboard/browser tab must not leave
    // an empty or uneditable article. Restore from preserved React draft content
    // only when the browser has emptied the contentEditable surface.
    await page.evaluate(() => {
      const editor = document.querySelector('[contenteditable][role="textbox"]');
      editor?.replaceChildren();
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await editor.locator("figure[data-photo-id]").waitFor();
    assert.equal(await editor.locator("h3").count(), 1, "the restored article heading remains editable");
    assert.equal(await figure.evaluate((node) => (node as HTMLElement).style.width), "60%",
      "restored inline photo keeps its saved width");
    await page.evaluate(() => {
      document.querySelector('[contenteditable][role="textbox"]')?.replaceChildren();
    });
    await editor.focus();
    await editor.locator("figure[data-photo-id]").waitFor();
    assert.equal(await editor.locator("h3").count(), 1, "focus also recovers an unexpectedly blank editor");

    await page.evaluate(() => (window as any).__switchArticleTab());
    await page.locator("#alternative-page").waitFor();
    assert.equal(await page.locator("#alternative-page").count(), 1, "editor unmounts on dashboard tab change");
    await page.evaluate(() => (window as any).__switchArticleTab());
    await editor.locator("h3").waitFor();
    await editor.locator("figure[data-photo-id]").waitFor();
    assert.equal(await editor.locator("h3").count(), 1, "article heading is restored after switching back");
    assert.equal(await editor.locator("figure[data-photo-id]").evaluate((node) => (node as HTMLElement).style.width),
      "60%", "the edited image width survives unmount/remount");
    assert.ok((await page.evaluate(() => (window as any).__guideContent)).includes("[[photo:" + photoId + "|60]]"),
      "the React draft content is not lost on tab switching");
    const authored = await page.evaluate(() => (window as any).__guideContent);
    const otherLanguage = language === "he" ? "es" : "he";
    await page.evaluate((lang) => (window as any).__changeLanguage(lang), otherLanguage);
    await page.locator("figure[data-photo-id]").getByRole("button", { name: (otherLanguage === "he" ? he : es).rgeNeighborhood.resizeHandle }).waitFor();
    assert.deepEqual(await page.evaluate(() => (window as any).__mapQueries), queries);
    assert.equal(await page.evaluate(() => (window as any).__shape), undefined);
    assert.equal(await page.evaluate(() => (window as any).__guideContent), authored, "language changes do not change authored content");
    assert.equal(await page.locator("figure[data-photo-id]").evaluate((node) => (node as HTMLElement).style.width), "60%");
  });
}

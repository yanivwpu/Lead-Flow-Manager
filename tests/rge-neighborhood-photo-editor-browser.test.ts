import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const owner = "e3078bc6-e9a0-4bf3-ad73-b849e1a84a44";
const photoId = "2e089653-eaa7-4bee-abce-a3f6f4aa99b3";
const photoUrl = "https://images.example.test/media/" + owner + "/neighborhood-guide/" + photoId + ".jpg";

test("real article editor visibly inserts an image at the chosen heading and persists resized width", { timeout: 120_000 }, async (t) => {
  if (process.env.AGENT_PAGE_BROWSER_TEST !== "1") { t.skip("Browser checks run in Agent Page CI"); return; }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const harness = [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { NeighborhoodGuideVisualEditor } from "./client/src/components/agentPage/NeighborhoodGuideVisualEditor.tsx";',
    'const photo = { url: ' + JSON.stringify(photoUrl) + ', alt: "Victoria Park street view" };',
    'function Harness() {',
    ' const [value, setValue] = React.useState("Victoria Park has an inviting mix of homes near downtown.\\n\\n## Around the block");',
    ' return <NeighborhoodGuideVisualEditor content={value} photos={[photo]} disabled={false} canUpload={true} uploading={false}',
    ' onChange={(next) => { window.__guideContent = next; setValue(next); }}',
    ' onPhotoAltChange={() => {}} onUploadPhoto={async () => null} />;',
    '}',
    'createRoot(document.getElementById("root")).render(<Harness />);',
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  t.after(() => page.close());
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: js.text });
  const editor = page.getByRole("textbox", { name: "Your local guide article" });
  await editor.waitFor();
  await editor.locator("h3").click();
  await page.getByRole("button", { name: "Insert image" }).click();
  assert.equal(await editor.locator('[data-inline-photo-picker="true"]').count(), 1, "picker is inside the article, not above it");
  await editor.locator('[aria-label="Choose article image"] button:has(img)').click();
  const figure = editor.locator("figure[data-photo-id]");
  await figure.waitFor();
  assert.equal(await figure.count(), 1, "image appears immediately inside the editor");
  assert.equal(await editor.locator('[data-inline-photo-picker="true"]').count(), 0, "picker is replaced with image");
  assert.equal(await figure.locator("img").getAttribute("alt"), "Victoria Park street view");
  assert.ok((await page.evaluate(() => (window as unknown as { __guideContent?: string }).__guideContent ?? "")).includes("[[photo:" + photoId + "]]"), "inline image reference was saved");
  const tagNames = await editor.locator("h3, figure").evaluateAll((elements) => elements.map((element) => element.tagName));
  assert.deepEqual(tagNames, ["H3", "FIGURE"], "photo lands below the selected heading");
  const widthSlider = page.getByRole("slider", { name: "Resize selected article image" });
  await widthSlider.focus();
  await widthSlider.press("Home");
  for (let i = 0; i < 4; i++) await widthSlider.press("ArrowRight");
  assert.equal(await figure.evaluate((node) => (node as HTMLElement).style.width), "60%");
  assert.ok((await page.evaluate(() => (window as unknown as { __guideContent?: string }).__guideContent ?? "")).includes("[[photo:" + photoId + "|60]]"), "width persists in the saved article marker");

  // Regression: returning to an inactive dashboard/browser tab must not leave
  // an empty or uneditable article. Restore from preserved React draft content
  // only when the browser has emptied the contentEditable surface.
  await page.evaluate(() => {
    const editor = document.querySelector('[aria-label="Your local guide article"]');
    editor?.replaceChildren();
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await editor.locator("figure[data-photo-id]").waitFor();
  assert.equal(await editor.locator("h3").count(), 1, "the restored article heading remains editable");
  assert.equal(await figure.evaluate((node) => (node as HTMLElement).style.width), "60%",
    "restored inline photo keeps its saved width");
  await page.evaluate(() => {
    document.querySelector('[aria-label="Your local guide article"]')?.replaceChildren();
  });
  await editor.focus();
  await editor.locator("figure[data-photo-id]").waitFor();
  assert.equal(await editor.locator("h3").count(), 1, "focus also recovers an unexpectedly blank editor");
});

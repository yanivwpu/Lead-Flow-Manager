import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { buildPublicAgentPageHtml } from "../shared/agent/publicAgentPageHtml";
import type { PublicAgentPageRenderInput } from "../shared/agent/agentPageTypes";
import type { NeighborhoodPageSettings } from "../shared/agent/neighborhoodPages";
import { neighborhoodDraftKey } from "../client/src/lib/neighborhoodDrafts";
import { neighborhoodMapSessionKey } from "../client/src/lib/neighborhoodMapSession";

const browserOptions = { headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE };
const images = "https://image-fixtures.test";
const origin = "https://rge-ux.test";
const api = "/api/agent-page/neighborhoods";
const photos = process.env.RGE_PUBLIC_UX_SCREENSHOTS;
if (photos) mkdirSync(photos, { recursive: true });

test("shared logo scales on both public pages at desktop and mobile widths in LTR and RTL", async (t) => {
  if (process.env.AGENT_PAGE_BROWSER_TEST !== "1") { t.skip("Browser checks run in Agent Page CI"); return; }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch(browserOptions);
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route(images + "/**", (route) => {
    const logo = route.request().url().endsWith("/logo.svg");
    const small = route.request().url().endsWith("/small.svg");
    const size = logo ? 'width="630" height="180"' : small ? 'width="90" height="30"' : 'width="160" height="160"';
    const drawing = logo
      ? '<path fill="#0f3f37" d="M10 128 80 28l70 100h-25L80 62l-47 66z"/><circle cx="80" cy="110" r="11" fill="#ad7944"/><text x="170" y="94" font-family="Georgia" font-size="62" fill="#0f3f37">CYPRESS</text><text x="174" y="137" font-family="Arial" font-size="31" letter-spacing="9" fill="#0f3f37">REALTY GROUP</text>'
      : '<rect width="160" height="160" fill="#daeae4"/><circle cx="80" cy="62" r="30" fill="#487467"/><path d="M23 160v-11a57 57 0 0 1 114 0v11z" fill="#487467"/>';
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" ' + size + ">" + drawing + "</svg>" });
  });
  for (const [lang, displayName, brokerageName, neighborhood] of [
    ["en", "Jane Morgan", "Cypress Realty Group", "Victoria Park"],
    ["es", "Elena García", "Grupo Inmobiliario Cypress", "Parque Victoria"],
    ["he", "יעל לוי", "קבוצת התיווך סייפרס", "פארק ויקטוריה"],
  ]) {
    const profile: PublicAgentPageRenderInput = {
      userId: "fixture", displayName, brokerageName, bio: "Local guidance for buyers and sellers.",
      marketArea: "Fort Lauderdale, FL", avatarUrl: images + "/avatar.svg", companyLogo: images + "/logo.svg",
      socialLinks: { websiteUrl: "", facebookUrl: "", instagramUrl: "", linkedinUrl: "", youtubeUrl: "" },
      publicPhone: "+19545550180", schedulingUrl: "", widgetEnabled: false, preferredLeadCapture: "phone",
      showHomeValueCta: false, agentPageSlug: "jane-morgan", listings: [], browseTotal: 0,
      browseHasMore: false, browsePageSize: 24, agentPageUrl: origin + "/agents/jane-morgan",
    };
    for (const kind of ["agent", "neighborhood"]) {
      const data = kind === "agent" ? profile : { ...profile, neighborhood: {
        name: neighborhood, city: "Fort Lauderdale", state: "FL", slug: "victoria-park",
        parentUrl: profile.agentPageUrl!, content: "Walkable streets and quiet parks close to downtown.",
      } };
      for (const width of [1200, 390]) {
        await page.setViewportSize({ width, height: 850 });
        // Exercise the existing public CSS with localized profile text and explicit direction.
        await page.setContent(buildPublicAgentPageHtml(data).replace('<html lang="en">',
          '<html lang="' + lang + '" dir="' + (lang === "he" ? "rtl" : "ltr") + '">'));
        const logo = page.locator(".agent-logo");
        const dimensions = await logo.evaluate(async (img: HTMLImageElement) => {
          await img.decode();
          const rect = img.getBoundingClientRect();
          const parent = img.parentElement!.getBoundingClientRect();
          return { width: rect.width, height: rect.height, natural: img.naturalWidth / img.naturalHeight,
            fits: rect.left >= parent.left - 1 && rect.right <= parent.right + 1 };
        });
        assert.ok(Math.abs(dimensions.width - (width === 1200 ? 208 : 160)) < 0.5);
        assert.ok(Math.abs(dimensions.width / dimensions.height - dimensions.natural) < .01 && dimensions.fits);
        assert.equal(await page.locator(".agent-avatar").isVisible(), true);
        assert.equal(await page.getByText(displayName, { exact: true }).isVisible(), true);
        if (kind === "neighborhood") assert.equal(await page.getByText(brokerageName, { exact: true }).isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (photos && lang === "en") await page.locator(kind === "agent" ? ".agent-header" : ".neighborhood-agent-card")
          .screenshot({ path: join(photos, kind + (width === 1200 ? "-desktop.png" : "-mobile.png")) });
        if (lang === "en" && width === 1200) {
          await logo.evaluate((img: HTMLImageElement, url) => { img.src = url; }, images + "/small.svg");
          assert.equal(await logo.evaluate(async (img: HTMLImageElement) => { await img.decode(); return img.width; }), 90);
        }
      }
    }
  }
});

test("library and article uploads preserve draft identity, placement, and map", { timeout: 90_000 }, async (t) => {
  if (process.env.AGENT_PAGE_BROWSER_TEST !== "1") { t.skip("Browser checks run in Agent Page CI"); return; }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch(browserOptions);
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
  const harness = [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { QueryClient, QueryClientProvider } from "@tanstack/react-query";',
    'import i18n from "i18next";',
    'import { initReactI18next } from "react-i18next";',
    'import english from "./client/src/locales/en.json";',
    'import { useToast } from "./client/src/hooks/use-toast";',
    'import { NeighborhoodPageSettings } from "./client/src/components/agentPage/NeighborhoodPageSettings";',
    'i18n.use(initReactI18next).init({lng:"en", resources:{en:{translation:english}}});',
    'function Harness() { const [visible, setVisible] = React.useState(true); const { toasts } = useToast();',
    '  window.__toggleNeighborhoodSettings = () => setVisible(value => !value);',
    '  return <>{visible && <NeighborhoodPageSettings publicPageUrl="https://rge-ux.test/agents/jane-morgan"/>}',
    '    <output data-testid="fixture-toast">{toasts[0]?.title}</output></>; }',
    'createRoot(document.querySelector("#root")).render(<QueryClientProvider client={new QueryClient()}><Harness/></QueryClientProvider>);',
  ].join("\n");
  const bundled = await build({
    stdin: { contents: harness, resolveDir: process.cwd(), sourcefile: "rge-upload-harness.tsx", loader: "tsx" },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    alias: { "@": "./client/src", "@shared": "./shared" },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "fixture-auth", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/auth-context$/ }, () => ({ path: "auth", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'export const useAuth = () => ({ user: { id: "fixture" } });' }));
    } }],
  });
  let style = "";
  if (photos) {
    const { compile } = await import("@tailwindcss/node");
    const { Scanner } = await import("@tailwindcss/oxide");
    const candidates = new Scanner({ sources: [] }).scanFiles([
      "client/src/components/agentPage/NeighborhoodPageSettings.tsx",
      "client/src/components/agentPage/NeighborhoodGuideVisualEditor.tsx",
      "client/src/components/ui/button.tsx", "client/src/components/ui/input.tsx",
    ].map(file => ({ content: readFileSync(file, "utf8"), extension: "tsx" })));
    const css = await compile(readFileSync("client/src/index.css", "utf8"), { base: process.cwd(), onDependency() {} });
    style = css.build(candidates);
  }
  const id = "7a4670e2-e86d-43e1-9df8-cdcde30ae940";
  let targetId = id;
  let rejectNextImage = false;
  let detachPickerOnUpload = false;
  const polygon = { type: "Polygon", coordinates: [[[-80.15, 26.12], [-80.14, 26.12], [-80.14, 26.13], [-80.15, 26.12]]] };
  const mapView = { open: false, center: { lat: 26.125, lon: -80.145 }, zoom: 15,
    vertices: [...polygon.coordinates[0].slice(0, -1), [-80.149, 26.128]], boundaryKey: JSON.stringify(polygon) };
  const guide = "Walk to local parks and find shaded streets near downtown.\n\n## Around the block\n\nVisit the neighborhood park on a quiet morning.";
  const image = (i: number) => images + "/media/fixture/neighborhood-guide/bb4db2d6-de94-4895-bb4c-827ba082390" + i + ".png";
  let saved: NeighborhoodPageSettings | undefined;
  const creates: NeighborhoodPageSettings[] = [];
  const updates: NeighborhoodPageSettings[] = [];
  const uploads: string[] = [];
  await page.route(images + "/**", route => route.fulfill({ contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="140"><rect width="240" height="140" fill="#a0c9b3"/><path d="M0 140 58 54l37 44 49-71 96 113z" fill="#396052"/></svg>' }));
  await page.route(origin + "/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === api && method === "GET") return route.fulfill({ json: { canPublish: true, pages: saved ? [saved] : [] } });
    if (path === api && method === "POST") {
      const body = request.postDataJSON();
      creates.push(body);
      if (creates.length === 1) return route.fulfill({ status: 400, json: { error: "Fixture draft error" } });
      saved = { ...body, id: targetId, slug: "victoria-park", published: false, publicUrl: null, updatedAt: "2026-11-25T01:25:00.000Z" };
      return route.fulfill({ status: 201, json: saved });
    }
    if (path === api + "/" + targetId + "/photos" && method === "POST") {
      uploads.push(path);
      if (uploads.length === 2 || rejectNextImage) {
        rejectNextImage = false;
        return route.fulfill({ status: 503, json: { error: "Fixture upload error" } });
      }
      if (detachPickerOnUpload) {
        detachPickerOnUpload = false;
        await page.evaluate(() => document.querySelector('[data-inline-photo-picker="true"]')?.remove());
      }
      return route.fulfill({ status: 201, json: { url: image(uploads.length) } });
    }
    if (path === api + "/" + targetId && method === "PUT") {
      const body = request.postDataJSON();
      updates.push(body);
      saved = { ...saved!, ...body, updatedAt: "2026-11-25T01:26:00.000Z" };
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><html class="wcs-hide-static-marketing" data-authenticated-layout><head><style>' + style + '</style></head><body><div id="root"></div></body></html>' });
  });
  const mount = async () => {
    await page.goto(origin + "/");
    await page.addScriptTag({ content: bundled.outputFiles[0].text });
  };
  await mount();
  await page.getByRole("button", { name: "+ Add", exact: true }).click();
  const openLibrary = () => page.getByText(/^Cover photo & media library/).click();
  const upload = page.getByRole("button", { name: "Upload to library" });
  const choose = page.getByRole("button", { name: "Choose photo and create draft" });
  const input = page.getByLabel("Upload neighborhood photo", { exact: true });
  await openLibrary();
  await upload.click();
  await page.getByText("Enter the neighborhood, city, region, and a two-letter country code first.", { exact: true }).waitFor();
  assert.equal(await choose.isEnabled(), false);
  assert.equal(creates.length, 0);

  await page.evaluate(({ localKey, mapKey, polygon, mapView, guide }) => {
    localStorage.setItem(localKey, JSON.stringify({ active: "new", entries: { new: {
      values: { name: "Victoria Park", city: "Fort Lauderdale", state: "FL", country: "US", content: guide, photos: [], customBoundary: polygon },
      baseVersion: null,
    } } }));
    sessionStorage.setItem(mapKey, JSON.stringify(mapView));
  }, { localKey: neighborhoodDraftKey("fixture"), mapKey: neighborhoodMapSessionKey("fixture", "new"), polygon, mapView, guide });
  await mount();
  await openLibrary();
  await upload.click();
  assert.equal(await choose.isEnabled(), true);
  const library = page.locator("details").filter({ hasText: /Cover photo & media library/ });
  if (photos) await library.screenshot({ path: join(photos, "create-draft-before-upload.png") });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), choose.click()]);
  assert.equal(creates.length, 0, "the chooser can be canceled without creating a draft");
  await chooser.setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") });
  assert.equal(creates.length, 0, "unsupported files cannot trigger a draft save");

  const file = { name: "park.png", mimeType: "image/png", buffer: Buffer.from("fixture image") };
  const failure = page.waitForResponse(response => response.url().endsWith(api) && response.status() === 400);
  await input.setInputFiles(file);
  await failure;
  await page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Choose photo and create draft")?.disabled);
  assert.equal(uploads.length, 0);
  assert.equal(await page.locator("#neighborhood-name").inputValue(), "Victoria Park");

  const firstAttachment = page.waitForResponse(response => response.request().method() === "PUT");
  await input.setInputFiles(file);
  await firstAttachment;
  await upload.waitFor();
  assert.equal(creates.length, 2, "one rejected creation and one successful creation");
  assert.equal(creates[1].published, false);
  assert.equal(creates[1].country, "US");
  assert.equal(creates[1].content, guide);
  assert.deepEqual(creates[1].customBoundary, polygon);
  assert.deepEqual(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || "{}").vertices,
    neighborhoodMapSessionKey("fixture", id)), mapView.vertices);

  assert.deepEqual(saved?.photos?.map(photo => photo.url), [image(1)], "first photo is linked to the unpublished draft");
  assert.equal(updates[0].published, false);
  assert.deepEqual(updates[0].customBoundary, polygon);
  const uploadFailure = page.waitForResponse(response => response.url().endsWith("/photos") && response.status() === 503);
  const [afterDraft] = await Promise.all([page.waitForEvent("filechooser"), upload.click()]);
  await afterDraft.setFiles(file);
  await uploadFailure;
  const [retry] = await Promise.all([page.waitForEvent("filechooser"), upload.click()]);
  await retry.setFiles(file);
  await library.locator('img[src="' + image(3) + '"]').waitFor();
  assert.equal(creates.length, 2, "upload retries reuse the saved draft");
  assert.deepEqual(uploads, Array(3).fill(api + "/" + id + "/photos"));
  if (photos) await library.screenshot({ path: join(photos, "photos-in-draft-library.png") });
  const savedPhotos = page.waitForResponse(response => response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await savedPhotos;
  assert.equal(updates[1].published, false);
  assert.equal(updates[1].content, guide);
  assert.deepEqual(updates[1].customBoundary, polygon);
  assert.deepEqual(updates[1].photos?.map(photo => photo.url), [image(1), image(3)]);

  const editor = page.getByRole("textbox", { name: "Your local guide article" });
  const articleShape = () => editor.locator(":scope > p, :scope > h3, :scope > figure").evaluateAll(nodes =>
    nodes.filter(node => node.nodeName === "FIGURE" || node.textContent?.trim()).map(node => node.nodeName));
  assert.deepEqual(await articleShape(), ["P", "H3", "P"], "standalone library uploads do not insert a photo");

  const chooseAt = async (selector: string) => {
    await editor.locator(selector).first().click();
    await page.getByRole("button", { name: "Insert image", exact: true }).click();
    await page.getByRole("region", { name: "Choose article image" }).waitFor();
  };
  const articleUpload = page.getByRole("button", { name: "Upload new photo", exact: true });
  const uploadInline = async () => {
    const [picker] = await Promise.all([page.waitForEvent("filechooser"), articleUpload.click()]);
    await picker.setFiles(file);
  };

  await chooseAt("h3");
  await page.getByRole("region", { name: "Choose article image" })
    .locator('button:has(img[src="' + image(1) + '"])').click();
  assert.deepEqual(await articleShape(), ["P", "H3", "FIGURE", "P"]);
  const existingFigure = editor.locator('figure:has(img[src="' + image(1) + '"])');
  assert.ok(await existingFigure.isVisible());

  rejectNextImage = true;
  await chooseAt("p");
  await uploadInline();
  await page.getByTestId("fixture-toast").getByText("Photo upload failed").waitFor();
  assert.deepEqual(await articleShape(), ["P", "H3", "FIGURE", "P"], "failed upload leaves the article intact");
  assert.ok(await articleUpload.isEnabled(), "the original chooser can retry");

  detachPickerOnUpload = true;
  await uploadInline();
  const inlineImage = image(5);
  const inlineFigure = editor.locator('figure:has(img[src="' + inlineImage + '"])');
  await inlineFigure.waitFor();
  assert.deepEqual(await articleShape(), ["P", "FIGURE", "H3", "FIGURE", "P"]);
  assert.equal(await editor.locator("figure").count(), 2);
  assert.ok(await library.locator('img[src="' + inlineImage + '"]').isVisible());
  const width = page.getByRole("slider", { name: "Resize selected article image" });
  await width.press("Home");
  const caption = page.getByLabel("Image caption", { exact: true });
  await caption.fill("Shaded walk near the park");
  await inlineFigure.getByText("Shaded walk near the park").waitFor();
  assert.equal(await inlineFigure.getAttribute("data-photo-width"), "40");

  const articleSave = page.waitForResponse(response => response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await articleSave;
  assert.deepEqual(updates[2].customBoundary, polygon);
  assert.match(updates[2].content, /\[\[photo:[a-f0-9-]+\|40\]\]/);
  await page.evaluate(() => (window as any).__toggleNeighborhoodSettings());
  await editor.waitFor({ state: "detached" });
  await page.evaluate(() => (window as any).__toggleNeighborhoodSettings());
  await inlineFigure.waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /^Edit Victoria Park/ }).click();
  await inlineFigure.waitFor();
  assert.deepEqual(await articleShape(), ["P", "FIGURE", "H3", "FIGURE", "P"]);
  assert.equal(await inlineFigure.getAttribute("data-photo-width"), "40");
  assert.equal(await inlineFigure.locator("figcaption").textContent(), "Shaded walk near the park");

  await page.getByRole("button", { name: "+ Add", exact: true }).click();
  await page.getByRole("button", { name: "Insert image", exact: true }).click();
  await page.getByRole("region", { name: "Choose article image" })
    .getByText("Enter the neighborhood, city, region, and a two-letter country code first.").waitFor();
  assert.equal(await articleUpload.isEnabled(), false);

  targetId = "c5267bdb-66b2-48a3-8bb9-b651f094fdc5";
  await page.evaluate(({ localKey, polygon, guide }) => {
    localStorage.setItem(localKey, JSON.stringify({ active: "new", entries: { new: {
      values: { name: "Palm Gardens", city: "Fort Lauderdale", state: "FL", country: "US", content: guide, photos: [], customBoundary: polygon },
      baseVersion: null,
    } } }));
  }, { localKey: neighborhoodDraftKey("fixture"), polygon, guide });
  await mount();
  await chooseAt("h3");
  await page.getByText("Uploading creates an unpublished draft and inserts the photo here.").waitFor();
  const newArticleSave = page.waitForResponse(response => response.request().method() === "PUT");
  await uploadInline();
  await newArticleSave;
  assert.equal(creates.length, 3, "inline upload creates only one new draft");
  assert.equal(creates[2].published, false);
  assert.equal(creates[2].content, guide);
  assert.deepEqual(creates[2].customBoundary, polygon);
  assert.equal(updates[3].published, false);
  assert.deepEqual(updates[3].customBoundary, polygon);
  assert.deepEqual(updates[3].photos?.map(photo => photo.url), [image(6)]);
  await editor.locator('figure:has(img[src="' + image(6) + '"])').waitFor();
  assert.deepEqual(await articleShape(), ["P", "H3", "FIGURE", "P"]);
  await page.locator("#neighborhood-inline-image-width:enabled").waitFor();
  assert.equal(await width.isEnabled(), true, "resize controls are available after the new editor remounts");
  assert.equal(await caption.isEnabled(), true);
});

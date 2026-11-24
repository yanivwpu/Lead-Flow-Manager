import test from "node:test";
import { build } from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readCustomNeighborhoodBoundary } from "../shared/agent/neighborhoodCustomBoundary";
import { coordinateWithinNeighborhood, type PolygonBoundary } from "../shared/agent/neighborhoodListingGeo";
import { resolveNeighborhoodBoundary } from "../server/agentPage/neighborhoodBoundaryService";
import { EMPTY_NEIGHBORHOOD, neighborhoodDraftKey, readNeighborhoodDrafts, writeNeighborhoodDrafts } from "../client/src/lib/neighborhoodDrafts";

const square: PolygonBoundary = { type: "Polygon", coordinates: [[
  [-80.15, 26.12], [-80.14, 26.12], [-80.14, 26.13],
  [-80.15, 26.13], [-80.15, 26.12],
]] };

test("agent boundary is a valid small, closed polygon; inside/outside are exact", () => {
  assert.deepEqual(readCustomNeighborhoodBoundary(square), square);
  assert.deepEqual(readCustomNeighborhoodBoundary({ ...square, extra: "ignored" }), square);
  assert.equal(coordinateWithinNeighborhood(26.125, -80.145, square), true);
  assert.equal(coordinateWithinNeighborhood(26.16, -80.145, square), false);
  assert.equal(readCustomNeighborhoodBoundary({ type: "Point", coordinates: [-80.14, 26.12] }), null);
  assert.equal(readCustomNeighborhoodBoundary({ type: "MultiPolygon", coordinates: [square.coordinates] }), null);
  assert.equal(readCustomNeighborhoodBoundary({ ...square, coordinates: [[...square.coordinates[0].slice(0, -1)]] }), null);
  assert.equal(readCustomNeighborhoodBoundary({ type: "Polygon", coordinates: [square.coordinates[0], square.coordinates[0]] }), null);
});

test("custom area rejects crossed, huge and repeated or out-of-range rings", () => {
  const bowTie = { type: "Polygon", coordinates: [[
    [-80.15, 26.12], [-80.14, 26.13], [-80.15, 26.13],
    [-80.14, 26.12], [-80.15, 26.12],
  ]] };
  assert.equal(readCustomNeighborhoodBoundary(bowTie), null);
  const huge = { type: "Polygon", coordinates: [[
    [-80.15, 26.12], [-79.15, 26.12], [-79.15, 27.12],
    [-80.15, 27.12], [-80.15, 26.12],
  ]] };
  assert.equal(readCustomNeighborhoodBoundary(huge), null);
  assert.equal(readCustomNeighborhoodBoundary({ type: "Polygon", coordinates: [[
    [-80.15, 26.12], [-80.14, 26.12], [-80.14, 26.12],
    [-80.15, 26.13], [-80.15, 26.12],
  ]] }), null);
  assert.equal(readCustomNeighborhoodBoundary({ type: "Polygon", coordinates: [[
    [-180, 26.12], [180, 26.12], [180, 26.13], [-180, 26.13], [-180, 26.12],
  ]] }), null);
});

test("owner-defined geometry stays explicitly labeled and does not call unsupported official GIS", async () => {
  const result = await resolveNeighborhoodBoundary({
    name: "נווה צדק", city: "Tel Aviv", state: "Tel Aviv", country: "IL", customBoundary: square,
  });
  assert.equal(result.status, "custom");
  if (result.status === "custom") {
    assert.match(result.source, /Agent-defined.*not official GIS/);
    assert.equal(result.bounds.minLon, -80.15);
  }
  assert.equal((await resolveNeighborhoodBoundary({
    name: "נווה צדק", city: "Tel Aviv", state: "Tel Aviv", country: "IL",
  })).status, "unsupported");
  assert.equal((await resolveNeighborhoodBoundary({
    name: "נווה צדק", city: "Tel Aviv", state: "Tel Aviv", country: "IL",
    customBoundary: { type: "Polygon", coordinates: [] },
  })).status, "unmatched");
});

test("agent custom area draft survives reload and remains tenant isolated", () => {
  const key = neighborhoodDraftKey("agent-area-owner");
  const records = new Map<string, string>();
  const storage = {
    getItem: (k: string) => records.get(k) ?? null,
    setItem: (k: string, v: string) => { records.set(k, v); },
    removeItem: (k: string) => { records.delete(k); },
  };
  writeNeighborhoodDrafts(storage, key, { active: "new", entries: {
    new: { values: { ...EMPTY_NEIGHBORHOOD, city: "Miami", customBoundary: square }, baseVersion: null },
  } });
  assert.deepEqual(readNeighborhoodDrafts(storage, key).entries.new.values.customBoundary, square);
  assert.equal(readNeighborhoodDrafts(storage, neighborhoodDraftKey("someone-else")).entries.new, undefined);
  records.set(key, JSON.stringify({ active: "new", entries: { new: {
    values: { ...EMPTY_NEIGHBORHOOD, customBoundary: { type: "Polygon", coordinates: [] } },
    baseVersion: null,
  } } }));
  assert.equal(readNeighborhoodDrafts(storage, key).entries.new, undefined);
});

test("owner endpoints, public HTML, persistence and map editing retain custom-area safeguards", () => {
  const api = readFileSync("server/routes/agentNeighborhoodPages.ts", "utf8");
  const listings = readFileSync("server/agentPage/neighborhoodListings.ts", "utf8");
  const html = readFileSync("shared/agent/publicAgentPageHtml.ts", "utf8");
  const editor = readFileSync("client/src/components/agentPage/NeighborhoodBoundaryEditor.tsx", "utf8");
  const migration = readFileSync("migrations/20261124_agent_neighborhood_custom_boundary.sql", "utf8");
  assert.match(api, /readCustomNeighborhoodBoundary\(value\)/);
  assert.match(api, /router\.use\(\(req, res, next\)/);
  assert.match(listings, /boundary\.status === "custom"/);
  assert.match(listings, /row\.country/);
  assert.match(listings, /row\.city/);
  assert.match(html, /agent-defined custom area, not an official neighborhood boundary/);
  assert.ok(html.includes('data.boundaryStatus !== "verified" && data.boundaryStatus !== "custom"'));
  assert.ok(editor.includes('t("rgeMap.apply")'));
  assert.ok(editor.includes('t("rgeMap.remove")'));
  assert.ok(editor.includes('t("rgeMap.attribution")'));
  for (const locale of ["en", "he", "es"]) {
    const labels = JSON.parse(readFileSync(`client/src/locales/${locale}.json`, "utf8")).rgeMap;
    assert.ok(labels.apply && labels.remove && labels.attribution);
  }
  assert.match(migration, /ADD COLUMN IF NOT EXISTS custom_boundary jsonb/);
});

test("map editor visibly restores saved geometry when draft is discarded or changed in another tab", { timeout: 90_000 }, async (t) => {
  if (process.env.AGENT_PAGE_BROWSER_TEST !== "1") { t.skip("Chromium runs in RGE CI"); return; }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const updated: PolygonBoundary = { type: "Polygon", coordinates: [[
    [-80.149, 26.115], [-80.135, 26.115], [-80.135, 26.13],
    [-80.149, 26.13], [-80.149, 26.115],
  ]] };
  const harness = [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { NeighborhoodBoundaryEditor } from "./client/src/components/agentPage/NeighborhoodBoundaryEditor.tsx";',
    'const original = ' + JSON.stringify(square) + ';',
    'function Harness() {',
    ' const [saved, setSaved] = React.useState(original);',
    ' window.__replaceBoundary = (boundary) => setSaved(boundary);',
    ' return <NeighborhoodBoundaryEditor boundary={saved} name="Victoria Park" city="Fort Lauderdale"',
    '  state="FL" country="US" disabled={false} onChange={setSaved} />;',
    '}',
    'createRoot(document.getElementById("root")).render(<Harness />);',
  ].join("\n");
  const result = await build({
    stdin: { contents: harness, resolveDir: process.cwd(), sourcefile: "rge-map-harness.tsx", loader: "tsx" },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    alias: { "@": "./client/src", "@shared": "./shared" },
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".css": "empty" }, logLevel: "silent",
  });
  const js = result.outputFiles.find((file) => file.path.endsWith(".js")) ?? result.outputFiles[0];
  assert.ok(js, "map editor browser harness bundles");
  const page = await browser.newPage({ viewport: { width: 960, height: 800 } });
  t.after(() => page.close());
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: js.text });
  await page.locator("summary").click();
  const map = page.locator("svg.cursor-crosshair");
  await map.waitFor();
  const circles = map.locator("circle");
  assert.equal(await circles.count(), 4, "the saved four-corner area is visible");
  await map.click({ position: { x: 250, y: 160 } });
  assert.equal(await circles.count(), 5, "unapplied local edit appears on the map");
  await page.evaluate((newBoundary) => (window as any).__replaceBoundary(newBoundary), updated);
  await page.waitForFunction(() => document.querySelectorAll("svg.cursor-crosshair circle").length === 4);
  const afterUpdate = await map.locator("polygon").getAttribute("points");
  assert.ok(afterUpdate && afterUpdate.split(" ").length === 4, "updated saved polygon replaces stale corners");
  await page.evaluate(() => (window as any).__replaceBoundary(null));
  await page.waitForFunction(() => document.querySelectorAll("svg.cursor-crosshair circle").length === 0);
  assert.equal(await map.locator("polygon").count(), 0, "clearing a saved custom area clears the visible map");
  await map.click({ position: { x: 240, y: 155 } });
  assert.equal(await circles.count(), 1);
  await page.evaluate((previousBoundary) => (window as any).__replaceBoundary(previousBoundary), square);
  await page.waitForFunction(() => document.querySelectorAll("svg.cursor-crosshair circle").length === 4);
  assert.equal(await circles.count(), 4, "discarding again restores the exact saved area");

  // Navigation must feel like a modern map, without creating fake polygon corners.
  const bounds = await map.boundingBox();
  assert.ok(bounds, "map drawing surface is visible");
  const midX = bounds!.x + bounds!.width / 2;
  const midY = bounds!.y + bounds!.height / 2;
  const initialLatitude = await page.locator('input').first().inputValue();
  await page.mouse.move(midX, midY);
  await page.mouse.down();
  await page.mouse.move(midX + 120, midY + 75, { steps: 8 });
  await page.mouse.up();
  assert.equal(await circles.count(), 4, "dragging pans the map, never adding a boundary corner");
  assert.notEqual(await page.locator('input').first().inputValue(), initialLatitude,
    "dragging changes the map center");
  await map.click({ position: { x: 220, y: 140 } });
  assert.equal(await circles.count(), 5, "a stationary click still adds a corner");
  await page.getByRole("button", { name: "rgeMap.undo" }).click();
  assert.equal(await circles.count(), 4, "Undo corner still works after drag");

  const tile = page.locator('img[src*="tile.openstreetmap.org"]').first();
  const tileBefore = await tile.getAttribute("src");
  const beforeZoom = tileBefore ? Number(new URL(tileBefore).pathname.split("/")[1]) : NaN;
  assert.ok(beforeZoom >= 10);
  await page.mouse.move(midX, midY);
  await page.mouse.wheel(0, -500);
  await page.waitForFunction((prior) => {
    const image = document.querySelector('img[src*="tile.openstreetmap.org"]');
    const src = image?.getAttribute("src");
    const zoom = src ? Number(new URL(src).pathname.split("/")[1]) : NaN;
    return zoom > prior;
  }, beforeZoom);
  assert.equal(await circles.count(), 4, "wheel zoom does not change the boundary");

  await page.locator('button[aria-label="rgeMap.expand"]').click();
  const expanded = await page.locator('div[aria-label="rgeMap.map"]').boundingBox();
  assert.ok(expanded && expanded.width > 850 && expanded.height > 650,
    "expanded view uses most of the viewport");
  await page.waitForFunction(() => {
    const mapRoot = document.querySelector('div[aria-label="rgeMap.map"]');
    const tile = mapRoot?.querySelector('img[src*="tile.openstreetmap.org"]');
    return Boolean(tile && (mapRoot as HTMLElement).getBoundingClientRect().height > 650);
  });
  await page.keyboard.press("Escape");
  const collapsed = await page.locator('div[aria-label="rgeMap.map"]').boundingBox();
  assert.ok(collapsed && collapsed.height < 400, "Escape closes expanded view");
  assert.equal(await circles.count(), 4, "expanding and collapsing preserves existing boundary");
});

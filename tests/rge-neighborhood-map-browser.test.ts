import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

test("real owner map editor creates a valid, draft-only polygon with mobile pointer clicks", { timeout: 120_000 }, async (t) => {
  if (process.env.AGENT_PAGE_BROWSER_TEST !== "1") { t.skip("Chromium in RGE CI only"); return; }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const harness = [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { NeighborhoodBoundaryMap } from "./client/src/components/agentPage/NeighborhoodBoundaryMap.tsx";',
    'function Harness() {',
    ' const [area,setArea] = React.useState(null);',
    ' return <NeighborhoodBoundaryMap boundary={area} country="US" disabled={false} onChange={(next)=> { window.__area = next; setArea(next); }} />;',
    '}',
    'createRoot(document.getElementById("root")).render(<Harness />);',
  ].join("\n");
  const result = await build({
    stdin: { contents: harness, resolveDir: process.cwd(), sourcefile: "area-editor-harness.tsx", loader: "tsx" },
    bundle: true, write: false, format: "iife", platform: "browser",
    jsx: "automatic", alias: { "@": "./client/src", "@shared": "./shared" },
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".css": "empty" }, logLevel: "silent",
  });
  const script = result.outputFiles.find((file) => file.path.endsWith(".js")) ?? result.outputFiles[0];
  assert.ok(script);
  const page = await browser.newPage({ viewport: { width: 390, height: 810 } });
  t.after(() => page.close());
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 204 }));
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: script.text });
  const map = page.getByRole("application", { name: /Neighborhood map/ });
  await map.waitFor();
  await page.getByRole("button", { name: "Draw outline" }).click();
  await map.click({ position: { x: 110, y: 75 } });
  await map.click({ position: { x: 200, y: 80 } });
  await map.click({ position: { x: 185, y: 150 } });
  await page.getByRole("button", { name: "Use this outline" }).click();
  const saved = await page.evaluate(() => (window as unknown as { __area?: unknown }).__area);
  assert.ok(saved && typeof saved === "object" && (saved as { type?: string }).type === "Polygon");
  assert.equal((saved as { coordinates: number[][][] }).coordinates[0].length, 4);
  assert.match(await page.getByRole("status").innerText(), /added to your page draft/);
  await page.getByRole("button", { name: "Remove saved area" }).click();
  assert.equal(await page.evaluate(() => (window as unknown as { __area?: unknown }).__area), null);
});

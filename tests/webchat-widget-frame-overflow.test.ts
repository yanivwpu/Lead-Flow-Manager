/**
 * WidgetFrame must fill its iframe without 100vw / page-scrollbar-gutter overflow.
 * Reproduces the Affordable Pompano branded panel horizontal scrollbar.
 * Run: npx tsx tests/webchat-widget-frame-overflow.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

{
  const html = read("client/index.html");
  assert.match(html, /classList\.add\("wcw-embed"\)/);
  assert.match(html, /\/widget-frame/);
  assert.match(html, /\/chat\//);
}

{
  const css = read("client/src/index.css");
  assert.match(css, /html\.wcw-embed/);
  assert.match(css, /scrollbar-gutter:\s*auto/);
  const embed = css.slice(css.indexOf("html.wcw-embed"), css.indexOf("html.wcw-embed") + 900);
  assert.match(embed, /overflow:\s*hidden/);
  assert.doesNotMatch(embed, /scrollbar-gutter:\s*stable/);
}

{
  const frame = read("client/src/pages/WidgetFrame.tsx");
  const shell = frame.slice(frame.indexOf("const deduped"), frame.indexOf("{/* Header */}"));
  assert.match(shell, /h-full w-full min-w-0 max-w-full/);
  assert.doesNotMatch(shell, /w-screen/);
  assert.match(frame, /min-w-0 flex-1 overflow-y-auto/);
  assert.match(frame, /break-words/);
  assert.match(frame, /\[overflow-wrap:anywhere\]/);
  assert.match(frame, /min-w-0 flex-1 px-3 py-2/);
  assert.match(frame, /flex min-w-0 gap-2 items-center/);
}

console.log("webchat-widget-frame-overflow.test.ts: all assertions passed");

/**
 * Scan install surfaces so UUID / users.id cannot drift back into widget snippets.
 * Run: npx tsx tests/webchat-widget-snippet-scan.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  buildWebchatIframeParentSnippet,
  buildWebchatIframeSnippet,
  buildWebchatScriptSnippet,
} from "../shared/webchatWidgetSnippet";
import { isWidgetPublicId } from "../shared/opaquePublicToken";

const ROOT = process.cwd();
const WIDGET_ID = "wgt_" + "a".repeat(48);

{
  const script = buildWebchatScriptSnippet({
    baseUrl: "https://app.example.com",
    widgetPublicId: WIDGET_ID,
  });
  assert.match(script, /\?id=wgt_/);
  assert.doesNotMatch(script, /data-user-id/);
  assert.equal(isWidgetPublicId(WIDGET_ID), true);
  assert.equal(buildWebchatScriptSnippet({ baseUrl: "https://app.example.com", widgetPublicId: "" }), "");
  assert.match(
    buildWebchatIframeSnippet({ baseUrl: "https://app.example.com", widgetPublicId: WIDGET_ID }),
    /widget-frame\/wgt_/,
  );
  assert.match(
    buildWebchatIframeParentSnippet({ baseUrl: "https://app.example.com", widgetPublicId: WIDGET_ID }),
    /parentUrl/,
  );
}

const SCAN_ROOTS = ["client/src", "shared/agent", "server"];
const FORBIDDEN = [
  /data-user-id=\$\{user/,
  /\/api\/webchat\/\$\{user\./,
  /\/api\/webchat\/\$\{user\?/,
  /widget\.js\?id=\$\{user\.id/,
  /widget-frame\/\$\{user\.id/,
  /\/chat\/\$\{user\.id/,
];

function walk(dir: string, acc: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?|html|md)$/.test(name)) acc.push(p);
  }
  return acc;
}

const hits: string[] = [];
for (const root of SCAN_ROOTS) {
  for (const file of walk(join(ROOT, root), [])) {
    const text = readFileSync(file, "utf8");
    for (const re of FORBIDDEN) {
      if (re.test(text)) hits.push(`${file}: ${re}`);
    }
  }
}
assert.equal(hits.length, 0, hits.join("\n"));

{
  const channels = readFileSync(join(ROOT, "client/src/components/ChannelSettings.tsx"), "utf8");
  assert.match(channels, /buildWebchatScriptSnippet/);
  assert.doesNotMatch(channels, /\/api\/webhook\/tiktok\/lead`/);
  const website = readFileSync(join(ROOT, "client/src/pages/WebsiteWidget.tsx"), "utf8");
  assert.match(website, /buildWebchatScriptSnippet/);
  assert.match(website, /select-rule-flow/);
  const agent = readFileSync(join(ROOT, "shared/agent/publicAgentPageHtml.ts"), "utf8");
  assert.match(agent, /widgetPublicId/);
}

console.log("webchat-widget-snippet-scan.test.ts: all assertions passed");

/**
 * Regression: email CSS must not leak into host UI.
 * Run: npx tsx --test tests/email-html-isolation.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildIsolatedEmailSrcDoc,
  emailHtmlHasHostLeakingStyles,
  hardenEmailHtmlForFrame,
} from "../shared/emailHtmlIsolation";
import { sanitizeEmailHtml } from "../server/emailChannel/htmlSanitize";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GA_STYLE_LEAK = `
<style type="text/css">
  a { color: #1a73e8 !important; }
  body { font-family: Roboto, Arial, sans-serif; }
</style>
<table>
  <tr><td>
    <a href="https://analytics.google.com/">Open Google Analytics</a>
  </td></tr>
</table>
`;

test("detects host-leaking style tags (Google Analytics-style)", () => {
  assert.equal(emailHtmlHasHostLeakingStyles(GA_STYLE_LEAK), true);
  assert.equal(emailHtmlHasHostLeakingStyles("<p>Hello</p>"), false);
});

test("isolated srcdoc contains email styles but is a separate document", () => {
  const srcDoc = buildIsolatedEmailSrcDoc(GA_STYLE_LEAK);
  assert.match(srcDoc, /<!DOCTYPE html>/i);
  assert.match(srcDoc, /a \{ color: #1a73e8 !important; \}/);
  assert.match(srcDoc, /<base target="_blank"/i);
  assert.match(srcDoc, /Content-Security-Policy/i);
  assert.match(srcDoc, /Open Google Analytics/);
  // Document boundary: styles live under the framed html, not as a fragment for host inject.
  assert.match(srcDoc, /<body>[\s\S]*<style/i);
});

test("hardenEmailHtmlForFrame strips scripts, handlers, forms, stylesheet links", () => {
  const raw = `
    <link rel="stylesheet" href="https://evil.example/x.css" />
    <style>@import url("https://evil.example/y.css"); a { color: blue !important; }</style>
    <p onclick="alert(1)">Hi <script>evil()</script></p>
    <form action="https://evil.example"><input /></form>
    <a href="javascript:alert(1)">bad</a>
    <a href="https://ok.example">good</a>
  `;
  const hard = hardenEmailHtmlForFrame(raw);
  assert.doesNotMatch(hard, /<script/i);
  assert.doesNotMatch(hard, /onclick/i);
  assert.doesNotMatch(hard, /<form/i);
  assert.doesNotMatch(hard, /<link/i);
  assert.doesNotMatch(hard, /@import/i);
  assert.doesNotMatch(hard, /javascript:/i);
  assert.match(hard, /color: blue !important/);
  assert.match(hard, /rel="noopener noreferrer"/);
  assert.match(hard, /target="_blank"/);
  assert.match(hard, /https:\/\/ok\.example/);
});

test("server sanitize keeps style for framed rendering but blocks link + import", () => {
  const { html } = sanitizeEmailHtml(`
    <link rel="stylesheet" href="https://evil.example/x.css" />
    <style>@import url("https://evil.example/y.css"); a { color: blue !important; }</style>
    <p>Hello</p>
  `);
  assert.doesNotMatch(html, /<link/i);
  assert.doesNotMatch(html, /@import/i);
  assert.match(html, /a \{ color: blue !important; \}/);
  assert.match(html, /Hello/);
});

test("EmailMessageBody no longer uses dangerouslySetInnerHTML for HTML bodies", () => {
  const bodyPath = join(
    __dirname,
    "../client/src/components/inbox/EmailMessageBody.tsx",
  );
  const framePath = join(
    __dirname,
    "../client/src/components/inbox/EmailHtmlFrame.tsx",
  );
  const bodySrc = readFileSync(bodyPath, "utf8");
  const frameSrc = readFileSync(framePath, "utf8");
  assert.doesNotMatch(bodySrc, /dangerouslySetInnerHTML/);
  assert.match(bodySrc, /EmailHtmlFrame/);
  assert.match(frameSrc, /sandbox/);
  assert.match(frameSrc, /allow-same-origin/);
  // Sandbox token list must not enable scripts (comment may mention the forbidden flag).
  const sandboxJoin = frameSrc.match(/const IFRAME_SANDBOX = \[([\s\S]*?)\]\.join/);
  assert.ok(sandboxJoin, "IFRAME_SANDBOX constant present");
  assert.doesNotMatch(sandboxJoin![1], /["']allow-scripts["']/);
  assert.match(frameSrc, /srcDoc|srcdoc/i);
  assert.match(frameSrc, /buildIsolatedEmailSrcDoc/);
});

test("regression payload: global a{} style is only present inside isolated srcdoc", () => {
  const leakPayload = `<style>a { color: blue !important; }</style><a href="https://example.com">link</a>`;
  assert.equal(emailHtmlHasHostLeakingStyles(leakPayload), true);
  const srcDoc = buildIsolatedEmailSrcDoc(leakPayload);
  // Host would be affected only if this fragment were injected into the app DOM.
  // Framed document keeps the rule — isolation is the boundary, not style deletion.
  assert.match(srcDoc, /a \{ color: blue !important; \}/);
  assert.match(srcDoc, /<!DOCTYPE html>/i);
  assert.match(hardenEmailHtmlForFrame(leakPayload), /noopener noreferrer/);
});

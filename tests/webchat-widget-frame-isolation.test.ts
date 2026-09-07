/**
 * WidgetFrame must keep chrome visible when a chunk or message throws.
 * Run: npx tsx tests/webchat-widget-frame-isolation.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

{
  const policy = read("shared/webchatImagePolicy.ts");
  assert.doesNotMatch(policy, /\bBuffer\b/);
  assert.match(policy, /This module is imported by the WidgetFrame browser bundle/);
}

{
  const app = read("client/src/App.tsx");
  assert.match(app, /WidgetFrameErrorBoundary/);
  const widgetRoute = app.slice(app.indexOf("/widget-frame/:widgetId"));
  assert.match(widgetRoute.slice(0, 400), /WidgetFrameErrorBoundary/);
  assert.match(widgetRoute.slice(0, 400), /<WidgetFrame \/>/);
}

{
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /WebchatMessageErrorBoundary/);
  assert.match(frame, /text-settings-error/);
  assert.match(frame, /webchat-loading/);
  assert.match(frame, /typeof row\.id !== "string"/);
  assert.doesNotMatch(frame, /m\.id\.startsWith\("opt_"\)/);
}

{
  const boundary = read("client/src/components/webchat/WidgetFrameErrorBoundary.tsx");
  assert.match(boundary, /webchat-error-shell/);
  assert.match(boundary, /text-widget-error/);
  assert.match(boundary, /input-chat-message/);
  assert.match(boundary, /btn-send-chat/);
  assert.match(boundary, /webchat-message-error/);
  assert.match(boundary, /This message could not be displayed/);
}

{
  const overflow = read("client/src/pages/WidgetFrame.tsx");
  const shell = overflow.slice(overflow.indexOf("const deduped"), overflow.indexOf("{/* Header */}"));
  assert.match(shell, /h-full w-full min-w-0 max-w-full/);
}

console.log("webchat-widget-frame-isolation.test.ts: all assertions passed");

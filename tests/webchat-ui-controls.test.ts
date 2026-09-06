/**
 * Customer-facing webchat/AI/channel controls must exist in UI, not only backend.
 * Run: npx tsx tests/webchat-ui-controls.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

{
  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /select-rule-flow/);
  assert.match(website, /effectiveHasAIBrain/);
  assert.match(website, /text-auto-rollout-off/);
  assert.match(website, /checkbox-allow-any-origin/);
  assert.match(website, /text-origin-required/);
  assert.match(website, /buildWebchatScriptSnippet/);
  assert.match(website, /resolveWidgetActivationState/);
  assert.match(website, /widgetSurfaceStatus/);
  assert.doesNotMatch(website, /input-rule-flow-/);
  assert.doesNotMatch(website, /checked=\{settings\.enabled\}/);
}

{
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /effectiveHasAIBrain/);
  assert.match(inbox, /text-ai-generated-message/);
  assert.match(inbox, /generatedBy === "ai_brain"/);
  const panel = read("client/src/components/InboxLeadDetailsPanel.tsx");
  assert.match(panel, /section-conversation-ai-control/);
  assert.match(panel, /section-ai-suggestion/);
  assert.match(panel, /inbox-use-ai-suggestion/);
}

{
  const channels = read("client/src/components/ChannelSettings.tsx");
  assert.match(channels, /section-telegram-webhook-url/);
  assert.match(channels, /secretConfigured/);
  assert.match(channels, /text-tiktok-webhook-loading/);
  assert.match(channels, /text-tiktok-webhook-error/);
  assert.doesNotMatch(channels, /\/api\/webhook\/tiktok\/lead`/);
  assert.doesNotMatch(channels, /\/api\/webchat\/\$\{user/);
}

{
  const brain = read("client/src/pages/AIBrain.tsx");
  assert.match(brain, /autoModeLocked = !effectiveHasAIBrain/);
  assert.doesNotMatch(brain, /autoModeLocked = starterOnly/);
}

{
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /status !== "failed"/);
  assert.match(frame, /if \(!res\.ok\)/);
  assert.match(frame, /text-delivery-error/);
  assert.match(frame, /setWidgetUnavailable/);
}

{
  const telegramGet = read("server/routes.ts");
  assert.match(telegramGet, /getTelegramIngress/);
  assert.match(telegramGet, /getTiktokLeadPublicId/);
  assert.doesNotMatch(
    telegramGet.slice(
      telegramGet.indexOf('app.get("/api/integrations/telegram/webhook-url"'),
      telegramGet.indexOf('app.get("/api/integrations/telegram/webhook-url"') + 900,
    ),
    /ensureTelegramIngress/,
  );
}

console.log("webchat-ui-controls.test.ts: all assertions passed");

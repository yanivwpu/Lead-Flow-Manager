/**
 * Custom /widget-frame/{uuid} embeds must fail closed and must not look delivered.
 * Reproduces the Affordable Pompano case: raw users.id iframe, POST 404, optimistic UI.
 * Run: npx tsx tests/webchat-uuid-embed-fail-closed.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isUuidLike,
  isWidgetPublicId,
  looksLikeRawTenantUserId,
} from "../shared/opaquePublicToken";
import {
  buildWebchatIframeSnippet,
  buildWebchatScriptSnippet,
} from "../shared/webchatWidgetSnippet";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const RAW_USER_UUID = "11111111-1111-4111-8111-111111111111";
const OPAQUE = "wgt_" + "b".repeat(48);

{
  assert.equal(isUuidLike(RAW_USER_UUID), true);
  assert.equal(isWidgetPublicId(RAW_USER_UUID), false);
  assert.equal(looksLikeRawTenantUserId(RAW_USER_UUID), true);
  assert.equal(isWidgetPublicId(OPAQUE), true);
  assert.equal(isUuidLike(OPAQUE), false);
}

{
  const identity = read("server/widgetIdentity.ts");
  assert.match(identity, /rejected_raw_user_id/);
  assert.match(identity, /looksLikeRawTenantUserId/);
  assert.match(identity, /isUuidLike/);
  assert.match(identity, /isLegacyUserIdWidgetEnabled/);
  const rejectIf = identity.slice(
    identity.indexOf("if (!isLegacyUserIdWidgetEnabled())"),
    identity.indexOf("if (!isLegacyUserIdWidgetEnabled())") + 400,
  );
  assert.match(rejectIf, /return null/);
}

{
  const access = read("server/webchatAccess.ts");
  assert.match(access, /export const WEBCHAT_GENERIC_NOT_FOUND = \{ error: "Not found" \}/);
  assert.match(access, /export const WEBCHAT_GENERIC_DISABLED = \{ error: "Widget unavailable" \}/);
  const resolve = access.slice(
    access.indexOf("export async function resolvePublicWidgetAccess"),
    access.indexOf("export async function resolvePublicWidgetAccess") + 1600,
  );
  assert.match(resolve, /getWidgetOwnerByPublicId/);
  const ownerNull = resolve.indexOf("if (!owner)");
  const enabledCheck = resolve.indexOf("!embed.ok");
  assert.ok(ownerNull >= 0 && enabledCheck > ownerNull);
  assert.match(resolve.slice(ownerNull, ownerNull + 180), /status: 404, body: WEBCHAT_GENERIC_NOT_FOUND/);
}

{
  const webhooks = read("server/routes/webhooks.ts");
  const postStart = webhooks.indexOf('app.post("/api/webchat/:userId"');
  assert.ok(postStart >= 0);
  const post = webhooks.slice(postStart, postStart + 2200);
  assert.match(post, /resolvePublicWidgetAccess/);
  assert.match(post, /requireEnabled: true/);
  assert.match(post, /strictOrigin: true/);
  const accessIdx = post.indexOf("resolvePublicWidgetAccess");
  const persistIdx = post.indexOf("getContactByChannelId");
  assert.ok(accessIdx >= 0);
  assert.ok(persistIdx > accessIdx, "persistence must run only after public widget resolution");
  assert.match(post, /if \(!access\.ok\)/);
  assert.match(post, /access\.status/);
}

{
  const snippet = buildWebchatScriptSnippet({
    baseUrl: "https://app.example.com",
    widgetPublicId: OPAQUE,
  });
  assert.match(snippet, /\?id=wgt_/);
  assert.match(snippet, /widget\.js/);
  assert.doesNotMatch(snippet, new RegExp(RAW_USER_UUID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const iframe = buildWebchatIframeSnippet({
    baseUrl: "https://app.example.com",
    widgetPublicId: OPAQUE,
  });
  assert.match(iframe, /widget-frame\/wgt_/);
  assert.doesNotMatch(iframe, /widget-frame\/11111111/);
}

{
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /if \(!r\.ok\)/);
  assert.match(frame, /setWidgetUnavailable\(true\)/);
  assert.match(frame, /if \(!res\.ok\)/);
  assert.match(frame, /markFailed\(optId\)/);
  assert.match(frame, /status: "failed"/);
  assert.match(frame, /data-testid="text-delivery-error"/);
  assert.match(frame, /data-testid="btn-retry-send"/);
  assert.match(frame, /data-testid="text-widget-unavailable"/);
  const send = frame.slice(frame.indexOf("const sendMessage"), frame.indexOf("const handleButtonClick"));
  assert.match(send, /await fetch\(`\/api\/webchat\/\$\{userId\}`/);
  const okCheck = send.indexOf("if (!res.ok)");
  const refetch = send.indexOf("await fetchMessages()");
  assert.ok(okCheck >= 0 && refetch > okCheck, "failed POST must not look delivered via refetch");
  assert.doesNotMatch(send.slice(0, okCheck), /await fetchMessages\(\)/);
}

console.log("webchat-uuid-embed-fail-closed.test.ts: all assertions passed");

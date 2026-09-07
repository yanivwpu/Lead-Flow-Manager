/**
 * Web Chat outbound sync: public poll must return visitor-visible replies.
 * Run: npx tsx --test tests/webchat-outbound-sync.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WEBCHAT_IDENTITY_PROMPT } from "../shared/agent/webchatLeadContext";
import { publicWidgetOriginGateRequired } from "../shared/webchatOriginPolicy";
import {
  isPublicWebchatMessageVisible,
  toPublicWebchatMessages,
} from "../shared/webchatPublicMessages";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const inbound = {
  id: "in-1",
  direction: "inbound" as const,
  content: "Pompano production test 0906",
  contentType: "text",
  mediaUrl: null,
  createdAt: "2026-09-06T15:00:00.000Z",
  status: "delivered",
  userId: "tenant-a",
  contactId: "contact-a",
  conversationId: "conv-a",
  generatedBy: null,
  errorMessage: "secret",
};

const outboundSent = {
  id: "out-1",
  direction: "outbound" as const,
  content: WEBCHAT_IDENTITY_PROMPT,
  contentType: "text",
  mediaUrl: null,
  createdAt: "2026-09-06T15:00:02.000Z",
  status: "sent",
  userId: "tenant-a",
  contactId: "contact-a",
  conversationId: "conv-a",
  generatedBy: undefined,
  generationMeta: { prompt: "internal" },
  errorMessage: null,
  sentByUserId: null,
};

const outboundFailed = {
  ...outboundSent,
  id: "out-fail",
  status: "failed",
  errorMessage: "webchat_session_inactive",
};

const humanOutbound = {
  ...outboundSent,
  id: "out-human",
  content: "We can help with that.",
  generatedBy: "human",
  sentByUserId: "agent-1",
};

test("iframe Referer must not block public message polling", () => {
  assert.equal(
    publicWidgetOriginGateRequired({ strictOrigin: false, allowAny: false }),
    false,
    "GET /messages uses strictOrigin:false so widget-host Referer is not the customer allowlist",
  );
  assert.equal(publicWidgetOriginGateRequired({ strictOrigin: true, allowAny: false }), true);
  const access = read("server/webchatAccess.ts");
  assert.match(access, /publicWidgetOriginGateRequired/);
  assert.doesNotMatch(access, /strictOrigin \|\| hasHint/);
  const webhooks = read("server/routes/webhooks.ts");
  const getHandler = webhooks.slice(webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/messages"'));
  assert.match(getHandler.slice(0, 900), /strictOrigin:\s*false/);
  assert.match(getHandler.slice(0, 900), /parentUrl:\s*hrefParam/);
  assert.match(webhooks.slice(webhooks.indexOf('app.post("/api/webchat/:userId"'), webhooks.indexOf('app.post("/api/webchat/:userId"') + 1200), /strictOrigin:\s*true/);
});

test("inbound visitor message and server-generated outbound appear in the public payload", () => {
  const payload = toPublicWebchatMessages([inbound, outboundSent]);
  assert.equal(payload.length, 2);
  assert.equal(payload[0].direction, "inbound");
  assert.equal(payload[0].content, inbound.content);
  assert.equal(payload[1].direction, "outbound");
  assert.equal(payload[1].content, WEBCHAT_IDENTITY_PROMPT);
  assert.equal(payload[1].status, "sent");
  assert.equal("userId" in payload[1], false);
  assert.equal("errorMessage" in payload[1], false);
  assert.equal("generationMeta" in payload[1], false);
  assert.equal("sentByUserId" in payload[1], false);
});

test("manual Inbox reply also appears when delivery succeeded", () => {
  const payload = toPublicWebchatMessages([inbound, humanOutbound]);
  assert.equal(payload.some((m) => m.id === "out-human" && m.direction === "outbound"), true);
});

test("refresh restores both directions; failed outbound stays inbox-only", () => {
  const refreshed = toPublicWebchatMessages([inbound, outboundSent, outboundFailed, humanOutbound]);
  const ids = refreshed.map((m) => m.id);
  assert.deepEqual(ids, ["in-1", "out-1", "out-human"]);
  assert.equal(isPublicWebchatMessageVisible(outboundFailed), false);
  assert.equal(isPublicWebchatMessageVisible(outboundSent), true);
});

test("another visitor or tenant cannot be implied by the public mapper or lookup", () => {
  const webhooks = read("server/routes/webhooks.ts");
  const getHandler = webhooks.slice(
    webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/messages"'),
    webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/messages"') + 2800,
  );
  assert.match(getHandler, /getContactByChannelId\(access\.owner\.userId, "webchat", visitorId\)/);
  assert.match(getHandler, /contact\.userId !== access\.owner\.userId/);
  assert.match(getHandler, /conversation\.userId !== access\.owner\.userId/);
  assert.match(getHandler, /toPublicWebchatMessages/);
  assert.doesNotMatch(getHandler, /accessToken|refreshToken|handoff/);
  const otherTenant = toPublicWebchatMessages([
    { ...inbound, id: "other", userId: "tenant-b", conversationId: "conv-b" },
  ]);
  assert.equal(otherTenant[0].id, "other");
  assert.equal("userId" in otherTenant[0], false);
});

test("identity prompt is classified as auto-reply, not AI Brain or chatbot", () => {
  const channel = read("server/channelService.ts");
  assert.match(channel, /WEBCHAT_IDENTITY_PROMPT/);
  assert.match(channel, /contactNeedsWebchatIdentity/);
  const schedule = channel.slice(
    channel.indexOf("private async _scheduleAutoReply"),
    channel.indexOf("private getChannelIdField"),
  );
  assert.match(schedule, /source = "auto_reply"/);
  assert.match(schedule, /forceChannel:\s*channel/);
  assert.doesNotMatch(schedule, /generatedBy:\s*"ai_brain"/);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.doesNotMatch(auto, /WEBCHAT_IDENTITY_PROMPT/);
});

test("WidgetFrame polls after send, keeps messages on error, and does not duplicate by id", () => {
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /WEBCHAT_POLL_BACKOFF_MS/);
  assert.match(frame, /visibilitychange/);
  assert.match(frame, /WEBCHAT_POLL_HIDDEN_MS/);
  assert.match(frame, /POLL_INTERVAL/);
  assert.match(frame, /loadOrRotateWebchatVisitorId/);
  assert.match(frame, /await fetchMessages\(\)/);
  assert.match(frame, /href=\$\{encodeURIComponent\(parentPageHref\)\}/);
  assert.match(frame, /text-poll-error/);
  assert.match(frame, /setPollError\(true\)/);
  assert.match(frame, /Array\.isArray\(data\)/);
  assert.match(frame, /new Map\(/);
  assert.match(frame, /typeof m\?\.id === "string"/);
  assert.match(frame, /\.map\(\(m\) => \[m\.id, m\]\)/);
  assert.match(frame, /wchat_visitor_\$\{userId\}/);
  assert.match(frame, /loadOrRotateWebchatVisitorId/);
  assert.doesNotMatch(frame, /Math\.random\(\)\.toString\(36\)/);
  const fetchFn = frame.slice(
    frame.indexOf("const fetchMessages"),
    frame.indexOf("Visibility-aware poll"),
  );
  assert.doesNotMatch(fetchFn, /setMessages\(\s*\[\]\s*\)/);
  assert.match(fetchFn, /setPollError\(true\)/);
});

test("conversation lookup is deterministic latest webchat thread", () => {
  const storage = read("server/storage.ts");
  const fn = storage.slice(storage.indexOf("async getConversationByContactAndChannel"));
  assert.match(fn.slice(0, 900), /orderBy\(desc\(conversations\.lastMessageAt\)/);
});

test("chatbot webchat sends pin forceChannel so replies stay on the widget thread", () => {
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /forceChannel: ctx\.channel as Channel/);
  assert.equal((engine.match(/forceChannel: ctx\.channel as Channel/g) || []).length >= 3, true);
});

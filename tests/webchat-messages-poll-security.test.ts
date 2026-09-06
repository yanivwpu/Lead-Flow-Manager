/**
 * Public GET /messages polling security preflight.
 * Run: npx tsx --test tests/webchat-messages-poll-security.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findRateLimitRule } from "../server/rateLimitMiddleware";
import {
  parseWebchatInboundBody,
  parentUrlAllowed,
  sendWebchatPublicJson,
  WEBCHAT_GENERIC_NOT_FOUND,
  WEBCHAT_GENERIC_RATE_LIMIT,
  WEBCHAT_PUBLIC_CACHE_CONTROL,
} from "../server/webchatAccess";
import { publicWidgetEmbedDecision } from "../shared/webchatOriginPolicy";
import {
  createWebchatVisitorId,
  isCryptographicWebchatVisitorId,
  isLegacyWebchatVisitorId,
  isPublicWebchatVisitorId,
  loadOrRotateWebchatVisitorId,
} from "../shared/webchatVisitorId";
import {
  WEBCHAT_POLL_ASSUMED_VISIBLE_VISITORS_PER_IP,
  WEBCHAT_POLL_ASSUMED_VISIBLE_VISITORS_PER_WIDGET,
  WEBCHAT_POLL_BACKOFF_MS,
  WEBCHAT_POLL_GLOBAL_IP_LIMIT,
  WEBCHAT_POLL_HIDDEN_MS,
  WEBCHAT_POLL_LIMIT_IP,
  WEBCHAT_POLL_LIMIT_VISITOR,
  WEBCHAT_POLL_LIMIT_WIDGET,
  WEBCHAT_POLL_VISIBLE_MS,
  WEBCHAT_POLL_VISIBLE_PER_WINDOW,
  WEBCHAT_POLL_WINDOW_MS,
} from "../shared/webchatPollPolicy";
import { toPublicWebchatMessages } from "../shared/webchatPublicMessages";
import { generateWidgetPublicId } from "../server/opaquePublicId";
import { isWidgetPublicId } from "../shared/opaquePublicToken";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

function webchatMessagesHandler(): string {
  const webhooks = read("server/routes/webhooks.ts");
  const start = webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/messages"');
  const nextPost = webhooks.indexOf("app.post(", start + 1);
  const nextGet = webhooks.indexOf("app.get(", start + 1);
  const end = Math.min(
    nextPost > start ? nextPost : webhooks.length,
    nextGet > start ? nextGet : webhooks.length,
  );
  return webhooks.slice(start, end);
}

function mockPublicRes() {
  const headers: Record<string, string> = {};
  let status = 200;
  let body: unknown;
  return {
    headers,
    get statusCode() {
      return status;
    },
    get body() {
      return body;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      status = code;
      return {
        json(next: unknown) {
          body = next;
        },
      };
    },
    json(next: unknown) {
      body = next;
    },
  };
}

test("visitor IDs are cryptographic UUID v4, not sequential or Math.random", () => {
  const ids = new Set(Array.from({ length: 40 }, () => createWebchatVisitorId()));
  assert.equal(ids.size, 40);
  for (const id of ids) {
    assert.equal(isCryptographicWebchatVisitorId(id), true);
    assert.equal(isPublicWebchatVisitorId(id), true);
    assert.doesNotMatch(id, /^visitor_\d+/);
  }
  const src = read("shared/webchatVisitorId.ts");
  assert.match(src, /randomUUID/);
  assert.match(src, /getRandomValues/);
  const impl = src.slice(src.indexOf("export function createWebchatVisitorId"));
  assert.doesNotMatch(impl, /Math\.random\(/);
  assert.doesNotMatch(impl, /Date\.now\(/);
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /loadOrRotateWebchatVisitorId/);
  assert.doesNotMatch(frame, /Math\.random\(\)\.toString\(36\)/);
  const inbound = parseWebchatInboundBody({ message: "hello" });
  assert.equal(inbound.ok, true);
  if (inbound.ok) {
    assert.equal(isCryptographicWebchatVisitorId(inbound.data.visitorId), true);
  }
});

test("legacy predictable visitor IDs are replaced and cannot read historical messages", () => {
  const legacy = "visitor_1757160000000_k7x9abc";
  assert.equal(isLegacyWebchatVisitorId(legacy), true);
  assert.equal(isPublicWebchatVisitorId(legacy), false);
  assert.equal(isCryptographicWebchatVisitorId(legacy), false);
  const migrated = loadOrRotateWebchatVisitorId(legacy);
  assert.equal(migrated.replaced, true);
  assert.notEqual(migrated.visitorId, legacy);
  assert.equal(isCryptographicWebchatVisitorId(migrated.visitorId), true);
  const kept = loadOrRotateWebchatVisitorId(migrated.visitorId);
  assert.equal(kept.replaced, false);
  assert.equal(kept.visitorId, migrated.visitorId);

  const inboundLegacy = parseWebchatInboundBody({ message: "hello", visitorId: legacy });
  assert.equal(inboundLegacy.ok, false);

  const handler = webchatMessagesHandler();
  const cryptoAt = handler.indexOf("isPublicWebchatVisitorId(visitorId)");
  const lookupAt = handler.indexOf("getContactByChannelId");
  assert.ok(cryptoAt >= 0 && lookupAt > cryptoAt, "legacy IDs must be rejected before contact lookup");
  assert.match(handler, /if \(!isPublicWebchatVisitorId\(visitorId\)\) \{\s*return sendWebchatPublicJson\(res, 200, \[\]\);/s);
  assert.doesNotMatch(handler, /visitor_\$\{Date/);
  const access = read("server/webchatAccess.ts");
  assert.doesNotMatch(access, /visitor_\$\{Date\.now/);
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /loadOrRotateWebchatVisitorId\(stored\)/);
  assert.match(frame, /localStorage\.setItem\(storageKey, vid\)/);
});

test("messages poll requires opaque widget id then tenant-owned visitor contact", () => {
  const identity = read("server/widgetIdentity.ts");
  assert.match(identity, /isWidgetPublicId\(token\)/);
  assert.match(identity, /rejected_raw_user_id/);
  assert.match(identity, /rotateWidgetPublicId/);
  const handler = webchatMessagesHandler();
  assert.match(handler, /resolvePublicWidgetAccess/);
  assert.match(handler, /requireEnabled:\s*true/);
  assert.match(handler, /isPublicWebchatVisitorId\(visitorId\)/);
  assert.match(handler, /getContactByChannelId\(access\.owner\.userId, "webchat", visitorId\)/);
  assert.match(handler, /contact\.userId !== access\.owner\.userId/);
  assert.match(handler, /conversation\.userId !== access\.owner\.userId/);
  const id = generateWidgetPublicId();
  assert.equal(isWidgetPublicId(id), true);
});

test("unknown or malformed visitor IDs are empty arrays, not existence oracles", () => {
  const handler = webchatMessagesHandler();
  assert.match(handler, /if \(!isPublicWebchatVisitorId\(visitorId\)\) \{\s*return sendWebchatPublicJson\(res, 200, \[\]\);/s);
  assert.match(handler, /if \(!contact \|\| contact\.userId !== access\.owner\.userId\) \{\s*return sendWebchatPublicJson\(res, 200, \[\]\);/s);
  assert.match(handler, /if \(!conversation \|\| conversation\.userId !== access\.owner\.userId\) \{\s*return sendWebchatPublicJson\(res, 200, \[\]\);/s);
  assert.doesNotMatch(handler, /exists|not found visitor|no conversation/i);
  assert.equal(isPublicWebchatVisitorId(""), false);
  assert.equal(isPublicWebchatVisitorId("bad visitor"), false);
  assert.equal(isPublicWebchatVisitorId("x".repeat(81)), false);
});

test("poll limits match 2.5s visible polling and shared-NAT capacity", () => {
  assert.equal(WEBCHAT_POLL_VISIBLE_MS, 2500);
  assert.equal(WEBCHAT_POLL_HIDDEN_MS, 0);
  assert.equal(WEBCHAT_POLL_VISIBLE_PER_WINDOW, 360);
  assert.equal(WEBCHAT_POLL_WINDOW_MS, 15 * 60 * 1000);
  assert.equal(WEBCHAT_POLL_ASSUMED_VISIBLE_VISITORS_PER_IP, 25);
  assert.equal(WEBCHAT_POLL_ASSUMED_VISIBLE_VISITORS_PER_WIDGET, 50);
  assert.ok(WEBCHAT_POLL_LIMIT_VISITOR >= WEBCHAT_POLL_VISIBLE_PER_WINDOW);
  assert.ok(
    WEBCHAT_POLL_LIMIT_IP >=
      WEBCHAT_POLL_ASSUMED_VISIBLE_VISITORS_PER_IP * WEBCHAT_POLL_VISIBLE_PER_WINDOW,
  );
  assert.ok(
    WEBCHAT_POLL_LIMIT_WIDGET >=
      WEBCHAT_POLL_ASSUMED_VISIBLE_VISITORS_PER_WIDGET * WEBCHAT_POLL_VISIBLE_PER_WINDOW,
  );
  assert.equal(WEBCHAT_POLL_GLOBAL_IP_LIMIT, WEBCHAT_POLL_LIMIT_IP);
  assert.deepEqual([...WEBCHAT_POLL_BACKOFF_MS], [2500, 5000, 10_000, 20_000, 30_000]);

  const handler = webchatMessagesHandler();
  assert.match(handler, /consumeWebchatPollRateLimits/);
  assert.doesNotMatch(handler, /consumeWebchatRateLimits/);
  const access = read("server/webchatAccess.ts");
  assert.match(access, /WEBCHAT_POLL_LIMIT_WIDGET/);
  assert.match(access, /WEBCHAT_POLL_LIMIT_IP/);
  assert.match(access, /WEBCHAT_POLL_LIMIT_VISITOR/);
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /visibilitychange/);
  assert.match(frame, /WEBCHAT_POLL_HIDDEN_MS/);
  assert.match(frame, /WEBCHAT_POLL_BACKOFF_MS/);
  const pollRule = findRateLimitRule("/api/webchat/wgt_abc/visitor/messages", "GET");
  assert.equal(pollRule?.id, "widget-poll");
  assert.equal(pollRule?.limit, WEBCHAT_POLL_GLOBAL_IP_LIMIT);
  assert.equal(findRateLimitRule("/api/webchat/wgt_abc", "POST")?.id, "widget");
});

test("poll 200, 404, and 429 responses all set Cache-Control no-store", () => {
  const handler = webchatMessagesHandler();
  assert.match(handler, /sendWebchatPublicJson\(res, access\.status, access\.body\)/);
  assert.match(handler, /sendWebchatPublicJson\(res, 200, \[\]\)/);
  assert.match(handler, /sendWebchatPublicJson\(res, 429, WEBCHAT_GENERIC_RATE_LIMIT\)/);
  assert.match(handler, /sendWebchatPublicJson\(res, 200, toPublicWebchatMessages/);
  const cases: Array<[number, unknown]> = [
    [200, []],
    [404, WEBCHAT_GENERIC_NOT_FOUND],
    [429, WEBCHAT_GENERIC_RATE_LIMIT],
  ];
  for (const [status, payload] of cases) {
    const res = mockPublicRes();
    sendWebchatPublicJson(res, status, payload);
    assert.equal(res.statusCode, status);
    assert.equal(res.headers["Cache-Control"], WEBCHAT_PUBLIC_CACHE_CONTROL);
    assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
    assert.equal(res.headers["Surrogate-Control"], "no-store");
    assert.equal(res.headers["Pragma"], "no-cache");
    assert.equal(res.headers["Expires"], "0");
    assert.deepEqual(res.body, payload);
  }
});

test("public payload is visitor-safe: message id plus chat fields only", () => {
  const payload = toPublicWebchatMessages([
    {
      id: "m1",
      direction: "outbound",
      content: "ok",
      contentType: "text",
      mediaUrl: null,
      createdAt: "2026-09-06T00:00:00.000Z",
      status: "sent",
      userId: "tenant",
      contactId: "contact",
      conversationId: "conv",
      generatedBy: "ai_brain",
      generationMeta: { prompt: "secret" },
      errorMessage: "boom",
      errorCode: "x",
      externalMessageId: "ext",
      sentByUserId: "staff-1",
    },
  ]);
  assert.deepEqual(Object.keys(payload[0]).sort(), [
    "content",
    "contentType",
    "createdAt",
    "direction",
    "id",
    "mediaUrl",
    "status",
    "templateVariables",
  ]);
  assert.equal("userId" in payload[0], false);
  assert.equal("contactId" in payload[0], false);
  assert.equal("conversationId" in payload[0], false);
  assert.equal("generatedBy" in payload[0], false);
  assert.equal("generationMeta" in payload[0], false);
  assert.equal("sentByUserId" in payload[0], false);
  assert.equal("errorMessage" in payload[0], false);
  assert.equal("externalMessageId" in payload[0], false);
});

test("unknown, disabled, and rotated widgets share one generic 404 body", () => {
  const off = publicWidgetEmbedDecision({ enabled: false, allowedOrigins: ["https://example.com"] });
  assert.equal(off.ok, false);
  assert.deepEqual(WEBCHAT_GENERIC_NOT_FOUND, { error: "Not found" });
  const access = read("server/webchatAccess.ts");
  const resolve = access.slice(access.indexOf("export async function resolvePublicWidgetAccess"));
  const ownerBlock = resolve.slice(resolve.indexOf("if (!owner)"), resolve.indexOf("if (!owner)") + 220);
  const disabledBlock = resolve.slice(resolve.indexOf("!embed.ok"), resolve.indexOf("!embed.ok") + 220);
  assert.match(ownerBlock, /status: 404, body: WEBCHAT_GENERIC_NOT_FOUND/);
  assert.match(disabledBlock, /status: 404, body: WEBCHAT_GENERIC_NOT_FOUND/);
  assert.doesNotMatch(access, /Widget unavailable/);
  assert.doesNotMatch(access, /GENERIC_DISABLED/);
  const identity = read("server/widgetIdentity.ts");
  const rotate = identity.slice(identity.indexOf("export async function rotateWidgetPublicId"));
  assert.match(rotate.slice(0, 400), /widgetPublicId: next/);
  const lookup = identity.slice(
    identity.indexOf("if (isWidgetPublicId(token))"),
    identity.indexOf("if (isWidgetPublicId(token))") + 280,
  );
  assert.match(lookup, /where\(eq\(users\.widgetPublicId, token\)\)/);
});

test("strictOrigin:false is only on public reads; POST inbound stays strict", () => {
  const webhooks = read("server/routes/webhooks.ts");
  const post = webhooks.slice(
    webhooks.indexOf('app.post("/api/webchat/:userId"'),
    webhooks.indexOf('app.get("/api/webchat/:userId/settings"'),
  );
  assert.match(post, /strictOrigin:\s*true/);
  assert.doesNotMatch(post, /strictOrigin:\s*false/);
  const messages = webchatMessagesHandler();
  assert.match(messages, /strictOrigin:\s*false/);
  const settings = webhooks.slice(
    webhooks.indexOf('app.get("/api/webchat/:userId/settings"'),
    webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/messages"'),
  );
  assert.match(settings, /strictOrigin:\s*false/);
  assert.doesNotMatch(settings, /consumeWebchatPollRateLimits/);
  const writes = [...webhooks.matchAll(/app\.post\("/g)];
  for (const m of writes) {
    const slice = webhooks.slice(m.index!, m.index! + 900);
    if (slice.includes('"/api/webchat/:userId"')) {
      assert.match(slice, /strictOrigin:\s*true/);
    }
  }
});

test("supplied href must match the tenant allowlist; WidgetFrame sends parent-page href", () => {
  const allowed = ["https://affordablepompano.com", "https://www.affordablepompano.com"];
  assert.equal(parentUrlAllowed(allowed, "https://www.affordablepompano.com/chat"), true);
  assert.equal(parentUrlAllowed(allowed, "https://evil.example/chat"), false);
  const access = read("server/webchatAccess.ts");
  const resolve = access.slice(access.indexOf("export async function resolvePublicWidgetAccess"));
  assert.match(resolve, /else if \(!allowAny && opts\?\.parentUrl\)/);
  assert.match(resolve, /parentUrlAllowed/);
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /parentPageHref/);
  assert.match(frame, /document\.referrer/);
  assert.match(frame, /href=\$\{encodeURIComponent\(parentPageHref\)\}/);
  const widgetJs = read("server/routes.ts");
  assert.match(widgetJs, /qs\.push\('parentUrl=' \+ encodeURIComponent\(window\.location\.href\)\)/);
  const hosted = read("client/src/pages/WidgetChat.tsx");
  assert.match(hosted, /resolvePageHref=\{pageHref\}/);
  assert.match(hosted, /setPageHref\(window\.location\.href\)/);
});

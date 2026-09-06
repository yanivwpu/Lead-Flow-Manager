/**
 * Web Chat phase-one image delivery: public mapper, tokens, file inspection, widget render.
 * Run: npx tsx --test tests/webchat-media.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  inspectWebchatImageBuffer,
  WEBCHAT_IMAGE_MAX_BYTES,
  webchatVisitorMediaPath,
} from "../shared/webchatImagePolicy";
import {
  isPublicWebchatMessageVisible,
  toPublicWebchatMessages,
} from "../shared/webchatPublicMessages";
import {
  WEBCHAT_MEDIA_UNAVAILABLE_MESSAGE,
  WEBCHAT_MEDIA_UNSUPPORTED_MESSAGE,
} from "../shared/webchatSendErrors";
import {
  WEBCHAT_PUBLIC_CACHE_CONTROL,
  WEBCHAT_PUBLIC_NOSNIFF,
  sendWebchatPublicJson,
  WEBCHAT_GENERIC_NOT_FOUND,
  WEBCHAT_GENERIC_RATE_LIMIT,
} from "../server/webchatAccess";
import {
  buildSignedWebchatVisitorMediaUrl,
  classifyWebchatMediaError,
  signWebchatVisitorMedia,
  verifyWebchatVisitorMedia,
  webchatInboundMediaErrorLog,
} from "../server/webchatVisitorMedia";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const outboundImage = {
  id: "img-out-1",
  direction: "outbound" as const,
  content: "",
  contentType: "image",
  mediaUrl: "https://cdn.example.r2.dev/media/tenant-a/web-upload/abc.jpg",
  createdAt: "2026-09-06T16:00:00.000Z",
  status: "sent",
  userId: "tenant-a",
  contactId: "contact-a",
  conversationId: "conv-a",
};

const outboundImageFailed = {
  ...outboundImage,
  id: "img-fail",
  status: "failed" as const,
  errorMessage: WEBCHAT_MEDIA_UNAVAILABLE_MESSAGE,
};

const inboundImage = {
  id: "img-in-1",
  direction: "inbound" as const,
  content: "Kitchen photo",
  contentType: "image",
  mediaUrl: "https://cdn.example.r2.dev/media/tenant-a/webchat/xyz.jpg",
  createdAt: "2026-09-06T16:01:00.000Z",
  status: "delivered",
  userId: "tenant-a",
  contactId: "contact-a",
  conversationId: "conv-a",
};

const textOutbound = {
  id: "txt-1",
  direction: "outbound" as const,
  content: "We can help with that.",
  contentType: "text",
  mediaUrl: null,
  createdAt: "2026-09-06T16:02:00.000Z",
  status: "sent",
};

test("public mapper never leaks stored media URLs and strips failed outbound images", () => {
  const leaked = toPublicWebchatMessages([outboundImage, inboundImage, outboundImageFailed, textOutbound]);
  assert.equal(leaked.some((m) => m.id === "img-fail"), false);
  assert.equal(isPublicWebchatMessageVisible(outboundImageFailed), false);
  const stored = leaked.find((m) => m.id === "img-out-1");
  assert.ok(stored);
  assert.equal(stored!.mediaUrl, null);
  assert.equal(stored!.contentType, "image");
  const inbound = leaked.find((m) => m.id === "img-in-1");
  assert.equal(inbound?.mediaUrl, null);
  const text = leaked.find((m) => m.id === "txt-1");
  assert.equal(text?.content, "We can help with that.");
  assert.equal(text?.mediaUrl, null);
});

test("signed visitor media URLs are issued only for the bound widget/visitor/message", () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "webchat-media-test-secret-32chars-min";
  const widgetA = "wgt_" + "a".repeat(48);
  const widgetB = "wgt_" + "b".repeat(48);
  const visitorA = "11111111-1111-4111-8111-111111111111";
  const visitorB = "22222222-2222-4222-8222-222222222222";
  const url = buildSignedWebchatVisitorMediaUrl({
    widgetPublicId: widgetA,
    visitorId: visitorA,
    messageId: outboundImage.id,
  });
  assert.ok(url);
  assert.match(url!, /^\/api\/webchat\/wgt_/);
  assert.match(url!, /\/media\/img-out-1\?/);
  assert.equal(url!.includes("cdn.example"), false);
  assert.equal(url!.includes("/objects/"), false);
  assert.equal(url!.includes("media/tenant-a"), false);

  const mapped = toPublicWebchatMessages([outboundImage], (message) =>
    buildSignedWebchatVisitorMediaUrl({
      widgetPublicId: widgetA,
      visitorId: visitorA,
      messageId: message.id,
    }),
  );
  assert.equal(mapped[0].mediaUrl, url);

  const exp = Math.floor(Date.now() / 1000) + 600;
  const sig = signWebchatVisitorMedia({
    widgetPublicId: widgetA,
    visitorId: visitorA,
    messageId: outboundImage.id,
    expiresUnixSec: exp,
  });
  assert.ok(sig);
  assert.equal(
    verifyWebchatVisitorMedia({
      widgetPublicId: widgetA,
      visitorId: visitorA,
      messageId: outboundImage.id,
      expiresUnixSec: exp,
      signature: sig!,
    }),
    true,
  );
  assert.equal(
    verifyWebchatVisitorMedia({
      widgetPublicId: widgetB,
      visitorId: visitorA,
      messageId: outboundImage.id,
      expiresUnixSec: exp,
      signature: sig!,
    }),
    false,
  );
  assert.equal(
    verifyWebchatVisitorMedia({
      widgetPublicId: widgetA,
      visitorId: visitorB,
      messageId: outboundImage.id,
      expiresUnixSec: exp,
      signature: sig!,
    }),
    false,
  );
  assert.equal(
    verifyWebchatVisitorMedia({
      widgetPublicId: widgetA,
      visitorId: visitorA,
      messageId: "other-message",
      expiresUnixSec: exp,
      signature: sig!,
    }),
    false,
  );
  assert.equal(
    verifyWebchatVisitorMedia({
      widgetPublicId: widgetA,
      visitorId: visitorA,
      messageId: outboundImage.id,
      expiresUnixSec: exp - 1200,
      signature: sig!,
      nowUnixSec: exp,
    }),
    false,
  );
  assert.equal(
    webchatVisitorMediaPath(widgetA, visitorA, outboundImage.id).includes(widgetA),
    true,
  );
});

test("invalid oversized and disguised files are rejected by content inspection", async () => {
  const jpeg = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 12, g: 80, b: 40 } },
  })
    .jpeg()
    .toBuffer();
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 200, g: 10, b: 10 } },
  })
    .png()
    .toBuffer();
  const webp = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 10, b: 200 } },
  })
    .webp()
    .toBuffer();

  assert.equal(inspectWebchatImageBuffer(jpeg).ok, true);
  assert.equal(inspectWebchatImageBuffer(png).ok, true);
  assert.equal(inspectWebchatImageBuffer(webp).ok, true);
  assert.equal(inspectWebchatImageBuffer(jpeg, "image/jpeg").ok, true);
  assert.equal(inspectWebchatImageBuffer(jpeg, "image/png").ok, false);

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(inspectWebchatImageBuffer(svg, "image/svg+xml").ok, false);
  const html = Buffer.from("<html><script>alert(1)</script></html>");
  assert.equal(inspectWebchatImageBuffer(html, "image/jpeg").ok, false);
  const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(32, 1)]);
  assert.equal(inspectWebchatImageBuffer(exe).ok, false);
  const pdf = Buffer.from("%PDF-1.7 disguised as image");
  assert.equal(inspectWebchatImageBuffer(pdf, "image/jpeg").ok, false);
  const polyglot = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("<html><script>")]);
  assert.equal(inspectWebchatImageBuffer(polyglot).ok, false);
  const huge = Buffer.alloc(WEBCHAT_IMAGE_MAX_BYTES + 1, 0xff);
  huge[0] = 0xff;
  huge[1] = 0xd8;
  huge[2] = 0xff;
  assert.equal(inspectWebchatImageBuffer(huge).ok, false);
});

test("WidgetFrame renders captionless images and keeps text send unchanged", () => {
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /WebchatMediaBubble/);
  assert.match(frame, /msg\.contentType === "image" && msg\.mediaUrl/);
  assert.doesNotMatch(frame, /\(msg\.content \|\| msg\.contentType === "buttons"\) && \(/);
  assert.match(frame, /\/api\/webchat\/\$\{userId\}/);
  assert.match(frame, /headers: \{ "Content-Type": "application\/json" \}/);
  assert.match(frame, /btn-attach-image/);
  assert.match(frame, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(frame, /capture="environment"/);
  const bubble = read("client/src/components/webchat/WebchatMediaBubble.tsx");
  assert.match(bubble, /webchat-image-loading/);
  assert.match(bubble, /webchat-image-error/);
  assert.match(bubble, /webchat-image-retry/);
  assert.match(bubble, /webchat-image-open/);
  assert.match(bubble, /caption/);
});

test("outbound webchat adapter does not mark media sent unless visitor-available", () => {
  const adapter = read("server/channelAdapters.ts");
  const webchat = adapter.slice(adapter.indexOf("class WebChatAdapter"), adapter.indexOf("class InstagramAdapter"));
  assert.match(webchat, /webchatVisitorMediaIsAvailable/);
  assert.match(webchat, /WEBCHAT_MEDIA_UNAVAILABLE_MESSAGE/);
  assert.match(webchat, /WEBCHAT_MEDIA_UNSUPPORTED_MESSAGE/);
  assert.match(webchat, /isWebchatImageContentType/);
});

test("public media GET and visitor upload enforce widget visitor and tenant ownership", () => {
  const webhooks = read("server/routes/webhooks.ts");
  const mediaGet = webhooks.slice(webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/media/:messageId"'));
  assert.match(mediaGet.slice(0, 2500), /strictOrigin:\s*false/);
  assert.match(mediaGet.slice(0, 2500), /isPublicWebchatVisitorId\(visitorId\)/);
  assert.match(mediaGet.slice(0, 2800), /getContactByChannelId\(access\.owner\.userId, "webchat", visitorId\)/);
  assert.match(mediaGet.slice(0, 3200), /message\.userId !== access\.owner\.userId/);
  assert.match(mediaGet.slice(0, 3200), /message\.conversationId !== conversation\.id/);
  assert.match(mediaGet.slice(0, 3500), /verifyWebchatVisitorMedia/);
  assert.match(mediaGet.slice(0, 4000), /loadWebchatVisitorImageBytes/);
  assert.doesNotMatch(mediaGet.slice(0, 4000), /req\.user/);

  const mediaPost = webhooks.slice(webhooks.indexOf('app.post("/api/webchat/:userId/:visitorId/media"'));
  const postWindow = mediaPost.slice(0, 6500);
  assert.match(postWindow, /strictOrigin:\s*true/);
  assert.match(postWindow, /prepareWebchatVisitorImage/);
  assert.match(postWindow, /contentType: "image"/);
  assert.match(postWindow, /processIncomingMessage/);
  assert.doesNotMatch(postWindow, /image\/svg/);
});

test("Inbox blocks non-image webchat attachments before send", () => {
  const gate = read("client/src/lib/outboundAttachmentChannelGate.ts");
  assert.match(gate, /outboundWebchatMediaHint/);
  assert.match(gate, /JPEG, PNG, and WebP/);
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /outboundWebchatMediaHint/);
});

test("public media JSON 404 and 429 set no-store and nosniff", () => {
  const cases: Array<[number, unknown]> = [
    [404, WEBCHAT_GENERIC_NOT_FOUND],
    [429, WEBCHAT_GENERIC_RATE_LIMIT],
    [400, { error: "Invalid image" }],
    [500, { error: "Failed to process message" }],
  ];
  for (const [status, payload] of cases) {
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let body: unknown;
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      status(code: number) {
        statusCode = code;
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
    sendWebchatPublicJson(res, status, payload);
    assert.equal(statusCode, status);
    assert.equal(headers["Cache-Control"], WEBCHAT_PUBLIC_CACHE_CONTROL);
    assert.equal(headers["X-Content-Type-Options"], WEBCHAT_PUBLIC_NOSNIFF);
    assert.equal(headers["Pragma"], "no-cache");
    assert.equal(headers["Expires"], "0");
    assert.equal(headers["Surrogate-Control"], "no-store");
    assert.deepEqual(body, payload);
  }

  const webhooks = read("server/routes/webhooks.ts");
  const mediaGet = webhooks.slice(
    webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/media/:messageId"'),
    webhooks.indexOf('app.post("/api/webchat/:userId/:visitorId/media"'),
  );
  const mediaPost = webhooks.slice(webhooks.indexOf('app.post("/api/webchat/:userId/:visitorId/media"'));
  const postWindow = mediaPost.slice(0, 7000);
  assert.match(mediaGet, /sendWebchatPublicJson\(res, 404, WEBCHAT_GENERIC_NOT_FOUND\)/);
  assert.match(mediaGet, /sendWebchatPublicJson\(res, 429, WEBCHAT_GENERIC_RATE_LIMIT\)/);
  assert.match(postWindow, /sendWebchatPublicJson\(res, 429, WEBCHAT_GENERIC_RATE_LIMIT\)/);
  assert.match(postWindow, /sendWebchatPublicJson\(res, access\.status, access\.body\)/);
});

test("inbound media errors log only a generic category and requestId", () => {
  const bucket = "prod-whachat-media-bucket";
  const storageKey = "media/tenant-user-99/webchat/secret-photo.jpg";
  const signedUrl = "/api/webchat/wgt_abc/11111111-1111-4111-8111-111111111111/media/m1?exp=1&sig=deadbeef";
  const tenantId = "11111111-2222-4333-8444-555555555555";
  const filename = "passport-scan.webp";
  const credential = "AKIAIOSFODNN7EXAMPLE";
  const sdkError = Object.assign(new Error(`GetObject ${bucket} Key=${storageKey} ${signedUrl}`), {
    name: "NoSuchKey",
    code: "NoSuchKey",
    Bucket: bucket,
    Key: storageKey,
    userId: tenantId,
    filename,
    credentials: { accessKeyId: credential },
  });

  const logged = webchatInboundMediaErrorLog({ error: sdkError, requestId: "req-media-1" });
  assert.deepEqual(logged, {
    event: "inbound_media_error",
    requestId: "req-media-1",
    category: "storage",
  });
  const serialized = JSON.stringify(logged);
  assert.equal(serialized.includes(bucket), false);
  assert.equal(serialized.includes(storageKey), false);
  assert.equal(serialized.includes(signedUrl), false);
  assert.equal(serialized.includes(tenantId), false);
  assert.equal(serialized.includes(filename), false);
  assert.equal(serialized.includes(credential), false);
  assert.equal(serialized.includes("GetObject"), false);
  assert.equal(classifyWebchatMediaError({ name: "TimeoutError" }), "timeout");
  assert.equal(classifyWebchatMediaError({ code: "ECONNRESET" }), "network");
  assert.equal(classifyWebchatMediaError({ name: "MulterError", code: "LIMIT_FILE_SIZE" }), "payload");
  assert.equal(classifyWebchatMediaError(new Error("bucket leak")), "unknown");
  assert.equal(webchatInboundMediaErrorLog({ error: sdkError, requestId: "bad id / url" }).requestId, null);

  const webhooks = read("server/routes/webhooks.ts");
  const mediaPostStart = webhooks.indexOf('app.post("/api/webchat/:userId/:visitorId/media"');
  const mediaPostEnd = webhooks.indexOf('app.post("/api/webchat/:userId/:visitorId/forms"');
  const postWindow = webhooks.slice(
    mediaPostStart,
    mediaPostEnd > mediaPostStart ? mediaPostEnd : mediaPostStart + 8000,
  );
  assert.match(postWindow, /logWebchatInboundMediaError\(\{ error, requestId: getRequestId\(req\) \}\)/);
  assert.doesNotMatch(postWindow, /Web chat media error:", error/);
  assert.doesNotMatch(postWindow, /console\.error\(/);
});

/**
 * Phase 2 — email image rendering: sanitizer rewrite, SSRF proxy, CID helpers.
 * Run: npx tsx --test tests/email-image-rendering-phase2.test.ts
 */
import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  EMAIL_IMAGE_PROXY_PATH,
  buildEmailInlineImagePath,
  decodeEmailProxyUrlPayload,
  encodeEmailProxyUrlPayload,
  isEmailSafeImageMime,
  isLikelyTrackingPixelAttrs,
  normalizeEmailContentId,
} from "../shared/emailImagePolicy";
import {
  buildEmailRemoteProxySrc,
  sanitizeEmailHtml,
} from "../server/emailChannel/htmlSanitize";
import {
  buildSignedEmailImageProxyQuery,
  verifyEmailImageProxyRequest,
} from "../server/emailChannel/emailImageProxySecret";
import {
  assertPublicHttpUrl,
  clearEmailImageProxyCacheForTests,
  isBlockedIpAddress,
} from "../server/emailChannel/emailImageProxy";
import { buildIsolatedEmailSrcDoc } from "../shared/emailHtmlIsolation";

describe("inbound sanitizer preserves images via proxy/CID rewrite", () => {
  before(() => {
    const secret = String(process.env.EMAIL_IMAGE_PROXY_SECRET || "").trim();
    if (secret.length < 32) {
      process.env.EMAIL_IMAGE_PROXY_SECRET = "test-email-image-proxy-secret-32b!!";
    }
  });
  it("rewrites remote HTTPS img to signed proxy URL (not Remote image blocked)", () => {
    const { html, remoteImagesProxied, remoteImagesBlocked } = sanitizeEmailHtml(
      `<p>Hi</p><img src="https://cdn.example.com/logo.png" alt="Logo" width="120" height="40" />`,
      { purpose: "inbound", messageId: "msg-1" },
    );
    assert.equal(remoteImagesProxied, 1);
    assert.equal(remoteImagesBlocked, 0);
    assert.doesNotMatch(html, /Remote image blocked/i);
    assert.match(html, new RegExp(EMAIL_IMAGE_PROXY_PATH.replace(/\//g, "\\/")));
    assert.match(html, /u=/);
    assert.match(html, /s=/);
  });

  it("rewrites cid: to same-origin inline endpoint when messageId known", () => {
    const { html, cidImagesRewritten } = sanitizeEmailHtml(
      `<img src="cid:ii_abc123@example.com" />`,
      { purpose: "inbound", messageId: "msg-42" },
    );
    assert.equal(cidImagesRewritten, 1);
    assert.match(html, /\/api\/messages\/msg-42\/email-inline\?cid=/);
    assert.doesNotMatch(html, /src="cid:/i);
  });

  it("neutralizes obvious 1x1 tracking pixels without remote fetch", () => {
    const { html, trackingPixelsNeutralized } = sanitizeEmailHtml(
      `<img src="https://track.example/pixel.gif" width="1" height="1" />`,
      { purpose: "inbound", messageId: "msg-1" },
    );
    assert.equal(trackingPixelsNeutralized, 1);
    assert.match(html, /data:image\/gif;base64/);
    assert.doesNotMatch(html, /track\.example/);
  });

  it("rewrites CSS url(https://...) so backgrounds cannot bypass proxy", () => {
    const { html, remoteImagesProxied } = sanitizeEmailHtml(
      `<div style="background-image:url('https://cdn.example.com/bg.png')"></div>
       <style>.x{background:url("https://cdn.example.com/x.png")}</style>`,
      { purpose: "inbound", messageId: "msg-1" },
    );
    assert.ok(remoteImagesProxied >= 2);
    assert.doesNotMatch(html, /url\(['"]?https:\/\/cdn\.example\.com/i);
    assert.match(html, new RegExp(EMAIL_IMAGE_PROXY_PATH.replace(/\//g, "\\/")));
  });

  it("still strips scripts, handlers, javascript URLs, iframe/object/embed/forms", () => {
    const { html } = sanitizeEmailHtml(
      `<p onclick="alert(1)">Hello <script>evil()</script></p>
       <a href="javascript:alert(1)">x</a>
       <iframe src="https://evil"></iframe><object></object><embed></embed><form></form>
       <img src="https://ok.example/a.png" />`,
      { purpose: "inbound", messageId: "m" },
    );
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /onclick/i);
    assert.doesNotMatch(html, /javascript:/i);
    assert.doesNotMatch(html, /<iframe/i);
    assert.doesNotMatch(html, /<object/i);
    assert.doesNotMatch(html, /<embed/i);
    assert.doesNotMatch(html, /<form/i);
    assert.match(html, /Hello/);
    assert.match(html, new RegExp(EMAIL_IMAGE_PROXY_PATH.replace(/\//g, "\\/")));
  });

  it("outbound sanitizer does not rewrite remote images to proxy", () => {
    const { html, remoteImagesProxied } = sanitizeEmailHtml(
      `<img src="https://cdn.example.com/logo.png" /><script>x</script>`,
      { purpose: "outbound" },
    );
    assert.equal(remoteImagesProxied, 0);
    assert.match(html, /https:\/\/cdn\.example\.com\/logo\.png/);
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, new RegExp(EMAIL_IMAGE_PROXY_PATH.replace(/\//g, "\\/")));
  });

  it("re-sanitize keeps already-proxied same-origin image URLs", () => {
    const once = sanitizeEmailHtml(`<img src="https://cdn.example.com/a.png" width="10" height="10" />`, {
      purpose: "inbound",
      messageId: "m1",
    }).html;
    const twice = sanitizeEmailHtml(once, { purpose: "inbound", messageId: "m1" }).html;
    assert.match(twice, new RegExp(EMAIL_IMAGE_PROXY_PATH.replace(/\//g, "\\/")));
    assert.doesNotMatch(twice, /data-email-image-unavailable/);
  });
});

describe("proxy signing + payload", () => {
  it("round-trips URL payload and verifies HMAC with expiry", () => {
    process.env.EMAIL_IMAGE_PROXY_SECRET =
      process.env.EMAIL_IMAGE_PROXY_SECRET || "test-email-image-proxy-secret-32b!!";
    const url = "https://cdn.example.com/a.png";
    const enc = encodeEmailProxyUrlPayload(url);
    assert.equal(decodeEmailProxyUrlPayload(enc), url);
    const { expiresUnixSec, signature } = buildSignedEmailImageProxyQuery(url);
    assert.equal(
      verifyEmailImageProxyRequest({ remoteUrl: url, expiresUnixSec, signature }),
      true,
    );
    assert.equal(
      verifyEmailImageProxyRequest({
        remoteUrl: url,
        expiresUnixSec,
        signature: "deadbeef",
      }),
      false,
    );
    assert.match(buildEmailRemoteProxySrc(url), /^\//);
    assert.match(buildEmailRemoteProxySrc(url), /[?&]e=\d+/);
  });

  it("CID helpers normalize ids", () => {
    assert.equal(normalizeEmailContentId("cid:Foo@bar"), "Foo@bar");
    assert.equal(normalizeEmailContentId("<Foo@bar>"), "Foo@bar");
    assert.match(buildEmailInlineImagePath("m1", "cid:x"), /email-inline\?cid=x/);
    assert.equal(isLikelyTrackingPixelAttrs('width="1" height="1"'), true);
    assert.equal(isLikelyTrackingPixelAttrs('width="120" height="40"'), false);
    assert.equal(isEmailSafeImageMime("image/png"), true);
    assert.equal(isEmailSafeImageMime("image/svg+xml"), false);
  });
});

describe("SSRF protections", () => {
  it("blocks localhost, private, link-local, and metadata-style hosts", async () => {
    clearEmailImageProxyCacheForTests();
    assert.equal(isBlockedIpAddress("127.0.0.1"), true);
    assert.equal(isBlockedIpAddress("10.0.0.5"), true);
    assert.equal(isBlockedIpAddress("172.16.1.1"), true);
    assert.equal(isBlockedIpAddress("192.168.1.1"), true);
    assert.equal(isBlockedIpAddress("169.254.169.254"), true);
    assert.equal(isBlockedIpAddress("::1"), true);
    assert.equal(isBlockedIpAddress("8.8.8.8"), false);

    await assert.rejects(() => assertPublicHttpUrl("http://127.0.0.1/x"), /ip_blocked|host_blocked/);
    await assert.rejects(() => assertPublicHttpUrl("http://localhost/x"), /host_blocked/);
    await assert.rejects(() => assertPublicHttpUrl("file:///etc/passwd"), /scheme_blocked/);
    await assert.rejects(() => assertPublicHttpUrl("javascript:alert(1)"), /scheme_blocked|invalid_url/);
    await assert.rejects(() => assertPublicHttpUrl("ftp://example.com/a"), /scheme_blocked/);
    await assert.rejects(
      () => assertPublicHttpUrl("http://metadata.google.internal/"),
      /host_blocked/,
    );
  });
});

describe("CSP + wiring", () => {
  it("iframe CSP allows only self/data/blob for images (no direct http/https)", () => {
    const doc = buildIsolatedEmailSrcDoc(`<img src="/api/email/image-proxy?u=x&s=y" />`);
    const imgSrc = doc.match(/img-src[^;]+/)?.[0] || "";
    assert.match(imgSrc, /img-src 'self' data: blob:/);
    assert.doesNotMatch(imgSrc, /https:/);
    assert.doesNotMatch(imgSrc, /http:/);
    assert.doesNotMatch(imgSrc, /cid:/);
  });

  it("routes and providers wire proxy + inline + getAttachment", () => {
    const routes = fs.readFileSync(
      path.join(process.cwd(), "server/routes/emailChannel.ts"),
      "utf8",
    );
    const provider = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/gmailProvider.ts"),
      "utf8",
    );
    const persist = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/persistInbound.ts"),
      "utf8",
    );
    const send = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/sendService.ts"),
      "utf8",
    );
    assert.match(routes, /\/api\/email\/image-proxy/);
    assert.match(routes, /email-inline/);
    assert.match(provider, /async getAttachment/);
    assert.match(provider, /content-id/);
    assert.match(persist, /purpose:\s*"inbound"/);
    assert.match(send, /purpose:\s*"outbound"/);
  });

  it("Phase 1 live-first sync files still present (unchanged architecture)", () => {
    const sync = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/syncService.ts"),
      "utf8",
    );
    assert.match(sync, /establishGmailLiveSyncBaseline/);
    assert.match(sync, /runRecentEmailBootstrap/);
  });
});

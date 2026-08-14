/**
 * Phase 2 security hardening — proxy secret + DNS pin SSRF.
 * Run: npx tsx --test tests/email-image-proxy-security.test.ts
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  assertEmailImageProxySecretConfigured,
  buildSignedEmailImageProxyQuery,
  emailImageProxySignPayload,
  resolveEmailImageProxySecretMaterial,
  signEmailImageProxyRequest,
  verifyEmailImageProxyRequest,
} from "../server/emailChannel/emailImageProxySecret";
import {
  createPinnedDnsLookup,
  isBlockedIpAddress,
  resolveAndPinPublicHttpUrl,
} from "../server/emailChannel/emailImageProxy";
import { buildEmailRemoteProxySrc, sanitizeEmailHtml } from "../server/emailChannel/htmlSanitize";
import { EMAIL_IMAGE_PROXY_PATH } from "../shared/emailImagePolicy";

const PREV = { ...process.env };

describe("EMAIL_IMAGE_PROXY_SECRET production policy", () => {
  afterEach(() => {
    process.env.NODE_ENV = PREV.NODE_ENV;
    process.env.EMAIL_IMAGE_PROXY_SECRET = PREV.EMAIL_IMAGE_PROXY_SECRET;
    process.env.EMAIL_ENCRYPTION_KEY = PREV.EMAIL_ENCRYPTION_KEY;
    process.env.SESSION_SECRET = PREV.SESSION_SECRET;
  });

  it("production rejects missing secret (no hardcoded/empty fallback)", () => {
    const env = {
      NODE_ENV: "production",
      EMAIL_IMAGE_PROXY_SECRET: "",
      EMAIL_ENCRYPTION_KEY: "this-is-a-long-email-encryption-key!!",
      SESSION_SECRET: "this-is-a-long-session-secret-value!!",
    } as NodeJS.ProcessEnv;
    const resolved = resolveEmailImageProxySecretMaterial(env);
    assert.equal(resolved.secret, null);
    assert.equal("reason" in resolved && resolved.reason, "missing_EMAIL_IMAGE_PROXY_SECRET");
  });

  it("production rejects weak placeholder and short secrets", () => {
    assert.equal(
      resolveEmailImageProxySecretMaterial({
        NODE_ENV: "production",
        EMAIL_IMAGE_PROXY_SECRET: "email-image-proxy-dev-only",
      } as NodeJS.ProcessEnv).secret,
      null,
    );
    assert.equal(
      resolveEmailImageProxySecretMaterial({
        NODE_ENV: "production",
        EMAIL_IMAGE_PROXY_SECRET: "too-short",
      } as NodeJS.ProcessEnv).secret,
      null,
    );
  });

  it("production accepts dedicated ≥32 char secret only", () => {
    const secret = "a".repeat(32);
    const resolved = resolveEmailImageProxySecretMaterial({
      NODE_ENV: "production",
      EMAIL_IMAGE_PROXY_SECRET: secret,
    } as NodeJS.ProcessEnv);
    assert.equal(resolved.secret, secret);
    assert.equal(resolved.source, "EMAIL_IMAGE_PROXY_SECRET");
  });

  it("assertEmailImageProxySecretConfigured throws in production when missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_IMAGE_PROXY_SECRET;
    assert.throws(() => assertEmailImageProxySecretConfigured(process.env), /EMAIL_IMAGE_PROXY_SECRET/);
  });

  it("development may fall back to EMAIL_ENCRYPTION_KEY (never hardcoded placeholder)", () => {
    const env = {
      NODE_ENV: "development",
      EMAIL_IMAGE_PROXY_SECRET: "",
      EMAIL_ENCRYPTION_KEY: "dev-email-encryption-key-32bytes!!",
      SESSION_SECRET: "",
    } as NodeJS.ProcessEnv;
    const resolved = resolveEmailImageProxySecretMaterial(env);
    assert.equal(resolved.secret, "dev-email-encryption-key-32bytes!!");
    assert.equal(resolved.source, "EMAIL_ENCRYPTION_KEY");
  });

  it("inbound sanitize fails closed (no throw) when production secret missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_IMAGE_PROXY_SECRET;
    delete process.env.EMAIL_ENCRYPTION_KEY;
    delete process.env.SESSION_SECRET;
    const { html, remoteImagesBlocked, remoteImagesProxied } = sanitizeEmailHtml(
      `<img src="https://cdn.example.com/b.png" width="10" height="10" />`,
      { purpose: "inbound", messageId: "m1" },
    );
    assert.equal(remoteImagesProxied, 0);
    assert.equal(remoteImagesBlocked, 1);
    assert.doesNotMatch(html, /cdn\.example\.com/);
  });
});

describe("signed proxy URL expiry + timing-safe verify", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.EMAIL_IMAGE_PROXY_SECRET = "test-email-image-proxy-secret-32b!!";
  });
  afterEach(() => {
    process.env.NODE_ENV = PREV.NODE_ENV;
    process.env.EMAIL_IMAGE_PROXY_SECRET = PREV.EMAIL_IMAGE_PROXY_SECRET;
  });

  it("valid signature within expiry passes; tampered fails", () => {
    const url = "https://cdn.example.com/logo.png";
    const { expiresUnixSec, signature } = buildSignedEmailImageProxyQuery(url);
    assert.equal(
      verifyEmailImageProxyRequest({ remoteUrl: url, expiresUnixSec, signature }),
      true,
    );
    assert.equal(
      verifyEmailImageProxyRequest({
        remoteUrl: url,
        expiresUnixSec,
        signature: signature.slice(0, -1) + (signature.endsWith("a") ? "b" : "a"),
      }),
      false,
    );
    assert.equal(
      verifyEmailImageProxyRequest({
        remoteUrl: "https://evil.example/x.png",
        expiresUnixSec,
        signature,
      }),
      false,
    );
  });

  it("expired signature is rejected", () => {
    const url = "https://cdn.example.com/logo.png";
    const exp = Math.floor(Date.now() / 1000) - 10;
    const signature = signEmailImageProxyRequest(url, exp);
    assert.equal(
      verifyEmailImageProxyRequest({
        remoteUrl: url,
        expiresUnixSec: exp,
        signature,
        nowUnixSec: Math.floor(Date.now() / 1000),
      }),
      false,
    );
  });

  it("HMAC covers url|expiry payload; timingSafeEqual used", () => {
    const url = "https://cdn.example.com/a.png";
    const exp = 2_000_000_000;
    const payload = emailImageProxySignPayload(url, exp);
    assert.equal(payload, `${url}|${exp}`);
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/emailImageProxySecret.ts"),
      "utf8",
    );
    assert.match(src, /timingSafeEqual/);
    const built = buildEmailRemoteProxySrc(url);
    assert.match(built, new RegExp(`${EMAIL_IMAGE_PROXY_PATH}\\?u=`));
    assert.match(built, /[?&]e=\d+/);
    assert.match(built, /[?&]s=/);
  });

  it("inbound sanitize embeds expiring signed proxy URLs", () => {
    const { html } = sanitizeEmailHtml(
      `<img src="https://cdn.example.com/b.png" width="10" height="10" />`,
      { purpose: "inbound", messageId: "m1" },
    );
    assert.match(html, /[?&]e=\d+/);
    assert.match(html, /[?&]s=/);
  });
});

describe("DNS pin / rebinding SSRF hardening", () => {
  it("blocks IPv4 private + IPv6 loopback/link-local/unique-local/multicast", () => {
    assert.equal(isBlockedIpAddress("127.0.0.1"), true);
    assert.equal(isBlockedIpAddress("10.1.2.3"), true);
    assert.equal(isBlockedIpAddress("172.16.0.1"), true);
    assert.equal(isBlockedIpAddress("192.168.0.1"), true);
    assert.equal(isBlockedIpAddress("169.254.169.254"), true);
    assert.equal(isBlockedIpAddress("::1"), true);
    assert.equal(isBlockedIpAddress("fc00::1"), true);
    assert.equal(isBlockedIpAddress("fd12::1"), true);
    assert.equal(isBlockedIpAddress("fe80::1"), true);
    assert.equal(isBlockedIpAddress("ff02::1"), true);
    assert.equal(isBlockedIpAddress("8.8.8.8"), false);
    assert.equal(isBlockedIpAddress("2001:4860:4860::8888"), false);
  });

  it("pinned lookup always returns validated IP (cannot switch to private)", () => {
    const lookup = createPinnedDnsLookup("203.0.113.10", 4);
    let got: { address: string; family: number } | null = null;
    lookup("evil-rebind.example", {}, (err, address, family) => {
      assert.equal(err, null);
      got = { address, family };
    });
    assert.deepEqual(got, { address: "203.0.113.10", family: 4 });

    const blockedLookup = createPinnedDnsLookup("127.0.0.1", 4);
    let blockedErr: Error | null = null;
    blockedLookup("evil.example", {}, (err) => {
      blockedErr = err;
    });
    assert.ok(blockedErr);
    assert.equal((blockedErr as any).code, "pinned_ip_blocked");
  });

  it("literal private IP URLs are rejected at pin time", async () => {
    await assert.rejects(
      () => resolveAndPinPublicHttpUrl("http://127.0.0.1/x.png"),
      /ip_blocked|host_blocked/,
    );
    await assert.rejects(
      () => resolveAndPinPublicHttpUrl("http://[::1]/logo.png"),
      /ip_blocked|host_blocked/,
    );
    await assert.rejects(
      () => resolveAndPinPublicHttpUrl("http://192.168.1.5/a.png"),
      /ip_blocked/,
    );
  });

  it("proxy implementation pins lookup and sets TLS servername", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/emailImageProxy.ts"),
      "utf8",
    );
    assert.match(src, /createPinnedDnsLookup/);
    assert.match(src, /resolveAndPinPublicHttpUrl/);
    assert.match(src, /servername:/);
    assert.match(src, /lookup:\s*createPinnedDnsLookup/);
    assert.match(src, /Next hop: resolve \+ validate \+ pin again/);
    assert.doesNotMatch(src, /fetch\(current,\s*\{/);
  });

  it("blocks IPv4-mapped IPv6 private addresses", () => {
    assert.equal(isBlockedIpAddress("::ffff:127.0.0.1"), true);
    assert.equal(isBlockedIpAddress("::ffff:192.168.1.1"), true);
    assert.equal(isBlockedIpAddress("::ffff:8.8.8.8"), false);
  });
});

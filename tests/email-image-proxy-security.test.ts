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
  fetchEmailImageViaProxy,
  isBlockedIpAddress,
  resolveAndPinPublicHttpUrl,
} from "../server/emailChannel/emailImageProxy";
import { buildEmailRemoteProxySrc, sanitizeEmailHtml } from "../server/emailChannel/htmlSanitize";
import {
  decodeEmailProxyUrlPayload,
  decodeHtmlEntitiesInRemoteUrl,
  EMAIL_IMAGE_PROXY_PATH,
  encodeEmailProxyUrlPayload,
} from "../shared/emailImagePolicy";

const PREV = { ...process.env };

function restoreEnv(key: "NODE_ENV" | "EMAIL_IMAGE_PROXY_SECRET" | "EMAIL_ENCRYPTION_KEY" | "SESSION_SECRET"): void {
  const v = PREV[key];
  if (v === undefined) delete process.env[key];
  else process.env[key] = v;
}

describe("EMAIL_IMAGE_PROXY_SECRET production policy", () => {
  afterEach(() => {
    restoreEnv("NODE_ENV");
    restoreEnv("EMAIL_IMAGE_PROXY_SECRET");
    restoreEnv("EMAIL_ENCRYPTION_KEY");
    restoreEnv("SESSION_SECRET");
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
    restoreEnv("NODE_ENV");
    restoreEnv("EMAIL_IMAGE_PROXY_SECRET");
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

  it("Node 20 { all: true } lookup returns [{ address, family }]", () => {
    const lookup = createPinnedDnsLookup("203.0.113.10", 4);
    let addresses: unknown = null;
    lookup("cdn.example", { all: true }, ((err: Error | null, result: unknown) => {
      assert.equal(err, null);
      addresses = result;
    }) as any);
    assert.deepEqual(addresses, [{ address: "203.0.113.10", family: 4 }]);
  });

  it("legacy all:false lookup still returns (address, family)", () => {
    const lookup = createPinnedDnsLookup("198.51.100.20", 4);
    let address: unknown;
    let family: unknown;
    lookup("cdn.example", { all: false }, (err, addr, fam) => {
      assert.equal(err, null);
      address = addr;
      family = fam;
    });
    assert.equal(address, "198.51.100.20");
    assert.equal(family, 4);
  });

  it("blocked pin still errors when lookup is called with all:true", () => {
    const lookup = createPinnedDnsLookup("10.0.0.1", 4);
    let blockedErr: Error | null = null;
    lookup("evil.example", { all: true }, ((err: Error | null) => {
      blockedErr = err;
    }) as any);
    assert.ok(blockedErr);
    assert.equal((blockedErr as any).code, "pinned_ip_blocked");
  });

  it("Node 20-style http.request with pinned lookup does not throw ERR_INVALID_IP_ADDRESS", async () => {
    const http = await import("node:http");
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          protocol: "http:",
          hostname: "pin-test.example",
          port: 80,
          path: "/",
          method: "GET",
          lookup: createPinnedDnsLookup("203.0.113.10", 4) as any,
          autoSelectFamily: true,
          timeout: 400,
        },
        () => {
          req.destroy();
          resolve();
        },
      );
      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err?.code === "ERR_INVALID_IP_ADDRESS") {
          reject(err);
          return;
        }
        resolve();
      });
      req.on("timeout", () => {
        req.destroy();
        resolve();
      });
      req.end();
    });
  });

  it("all:true array lookup shape lets Node complete an HTTP GET", async () => {
    const http = await import("node:http");
    const { once } = await import("node:events");
    const payload = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(payload);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const port = addr.port;
    try {
      const lookup = createPinnedDnsLookup("203.0.113.10", 4);
      let productionAllTrueShape: unknown;
      lookup("cdn.example", { all: true }, ((err: Error | null, result: unknown) => {
        assert.equal(err, null);
        productionAllTrueShape = result;
      }) as any);
      assert.equal(Array.isArray(productionAllTrueShape), true);
      assert.equal((productionAllTrueShape as { address: string }[])[0].address, "203.0.113.10");

      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            hostname: "localhost",
            port,
            path: "/",
            method: "GET",
            lookup: ((_hostname: string, options: { all?: boolean }, cb: Function) => {
              const family = 4 as const;
              const ip = "127.0.0.1";
              if (options?.all) cb(null, [{ address: ip, family }]);
              else cb(null, ip, family);
            }) as any,
          },
          (res) => {
            res.on("data", (c: Buffer) => chunks.push(c));
            res.on("end", () => resolve());
            res.on("error", reject);
          },
        );
        req.on("error", reject);
        req.end();
      });
      assert.deepEqual(Buffer.concat(chunks), payload);
    } finally {
      server.close();
      await once(server, "close").catch(() => undefined);
    }
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
    assert.match(src, /autoSelectFamily:\s*false/);
    assert.match(src, /ERR_INVALID_IP_ADDRESS/);
    assert.match(src, /Next hop: resolve \+ validate \+ pin again/);
    assert.doesNotMatch(src, /fetch\(current,\s*\{/);
  });

  it("blocks IPv4-mapped IPv6 private addresses", () => {
    assert.equal(isBlockedIpAddress("::ffff:127.0.0.1"), true);
    assert.equal(isBlockedIpAddress("::ffff:192.168.1.1"), true);
    assert.equal(isBlockedIpAddress("::ffff:8.8.8.8"), false);
  });
});

describe("HTML entity decode does not bypass proxy security", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.EMAIL_IMAGE_PROXY_SECRET = "test-email-image-proxy-secret-32b!!";
  });
  afterEach(() => {
    restoreEnv("NODE_ENV");
    restoreEnv("EMAIL_IMAGE_PROXY_SECRET");
  });

  it("historical signed u= with literal &amp; still verifies; fetch target is decoded", () => {
    const historical =
      "https://media.licdn.com/dms/image/v2/abc/photo?e=1999999999&amp;v=beta&amp;t=sig";
    const decoded = "https://media.licdn.com/dms/image/v2/abc/photo?e=1999999999&v=beta&t=sig";
    const { expiresUnixSec, signature } = buildSignedEmailImageProxyQuery(historical);
    assert.equal(
      verifyEmailImageProxyRequest({ remoteUrl: historical, expiresUnixSec, signature }),
      true,
    );
    assert.equal(
      verifyEmailImageProxyRequest({ remoteUrl: decoded, expiresUnixSec, signature }),
      false,
    );
    assert.equal(decodeHtmlEntitiesInRemoteUrl(historical), decoded);
    assert.equal(decodeEmailProxyUrlPayload(encodeEmailProxyUrlPayload(historical)), historical);
  });

  it("entity decoding does not bypass private-IP/SSRF checks", async () => {
    const historical = "http://127.0.0.1/secret.png?e=1&amp;v=2";
    assert.equal(decodeHtmlEntitiesInRemoteUrl(historical), "http://127.0.0.1/secret.png?e=1&v=2");
    await assert.rejects(
      () => resolveAndPinPublicHttpUrl(decodeHtmlEntitiesInRemoteUrl(historical)),
      /ip_blocked|host_blocked/,
    );
    const { expiresUnixSec, signature } = buildSignedEmailImageProxyQuery(historical);
    const result = await fetchEmailImageViaProxy({
      encodedUrl: encodeEmailProxyUrlPayload(historical),
      signature,
      expiresUnixSec,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.match(result.code, /ip_blocked|host_blocked/);
    }
  });

  it("entity decoding does not bypass scheme rejection", async () => {
    await assert.rejects(
      () => resolveAndPinPublicHttpUrl(decodeHtmlEntitiesInRemoteUrl("file:///etc/passwd&amp;x=1")),
      /scheme_blocked|invalid_url/,
    );
    assert.equal(decodeEmailProxyUrlPayload(encodeEmailProxyUrlPayload("javascript:alert(1)")), null);
  });

  it("proxy verifies signature before HTML-entity decode; redirects still re-pin", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/emailImageProxy.ts"),
      "utf8",
    );
    const verifyAt = src.indexOf("verifyEmailImageProxyRequest");
    const decodeAt = src.indexOf("decodeHtmlEntitiesInRemoteUrl(remoteUrl)");
    assert.ok(verifyAt > 0 && decodeAt > verifyAt, "signature verify must precede entity decode");
    assert.match(src, /Next hop: resolve \+ validate \+ pin again/);
    assert.match(src, /isEmailSafeImageMime/);
    assert.match(src, /rejected_html_masquerade/);
    assert.match(src, /EMAIL_IMAGE_PROXY_MAX_BYTES/);
    assert.doesNotMatch(src, /127\.0\.0\.1:7693/);
    assert.doesNotMatch(src, /#region agent log/);
  });
});

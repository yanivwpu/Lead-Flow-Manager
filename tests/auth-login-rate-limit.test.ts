/**
 * Login vs session-probe rate limiting, proxy keys, Retry-After.
 * Run: npx tsx --test tests/auth-login-rate-limit.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import {
  __resetRateLimitMemoryForTests,
  findRateLimitRule,
  getClientIp,
  normalizeClientIp,
  rateLimitMiddleware,
  resetRateLimitKey,
} from "../server/rateLimitMiddleware";
import {
  LOGIN_PAIR_LIMIT,
  clearLoginFailures,
  evaluateLoginRateLimit,
  loginPairRateLimitKey,
  recordLoginFailure,
} from "../server/authSecurity";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

function fakeReq(opts: {
  path: string;
  method: string;
  ip: string;
  headers?: Record<string, string>;
  userId?: string;
}): Request {
  const headers = opts.headers || {};
  return {
    path: opts.path,
    method: opts.method,
    ip: opts.ip,
    headers,
    socket: { remoteAddress: opts.ip },
    user: opts.userId ? { id: opts.userId } : undefined,
    get(name: string) {
      return headers[name.toLowerCase()] || headers[name] || undefined;
    },
    app: { get: (k: string) => (k === "trust proxy" ? 1 : undefined) },
  } as unknown as Request;
}

function applyRateLimit(req: Request): Promise<{
  allowed: boolean;
  status: number;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
}> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {};
    let status = 200;
    const res = {
      set(k: string, v: string) {
        headers[String(k).toLowerCase()] = String(v);
        return this;
      },
      status(code: number) {
        status = code;
        return this;
      },
      json(body: Record<string, unknown>) {
        resolve({ allowed: false, status, body, headers });
        return this;
      },
    } as unknown as Response;
    rateLimitMiddleware(req, res, () => {
      resolve({ allowed: true, status: 0, body: null, headers });
    });
  });
}

test("GET /api/auth/me is not the login failure limiter", () => {
  const me = findRateLimitRule("/api/auth/me", "GET");
  const login = findRateLimitRule("/api/auth/login", "POST");
  assert.equal(me?.id, "auth-session");
  assert.equal(me?.limit, 300);
  assert.equal(login, undefined, "POST /api/auth/login has no global request counter");
});

test("signup/forgot remain on auth-sensitive, not auth-session", () => {
  assert.equal(findRateLimitRule("/api/auth/signup", "POST")?.id, "auth-sensitive");
  assert.equal(findRateLimitRule("/api/auth/forgot-password", "POST")?.id, "auth-sensitive");
  assert.equal(findRateLimitRule("/api/auth/reset-password", "POST")?.id, "auth-sensitive");
  assert.equal(findRateLimitRule("/api/auth/verify-email", "POST")?.id, "auth-sensitive");
  assert.equal(findRateLimitRule("/api/auth/logout", "POST")?.id, "auth-session");
});

test("repeated unauthenticated /api/auth/me does not consume login failure allowance", async () => {
  __resetRateLimitMemoryForTests();
  const ip = "203.0.113.10";
  const email = "probe-user@example.test";
  await resetRateLimitKey(loginPairRateLimitKey(email, ip));

  for (let i = 0; i < 40; i++) {
    const result = await applyRateLimit(fakeReq({ path: "/api/auth/me", method: "GET", ip }));
    assert.equal(result.allowed, true, `session probe ${i + 1} must not 429`);
  }

  const loginGate = await evaluateLoginRateLimit({ email, ip });
  assert.equal(loginGate.allowed, true);
});

test("normal session probing does not 429 /api/auth/me", async () => {
  __resetRateLimitMemoryForTests();
  const ip = "203.0.113.11";
  for (let i = 0; i < 20; i++) {
    const result = await applyRateLimit(fakeReq({ path: "/api/auth/me", method: "GET", ip }));
    assert.equal(result.allowed, true);
  }
});

test("repeated failed logins eventually 429 with Retry-After", async () => {
  __resetRateLimitMemoryForTests();
  const ip = "203.0.113.12";
  const email = "lockout@example.test";
  await resetRateLimitKey(loginPairRateLimitKey(email, ip));

  for (let i = 0; i < LOGIN_PAIR_LIMIT; i++) {
    const recorded = await recordLoginFailure({ email, ip });
    assert.equal(recorded.allowed, true, `failure ${i + 1} still under pair cap`);
  }
  const blocked = await evaluateLoginRateLimit({ email, ip });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
});

test("correct credentials before the failure threshold stay allowed", async () => {
  __resetRateLimitMemoryForTests();
  const ip = "203.0.113.13";
  const email = "legit@example.test";
  await resetRateLimitKey(loginPairRateLimitKey(email, ip));
  for (let i = 0; i < 3; i++) {
    const recorded = await recordLoginFailure({ email, ip });
    assert.equal(recorded.allowed, true);
  }
  const pre = await evaluateLoginRateLimit({ email, ip });
  assert.equal(pre.allowed, true);
});

test("successful login resets email+IP failure state", async () => {
  __resetRateLimitMemoryForTests();
  const ip = "203.0.113.14";
  const email = "reset-ok@example.test";
  await resetRateLimitKey(loginPairRateLimitKey(email, ip));
  for (let i = 0; i < LOGIN_PAIR_LIMIT; i++) {
    await recordLoginFailure({ email, ip });
  }
  assert.equal((await evaluateLoginRateLimit({ email, ip })).allowed, false);
  await clearLoginFailures({ email, ip });
  assert.equal((await evaluateLoginRateLimit({ email, ip })).allowed, true);
  for (let i = 0; i < LOGIN_PAIR_LIMIT; i++) {
    assert.equal((await recordLoginFailure({ email, ip })).allowed, true);
  }
});

test("different normalized email/IP keys do not share lockout", async () => {
  __resetRateLimitMemoryForTests();
  const ipA = "203.0.113.15";
  const ipB = "198.51.100.20";
  const emailA = "  Alpha@Example.TEST ";
  const emailB = "beta@example.test";
  await Promise.all([
    resetRateLimitKey(loginPairRateLimitKey(emailA, ipA)),
    resetRateLimitKey(loginPairRateLimitKey(emailB, ipA)),
    resetRateLimitKey(loginPairRateLimitKey(emailA, ipB)),
  ]);

  for (let i = 0; i < LOGIN_PAIR_LIMIT; i++) {
    await recordLoginFailure({ email: emailA, ip: ipA });
  }
  assert.equal((await evaluateLoginRateLimit({ email: emailA, ip: ipA })).allowed, false);
  assert.equal((await evaluateLoginRateLimit({ email: "alpha@example.test", ip: ipA })).allowed, false);
  assert.equal((await evaluateLoginRateLimit({ email: emailB, ip: ipA })).allowed, true);
  assert.equal((await evaluateLoginRateLimit({ email: emailA, ip: ipB })).allowed, true);
});

test("proxy handling uses Express req.ip, not a spoofed X-Forwarded-For hop", () => {
  const spoofed = fakeReq({
    path: "/api/auth/login",
    method: "POST",
    ip: "203.0.113.40",
    headers: { "x-forwarded-for": "8.8.8.8, 1.1.1.1" },
  });
  assert.equal(getClientIp(spoofed), "203.0.113.40");
  assert.notEqual(getClientIp(spoofed), "8.8.8.8");

  const other = fakeReq({
    path: "/api/auth/login",
    method: "POST",
    ip: "198.51.100.77",
    headers: { "x-forwarded-for": "8.8.8.8" },
  });
  assert.equal(getClientIp(other), "198.51.100.77");
  assert.notEqual(getClientIp(spoofed), getClientIp(other));
});

test("IPv4-mapped IPv6 normalizes to the same limiter key", () => {
  assert.equal(normalizeClientIp("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(
    loginPairRateLimitKey("same@example.test", "::ffff:203.0.113.9"),
    loginPairRateLimitKey("same@example.test", "203.0.113.9"),
  );
});

test("exhausted session limiter 429 includes Retry-After and still leaves login allowed", async () => {
  __resetRateLimitMemoryForTests();
  const ip = "203.0.113.50";
  const email = "after-me-storm@example.test";
  await resetRateLimitKey(loginPairRateLimitKey(email, ip));
  const limit = findRateLimitRule("/api/auth/me", "GET")!.limit;
  let last: Awaited<ReturnType<typeof applyRateLimit>> | null = null;
  for (let i = 0; i < limit + 1; i++) {
    last = await applyRateLimit(fakeReq({ path: "/api/auth/me", method: "GET", ip }));
  }
  assert.equal(last?.allowed, false);
  assert.equal(last?.status, 429);
  assert.ok(last?.headers["retry-after"]);
  assert.equal((await evaluateLoginRateLimit({ email, ip })).allowed, true);
});

test("auth.ts login route uses failure limiter and trust proxy is one hop", () => {
  const auth = read("server/auth.ts");
  const index = read("server/index.ts");
  assert.match(auth, /app\.set\('trust proxy', 1\)/);
  assert.match(auth, /evaluateLoginRateLimit/);
  assert.match(auth, /recordLoginFailure/);
  assert.match(auth, /clearLoginFailures/);
  assert.match(auth, /setRetryAfterHeader/);
  assert.match(index, /setupAuth\(app\)/);
  assert.match(index, /app\.use\(rateLimitMiddleware\)/);
  const setupAt = index.indexOf("setupAuth(app)");
  const limiterAt = index.indexOf("app.use(rateLimitMiddleware)");
  assert.ok(setupAt > 0 && limiterAt > setupAt, "trust proxy must be set before the limiter");
});

/**
 * Login page error copy, session-probe backoff, post-auth redirect.
 * Run: npx tsx --test tests/auth-frontend-errors.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  classifyLoginHttpStatus,
  formatLoginUserMessage,
  parseRetryAfterHeader,
} from "../client/src/lib/authErrorMessages";
import { holdUntilAfterSessionStatus, shouldSkipSessionProbe } from "../client/src/lib/sessionProbePolicy";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

test("401 shows invalid credentials, not a rate-limit message", () => {
  assert.equal(classifyLoginHttpStatus(401), "invalid");
  assert.equal(
    formatLoginUserMessage({ ok: false, errorKind: "invalid", status: 401 }),
    "Invalid email or password",
  );
});

test("429 shows wait time from Retry-After", () => {
  assert.equal(classifyLoginHttpStatus(429), "rate_limited");
  assert.equal(parseRetryAfterHeader("120"), 120);
  const msg = formatLoginUserMessage({
    ok: false,
    errorKind: "rate_limited",
    status: 429,
    retryAfterSec: 120,
  });
  assert.match(msg, /Too many login attempts/);
  assert.match(msg, /2 minute/);
  assert.doesNotMatch(msg, /Invalid email or password/);
});

test("5xx and network failures have distinct copy", () => {
  assert.equal(classifyLoginHttpStatus(500), "server");
  assert.match(
    formatLoginUserMessage({ ok: false, errorKind: "server", status: 503 }),
    /temporarily unavailable/i,
  );
  assert.match(
    formatLoginUserMessage({ ok: false, errorKind: "network", status: 0 }),
    /Connection problem/,
  );
});

test("session probes stop after 401 when signed out and back off on 429", () => {
  const now = 1_700_000_000_000;
  assert.equal(
    shouldSkipSessionProbe({ now, holdUntil: 0, hasLocalUser: false, reason: "focus" }),
    true,
  );
  assert.equal(
    shouldSkipSessionProbe({ now, holdUntil: 0, hasLocalUser: false, reason: "mount" }),
    false,
  );
  const after401 = holdUntilAfterSessionStatus(401, null, now);
  assert.ok(after401 > now);
  assert.equal(
    shouldSkipSessionProbe({ now: now + 1000, holdUntil: after401, hasLocalUser: false, reason: "mount" }),
    true,
  );
  const after429 = holdUntilAfterSessionStatus(429, 90, now);
  assert.equal(after429, now + 90_000);
  assert.equal(
    shouldSkipSessionProbe({ now: now + 1000, holdUntil: after429, hasLocalUser: true, reason: "focus" }),
    true,
  );
});

test("Auth page uses classified login errors and keeps redirect", () => {
  const page = read("client/src/pages/Auth.tsx");
  const ctx = read("client/src/lib/auth-context.tsx");
  assert.match(page, /formatLoginUserMessage/);
  assert.match(page, /loginLockoutUntil/);
  assert.match(page, /navigateAfterAuth\(postAuthRedirect\)/);
  assert.match(page, /redirectTo \|\| "\/app\/inbox"/);
  assert.doesNotMatch(page, /setError\("Invalid email or password"\)/);
  assert.match(ctx, /classifyLoginHttpStatus/);
  assert.match(ctx, /shouldSkipSessionProbe/);
  assert.match(ctx, /refreshSession\("focus"\)/);
  assert.match(ctx, /errorKind: "network"/);
  assert.doesNotMatch(ctx, /if \(!response\.ok\) return \{ ok: false \}/);
});

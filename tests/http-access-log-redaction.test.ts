/**
 * HTTP access logs must never dump user records, secrets, or public ingress IDs.
 * Run: npx tsx --test tests/http-access-log-redaction.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  formatHttpAccessLog,
  isSensitiveLogKey,
  logLineLooksUnsafe,
  redactSensitiveForLog,
} from "../shared/safeLogRedaction";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const fakeUser = {
  id: "user-1",
  email: "owner@example.test",
  password: "hunter2-secret",
  passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
  accessToken: "shpat_live_secret",
  refreshToken: "refresh-secret",
  widgetPublicId: "wgt_abc123456789",
  telegramPublicId: "tgk_abc123456789",
  tiktokPublicId: "ttk_abc123456789",
  shopifyAccessToken: "shpss_secret",
  metaAccessToken: "EAAB-secret",
  phone: "+15555550123",
};

test("recursive redaction strips credentials, email, tokens, and public ingress ids", () => {
  const redacted = redactSensitiveForLog(fakeUser) as Record<string, unknown>;
  assert.equal(redacted.password, "[redacted]");
  assert.equal(redacted.email, "[redacted]");
  assert.equal(redacted.accessToken, "[redacted]");
  assert.equal(redacted.widgetPublicId, "[redacted]");
  assert.equal(redacted.telegramPublicId, "[redacted]");
  assert.equal(redacted.tiktokPublicId, "[redacted]");
  assert.equal(redacted.id, "user-1");
  assert.equal(isSensitiveLogKey("widget_public_id"), true);
  assert.equal(isSensitiveLogKey("authorization"), true);
  assert.equal(isSensitiveLogKey("id"), false);
});

test("HTTP access log is metadata only — no user object or response body", () => {
  const line = formatHttpAccessLog({
    method: "GET",
    path: "/api/auth/me",
    status: 200,
    durationMs: 12,
    requestId: "req-test-1",
  });
  assert.match(line, /"tag":"\[HTTP\]"/);
  assert.match(line, /"path":"\/api\/auth\/me"/);
  assert.equal(logLineLooksUnsafe(line), false);
  assert.doesNotMatch(line, /owner@example/);
  assert.doesNotMatch(line, /hunter2/);
  assert.doesNotMatch(line, /wgt_/);
  assert.doesNotMatch(line, /password/);
});

test("unsafe raw user JSON is detected", () => {
  assert.equal(logLineLooksUnsafe(JSON.stringify(fakeUser)), true);
});

test("index.ts no longer serializes API response bodies", () => {
  const index = read("server/index.ts");
  assert.match(index, /formatHttpAccessLog/);
  assert.doesNotMatch(index, /capturedJsonResponse/);
  assert.doesNotMatch(index, /JSON\.stringify\(capturedJsonResponse\)/);
  assert.doesNotMatch(index, /originalResJson/);
});

test("login attempt logs are structured metadata without email or password", () => {
  const auth = read("server/auth.ts");
  assert.match(auth, /tag: "\[LoginAttempt\]"/);
  assert.doesNotMatch(auth, /\[LoginAttempt\] \$\{JSON\.stringify\(payload\)\}/);
  assert.doesNotMatch(auth, /passwordSubmittedLen[\s\S]{0,80}email:/);
  const limiter = read("server/rateLimitMiddleware.ts");
  assert.match(limiter, /tag: "\[RATE_LIMIT\]"/);
  assert.doesNotMatch(limiter, /\$\{ip\} \$\{userId/);
});

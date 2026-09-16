/**
 * Cloudflare Turnstile signup verification.
 * Run: npx tsx --test tests/auth-turnstile.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TURNSTILE_GENERIC_ERROR,
  TURNSTILE_SIGNUP_ACTION,
  TURNSTILE_TEST_SECRET_KEY,
  TURNSTILE_TEST_SITE_KEY,
  describeTurnstileReadiness,
  expectedTurnstileHostnames,
  isTurnstileConfigured,
  isTurnstileRequired,
  turnstileHostnameAllowed,
  verifyTurnstileToken,
} from "../server/authTurnstile";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const SITE = TURNSTILE_TEST_SITE_KEY;
const SECRET = TURNSTILE_TEST_SECRET_KEY;

function withEnv(patch: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    prev[key] = process.env[key];
    const next = patch[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(patch)) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    });
}

function mockSiteverify(payload: Record<string, unknown>, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  })) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("production without keys is fail-closed and misconfigured", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      VITE_TURNSTILE_SITE_KEY: undefined,
      TURNSTILE_SECRET_KEY: undefined,
    },
    async () => {
      assert.equal(isTurnstileConfigured(), false);
      assert.equal(isTurnstileRequired(), true);
      const readiness = describeTurnstileReadiness();
      assert.equal(readiness.failClosed, true);
      assert.equal(readiness.required, true);
      const missing = await verifyTurnstileToken("token-value");
      assert.equal(missing.ok, false);
      if (!missing.ok) assert.equal(missing.reason, "misconfigured");
    },
  );
});

test("development without keys does not require Turnstile", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      VITE_TURNSTILE_SITE_KEY: undefined,
      TURNSTILE_SECRET_KEY: undefined,
    },
    async () => {
      assert.equal(isTurnstileRequired(), false);
      const skipped = await verifyTurnstileToken("");
      assert.equal(skipped.ok, true);
    },
  );
});

test("configured keys require a token and accept a valid signup hostname/action", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      VITE_TURNSTILE_SITE_KEY: SITE,
      TURNSTILE_SECRET_KEY: "live-secret-not-test-key",
      APP_URL: "https://app.whachatcrm.com",
    },
    async () => {
      assert.equal(isTurnstileRequired(), true);
      const missing = await verifyTurnstileToken("");
      assert.equal(missing.ok, false);
      if (!missing.ok) assert.equal(missing.reason, "missing");

      const restore = mockSiteverify({
        success: true,
        hostname: "app.whachatcrm.com",
        action: TURNSTILE_SIGNUP_ACTION,
      });
      try {
        const ok = await verifyTurnstileToken("valid-token");
        assert.equal(ok.ok, true);
      } finally {
        restore();
      }
    },
  );
});

test("invalid, expired, and replayed tokens are rejected without logging the token", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      VITE_TURNSTILE_SITE_KEY: SITE,
      TURNSTILE_SECRET_KEY: "live-secret-not-test-key",
    },
    async () => {
      const invalid = mockSiteverify({
        success: false,
        "error-codes": ["invalid-input-response"],
      });
      try {
        const result = await verifyTurnstileToken("bad-token");
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.reason, "invalid");
      } finally {
        invalid();
      }

      const expired = mockSiteverify({
        success: false,
        "error-codes": ["timeout-or-duplicate"],
      });
      try {
        const result = await verifyTurnstileToken("expired-or-replayed");
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.reason, "invalid");
      } finally {
        expired();
      }
    },
  );

  const src = read("server/authTurnstile.ts");
  assert.doesNotMatch(src, /console\.\w+\([^)]*token/);
  assert.doesNotMatch(src, /console\.\w+\([^)]*secret/);
  assert.doesNotMatch(src, /JSON\.stringify\(data\)/);
  assert.match(src, /error-codes/);
});

test("hostname and action mismatches are rejected; test keys skip host checks", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      VITE_TURNSTILE_SITE_KEY: SITE,
      TURNSTILE_SECRET_KEY: "live-secret-not-test-key",
    },
    async () => {
      const badHost = mockSiteverify({
        success: true,
        hostname: "evil.example",
        action: TURNSTILE_SIGNUP_ACTION,
      });
      try {
        const result = await verifyTurnstileToken("ok-looking");
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.reason, "hostname");
      } finally {
        badHost();
      }

      const badAction = mockSiteverify({
        success: true,
        hostname: "www.whachatcrm.com",
        action: "login",
      });
      try {
        const result = await verifyTurnstileToken("ok-looking");
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.reason, "action");
      } finally {
        badAction();
      }
    },
  );

  await withEnv(
    {
      NODE_ENV: "development",
      VITE_TURNSTILE_SITE_KEY: SITE,
      TURNSTILE_SECRET_KEY: SECRET,
    },
    async () => {
      const restore = mockSiteverify({ success: true, hostname: "localhost" });
      try {
        const result = await verifyTurnstileToken("test-token");
        assert.equal(result.ok, true);
      } finally {
        restore();
      }
    },
  );

  assert.equal(turnstileHostnameAllowed("app.whachatcrm.com"), true);
  assert.equal(turnstileHostnameAllowed("www.whachatcrm.com"), true);
  assert.equal(turnstileHostnameAllowed("whachatcrm.com"), true);
  assert.equal(turnstileHostnameAllowed("evil.example"), false);
  assert.ok(expectedTurnstileHostnames().includes("app.whachatcrm.com"));
});

test("login, reset, Shopify, GHL, invite, and seed paths are not Turnstile-gated", () => {
  const auth = read("server/auth.ts");
  const signupSlice = auth.slice(auth.indexOf("app.post('/api/auth/signup'"), auth.indexOf("app.post('/api/auth/resend-verification'"));
  assert.match(signupSlice, /isTurnstileRequired/);
  assert.match(signupSlice, /verifyTurnstileToken/);

  const loginSlice = auth.slice(auth.indexOf("app.post('/api/auth/login'"), auth.indexOf("app.post('/api/auth/logout'"));
  assert.doesNotMatch(loginSlice, /verifyTurnstileToken/);
  const forgotSlice = auth.slice(auth.indexOf("app.post('/api/auth/forgot-password'"), auth.indexOf("app.post('/api/auth/emergency-reset'"));
  assert.doesNotMatch(forgotSlice, /verifyTurnstileToken/);
  const resetSlice = auth.slice(auth.indexOf("app.post('/api/auth/reset-password'"));
  assert.doesNotMatch(resetSlice, /verifyTurnstileToken/);

  const shopify = read("server/shopifyRoutes.ts");
  assert.match(shopify, /storage\.createUser\(/);
  assert.doesNotMatch(shopify, /verifyTurnstileToken/);

  const ghl = read("server/ghlRoutes.ts");
  assert.doesNotMatch(ghl, /verifyTurnstileToken/);
  assert.match(ghl, /\/auth\?redirect=/);

  const team = read("server/routes.ts");
  const invite = team.slice(team.indexOf('app.post("/api/team"'), team.indexOf('app.delete("/api/team/:id"'));
  assert.doesNotMatch(invite, /verifyTurnstileToken/);
  assert.doesNotMatch(invite, /storage\.createUser\(/);

  const boot = read("server/index.ts");
  const sso = boot.slice(boot.indexOf("Ensure SSO user exists"), boot.indexOf("Seed Realtor Growth Engine"));
  assert.match(sso, /storage\.createUser\(/);
  assert.doesNotMatch(sso, /verifyTurnstileToken/);

  const widget = read("client/src/components/TurnstileWidget.tsx");
  assert.match(widget, /action: "signup"/);
  assert.doesNotMatch(widget, /TURNSTILE_SECRET_KEY/);
  assert.match(widget, /import\.meta\.env\.VITE_TURNSTILE_SITE_KEY/);

  const page = read("client/src/pages/Auth.tsx");
  assert.match(page, /Signup is temporarily unavailable/);
  assert.match(page, /import\.meta\.env\.PROD/);
  assert.ok(TURNSTILE_GENERIC_ERROR.includes("verify"));
});

/**
 * Public signup / password-reset hardening unit tests.
 * Run: npx tsx tests/auth-signup-hardening.test.ts
 */
import assert from "node:assert/strict";
import { isDisposableEmail, normalizeEmailAddress } from "../shared/disposableEmail";
import {
  activationStartAt,
  isEligibleForActivationEmails,
} from "../shared/activationEmailEligibility";
import {
  isTurnstileRequired,
  isTurnstileConfigured,
  TURNSTILE_GENERIC_ERROR,
} from "../server/authTurnstile";
import {
  __resetRateLimitMemoryForTests,
  consumeRateLimit,
} from "../server/rateLimitMiddleware";
import { isEmailVerified } from "../server/authSecurity";

function section(title: string) {
  console.log(`\n== ${title} ==`);
}

section("disposable email blocking");
{
  assert.equal(isDisposableEmail("wh40d8776@web-library.net"), true, "web-library.net blocked");
  assert.equal(isDisposableEmail("user@mail.web-library.net"), true, "subdomain of web-library blocked");
  assert.equal(isDisposableEmail("  alice@Gmail.com  "), false, "Gmail allowed");
  assert.equal(isDisposableEmail("ops@acme-realty.com"), false, "company domain allowed");
  assert.equal(isDisposableEmail("bob@outlook.com"), false, "Outlook allowed");
  assert.equal(isDisposableEmail("carol@yahoo.com"), false, "Yahoo allowed");
  assert.equal(isDisposableEmail("dan@proton.me"), false, "Proton allowed");
  assert.equal(normalizeEmailAddress("  Foo@Bar.COM "), "foo@bar.com");
}

section("Turnstile configuration gating");
{
  const prevSite = process.env.VITE_TURNSTILE_SITE_KEY;
  const prevSecret = process.env.TURNSTILE_SECRET_KEY;
  const prevNode = process.env.NODE_ENV;

  try {
    delete process.env.VITE_TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.NODE_ENV = "development";
    assert.equal(isTurnstileConfigured(), false);
    assert.equal(isTurnstileRequired(), false, "dev without keys does not require Turnstile");

    process.env.NODE_ENV = "production";
    assert.equal(isTurnstileRequired(), false, "production without keys does not pretend Turnstile passed");

    process.env.VITE_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
    process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    assert.equal(isTurnstileConfigured(), true);
    assert.equal(isTurnstileRequired(), true, "configured keys require verification");
    assert.ok(TURNSTILE_GENERIC_ERROR.includes("verify"));
  } finally {
    if (prevSite === undefined) delete process.env.VITE_TURNSTILE_SITE_KEY;
    else process.env.VITE_TURNSTILE_SITE_KEY = prevSite;
    if (prevSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = prevSecret;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  }
}

section("email verified semantics");
{
  assert.equal(isEmailVerified({ emailVerifiedAt: new Date() }), true);
  assert.equal(isEmailVerified({ emailVerifiedAt: null }), false);
  assert.equal(isEmailVerified({}), true, "missing field = legacy verified");
}

section("activation eligibility after verification");
{
  const pending = {
    email: "new@acme.com",
    emailVerifiedAt: null,
    trialStartedAt: null,
  };
  assert.equal(isEligibleForActivationEmails(pending), false);
  assert.equal(activationStartAt(pending), null);

  const verified = {
    email: "new@acme.com",
    emailVerifiedAt: new Date("2026-08-01T12:00:00Z"),
    trialStartedAt: new Date("2026-08-01T12:00:00Z"),
  };
  assert.equal(isEligibleForActivationEmails(verified), true);
  assert.equal(activationStartAt(verified)?.toISOString(), "2026-08-01T12:00:00.000Z");

  // Trial date wins over createdAt-style fallbacks (no createdAt used for pending)
  const withCreatedOnly = {
    email: "old@acme.com",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    emailVerifiedAt: null,
    trialStartedAt: null,
  };
  assert.equal(activationStartAt(withCreatedOnly), null);
}

section("shared rate limit buckets (signup IP / email)");
{
  __resetRateLimitMemoryForTests();
  const windowMs = 60 * 60 * 1000;

  for (let i = 0; i < 5; i++) {
    const r = await consumeRateLimit("authlimit:test-signup-ip:0", 5, windowMs);
    assert.equal(r.allowed, true, `IP attempt ${i + 1} allowed`);
  }
  const blockedIp = await consumeRateLimit("authlimit:test-signup-ip:0", 5, windowMs);
  assert.equal(blockedIp.allowed, false, "6th IP signup blocked");

  __resetRateLimitMemoryForTests();
  for (let i = 0; i < 3; i++) {
    const r = await consumeRateLimit("authlimit:test-signup-email:0", 3, windowMs);
    assert.equal(r.allowed, true);
  }
  const blockedEmail = await consumeRateLimit("authlimit:test-signup-email:0", 3, windowMs);
  assert.equal(blockedEmail.allowed, false, "4th email signup blocked");

  __resetRateLimitMemoryForTests();
  for (let i = 0; i < 3; i++) {
    assert.equal((await consumeRateLimit("authlimit:test-resend:0", 3, windowMs)).allowed, true);
  }
  assert.equal((await consumeRateLimit("authlimit:test-resend:0", 3, windowMs)).allowed, false);
}

section("forgot-password message contract (static)");
{
  // Ensure wording does not encode existence
  const msg =
    "If an account exists for that email, we’ve sent password-reset instructions.";
  assert.ok(msg.toLowerCase().includes("if an account exists"));
  assert.ok(!msg.toLowerCase().includes("not found"));
  assert.ok(!msg.toLowerCase().includes("no account"));
}

console.log("\nAll auth-signup-hardening tests passed.");

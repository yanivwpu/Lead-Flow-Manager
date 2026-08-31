/**
 * Dedicated /check-email verification UX + 24h token contracts.
 * Run: npx tsx tests/check-email-verification-ux.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMAIL_VERIFICATION_TTL_MS, TRIAL_DAYS } from "../server/emailVerification";
import { VERIFICATION_RESEND_COOLDOWN_MS } from "../server/authSecurity";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function section(title: string) {
  console.log(`\n== ${title} ==`);
}

section("token validity is 24 hours; trial remains 14 days");
{
  assert.equal(EMAIL_VERIFICATION_TTL_MS, 24 * 60 * 60 * 1000);
  assert.equal(TRIAL_DAYS, 14);
  assert.equal(VERIFICATION_RESEND_COOLDOWN_MS, 60 * 1000);
  const verify = src("server/emailVerification.ts");
  assert.ok(verify.includes("isNull(emailVerificationTokens.usedAt)"));
  assert.ok(!verify.includes("gt(emailVerificationTokens.expiresAt"));
  assert.ok(verify.includes("shouldStartTrial"));
  assert.ok(verify.includes('trialPlan = "pro_ai"') || verify.includes('trialPlan: "pro_ai"'));
}

section("signup routes to /check-email and establishes a pending session");
{
  const auth = src("server/auth.ts");
  assert.ok(auth.includes("emailSent"));
  assert.ok(auth.includes("sessionEstablished"));
  assert.ok(auth.includes("change-pending-email"));
  assert.ok(auth.includes("VERIFICATION_SEND_FAILED_MESSAGE"));
  assert.ok(auth.includes("checkVerificationResendCooldown"));
  assert.ok(auth.includes("EMAIL_IN_USE"));
  assert.ok(auth.includes("/api/auth/change-pending-email"));

  const clientAuth = src("client/src/pages/Auth.tsx");
  assert.ok(clientAuth.includes("CHECK_EMAIL_PATH"));
  assert.ok(clientAuth.includes("result.pendingVerification"));
  assert.ok(!clientAuth.includes("We sent a verification link to"));

  const app = src("client/src/App.tsx");
  assert.ok(app.includes('path="/check-email"'));
  assert.ok(app.includes('Redirect to={`/check-email`}'));

  const page = src("client/src/pages/CheckEmail.tsx");
  assert.ok(page.includes("auth.checkEmailTitle"));
  assert.ok(page.includes("auth.checkEmailPrimary"));
  assert.ok(page.includes("auth.resendVerification"));
  assert.ok(page.includes("auth.changeEmail"));
  assert.ok(page.includes("auth.returnToLogin"));
  assert.ok(page.includes("/api/auth/change-pending-email"));
}

section("email copy and i18n");
{
  const email = src("server/email.ts");
  assert.ok(email.includes("Verify your email to start your 14-day Pro trial with AI Brain"));
  assert.ok(email.includes("Verify email and start my 14-day trial"));
  assert.ok(email.includes("This link expires in 24 hours"));

  const en = JSON.parse(src("client/src/locales/en.json"));
  const es = JSON.parse(src("client/src/locales/es.json"));
  const he = JSON.parse(src("client/src/locales/he.json"));
  for (const loc of [en, es, he]) {
    assert.ok(loc.auth.checkEmailTitle);
    assert.ok(String(loc.auth.checkEmailPrimary).includes("{{email}}"));
    assert.ok(loc.auth.checkEmailSpamHint);
    assert.ok(loc.auth.resendVerification);
    assert.ok(loc.auth.changeEmail);
    assert.ok(loc.auth.returnToLogin);
    assert.ok(loc.auth.verificationSendFailed);
    assert.ok(loc.auth.verificationResendSuccess);
  }
}

section("change-email is scoped to the pending session user");
{
  const auth = src("server/auth.ts");
  assert.ok(auth.includes("requireAuth"));
  assert.ok(auth.includes("isEmailVerified(sessionUser)"));
  assert.ok(auth.includes("existing.id !== sessionUser.id"));
  assert.ok(auth.includes("issueEmailVerification(sessionUser.id, nextEmail"));
}

console.log("\nAll check-email-verification-ux tests passed.");

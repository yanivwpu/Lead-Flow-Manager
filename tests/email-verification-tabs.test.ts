/**
 * Two-tab email verification: original /check-email stays primary.
 * Run: npx tsx tests/email-verification-tabs.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeClientRedirectPath } from "../client/src/lib/postAuthRedirect";
import {
  decideVerificationLinkFollowUp,
  detectOriginalVerificationTab,
  emailVerificationTabMessage,
  EMAIL_VERIFICATION_CHANNEL_NAME,
  EMAIL_VERIFICATION_SIGNAL_KEY,
  EMAIL_VERIFICATION_WAITER_KEY,
  EMAIL_VERIFICATION_WAITER_TTL_MS,
  isSafeEmailVerificationTabMessage,
  isWaiterHeartbeatLive,
  shouldAutoCloseVerificationTab,
  tryCloseScriptOpenedTab,
  verificationContinuePath,
} from "../shared/emailVerificationTabs";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

{
  const now = 1_700_000_000_000;
  assert.equal(isWaiterHeartbeatLive(String(now), now), true);
  assert.equal(isWaiterHeartbeatLive(String(now - EMAIL_VERIFICATION_WAITER_TTL_MS + 1), now), true);
  assert.equal(isWaiterHeartbeatLive(String(now - EMAIL_VERIFICATION_WAITER_TTL_MS - 1), now), false);
  assert.equal(isWaiterHeartbeatLive(null, now), false);
  assert.equal(isWaiterHeartbeatLive("nope", now), false);
}

{
  const now = 1_700_000_000_000;
  assert.equal(
    detectOriginalVerificationTab({ now, waiterHeartbeat: String(now), receivedAck: false }),
    true,
    "same-browser waiting tab heartbeat",
  );
  assert.equal(
    decideVerificationLinkFollowUp(true),
    "close-hint",
  );
  assert.equal(
    detectOriginalVerificationTab({ now, waiterHeartbeat: null, receivedAck: false }),
    false,
    "another device / no original tab",
  );
  assert.equal(decideVerificationLinkFollowUp(false), "continue");
  assert.equal(
    detectOriginalVerificationTab({
      now,
      waiterHeartbeat: String(now - EMAIL_VERIFICATION_WAITER_TTL_MS - 5_000),
      receivedAck: false,
    }),
    false,
    "missing original tab (stale heartbeat)",
  );
  assert.equal(
    detectOriginalVerificationTab({ now, waiterHeartbeat: null, receivedAck: true }),
    true,
    "BroadcastChannel ack without heartbeat",
  );
}

{
  assert.equal(verificationContinuePath(true), "/app/inbox");
  assert.equal(verificationContinuePath(false), "/auth");
  assert.equal(sanitizeClientRedirectPath("https://evil.example/phish"), "/app/inbox");
  assert.equal(sanitizeClientRedirectPath("//evil.example"), "/app/inbox");
  assert.equal(sanitizeClientRedirectPath("/app/inbox"), "/app/inbox");
  assert.equal(shouldAutoCloseVerificationTab(false), false);
  assert.equal(shouldAutoCloseVerificationTab(true), true);
  let closed = false;
  assert.equal(tryCloseScriptOpenedTab({ opener: null, close: () => { closed = true; } }), false);
  assert.equal(closed, false);
  assert.equal(tryCloseScriptOpenedTab({ opener: {}, close: () => { closed = true; } }), true);
  assert.equal(closed, true);
}

{
  assert.equal(isSafeEmailVerificationTabMessage({ type: "verified" }), true);
  assert.equal(isSafeEmailVerificationTabMessage({ type: "waiter-ack" }), true);
  assert.equal(isSafeEmailVerificationTabMessage({ type: "waiter-hello" }), true);
  assert.equal(isSafeEmailVerificationTabMessage({ type: "verified", token: "abc" }), false);
  assert.equal(isSafeEmailVerificationTabMessage({ type: "verified", email: "a@b.c" }), false);
  assert.equal(isSafeEmailVerificationTabMessage({ type: "verified", userId: "u1" }), false);
  assert.equal(isSafeEmailVerificationTabMessage({ type: "open-dashboard" }), false);
  assert.deepEqual(emailVerificationTabMessage("verified"), { type: "verified" });
}

{
  const auth = src("server/auth.ts");
  const verifySlice = auth.slice(
    auth.indexOf("app.post('/api/auth/verify-email'"),
    auth.indexOf("Failed to verify email"),
  );
  assert.match(verifySlice, /result\.reason === "expired"/);
  assert.match(verifySlice, /result\.reason === "used"/);
  assert.match(verifySlice, /has expired/);
  assert.match(verifySlice, /already been used/);
  assert.match(verifySlice, /reason: result\.reason/);
  const consume = src("server/emailVerification.ts");
  assert.match(consume, /if \(row\.usedAt\) return \{ ok: false, reason: "used" \}/);
  assert.match(consume, /reason: "expired"/);
  assert.match(consume, /reason: "invalid"/);
  assert.match(consume, /invalidateOtherUnusedTokens/);
}

{
  const page = src("client/src/pages/VerifyEmail.tsx");
  assert.match(page, /announceVerifiedAndAwaitOriginalTab/);
  assert.match(page, /decideVerificationLinkFollowUp/);
  assert.match(page, /auth\.verifyCloseThisTab/);
  assert.match(page, /auth\.continueToWhachat/);
  assert.match(page, /button-continue-whachat/);
  assert.match(page, /sanitizeClientRedirectPath/);
  assert.match(page, /verificationContinuePath/);
  assert.match(page, /shouldAutoCloseVerificationTab\(Boolean\(window\.opener\)\)/);
  assert.doesNotMatch(page, /setLocation\("\/app\/inbox"\)/);
  assert.doesNotMatch(page, /setTimeout\(\(\) => setLocation/);
  assert.doesNotMatch(page, /params\.get\("redirect"\)/);
  assert.doesNotMatch(page, /window\.location\.search[\s\S]{0,80}redirect/);
  assert.match(page, /data\.error \|\| t\("auth\.verifyInvalidLink"\)/);

  const waiting = src("client/src/pages/CheckEmail.tsx");
  assert.match(waiting, /startEmailVerificationWaiter/);
  assert.match(waiting, /CHECK_EMAIL_SESSION_POLL_MS/);
  assert.match(waiting, /navigateAfterAuth\("\/app\/inbox"\)/);
  assert.match(waiting, /refreshSession/);

  const sync = src("client/src/lib/emailVerificationTabSync.ts");
  assert.match(sync, /BroadcastChannel/);
  assert.match(sync, /EMAIL_VERIFICATION_WAITER_KEY/);
  assert.match(sync, /EMAIL_VERIFICATION_SIGNAL_KEY/);
  assert.match(sync, /EMAIL_VERIFICATION_CHANNEL_NAME/);
  assert.doesNotMatch(sync, /["']token["']\s*:/);
  assert.doesNotMatch(sync, /emailVerifiedAt/);
  const sharedTabs = src("shared/emailVerificationTabs.ts");
  assert.match(sharedTabs, new RegExp(EMAIL_VERIFICATION_CHANNEL_NAME));
}

{
  const en = JSON.parse(src("client/src/locales/en.json"));
  const es = JSON.parse(src("client/src/locales/es.json"));
  const he = JSON.parse(src("client/src/locales/he.json"));
  for (const loc of [en, es, he]) {
    assert.equal(typeof loc.auth.emailVerifiedTitle, "string");
    assert.equal(typeof loc.auth.verifyCloseThisTab, "string");
    assert.equal(typeof loc.auth.continueToWhachat, "string");
  }
  assert.equal(en.auth.emailVerifiedTitle, "Email verified");
  assert.equal(en.auth.verifyCloseThisTab, "You can close this tab and return to WhachatCRM.");
  assert.equal(en.auth.continueToWhachat, "Continue to WhachatCRM");
}

console.log("email-verification-tabs.test.ts: OK");

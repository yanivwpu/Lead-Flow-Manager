/**
 * Signup must consume a Turnstile token and remount the widget after any failed attempt.
 * Run: npx tsx --test tests/turnstile-signup-retry.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  beginSignupTurnstileAttempt,
  finishFailedSignupTurnstile,
  signupResultRequiresTurnstileReset,
} from "../client/src/lib/turnstileSignupRetry";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("verification failure clears the stored token and remounts the widget", () => {
  const first = beginSignupTurnstileAttempt({ token: "used-token-1", resetKey: 0 });
  assert.equal(first.tokenToSend, "used-token-1");
  assert.equal(first.next.token, null);
  assert.equal(first.next.resetKey, 1);

  const afterVerifyFail = finishFailedSignupTurnstile(first.next);
  assert.equal(afterVerifyFail.token, null);
  assert.equal(afterVerifyFail.resetKey, 2);
  assert.equal(signupResultRequiresTurnstileReset({ success: false }), true);
});

test("post-verification validation failure also remounts before the next submit", () => {
  const first = beginSignupTurnstileAttempt({ token: "used-token-2", resetKey: 4 });
  assert.equal(first.tokenToSend, "used-token-2");
  assert.equal(first.next.token, null);

  const alreadyExists = finishFailedSignupTurnstile(first.next);
  assert.equal(alreadyExists.token, null);
  assert.equal(alreadyExists.resetKey, 6);
  assert.equal(signupResultRequiresTurnstileReset({ success: false }), true);
});

test("retry cannot reuse the previous token", () => {
  const first = beginSignupTurnstileAttempt({ token: "old-token", resetKey: 0 });
  const retry = beginSignupTurnstileAttempt(first.next);
  assert.equal(retry.tokenToSend, null);
  assert.notEqual(retry.tokenToSend, "old-token");

  const afterNewWidget = beginSignupTurnstileAttempt({
    token: "fresh-token",
    resetKey: retry.next.resetKey,
  });
  assert.equal(afterNewWidget.tokenToSend, "fresh-token");
  assert.notEqual(afterNewWidget.tokenToSend, "old-token");
});

test("successful signup does not require another widget reset", () => {
  assert.equal(signupResultRequiresTurnstileReset({ success: true }), false);
});

test("Auth page consumes the token before signup and resets after every failure", () => {
  const page = read("client/src/pages/Auth.tsx");
  assert.match(page, /beginSignupTurnstileAttempt/);
  assert.match(page, /turnstileToken: attempt\.tokenToSend/);
  assert.match(page, /finishFailedSignupTurnstile/);
  assert.match(page, /signupResultRequiresTurnstileReset/);
  assert.match(page, /setTurnstileToken\(attempt\.next\.token\)/);
  assert.match(page, /setTurnstileResetKey\(attempt\.next\.resetKey\)/);

  const widget = read("client/src/components/TurnstileWidget.tsx");
  assert.match(widget, /resetKey/);
  assert.match(widget, /window\.turnstile\.remove/);
  assert.match(widget, /action: "signup"/);

  const helper = read("client/src/lib/turnstileSignupRetry.ts");
  assert.match(helper, /single-use/);
});

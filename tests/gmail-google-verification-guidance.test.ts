/**
 * Gmail Google verification guidance — feature flag + cancel-help toast helpers.
 * Run: npx tsx tests/gmail-google-verification-guidance.test.ts
 */
import assert from "node:assert/strict";
import {
  getGmailSetupVideoUrl,
  gmailVerificationCancelHelpToast,
  isGmailGoogleVerificationPending,
  shouldShowGmailVerificationCancelHelp,
  shouldShowGmailVerificationGuidance,
} from "../shared/gmailGoogleVerification";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("verification pending defaults to true when unset", () => {
  assert.equal(isGmailGoogleVerificationPending(undefined), true);
  assert.equal(isGmailGoogleVerificationPending(""), true);
  assert.equal(isGmailGoogleVerificationPending("true"), true);
  assert.equal(isGmailGoogleVerificationPending("pending"), true);
});

run("verification pending turns off when verified/complete", () => {
  assert.equal(isGmailGoogleVerificationPending("false"), false);
  assert.equal(isGmailGoogleVerificationPending("0"), false);
  assert.equal(isGmailGoogleVerificationPending("verified"), false);
  assert.equal(isGmailGoogleVerificationPending("complete"), false);
});

run("guidance shows only when pending and not connected", () => {
  assert.equal(
    shouldShowGmailVerificationGuidance({ verificationPending: true, gmailUiConnected: false }),
    true,
  );
  assert.equal(
    shouldShowGmailVerificationGuidance({ verificationPending: true, gmailUiConnected: true }),
    false,
  );
  assert.equal(
    shouldShowGmailVerificationGuidance({ verificationPending: false, gmailUiConnected: false }),
    false,
  );
});

run("setup video URL hidden when empty; accepts https", () => {
  assert.equal(getGmailSetupVideoUrl(null), null);
  assert.equal(getGmailSetupVideoUrl(""), null);
  assert.equal(getGmailSetupVideoUrl("https://example.com/setup.mp4"), "https://example.com/setup.mp4");
  assert.equal(getGmailSetupVideoUrl("not-a-url"), null);
});

run("cancel help toast wording is reassuring", () => {
  const toast = gmailVerificationCancelHelpToast();
  assert.equal(toast.title, "Need help?");
  assert.match(toast.description, /Advanced/);
  assert.match(toast.description, /Continue to WhachatCRM/);
  assert.doesNotMatch(toast.description, /unsafe/i);
  assert.doesNotMatch(toast.description, /sorry/i);
});

run("cancel help shows for oauth_failed / access_denied while pending", () => {
  assert.equal(
    shouldShowGmailVerificationCancelHelp({
      verificationPending: true,
      errorCategory: "oauth_failed",
      errorDetail: "access_denied",
    }),
    true,
  );
  assert.equal(
    shouldShowGmailVerificationCancelHelp({
      verificationPending: false,
      errorCategory: "oauth_failed",
      errorDetail: "access_denied",
    }),
    false,
  );
  assert.equal(
    shouldShowGmailVerificationCancelHelp({
      verificationPending: true,
      errorCategory: "profile_api_403",
      errorDetail: "Failed to load Gmail profile",
    }),
    false,
  );
});

run("ChannelSettings wires guidance component and Connect Gmail button", () => {
  const src = readFileSync(
    join(process.cwd(), "client/src/components/ChannelSettings.tsx"),
    "utf8",
  );
  assert.match(src, /GmailVerificationGuidance/);
  assert.match(src, /shouldShowGmailVerificationGuidance/);
  assert.match(src, /shouldShowGmailVerificationCancelHelp/);
  assert.match(src, /button-connect-gmail/);
});

run("guidance component includes required copy and timeline", () => {
  const src = readFileSync(
    join(process.cwd(), "client/src/components/GmailVerificationGuidance.tsx"),
    "utf8",
  );
  assert.match(src, /Connecting Gmail \(Quick Setup\)/);
  assert.match(src, /This app isn&apos;t verified/);
  assert.match(src, /Click Advanced/);
  assert.match(src, /Continue to WhachatCRM/);
  assert.match(src, /Approve Gmail Access/);
  assert.match(src, /Need help connecting Gmail\?/);
  assert.match(src, /Watch 20-second setup/);
  assert.match(src, /gmail-google-unverified-placeholder\.svg/);
  assert.doesNotMatch(src, /unsafe/i);
  assert.doesNotMatch(src, /sorry/i);
});

console.log("\nAll gmail google verification guidance tests passed.");

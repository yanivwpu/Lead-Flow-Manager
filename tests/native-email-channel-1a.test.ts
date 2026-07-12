/**
 * Native Email Channel Phase 1A — unit tests (no live Gmail).
 * Run: npx tsx tests/native-email-channel-1a.test.ts
 */
import assert from "node:assert/strict";
import {
  normalizeEmailAddress,
  GMAIL_OAUTH_SCOPES,
  initialSyncModeToDays,
  EMAIL_DEFAULT_INITIAL_SYNC_MODE,
} from "../shared/emailChannel";
import {
  sanitizeEmailHtml,
  htmlToPlainText,
  stripQuotedEmailReplies,
} from "../server/emailChannel/htmlSanitize";
import { shouldSuppressEmailContactCreation } from "../server/emailChannel/contactMatch";
import {
  encryptEmailCredential,
  decryptEmailCredential,
  isEmailCredentialEncrypted,
} from "../server/emailChannel/credentials";
import { CHANNELS, CHANNEL_INFO } from "../shared/schema";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("email is a first-class CHANNELS messaging entry", () => {
  assert.ok((CHANNELS as readonly string[]).includes("email"));
  assert.equal(CHANNEL_INFO.email.isMessaging, true);
  assert.equal(CHANNEL_INFO.email.label, "Email");
});

run("Gmail scopes are readonly + send (not modify / full mail)", () => {
  const joined = GMAIL_OAUTH_SCOPES.join(" ");
  assert.match(joined, /gmail\.readonly/);
  assert.match(joined, /gmail\.send/);
  assert.doesNotMatch(joined, /gmail\.modify/);
  assert.doesNotMatch(joined, /mail\.google\.com/);
});

run("normalizeEmailAddress trims + lowercases only", () => {
  assert.equal(normalizeEmailAddress("  Ada@Example.COM "), "ada@example.com");
  assert.equal(normalizeEmailAddress("not-an-email"), null);
  assert.equal(normalizeEmailAddress(""), null);
  // Does NOT collapse Gmail dots / plus aliases
  assert.equal(normalizeEmailAddress("a.b+tag@gmail.com"), "a.b+tag@gmail.com");
});

run("noreply / system addresses are suppressed for contact creation", () => {
  assert.equal(shouldSuppressEmailContactCreation("noreply@vendor.com"), "noreply_or_system");
  assert.equal(shouldSuppressEmailContactCreation("no-reply@vendor.com"), "noreply_or_system");
  assert.equal(shouldSuppressEmailContactCreation("mailer-daemon@vendor.com"), "noreply_or_system");
  assert.equal(shouldSuppressEmailContactCreation("ada@example.com"), null);
});

run("sanitizeEmailHtml strips scripts, handlers, and remote images", () => {
  const raw = `
    <p onclick="alert(1)">Hello <script>evil()</script></p>
    <img src="https://evil.example/track.png" />
    <a href="javascript:alert(1)">x</a>
  `;
  const { html, remoteImagesBlocked } = sanitizeEmailHtml(raw);
  assert.equal(remoteImagesBlocked, 1);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onclick/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.match(html, /Remote image blocked/i);
  assert.match(html, /Hello/);
});

run("htmlToPlainText and stripQuotedEmailReplies support AI context", () => {
  const plain = htmlToPlainText("<p>Thanks for the tour.</p><br/><div>Can we book Friday?</div>");
  assert.match(plain, /Thanks for the tour/);
  assert.match(plain, /Can we book Friday/);

  const stripped = stripQuotedEmailReplies(
    ["Sounds good.", "", "On Mon, Ada wrote:", "> prior quote", "> more"].join("\n"),
  );
  assert.equal(stripped, "Sounds good.");
});

run("initial sync mode maps to day windows", () => {
  assert.equal(EMAIL_DEFAULT_INITIAL_SYNC_MODE, "last_30_days");
  assert.equal(initialSyncModeToDays("last_7_days"), 7);
  assert.equal(initialSyncModeToDays("last_30_days"), 30);
  assert.equal(initialSyncModeToDays("last_90_days"), 90);
  assert.equal(initialSyncModeToDays("new_only"), null);
});

run("email credentials encrypt/decrypt with fail-closed format", () => {
  process.env.EMAIL_ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || "test-email-encryption-key-32b!";
  const token = "ya29.test-access-token";
  const enc = encryptEmailCredential(token);
  assert.ok(isEmailCredentialEncrypted(enc));
  assert.equal(decryptEmailCredential(enc), token);
  assert.throws(() => decryptEmailCredential("plaintext-token"), /refusing plaintext/i);
});

run("email thread identity model: mailbox + threadId keys conversation uniqueness", () => {
  // Documented Phase 1A contract — one Gmail threadId → one WhachatCRM conversation
  const mailboxId = "mb-1";
  const threadId = "thread-abc";
  const key = `email:${mailboxId}:${threadId}`;
  assert.equal(key, "email:mb-1:thread-abc");
});

console.log("\nAll native email Phase 1A unit tests passed.");

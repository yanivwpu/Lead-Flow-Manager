/**
 * Gmail Limited Use — logs must not emit message bodies / subjects / AI text.
 * Run: npx tsx tests/safe-log-redaction-gmail.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isEmailMessagingChannel,
  safeTextLogMeta,
  redactContentFieldsFromLogPayload,
} from "../shared/safeLogRedaction";

assert.equal(isEmailMessagingChannel("email"), true);
assert.equal(isEmailMessagingChannel("Email"), true);
assert.equal(isEmailMessagingChannel("whatsapp"), false);

const meta = safeTextLogMeta("Secret Gmail body");
assert.equal(meta.textLen, "Secret Gmail body".length);
assert.equal(meta.textRedacted, true);

const redacted = redactContentFieldsFromLogPayload({
  contactId: "c1",
  message: "hello from gmail",
  subject: "Re: listing",
  keep: "ok",
});
assert.equal(redacted.message, undefined);
assert.equal(redacted.subject, undefined);
assert.equal(redacted.messageLen, "hello from gmail".length);
assert.equal(redacted.subjectLen, "Re: listing".length);
assert.equal(redacted.keep, "ok");

const buyerTrace = readFileSync(
  join(import.meta.dirname, "..", "shared/buyerMatchingTrace.ts"),
  "utf8",
);
assert.ok(buyerTrace.includes("redactTraceContentFields"));
assert.ok(!/message:\s*truncateMessage\(payload\.message\)/.test(buyerTrace));

const persist = readFileSync(
  join(import.meta.dirname, "..", "server/emailChannel/persistInbound.ts"),
  "utf8",
);
assert.ok(persist.includes("subjectRedacted"));
assert.ok(!persist.includes("subjectPrefix"));

const privacy = readFileSync(
  join(import.meta.dirname, "..", "client/src/pages/PrivacyPolicy.tsx"),
  "utf8",
);
assert.match(privacy, /OpenAI API/);

console.log("safe-log-redaction-gmail.test.ts: all assertions passed");

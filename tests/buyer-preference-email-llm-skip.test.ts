/**
 * Limited Use: automatic buyer-preference LLM must skip email conversations.
 * Run: npx tsx tests/buyer-preference-email-llm-skip.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldSkipAutomaticBuyerPreferenceLlmForChannel } from "../shared/buyerPreferenceLlmGate";

assert.equal(shouldSkipAutomaticBuyerPreferenceLlmForChannel("email"), true);
assert.equal(shouldSkipAutomaticBuyerPreferenceLlmForChannel("Email"), true);
assert.equal(shouldSkipAutomaticBuyerPreferenceLlmForChannel("EMAIL"), true);
assert.equal(shouldSkipAutomaticBuyerPreferenceLlmForChannel("whatsapp"), false);
assert.equal(shouldSkipAutomaticBuyerPreferenceLlmForChannel("sms"), false);
assert.equal(shouldSkipAutomaticBuyerPreferenceLlmForChannel(null), false);
assert.equal(shouldSkipAutomaticBuyerPreferenceLlmForChannel(""), false);

const svc = readFileSync(
  join(import.meta.dirname, "..", "server/buyerPreferenceService.ts"),
  "utf8",
);
assert.ok(svc.includes("shouldSkipAutomaticBuyerPreferenceLlmForChannel"));
assert.ok(svc.includes("email_channel_no_automatic_llm"));
assert.ok(svc.includes("Skipped OpenAI buyer-preference extraction because the latest conversation is email"));
// Gate must run before extractPreferencesWithLlm
const gateIdx = svc.indexOf("email_channel_no_automatic_llm");
const llmIdx = svc.indexOf("extractPreferencesWithLlm(freshForExisting");
assert.ok(gateIdx > 0 && llmIdx > gateIdx, "email skip must precede LLM call");

// User-initiated AI paths must not use this gate (they are separate services).
const aiService = readFileSync(join(import.meta.dirname, "..", "server/aiService.ts"), "utf8");
assert.ok(!aiService.includes("shouldSkipAutomaticBuyerPreferenceLlmForChannel"));
const contactsSnapshot = readFileSync(
  join(import.meta.dirname, "..", "server/routes/contacts.ts"),
  "utf8",
);
assert.ok(!contactsSnapshot.includes("shouldSkipAutomaticBuyerPreferenceLlmForChannel"));

console.log("buyer-preference-email-llm-skip.test.ts: all assertions passed");

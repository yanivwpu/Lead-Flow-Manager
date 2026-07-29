/**
 * Privacy Policy must disclose current Gmail OAuth access categories (read/send/modify)
 * and Google Workspace Limited Use / no generalized AI training.
 * Run: npx tsx tests/privacy-policy-gmail-scopes.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(import.meta.dirname, "..", "client/src/pages/PrivacyPolicy.tsx"),
  "utf8",
);

assert.ok(src.includes("5. Google / Gmail data (OAuth)"));
assert.match(src, /Gmail read access/i);
assert.match(src, /Gmail send access/i);
assert.match(src, /Gmail modify access/i);
assert.match(src, /Trash/i);
assert.match(
  src,
  /Google Workspace API data is not used to develop,\s*improve,\s*or train generalized\s+(?:AI or machine learning|artificial intelligence or machine\s+learning)\s*models/i,
);
assert.ok(src.includes("Google API Services User Data Policy"));
assert.ok(src.includes("Limited Use"));
assert.match(src, /OpenAI API/i);
assert.match(
  src,
  /raw or derived user data received from Google Workspace APIs adheres to the Google API Services User Data\s+Policy/i,
);
assert.match(src, /does\s+not operate self-hosted or offline AI models/i);
assert.ok(!src.includes("We do not claim specific third-party model-training practices"));
// Old code-style scope labels without modify coverage should be gone.
assert.ok(!src.includes("gmail.readonly"));
assert.ok(!src.includes("gmail.send"));
assert.ok(!src.includes("gmail.modify"));

const terms = readFileSync(
  join(import.meta.dirname, "..", "client/src/pages/TermsOfUse.tsx"),
  "utf8",
);
assert.match(terms, /OpenAI API/i);
assert.match(terms, /not\s+self-hosted or offline/i);

console.log("privacy-policy-gmail-scopes.test.ts: all assertions passed");

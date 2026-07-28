/**
 * Prospect AI Review failures (OpenAI key) + Review work-queue ordering.
 * Run: npx tsx tests/prospect-ai-review-failures-and-sort.test.ts
 */
import assert from "node:assert/strict";
import {
  formatProspectAiProviderFailureMessage,
  looksLikeOpenAiApiKey,
  looksLikeResendApiKey,
  resolveOpenAiApiKey,
} from "../shared/openaiApiKey";
import {
  compareProspectReviewActionOrder,
  prospectReviewActionRank,
} from "../shared/prospectReviewSort";
import { mergeProspectRowsStableOrder } from "../shared/prospectReviewUx";
import {
  formatOutreachInstructionsForPrompt,
  parseOutreachInstructions,
} from "../shared/prospectOutreachInstructions";
import {
  parseAndValidateProspectIntelligence,
  type ProspectIntelligenceAiInput,
} from "../server/prospectImport/prospectIntelligenceAi";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`fail ${name}`);
    throw err;
  }
}

// --- OpenAI key / failure messaging ---

run("Resend key prefix is detected and rejected as OpenAI", () => {
  assert.equal(looksLikeResendApiKey("re_eX7RFabcdefghijhhAF"), true);
  assert.equal(looksLikeOpenAiApiKey("re_eX7RFabcdefghijhhAF"), false);
  assert.equal(looksLikeOpenAiApiKey("sk-proj-abc123def456ghi789jkl"), true);
});

run("resolveOpenAiApiKey prefers valid OpenAI over Resend miswire", () => {
  const resolved = resolveOpenAiApiKey({
    AI_INTEGRATIONS_OPENAI_API_KEY: "re_eX7RFabcdefghijhhAF",
    OPENAI_API_KEY: "sk-proj-validopenaiabcdefghijklmnop",
  } as NodeJS.ProcessEnv);
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.source, "OPENAI_API_KEY");
    assert.ok(resolved.apiKey.startsWith("sk-"));
  }
});

run("resolveOpenAiApiKey fails clearly when only Resend key is set", () => {
  const resolved = resolveOpenAiApiKey({
    AI_INTEGRATIONS_OPENAI_API_KEY: "re_eX7RFabcdefghijhhAF",
  } as NodeJS.ProcessEnv);
  assert.equal(resolved.ok, false);
  if (!resolved.ok) {
    assert.match(resolved.reason, /Resend/i);
    assert.match(resolved.reason, /OpenAI/i);
  }
});

run("401 with Resend key material becomes actionable stored error", () => {
  const providerMsg =
    "401 Incorrect API key provided: re_eX7RF" +
    "************************" +
    "hhAF. You can find your API key at https://platform.openai.com/account/api-keys.";
  const msg = formatProspectAiProviderFailureMessage(new Error(providerMsg));
  assert.match(msg, /Resend/i);
  assert.match(msg, /OpenAI/i);
  assert.equal(msg.includes("re_eX7RF"), false);
  assert.ok(msg.length <= 500);
});

run("JSON parse failures keep a meaningful reason", () => {
  const msg = formatProspectAiProviderFailureMessage(
    new Error("Unexpected token < in JSON at position 0"),
  );
  assert.match(msg, /parsing failed/i);
});

// --- Outreach Instructions do not break AI review parse ---

run("language/link outreach settings parse safely for prompt + AI schema", () => {
  const instructions = parseOutreachInstructions({
    language: "spanish",
    linkUrl: "https://www.whachatcrm.com/demo",
    includeLinkNaturally: true,
    tone: "friendly",
    length: "short",
    personalize: true,
    customInstructions: "Mention Miami market",
  });
  const block = formatOutreachInstructionsForPrompt(instructions);
  assert.match(block, /spanish|Spanish/i);
  assert.match(block, /whachatcrm\.com\/demo/);

  const input: ProspectIntelligenceAiInput = {
    name: "Blackbook Properties",
    email: "info@example.com",
    emailDomain: "example.com",
    website: "https://blackbook.example",
    originalTags: [],
  };
  const parsed = parseAndValidateProspectIntelligence(
    {
      potentialFit: "good",
      leadScore: 72,
      priority: "medium",
      businessType: "real_estate",
      recommendedOffer: "real_estate_growth_engine",
      suggestedOutreachAngle: "Local growth",
      suggestedFirstMessage: "Hola, soy de WhaChatCRM.",
      // subject omitted — backward compatible
      reasoningSummary: "Miami real estate agent with public web presence.",
      needsReview: false,
      confidence: 70,
    },
    "gpt-4o-mini",
    input,
  );
  assert.ok(parsed.suggestedFirstMessage);
  // Subject is optional: parser fills a fallback when missing.
  assert.equal(typeof parsed.suggestedOutreachSubject, "string");
});

run("suggestedOutreachSubject optional / backward compatible", () => {
  const input: ProspectIntelligenceAiInput = {
    name: "Chariff Realty",
    email: null,
    emailDomain: null,
    originalTags: [],
  };
  const withoutSubject = parseAndValidateProspectIntelligence(
    {
      potentialFit: "unknown",
      leadScore: 40,
      priority: "needs_review",
      recommendedOffer: "general_demo",
      suggestedOutreachAngle: "Intro",
      suggestedFirstMessage: "Hi there - WhaChatCRM here.",
      reasoningSummary: "Limited public data.",
      needsReview: true,
      confidence: 30,
    },
    "gpt-4o-mini",
    input,
  );
  assert.ok(String(withoutSubject.suggestedOutreachSubject || "").length > 0);

  const withSubject = parseAndValidateProspectIntelligence(
    {
      potentialFit: "unknown",
      leadScore: 40,
      priority: "needs_review",
      recommendedOffer: "general_demo",
      suggestedOutreachAngle: "Intro",
      suggestedFirstMessage: "Hi there - WhaChatCRM here.",
      suggestedOutreachSubject: "Quick intro for Chariff Realty",
      reasoningSummary: "Limited public data.",
      needsReview: true,
      confidence: 30,
    },
    "gpt-4o-mini",
    input,
  );
  assert.match(String(withSubject.suggestedOutreachSubject), /Chariff/i);
});

// --- Review ordering ---

run("action rank: failed and needs_review above approved/history", () => {
  assert.ok(
    prospectReviewActionRank({ analysisStatus: "failed" }) <
      prospectReviewActionRank({ analysisStatus: "completed", reviewStatus: "approved" }),
  );
  assert.ok(
    prospectReviewActionRank({ analysisStatus: "completed", reviewStatus: "needs_review" }) <
      prospectReviewActionRank({
        analysisStatus: "completed",
        reviewStatus: "approved",
        outreachStatus: "not_sent",
      }),
  );
  assert.ok(
    prospectReviewActionRank({ analysisStatus: "pending" }) <
      prospectReviewActionRank({ analysisStatus: "failed" }),
  );
});

run("newest Needs Review appears above older reviewed; failed stays actionable near top", () => {
  const rows = [
    {
      id: "old-approved",
      analysisStatus: "completed",
      reviewStatus: "approved",
      outreachStatus: "not_sent",
      createdAt: "2026-07-20T10:00:00.000Z",
    },
    {
      id: "old-needs",
      analysisStatus: "completed",
      reviewStatus: "needs_review",
      createdAt: "2026-07-21T10:00:00.000Z",
    },
    {
      id: "new-failed",
      analysisStatus: "failed",
      reviewStatus: "pending",
      createdAt: "2026-07-26T16:25:00.000Z",
    },
    {
      id: "new-needs",
      analysisStatus: "completed",
      reviewStatus: "needs_review",
      createdAt: "2026-07-26T16:30:00.000Z",
    },
  ];
  const sorted = [...rows].sort(compareProspectReviewActionOrder);
  assert.deepEqual(
    sorted.map((r) => r.id),
    ["new-failed", "new-needs", "old-needs", "old-approved"],
  );
});

run("newest items sort first within same status", () => {
  const a = {
    analysisStatus: "failed" as const,
    createdAt: "2026-07-26T16:00:00.000Z",
  };
  const b = {
    analysisStatus: "failed" as const,
    createdAt: "2026-07-26T17:00:00.000Z",
  };
  assert.ok(compareProspectReviewActionOrder(b, a) < 0);
});

run("stable merge prepends newly added Review rows (not append)", () => {
  const merged = mergeProspectRowsStableOrder(
    ["old-a", "old-b"],
    [
      { contactId: "old-a" },
      { contactId: "old-b" },
      { contactId: "miami-new" },
    ],
  );
  assert.deepEqual(merged.order, ["miami-new", "old-a", "old-b"]);
});

run("Review panel defaults to action sort", () => {
  const panel = readFileSync(
    join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.match(
    panel,
    /useState<"leadScore" \| "priority" \| "confidence" \| "name" \| "action">\(\s*"action"/,
  );
  assert.match(panel, /pi-analysis-failed-reason/);
});

run("aiProvider resolves OpenAI key via shared helper (no debug ingest)", () => {
  const src = readFileSync(join(root, "server/aiProvider.ts"), "utf8");
  assert.match(src, /resolveOpenAiApiKey/);
  assert.match(src, /ensureOpenAiKey/);
  assert.equal(src.includes("7693/ingest"), false);
  assert.equal(src.includes("#region agent log"), false);
});

console.log("prospect-ai-review-failures-and-sort.test.ts: all assertions passed");

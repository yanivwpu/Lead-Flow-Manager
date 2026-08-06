/**
 * Inbox AI reply generation meter — accounting + ceilings.
 * Run: npx tsx --test tests/inbox-ai-reply-generations.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AI_ASSIST_MONTHLY_CREDITS,
  INBOX_AI_REPLY_FAIR_USE_MONTHLY_THRESHOLD,
  INBOX_AI_REPLY_GENERATIONS_MONTHLY,
  countInboxAiReplyGenerations,
  hasUsableInboxAiReplyText,
  shouldRecordInboxAiReplyGeneration,
} from "../shared/inboxAiReplyGenerations";

const root = process.cwd();
const routesSrc = readFileSync(join(root, "server/routes.ts"), "utf8");
const aiServiceSrc = readFileSync(join(root, "server/aiService.ts"), "utf8");
const prospectServiceSrc = readFileSync(
  join(root, "server/prospectAI/prospectAIService.ts"),
  "utf8",
);
const pricingSrc = readFileSync(join(root, "client/src/pages/Pricing.tsx"), "utf8");
const marketingSrc = readFileSync(
  join(root, "client/src/components/pricing/PricingMarketingSections.tsx"),
  "utf8",
);
const composerSrc = readFileSync(join(root, "client/src/components/AIComposer.tsx"), "utf8");
const schemaSrc = readFileSync(join(root, "shared/schema.ts"), "utf8");

test("hidden ceilings: Starter 2,000 / Pro 10,000", () => {
  assert.equal(INBOX_AI_REPLY_GENERATIONS_MONTHLY.starter, 2_000);
  assert.equal(INBOX_AI_REPLY_GENERATIONS_MONTHLY.pro, 10_000);
  assert.equal(INBOX_AI_REPLY_GENERATIONS_MONTHLY.free, 0);
  assert.ok(INBOX_AI_REPLY_FAIR_USE_MONTHLY_THRESHOLD > INBOX_AI_REPLY_GENERATIONS_MONTHLY.pro);
  // Legacy alias stays in sync
  assert.equal(AI_ASSIST_MONTHLY_CREDITS.starter, 2_000);
  assert.equal(AI_ASSIST_MONTHLY_CREDITS.pro, 10_000);
});

test("active quota formula uses repliesSuggested only; messagesGenerated ignored", () => {
  assert.equal(countInboxAiReplyGenerations({ repliesSuggested: 12, messagesGenerated: 999 }), 12);
  assert.equal(countInboxAiReplyGenerations({ repliesSuggested: 0, messagesGenerated: 50 }), 0);
  assert.equal(countInboxAiReplyGenerations(null), 0);
  assert.ok(
    schemaSrc.includes("Never incremented") || schemaSrc.includes("@deprecated Legacy column"),
    "schema must document messagesGenerated as deprecated",
  );
  assert.ok(
    routesSrc.includes("countInboxAiReplyGenerations"),
    "routes must use countInboxAiReplyGenerations for active meter",
  );
  assert.ok(
    !/creditsUsed\s*=\s*\(usage\?\.repliesSuggested[\s\S]{0,40}messagesGenerated/.test(routesSrc),
    "routes must not sum messagesGenerated into the active meter",
  );
});

test("record only after successful model generation with usable text", () => {
  assert.equal(
    shouldRecordInboxAiReplyGeneration({
      modelWasInvoked: true,
      modelGenerationSucceeded: true,
      finalReplyText: "Thanks — happy to help with that.",
    }),
    true,
  );
  // Empty/no-op Auto (model skipped)
  assert.equal(
    shouldRecordInboxAiReplyGeneration({
      modelWasInvoked: false,
      modelGenerationSucceeded: false,
      finalReplyText: "",
    }),
    false,
  );
  // Provider/model failure
  assert.equal(
    shouldRecordInboxAiReplyGeneration({
      modelWasInvoked: true,
      modelGenerationSucceeded: false,
      finalReplyText: "",
    }),
    false,
  );
  // Defensive: success flag without invoke
  assert.equal(
    shouldRecordInboxAiReplyGeneration({
      modelWasInvoked: false,
      modelGenerationSucceeded: true,
      finalReplyText: "text",
    }),
    false,
  );
});

test("empty or whitespace-only successful completion does not consume a generation", () => {
  assert.equal(hasUsableInboxAiReplyText(""), false);
  assert.equal(hasUsableInboxAiReplyText("   \n\t  "), false);
  assert.equal(hasUsableInboxAiReplyText(null), false);
  assert.equal(hasUsableInboxAiReplyText(undefined), false);
  assert.equal(hasUsableInboxAiReplyText("Hi there"), true);

  assert.equal(
    shouldRecordInboxAiReplyGeneration({
      modelWasInvoked: true,
      modelGenerationSucceeded: true,
      finalReplyText: "",
    }),
    false,
  );
  assert.equal(
    shouldRecordInboxAiReplyGeneration({
      modelWasInvoked: true,
      modelGenerationSucceeded: true,
      finalReplyText: "   \n  ",
    }),
    false,
  );
  // Routes must log empty_completion and pass finalReplyText into the gate.
  assert.ok(routesSrc.includes('empty_completion'));
  assert.ok(routesSrc.includes("finalReplyText"));
  assert.ok(
    /shouldRecordInboxAiReplyGeneration\([\s\S]{0,220}?finalReplyText/.test(routesSrc),
    "suggest-reply must pass finalReplyText into shouldRecordInboxAiReplyGeneration",
  );
});

test("suggest-reply accounting boundary is post-success and gated", () => {
  assert.ok(routesSrc.includes("shouldRecordInboxAiReplyGeneration"));
  assert.ok(routesSrc.includes("modelGenerationSucceeded"));
  assert.ok(routesSrc.includes('incrementAiUsage(userId, "repliesSuggested")'));
  // Increment must sit behind the shouldRecord gate (not unconditional).
  assert.ok(
    /shouldRecordInboxAiReplyGeneration\([\s\S]{0,200}?incrementAiUsage\(userId, "repliesSuggested"\)/.test(
      routesSrc,
    ),
    "increment must be behind shouldRecordInboxAiReplyGeneration",
  );
  assert.ok(aiServiceSrc.includes("modelGenerationSucceeded: true"));
  assert.ok(aiServiceSrc.includes("modelGenerationSucceeded: false"));
  // Internal fact-completeness retry must not imply a second meter unit
  assert.ok(aiServiceSrc.includes("FACT_COMPLETENESS_RETRY_INSTRUCTION"));
  assert.ok(
    aiServiceSrc.includes("One successful suggestReply = one meter unit"),
    "aiService must document single-count for internal retry",
  );
});

test("Suggest / Auto / Rewrite share suggest-reply path (one increment when successful)", () => {
  // Inbox Suggest + Auto call the same endpoint; no separate Rewrite meter path exists.
  const suggestCalls = (composerSrc.match(/\/api\/ai\/suggest-reply/g) || []).length;
  assert.ok(suggestCalls >= 2, "composer must call suggest-reply for Suggest and Auto");
  assert.ok(
    !composerSrc.includes("/api/ai/rewrite"),
    "no separate rewrite endpoint — rewrite would use suggest-reply if added",
  );
  assert.ok(routesSrc.includes('app.post("/api/ai/suggest-reply"'));
});

test("validation failure path does not reach increment (conversation history required)", () => {
  assert.ok(routesSrc.includes("Conversation history required"));
  // Early 400 return appears before suggestReply / increment in the handler
  const handlerStart = routesSrc.indexOf('app.post("/api/ai/suggest-reply"');
  const historyCheck = routesSrc.indexOf("Conversation history required", handlerStart);
  const increment = routesSrc.indexOf('incrementAiUsage(userId, "repliesSuggested")', handlerStart);
  assert.ok(handlerStart >= 0 && historyCheck > handlerStart && increment > historyCheck);
});

test("Prospect AI does not consume inbox AI reply meter", () => {
  assert.ok(!prospectServiceSrc.includes("incrementAiUsage"));
  assert.ok(!prospectServiceSrc.includes("repliesSuggested"));
  assert.ok(!prospectServiceSrc.includes("INBOX_AI_REPLY_GENERATIONS"));
});

test("Workflow AI tracks automationsGenerated only — not repliesSuggested", () => {
  const genAuto = routesSrc.indexOf('app.post("/api/ai/generate-automation"');
  assert.ok(genAuto >= 0);
  const slice = routesSrc.slice(genAuto, genAuto + 2500);
  assert.ok(slice.includes('incrementAiUsage(userId, \'automationsGenerated\')') || slice.includes('incrementAiUsage(userId, "automationsGenerated")'));
  assert.ok(!slice.includes('repliesSuggested'));
});

test("no public pricing or composer UI exposes numeric inbox AI reply limits", () => {
  assert.ok(!pricingSrc.includes("2,000"));
  assert.ok(!pricingSrc.includes("10000"));
  assert.ok(!pricingSrc.includes("10,000"));
  assert.ok(!marketingSrc.includes("INBOX_AI_REPLY_GENERATIONS"));
  assert.ok(!marketingSrc.includes("credits/month"));
  assert.ok(!composerSrc.includes("AICreditBadge"));
  assert.ok(!composerSrc.includes("more AI Assist capacity"));
  assert.ok(routesSrc.includes("inboxAiReplyGenerationsUsed"));
  assert.ok(routesSrc.includes("legacyMessagesGenerated"));
});

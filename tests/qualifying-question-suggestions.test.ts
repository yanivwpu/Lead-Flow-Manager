/**
 * Questions proposed from published business knowledge.
 *
 * The merchant no longer picks an industry template — the workflow proposes a starting set
 * from plan names, offerings, booking and locations. These checks lock the shape detection,
 * the plan-aware wording, the cap, and the regenerate-without-overwrite rule.
 *
 * Run: npx tsx tests/qualifying-question-suggestions.test.ts
 */

import assert from "node:assert/strict";
import {
  detectBusinessShape,
  newSuggestionsFor,
  suggestQualifyingQuestions,
} from "../shared/qualifyingQuestionSuggestions";
import { parseQualifyingQuestions } from "../shared/workspaceIntelligence";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("plan and offering names beat the industry dropdown", () => {
  assert.equal(
    detectBusinessShape({
      industry: "other",
      planNames: ["Featured Listing", "Spotlight Placement"],
    }),
    "directory",
  );
  assert.equal(
    detectBusinessShape({
      industry: "healthcare",
      offerings: ["Weekend brunch menu"],
    }),
    "dining",
  );
});

run("industry is used only when the knowledge does not say otherwise", () => {
  assert.equal(detectBusinessShape({ industry: "real_estate" }), "real_estate");
  assert.equal(detectBusinessShape({ industry: "hospitality" }), "lodging");
  assert.equal(detectBusinessShape({}), "generic");
});

run("published plans earn a package question that names them", () => {
  const qs = suggestQualifyingQuestions({
    planNames: ["Basic", "Pro", "Enterprise"],
    industry: "other",
  });
  const plan = qs.find((q) => q.key === "plan");
  assert.ok(plan, "a plan question must be proposed");
  assert.ok(plan!.question.includes("Basic"));
  assert.ok(plan!.question.includes("Pro"));
  assert.ok(plan!.question.includes("Enterprise"));
  assert.equal(plan!.required, true);
});

run("directory wording uses visibility package language", () => {
  const qs = suggestQualifyingQuestions({
    planNames: ["Spotlight", "Featured"],
    offerings: ["directory listing"],
  });
  const plan = qs.find((q) => q.key === "plan");
  assert.ok(plan?.question.includes("visibility package"));
});

run("booking and locations each earn a question when missing", () => {
  const qs = suggestQualifyingQuestions({
    industry: "ecommerce",
    hasBooking: true,
    hasLocations: true,
  });
  assert.ok(qs.some((q) => q.key === "preferred_time"));
  assert.ok(qs.some((q) => q.key === "preferred_location"));
});

run("the suggestion list stays short enough to review", () => {
  const qs = suggestQualifyingQuestions({
    industry: "real_estate",
    planNames: ["Starter", "Growth", "Scale"],
    hasBooking: true,
    hasLocations: true,
  });
  assert.ok(qs.length <= 6, `got ${qs.length} suggestions`);
});

run("regenerate only adds questions the merchant has not already kept", () => {
  const suggestions = suggestQualifyingQuestions({ industry: "contractor" });
  const existing = [
    { key: "service", question: "What service do you need?" },
    // Timestamped id still matches the suggestion key stem, so it must not come back.
    { key: "timeline_1710000000000", question: "When should we start the work?" },
  ];
  const missing = newSuggestionsFor(existing, suggestions);
  assert.ok(!missing.some((s) => s.key === "service"));
  assert.ok(!missing.some((s) => s.key === "timeline"));
  assert.ok(
    missing.some((s) => s.key === "location"),
    "unrelated suggestions must still be offered",
  );
  assert.ok(
    !newSuggestionsFor(
      [{ key: "x", question: "When would you like the work to start?" }],
      suggestions,
    ).some((s) => s.key === "timeline"),
    "matching question text must suppress the suggestion",
  );
});

run("turned-off questions are excluded from what the assistant sees", () => {
  const parsed = parseQualifyingQuestions([
    { key: "need", label: "Need", question: "What do you need?", required: true },
    {
      key: "budget",
      label: "Budget",
      question: "What is your budget?",
      required: true,
      enabled: false,
    },
    { key: "timeline", label: "Timeline", question: "When?", required: false, enabled: true },
  ]);
  assert.equal(parsed.length, 2);
  assert.ok(parsed.every((q) => q.key !== "budget"));
  assert.ok(parsed.some((q) => q.key === "need"));
  assert.ok(parsed.some((q) => q.key === "timeline"));
});

console.log("\nAll qualifying-question suggestion tests passed.");

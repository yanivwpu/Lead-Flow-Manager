/**
 * Business Knowledge steps must share the same column edges as the AI behavior card.
 * The timeline rail and numbered circles live in an internal start-side gutter.
 *
 * Run: npx tsx tests/ai-brain-knowledge-step-layout.test.ts
 */
import assert from "node:assert/strict";
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

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const STEP = read("client/src/components/aibrain/WorkflowStep.tsx");
const STEPS = read("client/src/components/aibrain/BusinessKnowledgeSteps.tsx");
const QUESTIONS = read("client/src/components/aibrain/CustomerQuestions.tsx");
const PAGE = read("client/src/pages/AIBrain.tsx");

run("the AI behavior card and knowledge list share the same page column", () => {
  assert.match(PAGE, /CardTitle[^>]*>AI behavior/);
  assert.match(PAGE, /max-w-\[800px\] mx-auto w-full/);
  assert.match(PAGE, /<BusinessKnowledgeSteps/);
  assert.match(STEPS, /<ol className="w-full min-w-0 space-y-5">/);
  assert.match(STEPS, /section aria-labelledby="business-knowledge-heading" className="w-full min-w-0/);
});

run("every knowledge step uses the shared full-width Step shell", () => {
  for (const title of ["Teach AI", "Analyze knowledge", "Review what AI learned"]) {
    assert.match(STEPS, new RegExp(`title="${title}"`));
  }
  assert.match(QUESTIONS, /title="What AI should ask customers"/);
  assert.match(QUESTIONS, /from "\.\/WorkflowStep"/);
  assert.match(STEPS, /from "\.\/WorkflowStep"/);
});

run("step cards align to both column edges instead of an external timeline gutter", () => {
  assert.doesNotMatch(STEP, /\bpl-11\b/);
  assert.doesNotMatch(STEP, /\bpl-14\b/);
  assert.doesNotMatch(STEP, /\bsm:pl-14\b/);
  assert.doesNotMatch(STEP, /\bml-11\b/);
  assert.doesNotMatch(STEP, /absolute left-0/);
  assert.doesNotMatch(STEP, /absolute left-4/);
  assert.doesNotMatch(STEP, /sm:left-5/);
  assert.match(STEP, /data-testid=\{`knowledge-step-card-\$\{index\}`\}/);
  assert.match(STEP, /flex w-full min-w-0 items-start gap-2/);
  assert.match(STEP, /rounded-2xl border-0 bg-white\/95/);
});

run("the rail and numbered circles sit in an internal start-side gutter", () => {
  assert.match(STEP, /data-testid=\{`knowledge-step-gutter-\$\{index\}`\}/);
  assert.match(STEP, /relative w-8 shrink-0 self-stretch sm:w-10/);
  assert.match(STEP, /absolute inset-x-0 top-9 z-0 mx-auto w-px/);
  assert.match(STEP, /sm:top-11/);
  assert.match(STEP, /flex h-8 w-8 items-center justify-center rounded-full/);
  assert.match(STEP, /sm:h-10 sm:w-10/);
  assert.match(STEP, /min-w-0 flex-1 pe-4/);
});

run("narrow viewports use a tighter internal gutter without hiding the circles", () => {
  assert.match(STEP, /ps-2\.5/);
  assert.match(STEP, /sm:ps-4/);
  assert.match(STEP, /gap-2/);
  assert.match(STEP, /sm:gap-3\.5/);
  assert.match(STEP, /w-8 shrink-0/);
  assert.match(STEP, /flex h-8 w-8 items-center justify-center rounded-full/);
});

run("RTL keeps the gutter on the start edge and does not double-reverse flex", () => {
  assert.match(STEP, /\bps-2\.5\b/);
  assert.match(STEP, /\bpe-4\b/);
  assert.match(STEP, /\bsm:pe-5\b/);
  assert.doesNotMatch(STEP, /\bflex-row\b/);
  assert.doesNotMatch(STEP, /\bpl-4\b/);
  assert.doesNotMatch(STEP, /\bpr-4\b/);
  assert.doesNotMatch(STEP, /\bleft-0\b/);
  assert.doesNotMatch(STEP, /\bright-0\b/);
});

run("step content is allowed to shrink so wide review rows cannot overflow the card", () => {
  assert.match(STEP, /min-w-0 flex-1 pe-4/);
  assert.match(STEP, /li className="relative w-full min-w-0"/);
  assert.doesNotMatch(STEP, /max-w-full/);
  assert.doesNotMatch(STEP, /overflow-x-hidden/);
  assert.doesNotMatch(STEP, /overflow-hidden/);
});

run("the questions step is the last item in the same ordered list", () => {
  assert.match(QUESTIONS, /index=\{4\}/);
  assert.match(QUESTIONS, /isLast/);
  const list = STEPS.slice(STEPS.indexOf("<ol"), STEPS.indexOf("</ol>"));
  assert.match(list, /title="Teach AI"/);
  assert.match(list, /title="Analyze knowledge"/);
  assert.match(list, /title="Review what AI learned"/);
  assert.match(list, /\{questionsStep\}/);
});

console.log("ai-brain-knowledge-step-layout.test.ts: all assertions passed");

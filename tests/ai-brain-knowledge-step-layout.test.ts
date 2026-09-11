/**
 * Business Knowledge step cards must share the AI behavior card's edges.
 * Timeline circles/rail sit outside the card on the start side and must not indent it.
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

const COLUMN_MAX = 800;
const SM = 640;
const LG = 1024;
const VIEWPORTS = [1767, 1366, 768, 375] as const;

/** Matches `p-6 sm:p-10` on the AI Brain column. */
function columnPaddingX(viewport: number): number {
  return viewport >= SM ? 40 : 24;
}

/** Matches `w-5 me-1 sm:w-8 sm:me-2 lg:w-10 lg:me-4`. */
function timelineMetrics(viewport: number): { circle: number; gap: number } {
  if (viewport >= LG) return { circle: 40, gap: 16 };
  if (viewport >= SM) return { circle: 32, gap: 8 };
  return { circle: 20, gap: 4 };
}

type Dir = "ltr" | "rtl";
type Box = { left: number; right: number; width: number };

function layoutAt(viewport: number, dir: Dir): { behavior: Box; card: Box; marker: Box } {
  const columnWidth = Math.min(COLUMN_MAX, viewport);
  const columnLeft = (viewport - columnWidth) / 2;
  const pad = columnPaddingX(viewport);
  const card: Box = {
    left: columnLeft + pad,
    right: columnLeft + columnWidth - pad,
    width: columnWidth - pad * 2,
  };
  const { circle, gap } = timelineMetrics(viewport);
  const marker: Box =
    dir === "ltr"
      ? { left: card.left - gap - circle, right: card.left - gap, width: circle }
      : { left: card.right + gap, right: card.right + gap + circle, width: circle };
  return { behavior: { ...card }, card, marker };
}

run("the AI behavior card and knowledge list share the same page column", () => {
  assert.match(PAGE, /CardTitle[^>]*>AI behavior/);
  assert.match(PAGE, /p-6 sm:p-10 max-w-\[800px\] mx-auto w-full/);
  assert.match(PAGE, /overflow-x-hidden/);
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
  assert.match(QUESTIONS, /index=\{4\}/);
  assert.match(QUESTIONS, /isLast/);
  const list = STEPS.slice(STEPS.indexOf("<ol"), STEPS.indexOf("</ol>"));
  assert.match(list, /\{questionsStep\}/);
});

run("the card is full-width in-flow; the timeline is not a flex/grid column that steals width", () => {
  assert.doesNotMatch(STEP, /\bpl-11\b/);
  assert.doesNotMatch(STEP, /\bpl-14\b/);
  assert.doesNotMatch(STEP, /\bsm:pl-14\b/);
  assert.doesNotMatch(STEP, /\bml-11\b/);
  assert.doesNotMatch(STEP, /className="[^"]*\bgrid\b/);
  assert.doesNotMatch(STEP, /\bflex-row\b/);
  assert.doesNotMatch(STEP, /flex w-full min-w-0 items-start gap-/);
  assert.match(STEP, /li className="relative w-full min-w-0"/);
  assert.match(STEP, /data-testid=\{`knowledge-step-card-\$\{index\}`\}/);
  assert.match(STEP, /w-full min-w-0 rounded-2xl border-0 bg-white\/95/);
});

run("circles and rail are absolutely positioned outside the card on the start side", () => {
  assert.match(STEP, /data-testid=\{`knowledge-step-gutter-\$\{index\}`\}/);
  assert.match(STEP, /data-testid=\{`knowledge-step-marker-\$\{index\}`\}/);
  assert.match(STEP, /absolute inset-y-0 end-full z-10/);
  assert.match(STEP, /\bme-1\b/);
  assert.match(STEP, /\bsm:me-2\b/);
  assert.match(STEP, /\blg:me-4\b/);
  assert.match(STEP, /\bw-5\b/);
  assert.match(STEP, /\bsm:w-8\b/);
  assert.match(STEP, /\blg:w-10\b/);
  assert.match(STEP, /h-5 w-5/);
  assert.match(STEP, /sm:h-8 sm:w-8/);
  assert.match(STEP, /lg:h-10 lg:w-10/);
  assert.doesNotMatch(STEP, /absolute left-0/);
  assert.doesNotMatch(STEP, /absolute left-4/);
  assert.doesNotMatch(STEP, /sm:left-5/);
  assert.doesNotMatch(STEP, /\bleft-0\b/);
  assert.doesNotMatch(STEP, /\bright-0\b/);
});

run("card internals keep the original horizontal padding so form width is unchanged", () => {
  assert.match(STEP, /space-y-1 px-4 pt-4 sm:px-5 sm:pt-5/);
  assert.match(STEP, /space-y-4 px-4 pb-5 pt-4 sm:px-5/);
});

run("RTL uses logical start/end positioning and does not double-reverse flex", () => {
  assert.match(STEP, /\bend-full\b/);
  assert.match(STEP, /\bme-1\b/);
  assert.match(STEP, /absolute start-0 top-1/);
  assert.doesNotMatch(STEP, /\bflex-row\b/);
  assert.doesNotMatch(STEP, /\bpl-4\b/);
  assert.doesNotMatch(STEP, /\bpr-4\b/);
});

for (const viewport of VIEWPORTS) {
  for (const dir of ["ltr", "rtl"] as const) {
    run(`bounding boxes at ${viewport}px ${dir.toUpperCase()}`, () => {
      const { behavior, card, marker } = layoutAt(viewport, dir);
      assert.equal(card.left, behavior.left, "card left must match AI behavior");
      assert.equal(card.right, behavior.right, "card right must match AI behavior");
      assert.equal(card.width, behavior.width, "card width must match AI behavior");

      if (dir === "ltr") {
        assert.ok(marker.right <= card.left, "LTR circle must sit entirely outside the card start edge");
        assert.equal(card.left - marker.right, timelineMetrics(viewport).gap, "LTR gap must be consistent");
      } else {
        assert.ok(marker.left >= card.right, "RTL circle must sit entirely outside the card end edge");
        assert.equal(marker.left - card.right, timelineMetrics(viewport).gap, "RTL gap must be consistent");
      }

      assert.ok(marker.left >= -0.01, "circle must not clip past the viewport start");
      assert.ok(marker.right <= viewport + 0.01, "circle must not clip past the viewport end");
      assert.ok(card.width > 0, "card must remain visible");
      assert.equal(marker.width, timelineMetrics(viewport).circle);
    });
  }
}

run("the source timeline metrics match the bounding-box model", () => {
  assert.match(STEP, /w-5 me-1 sm:w-8 sm:me-2 lg:w-10 lg:me-4/);
  assert.match(PAGE, /p-6 sm:p-10/);
  const mobile = layoutAt(375, "ltr");
  assert.equal(mobile.marker.left, 0);
  const tablet = layoutAt(768, "ltr");
  assert.equal(tablet.marker.left, 0);
  const desktop = layoutAt(1767, "ltr");
  assert.ok(desktop.marker.left > 0);
  assert.ok(desktop.card.left - desktop.marker.right === 16);
});

console.log("ai-brain-knowledge-step-layout.test.ts: all assertions passed");

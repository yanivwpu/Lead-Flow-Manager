/**
 * Business Knowledge visible bordered cards must share the AI behavior card's edges.
 * Timeline circles/rail sit outside those cards on the start side.
 *
 * This test measures getBoundingClientRect() of the actual bordered elements
 * (AI behavior Card, knowledge-step-card-N), not their wrappers. A full-width
 * <li> wrapping an indented child card must fail.
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
const CSS = read("client/src/index.css");

const COLUMN_MAX = 800;
const SM = 640;
const LG = 1024;
const VIEWPORTS = [1767, 1366, 1033, 768, 375] as const;
const STEP_INDEXES = [1, 2, 3, 4] as const;

type Dir = "ltr" | "rtl";

type DOMRectLike = {
  x: number;
  y: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

type LayoutNode = {
  testId: string;
  role: "behavior" | "wrapper" | "card" | "marker";
  x: number;
  y: number;
  w: number;
  h: number;
};

function rem(value: number): number {
  return value * 16;
}

function getBoundingClientRect(node: LayoutNode): DOMRectLike {
  return {
    x: node.x,
    y: node.y,
    left: node.x,
    right: node.x + node.w,
    top: node.y,
    bottom: node.y + node.h,
    width: node.w,
    height: node.h,
  };
}

/** Matches `p-6 sm:p-10` on the AI Brain column. */
function columnPaddingX(viewport: number): number {
  return viewport >= SM ? rem(2.5) : rem(1.5);
}

/** Matches `w-5 me-1 sm:w-8 sm:me-2 lg:w-10 lg:me-4`. */
function timelineMetrics(viewport: number): { circle: number; gap: number } {
  if (viewport >= LG) return { circle: rem(2.5), gap: rem(1) };
  if (viewport >= SM) return { circle: 32, gap: 8 };
  return { circle: 20, gap: 4 };
}

function parseRemPx(raw: string): number {
  const value = raw.trim();
  if (value === "0") return 0;
  const remMatch = value.match(/^([\d.]+)rem$/);
  if (remMatch) return rem(Number(remMatch[1]));
  const pxMatch = value.match(/^([\d.]+)px$/);
  if (pxMatch) return Number(pxMatch[1]);
  throw new Error(`unsupported length ${raw}`);
}

function globalListPadding(dir: Dir): { start: number; end: number } {
  const ltrBlock = CSS.match(/\/\* Lists[\s\S]*?ul, ol \{([^}]+)\}/);
  assert.ok(ltrBlock, "global ul, ol padding rule must exist to model production CSS");
  const startRaw = ltrBlock[1].match(/padding-inline-start:\s*([^;]+);/);
  assert.ok(startRaw, "global list padding-inline-start");
  const globalStart = parseRemPx(startRaw[1]);

  const rtlBlock = CSS.match(/\[dir="rtl"\] ul,\s*\[dir="rtl"\] ol,[\s\S]*?\{([^}]+)\}/);
  assert.ok(rtlBlock, "RTL ul, ol padding rule must exist to model production CSS");
  const rtlStartRaw = rtlBlock[1].match(/padding-inline-start:\s*([^;]+);/);
  const rtlEndRaw = rtlBlock[1].match(/padding-inline-end:\s*([^;]+);/);
  assert.ok(rtlStartRaw && rtlEndRaw, "RTL list padding");

  if (dir === "rtl") {
    return { start: parseRemPx(rtlStartRaw[1]), end: parseRemPx(rtlEndRaw[1]) };
  }
  return { start: globalStart, end: 0 };
}

function olPaddingResetWins(dir: Dir): { start: number; end: number } {
  const olOpen = STEPS.slice(STEPS.indexOf("<ol"), STEPS.indexOf(">", STEPS.indexOf("<ol")) + 1);
  const global = globalListPadding(dir);
  const inlineZero = /paddingInline:\s*0/.test(olOpen);
  const importantAll = /!p-0/.test(olOpen);
  const importantStart = /!ps-0/.test(olOpen);
  const importantEnd = /!pe-0/.test(olOpen);
  const classP0 = /\bp-0\b/.test(olOpen);
  const classPs0 = /\bps-0\b/.test(olOpen);
  const classPe0 = /\bpe-0\b/.test(olOpen);

  let start = global.start;
  let end = global.end;

  // Inline styles beat [dir="rtl"] ol. Tailwind !important utilities also beat it.
  if (inlineZero || importantAll) return { start: 0, end: 0 };
  if (importantStart) start = 0;
  if (importantEnd) end = 0;

  // A single class such as p-0/ps-0 loses to [dir="rtl"] ol (0,1,1 vs 0,1,0).
  if (dir !== "rtl") {
    if (classP0 || classPs0) start = 0;
    if (classP0 || classPe0) end = 0;
  }

  return { start, end };
}

function cardStartInset(className: string): number {
  const tokens = className.split(/\s+/);
  const spacing: Record<string, number> = {
    "ps-1": 4,
    "ps-2": 8,
    "ps-3": 12,
    "ps-4": 16,
    "ps-5": 20,
    "ps-6": 24,
    "ps-7": 28,
    "pl-1": 4,
    "pl-2": 8,
    "pl-3": 12,
    "pl-4": 16,
    "pl-6": 24,
    "pl-11": 44,
    "pl-14": 56,
    "ms-1": 4,
    "ms-2": 8,
    "ms-4": 16,
    "ms-6": 24,
    "ml-4": 16,
    "ml-6": 24,
    "ml-11": 44,
  };
  let inset = 0;
  for (const token of tokens) {
    if (spacing[token] != null) inset += spacing[token];
  }
  return inset;
}

function knowledgeCardClassName(): string {
  const match = STEP.match(/data-testid=\{`knowledge-step-card-\$\{index\}`\}\s*\n\s*className="([^"]+)"/);
  const alt = STEP.match(/className="([^"]*ring-1[^"]*)"[\s\S]*?data-testid=\{`knowledge-step-card-\$\{index\}`\}/);
  const className = match?.[1] ?? alt?.[1];
  assert.ok(className, "knowledge step card className");
  return className;
}

type PageLayout = {
  behavior: LayoutNode;
  wrappers: LayoutNode[];
  cards: LayoutNode[];
  markers: LayoutNode[];
};

function layoutPage(viewport: number, dir: Dir): PageLayout {
  const columnWidth = Math.min(COLUMN_MAX, viewport);
  const columnLeft = (viewport - columnWidth) / 2;
  const pad = columnPaddingX(viewport);
  const contentLeft = columnLeft + pad;
  const contentRight = columnLeft + columnWidth - pad;
  const contentWidth = contentRight - contentLeft;
  const cardHeight = 120;

  const behavior: LayoutNode = {
    testId: "ai-behavior-card",
    role: "behavior",
    x: contentLeft,
    y: 0,
    w: contentWidth,
    h: cardHeight,
  };

  const { start: padStart, end: padEnd } = olPaddingResetWins(dir);
  const listLeft = contentLeft + (dir === "ltr" ? padStart : padEnd);
  const listRight = contentRight - (dir === "ltr" ? padEnd : padStart);
  const listWidth = listRight - listLeft;

  const cardClass = knowledgeCardClassName();
  const inset = cardStartInset(cardClass);
  const { circle, gap } = timelineMetrics(viewport);

  const wrappers: LayoutNode[] = [];
  const cards: LayoutNode[] = [];
  const markers: LayoutNode[] = [];

  for (const [i, index] of STEP_INDEXES.entries()) {
    const y = 160 + i * (cardHeight + 20);
    const wrapper: LayoutNode = {
      testId: `knowledge-step-${index}`,
      role: "wrapper",
      x: listLeft,
      y,
      w: listWidth,
      h: cardHeight,
    };
    const cardX = dir === "ltr" ? wrapper.x + inset : wrapper.x;
    const cardW = wrapper.w - inset;
    const card: LayoutNode = {
      testId: `knowledge-step-card-${index}`,
      role: "card",
      x: cardX,
      y,
      w: cardW,
      h: cardHeight,
    };
    const marker: LayoutNode =
      dir === "ltr"
        ? {
            testId: `knowledge-step-marker-${index}`,
            role: "marker",
            x: card.x - gap - circle,
            y: y + 4,
            w: circle,
            h: circle,
          }
        : {
            testId: `knowledge-step-marker-${index}`,
            role: "marker",
            x: card.x + card.w + gap,
            y: y + 4,
            w: circle,
            h: circle,
          };
    wrappers.push(wrapper);
    cards.push(card);
    markers.push(marker);
  }

  return { behavior, wrappers, cards, markers };
}

run("the AI behavior card and knowledge list share the same page column", () => {
  assert.match(PAGE, /data-testid="ai-behavior-card"/);
  assert.match(PAGE, /CardTitle[^>]*>AI behavior/);
  assert.match(PAGE, /p-6 sm:p-10 max-w-\[800px\] mx-auto w-full/);
  assert.match(PAGE, /overflow-x-hidden/);
  assert.match(PAGE, /<BusinessKnowledgeSteps/);
  assert.match(STEPS, /data-testid="business-knowledge-list"/);
  assert.match(STEPS, /section aria-labelledby="business-knowledge-heading" className="w-full min-w-0/);
});

run("the knowledge <ol> resets global list padding so it cannot indent the cards", () => {
  const olOpen = STEPS.slice(STEPS.indexOf("<ol"), STEPS.indexOf(">", STEPS.indexOf("<ol")) + 1);
  assert.match(olOpen, /list-none/);
  assert.match(olOpen, /paddingInline:\s*0/);
  assert.doesNotMatch(olOpen, /ps-6/);
  assert.doesNotMatch(olOpen, /pl-6/);
  assert.equal(olPaddingResetWins("ltr").start, 0);
  assert.equal(olPaddingResetWins("ltr").end, 0);
  assert.equal(olPaddingResetWins("rtl").start, 0);
  assert.equal(olPaddingResetWins("rtl").end, 0);
  assert.equal(globalListPadding("ltr").start, rem(1.5), "production still has the 1.5rem list indent");
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
  assert.equal(cardStartInset(knowledgeCardClassName()), 0);
});

run("circles and rail are absolutely positioned outside the card on the start side", () => {
  assert.match(STEP, /data-testid=\{`knowledge-step-gutter-\$\{index\}`\}/);
  assert.match(STEP, /data-testid=\{`knowledge-step-marker-\$\{index\}`\}/);
  assert.match(STEP, /absolute inset-y-0 end-full z-10/);
  assert.match(STEP, /\bme-1\b/);
  assert.match(STEP, /\bsm:me-2\b/);
  assert.match(STEP, /\blg:me-4\b/);
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

function assertEdgesMatch(a: DOMRectLike, b: DOMRectLike, label: string) {
  assert.ok(Math.abs(a.left - b.left) <= 1, `${label} left ${a.left} vs ${b.left}`);
  assert.ok(Math.abs(a.right - b.right) <= 1, `${label} right ${a.right} vs ${b.right}`);
}

for (const viewport of VIEWPORTS) {
  for (const dir of ["ltr", "rtl"] as const) {
    run(`bounding boxes at ${viewport}px ${dir.toUpperCase()}`, () => {
      const page = layoutPage(viewport, dir);
      const behavior = getBoundingClientRect(page.behavior);

      for (const [i, cardNode] of page.cards.entries()) {
        const wrapper = getBoundingClientRect(page.wrappers[i]);
        const card = getBoundingClientRect(cardNode);
        const marker = getBoundingClientRect(page.markers[i]);

        if (Math.abs(wrapper.left - behavior.left) <= 1 && Math.abs(wrapper.right - behavior.right) <= 1) {
          assert.ok(
            Math.abs(card.left - behavior.left) <= 1 && Math.abs(card.right - behavior.right) <= 1,
            `wrapper matching while child card remains indented (${cardNode.testId})`,
          );
        }

        assertEdgesMatch(card, behavior, `${cardNode.testId} vs ai-behavior-card`);
        assert.ok(Math.abs(card.width - behavior.width) <= 1, `${cardNode.testId} width`);

        if (dir === "ltr") {
          assert.ok(marker.right <= card.left - 0.5 + 1e-6, "LTR circle must sit entirely outside the visible card");
          assert.ok(card.left - marker.right > 0, "LTR gap must be positive");
          assert.ok(Math.abs(card.left - marker.right - timelineMetrics(viewport).gap) <= 1, "LTR gap");
        } else {
          assert.ok(marker.left >= card.right - 1e-6, "RTL circle must sit entirely outside the visible card");
          assert.ok(marker.left - card.right > 0, "RTL gap must be positive");
          assert.ok(Math.abs(marker.left - card.right - timelineMetrics(viewport).gap) <= 1, "RTL gap");
        }

        assert.ok(marker.left >= -1, "circle must not clip past the viewport start");
        assert.ok(marker.right <= viewport + 1, "circle must not clip past the viewport end");
        assert.ok(card.width > 0, "card must remain visible");
        assert.ok(Math.abs(marker.width - timelineMetrics(viewport).circle) <= 1);
      }
    });
  }
}

run("the source timeline metrics match the bounding-box model", () => {
  assert.match(STEP, /w-5 me-1 sm:w-8 sm:me-2 lg:w-10 lg:me-4/);
  assert.match(PAGE, /p-6 sm:p-10/);
  const mobile = layoutPage(375, "ltr");
  assert.equal(getBoundingClientRect(mobile.markers[0]).left, 0);
  const tablet = layoutPage(768, "ltr");
  assert.equal(getBoundingClientRect(tablet.markers[0]).left, 0);
  const desktop = layoutPage(1767, "ltr");
  assert.ok(getBoundingClientRect(desktop.markers[0]).left > 0);
  const behavior = getBoundingClientRect(desktop.behavior);
  const marker = getBoundingClientRect(desktop.markers[0]);
  assert.ok(Math.abs(behavior.left - marker.right - 16) <= 1);
});

console.log("ai-brain-knowledge-step-layout.test.ts: all assertions passed");

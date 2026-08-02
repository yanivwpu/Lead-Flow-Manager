/**
 * One workflow, one publish action, one vocabulary.
 *
 * The AI Brain page carried two knowledge experiences at once: the original scan-and-save
 * summary editor and the review-and-publish flow that replaced it. A merchant could save
 * through one and publish through the other, and the two disagreed. These checks are what
 * stop the second path from growing back, and they read the shipped source rather than a
 * rendered tree so they hold without a DOM.
 *
 * The V1 server surface is deliberately still here — consumers outside this page read the
 * prose column — so the boundary these tests draw is "not reachable from the UI", not
 * "deleted".
 *
 * Run: npx tsx tests/ai-brain-single-workflow.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const PAGE = "client/src/pages/AIBrain.tsx";
const STEPS = "client/src/components/aibrain/BusinessKnowledgeSteps.tsx";

const page = read(PAGE);
const steps = read(STEPS);
/** Everything a merchant can read or click on this page. */
const clientSurface = `${page}\n${steps}`;

// ---------------------------------------------------------------------------
// The legacy experience is unreachable
// ---------------------------------------------------------------------------

run("the page cannot call any V1 website-knowledge endpoint", () => {
  for (const endpoint of [
    "/api/ai/website-knowledge/scan",
    "/api/ai/website-knowledge/save",
    '"/api/ai/website-knowledge"',
  ]) {
    assert.ok(
      !clientSurface.includes(endpoint),
      `the UI still reaches ${endpoint}; that is a second way to change what AI knows`,
    );
  }
});

run("the scan-and-save summary editor is gone", () => {
  for (const gone of [
    "Save to AI Brain",
    "Save text changes",
    "Scan knowledge pages",
    "Rescan knowledge pages",
    "Generated knowledge preview",
    "textarea-website-knowledge-preview",
    "WK_FIELD_ROWS",
  ]) {
    assert.ok(!clientSurface.includes(gone), `"${gone}" is still part of the UI`);
  }
});

run("the fixed nine-slot URL form is gone in favour of one page list", () => {
  for (const slot of [
    "Homepage URL",
    "Product / Services URL",
    "Shipping policy URL",
    "Privacy policy URL",
  ]) {
    assert.ok(!clientSurface.includes(slot), `the ${slot} slot survived`);
  }
  assert.ok(steps.includes("Pages AI learns from"), "the single page list is missing");
});

// ---------------------------------------------------------------------------
// The workflow that remains
// ---------------------------------------------------------------------------

run("the three steps are present and in order", () => {
  const order = ["Teach AI", "Analyze knowledge", "Review what AI learned"];
  let cursor = -1;
  for (const title of order) {
    const at = steps.indexOf(`title="${title}"`);
    assert.ok(at > 0, `step "${title}" is missing`);
    assert.ok(at > cursor, `step "${title}" is out of order`);
    cursor = at;
  }
  for (const index of [1, 2, 3]) {
    assert.ok(steps.includes(`index={${index}}`), `step ${index} is not numbered`);
  }
});

run("exactly one control publishes knowledge", () => {
  const publishCalls = steps.match(/"POST", "\/api\/ai\/knowledge\/publish"/g) ?? [];
  assert.equal(publishCalls.length, 1, "there must be a single publish call site");

  const publishButtons = clientSurface.match(/data-testid="button-publish-knowledge"/g) ?? [];
  assert.equal(publishButtons.length, 1, "there must be a single publish button");
});

run("publish is offered only when it would apply something", () => {
  assert.ok(
    /disabled=\{publishableCount === 0 \|\| publishMutation\.isPending\}/.test(steps),
    "publish must be gated on what it can actually apply, not on drafts existing",
  );
  // Held-back drafts are the reason the two counts differ; both exclusions must be present.
  const derivation = steps.slice(steps.indexOf("const publishableCount"), steps.indexOf("heldBackOnly"));
  assert.ok(/fact\.state !== "draft"/.test(derivation));
  assert.ok(/changeType === "suggested"/.test(derivation));
  assert.ok(/conflictBlocked/.test(derivation));
});

run("an analysis that outlives the page is picked back up", () => {
  assert.ok(
    /setActiveJobId\(latest\.id\)/.test(steps),
    "a running job must be adopted on mount or its progress freezes",
  );
  assert.ok(
    /reportedJobs\.current\.has\(latest\.id\)/.test(steps),
    "an already-reported job must not be adopted again",
  );
});

run("an established workspace is never shown an empty review", () => {
  const routes = read("server/websiteKnowledge/knowledgeRoutes.ts");
  assert.ok(/backfilled,/.test(routes), "the sources response must report the adoption");
  assert.ok(
    /sourcesQuery\.data\?\.backfilled[\s\S]{0,200}invalidateQueries\(\{ queryKey: FACTS_KEY \}\)/.test(steps),
    "the client must re-ask for knowledge that was adopted after its first request",
  );
});

run("adding a page that is already listed says so", () => {
  const routes = read("server/websiteKnowledge/knowledgeRoutes.ts");
  assert.ok(/created: !alreadyListed/.test(routes));
  assert.ok(/data\.created === false/.test(steps), "the client must surface the no-op");
});

run("nothing but publishing changes what the assistant uses", () => {
  // Discarding and removing are subtractive; neither may be presented as a save.
  assert.ok(steps.includes("Discard draft changes"));
  assert.ok(
    !/data-testid="button-[a-z-]*save[a-z-]*"/.test(clientSurface),
    "a save button reappeared alongside publish",
  );
});

// ---------------------------------------------------------------------------
// The review reads at a glance
// ---------------------------------------------------------------------------

run("a replaced value stays folded away until asked for", () => {
  const row = steps.slice(steps.indexOf("function FactRow"), steps.indexOf("function SectionBlock"));
  assert.ok(/useState\(false\)/.test(row), "the disclosure must start closed");
  assert.ok(/Show changes/.test(row) && /Hide changes/.test(row), "the disclosure has no control");
  // The old value may only appear under the toggle, never unconditionally.
  const previousAt = row.indexOf("Currently published:");
  assert.ok(previousAt > 0, "the previous value must still be inspectable");
  assert.ok(
    row.lastIndexOf("showChanges &&", previousAt) > row.indexOf("Show changes") - 400,
    "the previous value is not behind the disclosure",
  );
  assert.ok(
    !/line-through[^]{0,80}\{fact\.previousSummary\}/.test(row.slice(0, previousAt - 200)),
    "a crossed-out paragraph is still rendered by default",
  );
});

run("a pricing plan is laid out in parts, not re-worded", () => {
  const review = read("shared/knowledgeReview.ts");
  const builder = review.slice(review.indexOf("function factDisplay"), review.indexOf("export function toKnowledgeFactView"));
  assert.ok(/factType !== "pricing_plan"/.test(builder), "only pricing plans get the layout");
  assert.ok(/title: d\.name/.test(builder), "the plan name must be the stored name");
  assert.ok(/formatFactMoney\(d\.price/.test(builder), "the price must use the shared formatter");
  assert.ok(/bullets: \[\.\.\.d\.benefits\]/.test(builder), "benefits must be passed through as stored");
  // Nothing in the builder may compose new prose.
  assert.ok(!/`\$\{/.test(builder), "the display must not build sentences out of a fact");

  const row = steps.slice(steps.indexOf("function FactRow"), steps.indexOf("function SectionBlock"));
  assert.ok(/fact\.display\.title/.test(row) && /fact\.display\.headline/.test(row));
  assert.ok(/fact\.display\.bullets\.map/.test(row), "benefits must render as a list");
});

run("a source is named by what the page is, not by its title tag", () => {
  assert.ok(/Source: \{sourceLabel\}/.test(steps), "the source needs a plain label");
  assert.ok(!/fact\.sourceTitle/.test(steps), "the raw page title must not be shown");
  const resolver = steps.slice(steps.indexOf("function shortSourceLabel"), steps.indexOf("// ---"));
  assert.ok(/PAGE_TYPE_LABELS\[source\.detectedType\]/.test(resolver), "the detected page type is unused");
  assert.ok(/custom\.length <= 32/.test(resolver), "a long label must not be used verbatim");
  assert.ok(/urlKey\(url\)/.test(resolver), "there is no short-path fallback");
  assert.ok(/href=\{fact\.sourceUrl\}/.test(steps), "the source must stay clickable");
});

run("a large review opens one section, not all of them", () => {
  assert.ok(
    /defaultValue=\{firstPendingSectionId \? \[firstPendingSectionId\] : \[\]\}/.test(steps),
    "every section with changes still opens at once",
  );
  assert.ok(/\.find\(/.test(steps.slice(steps.indexOf("firstPendingSectionId = useMemo"))));
  // Counts stay legible per section rather than collapsing into one number.
  const section = steps.slice(steps.indexOf("function SectionBlock"), steps.indexOf("export function BusinessKnowledgeSteps"));
  for (const part of ["new", "changed", "no longer on page", "suggested"]) {
    assert.ok(section.includes(`${part}\``) || section.includes(`${part}"`), `the ${part} count is missing`);
  }
});

run("a published workspace is offered one way to try it", () => {
  assert.ok(steps.includes("Test AI knowledge"), "there is no way to try the published knowledge");
  assert.ok(/publishMutation\.isSuccess &&/.test(steps), "the offer must follow a successful publish");
  assert.ok(/href="\/app\/inbox"/.test(steps), "the test action must reach an existing surface");
  // Nothing here may open a second reply path of its own.
  assert.ok(!steps.includes("/api/ai/suggest-reply"), "the review step must not call the reply API");
});

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

run("the UI never names the machinery behind the workflow", () => {
  const banned = [
    "structured facts",
    "Structured business facts",
    "legacy summary",
    "Legacy summary",
    "websiteKnowledgeSummary",
    "knowledge v2",
    "Knowledge V2",
  ];
  for (const phrase of banned) {
    assert.ok(!clientSurface.includes(phrase), `"${phrase}" is exposed to the user`);
  }
});

run("no shared label leaks the storage generation into the review step", () => {
  // These strings are rendered verbatim next to every reviewed value.
  const labels = read("shared/businessKnowledgeFacts.ts");
  const block = labels.slice(
    labels.indexOf("const PRECEDENCE_LABELS"),
    labels.indexOf("export function describeFactPrecedence"),
  );
  assert.ok(block.length > 0, "PRECEDENCE_LABELS not found");
  for (const phrase of ["Legacy summary", "Migrated source"]) {
    assert.ok(!block.includes(phrase), `"${phrase}" would render in the review step`);
  }
});

// ---------------------------------------------------------------------------
// V1 stays alive underneath
// ---------------------------------------------------------------------------

run("the V1 server surface is untouched for consumers that have not migrated", () => {
  const routes = read("server/routes.ts");
  for (const endpoint of [
    '"/api/ai/website-knowledge/scan"',
    '"/api/ai/website-knowledge/save"',
    '"/api/ai/website-knowledge"',
  ]) {
    assert.ok(routes.includes(endpoint), `${endpoint} was removed from the server`);
  }
});

run("publishing still refreshes the prose column the old consumers read", () => {
  const publish = read("server/websiteKnowledge/publishFacts.ts");
  assert.ok(
    /rebuildLegacySummary/.test(publish),
    "publish must keep regenerating websiteKnowledgeSummary",
  );
  assert.ok(
    /websiteKnowledgeSummary: summary/.test(publish),
    "the regenerated summary must be written back",
  );
});

run("the page still refreshes every reader after a publish", () => {
  for (const key of [
    '"/api/ai/business-knowledge"',
    '"/api/ai/workspace-intelligence"',
  ]) {
    assert.ok(steps.includes(key), `publish does not invalidate ${key}`);
  }
});

console.log("\nAll AI Brain single-workflow tests passed.");

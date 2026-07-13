/**
 * Fixed inbox conversation row layout contract.
 * Run: npx tsx tests/inbox-conversation-row-layout.test.ts
 */
import assert from "node:assert/strict";
import {
  INBOX_ROW_CHIP,
  INBOX_ROW_LINE2,
  INBOX_ROW_LINE3,
  INBOX_ROW_OUTER_BASE,
  inboxConversationRowChromeClassName,
  inboxConversationRowLayoutContract,
} from "../client/src/lib/inboxConversationRow";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const variants = [
  { name: "normal", input: { selected: false } },
  { name: "selected", input: { selected: true } },
  { name: "unread (chrome same as normal)", input: { selected: false } },
  { name: "selected + unread", input: { selected: true } },
  { name: "Needs Reply + second tag (chrome)", input: { selected: false } },
  { name: "email row (chrome)", input: { selected: false } },
] as const;

run("all row variants share identical outer height/padding/border-width contract", () => {
  const contracts = variants.map((v) => ({
    name: v.name,
    ...inboxConversationRowLayoutContract(v.input),
  }));

  const base = contracts[0];
  for (const c of contracts) {
    assert.equal(c.heightClass, base.heightClass, `${c.name} height`);
    assert.equal(c.paddingClass, base.paddingClass, `${c.name} padding`);
    assert.equal(c.borderWidthClass, base.borderWidthClass, `${c.name} border width`);
    assert.equal(c.inner, base.inner, `${c.name} inner`);
    assert.equal(c.body, base.body, `${c.name} body`);
    assert.equal(c.line1, base.line1, `${c.name} line1`);
    assert.equal(c.line2, base.line2, `${c.name} line2`);
    assert.equal(c.line3, base.line3, `${c.name} line3`);
    assert.match(c.outer, /h-\[75px\]/, `${c.name} fixed height`);
    assert.match(c.outer, /px-3 py-1\.5/, `${c.name} padding`);
    assert.match(c.outer, /border-l-2/, `${c.name} border-l-2`);
    assert.match(c.outer, /overflow-hidden/, `${c.name} overflow`);
    assert.doesNotMatch(c.outer, /\bring-1\b/, `${c.name} no ring`);
    assert.doesNotMatch(c.outer, /\bshadow-sm\b/, `${c.name} no outer shadow`);
    assert.doesNotMatch(c.outer, /\bflex-wrap\b/, `${c.name} no wrap on outer`);
    assert.doesNotMatch(c.line3, /\bflex-wrap\b/, `${c.name} chips never wrap`);
  }
});

run("selected only changes background/accent color, not box model", () => {
  const normal = inboxConversationRowChromeClassName({ selected: false });
  const selected = inboxConversationRowChromeClassName({ selected: true });
  assert.match(INBOX_ROW_OUTER_BASE, /h-\[75px\]/);
  assert.match(normal, /h-\[75px\]/);
  assert.match(selected, /h-\[75px\]/);
  assert.match(normal, /px-3 py-1\.5/);
  assert.match(selected, /px-3 py-1\.5/);
  assert.match(selected, /bg-white/);
  assert.match(selected, /border-l-gray-300|!border-l-gray-300/);
  // Selected must not introduce extra vertical padding classes
  assert.doesNotMatch(selected, /\bpy-3\b/);
  assert.doesNotMatch(selected, /\bpy-2\b/);
  assert.doesNotMatch(selected, /\bp-3\b/);
  assert.doesNotMatch(selected, /\bring-/);
});

run("preview and chip lines enforce single-line clip", () => {
  assert.match(INBOX_ROW_LINE2, /overflow-hidden/);
  assert.match(INBOX_ROW_LINE2, /h-4|max-h-\[16px\]/);
  assert.match(INBOX_ROW_LINE3, /overflow-hidden/);
  assert.match(INBOX_ROW_LINE3, /whitespace-nowrap/);
  assert.doesNotMatch(INBOX_ROW_LINE3, /flex-wrap/);
  assert.match(INBOX_ROW_CHIP, /h-4|max-h-4/);
  assert.match(INBOX_ROW_CHIP, /whitespace-nowrap/);
  assert.match(INBOX_ROW_CHIP, /leading-none/);
});

console.log("\nAll inbox conversation row layout tests passed.");

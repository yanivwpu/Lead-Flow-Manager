/**
 * Unified Inbox email row trash hover affordance.
 * Run: npx tsx tests/inbox-email-trash-hover.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INBOX_ROW_LINE1, INBOX_ROW_OUTER_BASE } from "../client/src/lib/inboxConversationRow";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const inboxSrc = readFileSync(join(process.cwd(), "client/src/pages/UnifiedInbox.tsx"), "utf8");

run("email rows use named group for hover trash", () => {
  assert.ok(inboxSrc.includes('isEmailRow && "group/email-row"'));
  assert.ok(inboxSrc.includes("group-hover/email-row:opacity-100"));
  assert.ok(inboxSrc.includes("group-hover/email-row:pointer-events-auto"));
});

run("trash control sits in fixed LINE1 (does not grow row)", () => {
  assert.match(INBOX_ROW_OUTER_BASE, /h-\[75px\]/);
  assert.match(INBOX_ROW_LINE1, /h-5|max-h-\[20px\]/);
  assert.ok(inboxSrc.includes("button-trash-email-row-"));
  assert.ok(inboxSrc.includes("Move latest email to Trash"));
  // In-flow LINE1 control — not an absolute overlay clipped by overflow-hidden.
  assert.ok(!inboxSrc.includes("absolute bottom-0 right-0"));
  assert.ok(inboxSrc.includes("inline-flex h-4 w-4 shrink-0"));
});

run("trash requires email lastEmailMessageId and uses existing trash-email API", () => {
  assert.ok(inboxSrc.includes("item.lastEmailMessageId"));
  assert.ok(inboxSrc.includes("/api/messages/${encodeURIComponent(vars.messageId)}/trash-email"));
  assert.ok(inboxSrc.includes('source: "list"'));
});

run("row height contract unchanged with trash affordance", () => {
  assert.match(INBOX_ROW_OUTER_BASE, /overflow-hidden/);
  assert.doesNotMatch(INBOX_ROW_OUTER_BASE, /\bpy-3\b/);
});

console.log("\nAll inbox-email-trash-hover tests passed.");

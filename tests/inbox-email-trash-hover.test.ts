/**
 * Unified Inbox email row trash — rendered action container contract.
 * Run: npx tsx tests/inbox-email-trash-hover.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INBOX_ROW_BODY,
  INBOX_ROW_EMAIL_ACTIONS,
  INBOX_ROW_EMAIL_TRASH_BUTTON,
  INBOX_ROW_INNER,
  INBOX_ROW_LINE1,
  INBOX_ROW_OUTER_BASE,
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

const inboxSrc = readFileSync(join(process.cwd(), "client/src/pages/UnifiedInbox.tsx"), "utf8");

run("email actions container is a dedicated layout constant outside BODY overflow", () => {
  assert.match(INBOX_ROW_EMAIL_ACTIONS, /z-20/);
  assert.match(INBOX_ROW_EMAIL_ACTIONS, /w-4/);
  assert.match(INBOX_ROW_EMAIL_ACTIONS, /shrink-0/);
  assert.match(INBOX_ROW_EMAIL_ACTIONS, /overflow-visible/);
  assert.match(INBOX_ROW_BODY, /overflow-hidden/);
  assert.match(INBOX_ROW_LINE1, /overflow-hidden/);
  // Action slot must not live inside BODY's overflow-hidden class string.
  assert.notEqual(INBOX_ROW_EMAIL_ACTIONS, INBOX_ROW_BODY);
  assert.doesNotMatch(INBOX_ROW_EMAIL_ACTIONS, /overflow-hidden/);
});

run("trash button uses plain group-hover (production-safe), reserved opacity slot", () => {
  assert.match(INBOX_ROW_EMAIL_TRASH_BUTTON, /opacity-0/);
  assert.match(INBOX_ROW_EMAIL_TRASH_BUTTON, /group-hover:opacity-100/);
  assert.match(INBOX_ROW_EMAIL_TRASH_BUTTON, /group-hover:pointer-events-auto/);
  assert.match(INBOX_ROW_EMAIL_TRASH_BUTTON, /pointer-events-none/);
  assert.doesNotMatch(INBOX_ROW_EMAIL_TRASH_BUTTON, /group-hover\/email-row/);
});

run("UnifiedInbox renders trash inside inbox-row-email-actions, not LINE1", () => {
  assert.ok(inboxSrc.includes("INBOX_ROW_EMAIL_ACTIONS"));
  assert.ok(inboxSrc.includes("inbox-row-email-actions-"));
  assert.ok(inboxSrc.includes("button-trash-email-row-"));
  assert.ok(inboxSrc.includes("INBOX_ROW_EMAIL_TRASH_BUTTON"));

  const actionsIdx = inboxSrc.indexOf("inbox-row-email-actions-");
  const trashIdx = inboxSrc.indexOf("button-trash-email-row-");
  const bodyClosePattern = "INBOX_ROW_EMAIL_ACTIONS";
  // Actions block appears after BODY content in the row JSX.
  assert.ok(actionsIdx > 0);
  assert.ok(trashIdx > actionsIdx, "trash button must be inside/after the email-actions container");

  // Must not use the previous clipped placements.
  assert.ok(!inboxSrc.includes("absolute bottom-0 right-0"));
  assert.ok(!inboxSrc.includes("group/email-row"));
  assert.ok(!inboxSrc.includes("group-hover/email-row"));

  // Email rows use plain Tailwind `group` for hover.
  assert.ok(inboxSrc.includes('isEmailRow && "group"'));
});

run("click handlers stop row navigation and call existing trash-email API", () => {
  assert.ok(inboxSrc.includes('source: "list"'));
  assert.ok(inboxSrc.includes("/api/messages/${encodeURIComponent(vars.messageId)}/trash-email"));
  // Action container stops propagation.
  const actionsBlock = inboxSrc.slice(
    inboxSrc.indexOf("inbox-row-email-actions-"),
    inboxSrc.indexOf("inbox-row-email-actions-") + 900,
  );
  assert.ok(actionsBlock.includes("stopPropagation"));
});

run("fixed row height unchanged with email action column", () => {
  assert.match(INBOX_ROW_OUTER_BASE, /h-\[75px\]/);
  const contract = inboxConversationRowLayoutContract({ selected: false });
  assert.equal(contract.heightClass, "h-[75px]");
  assert.match(contract.outer, /h-\[75px\]/);
  assert.equal(contract.inner, INBOX_ROW_INNER);
});

console.log("\nAll inbox-email-trash-hover tests passed.");

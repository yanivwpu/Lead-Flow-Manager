/**
 * Unified Inbox email row — absolute top-right time + bottom-right trash.
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
  INBOX_ROW_TIME,
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

run("row outer is relative positioning root; body reserves right pad", () => {
  assert.match(INBOX_ROW_OUTER_BASE, /relative/);
  assert.match(INBOX_ROW_OUTER_BASE, /h-\[75px\]/);
  assert.match(INBOX_ROW_BODY, /pr-14/);
  assert.match(INBOX_ROW_BODY, /overflow-hidden/);
});

run("timestamp is absolute top-right (not LINE1 flex sibling)", () => {
  assert.match(INBOX_ROW_TIME, /absolute/);
  assert.match(INBOX_ROW_TIME, /top-1\.5/);
  assert.match(INBOX_ROW_TIME, /right-3/);
  assert.doesNotMatch(INBOX_ROW_TIME, /shrink-0/);
});

run("trash is absolute bottom-right with group-hover opacity", () => {
  assert.match(INBOX_ROW_EMAIL_TRASH_BUTTON, /absolute/);
  assert.match(INBOX_ROW_EMAIL_TRASH_BUTTON, /bottom-1\.5/);
  assert.match(INBOX_ROW_EMAIL_TRASH_BUTTON, /right-3/);
  assert.match(INBOX_ROW_EMAIL_TRASH_BUTTON, /opacity-0/);
  assert.match(INBOX_ROW_EMAIL_TRASH_BUTTON, /group-hover:opacity-100/);
  assert.match(INBOX_ROW_EMAIL_TRASH_BUTTON, /group-hover:pointer-events-auto/);
  assert.match(INBOX_ROW_EMAIL_TRASH_BUTTON, /pointer-events-none/);
  assert.doesNotMatch(INBOX_ROW_EMAIL_TRASH_BUTTON, /group-hover\/email-row/);
  assert.doesNotMatch(INBOX_ROW_EMAIL_ACTIONS, /self-start/);
  const cssSrc = readFileSync(join(process.cwd(), "client/src/index.css"), "utf8");
  assert.ok(cssSrc.includes('[data-inbox-email-row="true"]:hover [data-inbox-email-trash="true"]'));
});

run("UnifiedInbox: time outside LINE1; trash absolute; no flex sibling column", () => {
  assert.ok(inboxSrc.includes("INBOX_ROW_TIME"));
  assert.ok(inboxSrc.includes("inbox-row-time-"));
  assert.ok(inboxSrc.includes("button-trash-email-row-"));
  assert.ok(inboxSrc.includes("INBOX_ROW_EMAIL_TRASH_BUTTON"));
  assert.ok(inboxSrc.includes('isEmailRow && "group"'));

  // Timestamp must not be rendered inside LINE1 block before LINE2.
  const line1Open = inboxSrc.indexOf("INBOX_ROW_LINE1");
  const line2Marker = inboxSrc.indexOf("INBOX_ROW_LINE2", line1Open);
  const timeInLine1Region = inboxSrc.slice(line1Open, line2Marker);
  assert.ok(line1Open > 0 && line2Marker > line1Open);
  assert.ok(!timeInLine1Region.includes("inbox-row-time-"), "timestamp must not live inside LINE1");
  assert.ok(!timeInLine1Region.includes("INBOX_ROW_TIME"), "INBOX_ROW_TIME must not be inside LINE1");
  assert.ok(!inboxSrc.includes("127.0.0.1:7693"));
  assert.ok(!inboxSrc.includes("#region agent log"));

  // Absolute time + trash are siblings of INNER, not flex column after BODY.
  assert.ok(inboxSrc.includes("INBOX_ROW_EMAIL_TRASH_BUTTON"));
  assert.ok(!inboxSrc.includes("absolute bottom-0 right-0"));
  assert.ok(!inboxSrc.includes("group/email-row"));
});

run("click handlers stopPropagation and trash immediately (no confirm dialog)", () => {
  assert.ok(inboxSrc.includes('source: "list"') || inboxSrc.includes('"list"'));
  assert.ok(inboxSrc.includes("requestEmailTrash"));
  assert.ok(inboxSrc.includes("/api/messages/${encodeURIComponent(vars.messageId)}/trash-email"));
  assert.ok(inboxSrc.includes("stopPropagation"));
  assert.ok(!inboxSrc.includes("dialog-delete-email"));
  assert.ok(!inboxSrc.includes("button-confirm-delete-email"));
  assert.ok(!inboxSrc.includes("setEmailTrashTarget"));
});

run("fixed row height unchanged", () => {
  assert.match(INBOX_ROW_OUTER_BASE, /h-\[75px\]/);
  const contract = inboxConversationRowLayoutContract({ selected: false });
  assert.equal(contract.heightClass, "h-[75px]");
  assert.match(contract.outer, /h-\[75px\]/);
  assert.match(contract.outer, /relative/);
  assert.equal(contract.inner, INBOX_ROW_INNER);
  assert.match(contract.body, /pr-14/);
  assert.match(INBOX_ROW_LINE1, /overflow-hidden/);
});

console.log("\nAll inbox-email-trash-hover tests passed.");

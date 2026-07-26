/**
 * Inbox email trash id resolution + Unified Inbox wiring.
 * Run: npx tsx tests/inbox-email-last-message-id.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveLastEmailMessageIdForInboxRow } from "../shared/inboxEmailTrash";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("resolveLastEmailMessageId prefers provider-backed message", () => {
  assert.equal(resolveLastEmailMessageIdForInboxRow([]), null);
  assert.equal(
    resolveLastEmailMessageIdForInboxRow([{ id: "local-1", externalMessageId: null }]),
    "local-1",
  );
  assert.equal(
    resolveLastEmailMessageIdForInboxRow([
      { id: "local-no-ext", externalMessageId: "" },
      { id: "local-with-ext", externalMessageId: "gmail-abc" },
    ]),
    "local-with-ext",
  );
});

const storageSrc = readFileSync(join(process.cwd(), "server/storage.ts"), "utf8");
const inboxSrc = readFileSync(join(process.cwd(), "client/src/pages/UnifiedInbox.tsx"), "utf8");
const cssSrc = readFileSync(join(process.cwd(), "client/src/index.css"), "utf8");

run("getUnifiedInbox maps lastEmailMessageId via resolver", () => {
  assert.ok(storageSrc.includes("resolveLastEmailMessageIdForInboxRow"));
  assert.ok(storageSrc.includes("lastEmailMessageId"));
  assert.ok(storageSrc.includes("externalMessageId: messages.externalMessageId"));
  assert.ok(!storageSrc.includes("debug-4bac18.log"));
  assert.ok(!storageSrc.includes("#region agent log"));
});

run("email row with lastEmailMessageId renders trash; non-email does not", () => {
  assert.ok(inboxSrc.includes("isEmailRow && item.lastEmailMessageId"));
  assert.ok(inboxSrc.includes("button-trash-email-row-"));
  assert.ok(inboxSrc.includes('data-inbox-email-trash="true"'));
  assert.ok(inboxSrc.includes('data-inbox-email-row={isEmailRow ? "true" : undefined}'));
  assert.ok(!inboxSrc.includes("data-has-last-email-msg-id"));
  assert.ok(!inboxSrc.includes("127.0.0.1:7693"));
  assert.ok(!inboxSrc.includes("#region agent log"));
  assert.ok(inboxSrc.includes("/api/messages/${encodeURIComponent(vars.messageId)}/trash-email"));
});

run("date remains absolute top-right; trash absolute bottom-right", () => {
  const rowLib = readFileSync(
    join(process.cwd(), "client/src/lib/inboxConversationRow.ts"),
    "utf8",
  );
  assert.match(rowLib, /INBOX_ROW_TIME[\s\S]*absolute[\s\S]*top-1\.5[\s\S]*right-3/);
  assert.match(rowLib, /INBOX_ROW_EMAIL_TRASH_BUTTON[\s\S]*absolute[\s\S]*bottom-1\.5[\s\S]*right-3/);
  assert.ok(inboxSrc.includes("INBOX_ROW_TIME"));
  // Timestamp must not live inside LINE1 content before LINE2.
  const line1Marker = inboxSrc.indexOf("INBOX_ROW_LINE1");
  const line2Marker = inboxSrc.indexOf("INBOX_ROW_LINE2", line1Marker);
  assert.ok(line1Marker > 0 && line2Marker > line1Marker);
  assert.ok(!inboxSrc.slice(line1Marker, line2Marker).includes("INBOX_ROW_TIME"));
});

run("CSS row-hover makes trash visible without relying only on group-hover", () => {
  assert.ok(cssSrc.includes('[data-inbox-email-row="true"]:hover [data-inbox-email-trash="true"]'));
  assert.ok(cssSrc.includes("opacity: 1 !important"));
});

console.log("\nAll inbox-email-last-message-id tests passed.");

/**
 * Email trash → Inbox selection cleanup (no Gmail).
 * Run: npx tsx --test tests/email-trash-selection-cleanup.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideEmailTrashSelectionCleanup } from "../client/src/lib/emailTrashSelectionCleanup";
import fs from "node:fs";
import path from "node:path";

describe("decideEmailTrashSelectionCleanup", () => {
  it("message-only trash does not force inbox root navigation", () => {
    const d = decideEmailTrashSelectionCleanup({
      conversationDeleted: false,
      deletedConversationId: "conv-1",
      selectedConversationId: "conv-1",
    });
    assert.equal(d.shouldNavigateToInboxRoot, false);
    assert.equal(d.shouldClearSticky, false);
    assert.equal(d.reason, "message_only");
  });

  it("conversationDeleted + matching selectedConversationId navigates and clears sticky", () => {
    const d = decideEmailTrashSelectionCleanup({
      conversationDeleted: true,
      deletedConversationId: "conv-1",
      selectedConversationId: "conv-1",
      stickyConversationId: "conv-1",
    });
    assert.equal(d.shouldNavigateToInboxRoot, true);
    assert.equal(d.shouldClearSticky, true);
    assert.equal(d.reason, "conversation_deleted_selected_match");
  });

  it("conversationDeleted + mismatched selectedConversationId still navigates (stale URL hole)", () => {
    const d = decideEmailTrashSelectionCleanup({
      conversationDeleted: true,
      deletedConversationId: "conv-deleted",
      selectedConversationId: "conv-other",
      selectedContactId: "contact-1",
    });
    assert.equal(d.shouldNavigateToInboxRoot, true);
    assert.equal(d.shouldClearSticky, true);
    assert.equal(d.reason, "conversation_deleted_selected_mismatch");
  });

  it("conversationDeleted + null selectedConversationId still navigates (production white-screen hole)", () => {
    const d = decideEmailTrashSelectionCleanup({
      conversationDeleted: true,
      deletedConversationId: "conv-deleted",
      selectedConversationId: null,
      stickyConversationId: "conv-deleted",
      selectedContactId: "contact-1",
    });
    assert.equal(d.shouldNavigateToInboxRoot, true);
    assert.equal(d.shouldClearSticky, true);
    assert.equal(d.reason, "conversation_deleted_sticky_match");
  });

  it("conversationDeleted with no selection still navigates to clear contact route", () => {
    const d = decideEmailTrashSelectionCleanup({
      conversationDeleted: true,
      deletedConversationId: "conv-deleted",
      selectedConversationId: null,
      stickyConversationId: null,
      selectedContactId: "contact-1",
    });
    assert.equal(d.shouldNavigateToInboxRoot, true);
    assert.equal(d.shouldClearSticky, true);
    assert.equal(d.reason, "conversation_deleted_selected_null");
  });
});

describe("UnifiedInbox wires cleanup helper", () => {
  it("trash onSuccess uses decideEmailTrashSelectionCleanup and navigates on conversationDeleted", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "client/src/pages/UnifiedInbox.tsx"),
      "utf8",
    );
    assert.match(src, /decideEmailTrashSelectionCleanup/);
    assert.match(src, /shouldNavigateToInboxRoot/);
    // Must not keep the old match-only navigate gate as the sole path.
    assert.doesNotMatch(
      src,
      /if\s*\(\s*selectedConversationId\s*===\s*data\.conversationId\s*\)\s*\{\s*[\s\S]*?setLocation\("\/app\/inbox"\)/,
    );
  });
});

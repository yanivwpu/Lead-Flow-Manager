/**
 * Channel-aware Inbox conversation scroll: Email opens at top, chat pins to bottom.
 * Run: npx tsx --test tests/inbox-conversation-scroll.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { COMPOSER_CHAT_CHANNELS } from "../shared/composerKeyboard";
import {
  inboxOpenScrollAction,
  inboxShouldFollowNewMessagesToBottom,
  inboxShouldFollowResizeToBottom,
  inboxShouldPinOnOpen,
  inboxShouldTrackNearBottomPin,
  inboxThreadScrollKey,
  resolveInboxScrollMode,
} from "../client/src/lib/inboxConversationScroll";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("scroll mode by channel", () => {
  it("Email uses document-top; chat channels pin to bottom", () => {
    assert.equal(resolveInboxScrollMode("email"), "email-document-top");
    assert.equal(resolveInboxScrollMode("EMAIL"), "email-document-top");
    for (const channel of COMPOSER_CHAT_CHANNELS) {
      assert.equal(resolveInboxScrollMode(channel), "chat-pin-bottom", channel);
    }
    assert.equal(resolveInboxScrollMode("whatsapp"), "chat-pin-bottom");
  });
});

describe("Email initial open is top", () => {
  const email = resolveInboxScrollMode("email");

  it("selecting Email opens at scrollTop 0 (top action, pin false)", () => {
    assert.equal(inboxOpenScrollAction(email), "top");
    assert.equal(inboxShouldPinOnOpen(email), false);
  });

  it("same contact + different conversation ids are distinct open keys", () => {
    const contactId = "contact-1";
    const a = inboxThreadScrollKey({ contactId, conversationId: "email-thread-a" });
    const b = inboxThreadScrollKey({ contactId, conversationId: "email-thread-b" });
    assert.notEqual(a, b);
    assert.equal(
      inboxThreadScrollKey({ contactId, conversationId: "email-thread-a" }),
      a,
    );
    assert.equal(inboxOpenScrollAction(email), "top");
  });

  it("Email never follows resize or new messages to bottom (user scroll preserved)", () => {
    assert.equal(
      inboxShouldFollowResizeToBottom(email, { shouldPin: true, justSent: true }),
      false,
    );
    assert.equal(
      inboxShouldFollowNewMessagesToBottom(email, { shouldPin: true, justSent: true }),
      false,
    );
    assert.equal(inboxShouldTrackNearBottomPin(email), false);
  });
});

describe("Chat pin-to-bottom unchanged", () => {
  const chat = resolveInboxScrollMode("whatsapp");

  it("WhatsApp/chat still opens/pins at bottom", () => {
    assert.equal(inboxOpenScrollAction(chat), "bottom");
    assert.equal(inboxShouldPinOnOpen(chat), true);
  });

  it("chat ResizeObserver still maintains bottom when pinned or just sent", () => {
    assert.equal(
      inboxShouldFollowResizeToBottom(chat, { shouldPin: true, justSent: false }),
      true,
    );
    assert.equal(
      inboxShouldFollowResizeToBottom(chat, { shouldPin: false, justSent: true }),
      true,
    );
    assert.equal(
      inboxShouldFollowResizeToBottom(chat, { shouldPin: false, justSent: false }),
      false,
    );
  });

  it("chat shouldPin / new-message follow unchanged", () => {
    assert.equal(inboxShouldTrackNearBottomPin(chat), true);
    assert.equal(
      inboxShouldFollowNewMessagesToBottom(chat, { shouldPin: true, justSent: false }),
      true,
    );
    assert.equal(
      inboxShouldFollowNewMessagesToBottom(chat, { shouldPin: false, justSent: false }),
      false,
    );
  });
});

describe("UnifiedInbox wiring", () => {
  it("Email open uses scrollToTop / scrollTop 0 and gates scrollToBottom", () => {
    const inbox = read("client/src/pages/UnifiedInbox.tsx");
    assert.match(inbox, /resolveInboxScrollMode/);
    assert.match(inbox, /inboxThreadScrollKey/);
    assert.match(inbox, /selectedConversationId \|\| activeConversationId/);
    assert.match(inbox, /scrollToTop/);
    assert.match(inbox, /container\.scrollTop = 0/);
    assert.match(inbox, /if \(inboxScrollModeRef\.current === "email-document-top"\) return/);
    assert.match(inbox, /inboxShouldFollowResizeToBottom/);
    assert.match(inbox, /inboxShouldFollowNewMessagesToBottom/);
    assert.doesNotMatch(inbox, /127\.0\.0\.1:7693/);
    assert.doesNotMatch(inbox, /#region agent log/);
  });

  it("Email does not call messagesEndRef.scrollIntoView unless chat pin path", () => {
    const inbox = read("client/src/pages/UnifiedInbox.tsx");
    // scrollToBottom still has scrollIntoView for chat, but Email returns first
    const bottomFn = inbox.slice(
      inbox.indexOf("const scrollToBottom"),
      inbox.indexOf("const scrollToTop"),
    );
    assert.match(bottomFn, /email-document-top/);
    assert.match(bottomFn, /scrollIntoView/);
    assert.ok(
      bottomFn.indexOf("email-document-top") < bottomFn.indexOf("scrollIntoView"),
      "Email gate must precede scrollIntoView",
    );
  });

  it("EmailHtmlFrame has no debug ingest logs", () => {
    const frame = read("client/src/components/inbox/EmailHtmlFrame.tsx");
    assert.doesNotMatch(frame, /127\.0\.0\.1:7693/);
    assert.doesNotMatch(frame, /#region agent log/);
  });
});

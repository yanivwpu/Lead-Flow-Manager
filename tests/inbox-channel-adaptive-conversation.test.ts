/**
 * Channel-adaptive Unified Inbox conversation presentation contracts.
 * Run: npx tsx --test tests/inbox-channel-adaptive-conversation.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  CHAT_BUBBLE_MAX_WIDTH_CLASS,
  EMAIL_DOCUMENT_MAX_WIDTH_CLASS,
  EMAIL_FORBIDDEN_BUBBLE_WIDTH,
  chatBubbleShellClassName,
  getConversationThreadChrome,
  resolveConversationLayoutMode,
} from "../client/src/lib/inboxConversationPresentation";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("channel layout mode", () => {
  it("Email → email-document; WhatsApp/SMS/IG → chat-bubbles", () => {
    assert.equal(resolveConversationLayoutMode("email"), "email-document");
    assert.equal(resolveConversationLayoutMode("whatsapp"), "chat-bubbles");
    assert.equal(resolveConversationLayoutMode("instagram"), "chat-bubbles");
    assert.equal(resolveConversationLayoutMode("facebook"), "chat-bubbles");
    assert.equal(resolveConversationLayoutMode("sms"), "chat-bubbles");
    assert.equal(resolveConversationLayoutMode("telegram"), "chat-bubbles");
  });

  it("switching Email → WhatsApp changes presentation without reload (pure function)", () => {
    assert.equal(resolveConversationLayoutMode("email"), "email-document");
    assert.equal(resolveConversationLayoutMode("whatsapp"), "chat-bubbles");
    assert.equal(resolveConversationLayoutMode("email"), "email-document");
  });
});

describe("Email document width — no chat-bubble constraint", () => {
  it("email chrome uses full-width classes and forbids sm:max-w-[70%]", () => {
    const chrome = getConversationThreadChrome("email");
    assert.equal(chrome.layout, "email-document");
    assert.equal(chrome.composerLayout, "email");
    assert.match(chrome.bubbleMaxWidthClass, /w-full/);
    assert.match(chrome.bubbleMaxWidthClass, /max-w-full/);
    assert.doesNotMatch(chrome.bubbleMaxWidthClass, EMAIL_FORBIDDEN_BUBBLE_WIDTH);
    assert.doesNotMatch(EMAIL_DOCUMENT_MAX_WIDTH_CLASS, EMAIL_FORBIDDEN_BUBBLE_WIDTH);
    assert.match(CHAT_BUBBLE_MAX_WIDTH_CLASS, EMAIL_FORBIDDEN_BUBBLE_WIDTH);
  });

  it("EmailThreadMessage / EmailMessageBody / pane use document layout markers", () => {
    const emailMsg = read("client/src/components/inbox/conversation/EmailThreadMessage.tsx");
    const body = read("client/src/components/inbox/EmailMessageBody.tsx");
    const pane = read("client/src/components/inbox/conversation/UnifiedConversationMessagesPane.tsx");
    const inbox = read("client/src/pages/UnifiedInbox.tsx");

    assert.match(emailMsg, /data-conversation-layout=\"email-document\"/);
    assert.match(emailMsg, /EMAIL_DOCUMENT_MAX_WIDTH_CLASS/);
    assert.doesNotMatch(emailMsg, EMAIL_FORBIDDEN_BUBBLE_WIDTH);
    assert.match(body, /layout\s*=\s*\"document\"|layout\?:\s*\"inline\"\s*\|\s*\"document\"/);
    assert.match(pane, /data-conversation-layout=\{chrome\.layout/);
    assert.match(inbox, /EmailThreadMessage/);
    assert.match(inbox, /isEmailChannel/);
    assert.match(inbox, /UnifiedConversationMessagesPane/);
    // Email path must not wrap EmailMessageBody in the chat bubble max-width shell
    assert.match(inbox, /if \(isEmailChannel\)/);
  });

  it("email composer uses email-style headers + layout", () => {
    const inbox = read("client/src/pages/UnifiedInbox.tsx");
    const composer = read("client/src/components/AIComposer.tsx");
    assert.match(inbox, /data-testid=\"inbox-email-compose-headers\"/);
    assert.match(inbox, /data-composer-layout=\"email\"/);
    assert.match(composer, /inbox-email-composer/);
    assert.match(composer, /Write your email/);
    assert.match(composer, /data-composer-layout=\{isEmailComposer \? \"email\" : \"chat\"\}/);
  });
});

describe("WhatsApp / chat bubble presentation preserved", () => {
  it("WhatsApp outbound keeps green bubble + left/right direction classes", () => {
    const waOut = chatBubbleShellClassName("whatsapp", { isOutbound: true });
    const waIn = chatBubbleShellClassName("whatsapp", { isOutbound: false });
    assert.match(waOut, /bg-\[#d9fdd3\]/);
    assert.match(waOut, EMAIL_FORBIDDEN_BUBBLE_WIDTH);
    assert.match(waIn, /bg-white/);
    assert.match(waIn, /rounded-tl-none/);
    assert.match(waOut, /rounded-tr-none/);
  });

  it("UnifiedInbox chat path still uses chatBubbleShellClassName + justify-end/start", () => {
    const inbox = read("client/src/pages/UnifiedInbox.tsx");
    assert.match(inbox, /chatBubbleShellClassName\(activeChannel/);
    assert.match(inbox, /justify-end/);
    assert.match(inbox, /justify-start/);
    assert.match(inbox, /data-conversation-layout=\"chat-bubbles\"/);
    assert.match(inbox, /data-message-direction=\{isOut \? \"outbound\" : \"inbound\"\}/);
  });

  it("IG/FB/SMS get familiar variants without cloning proprietary UI", () => {
    assert.match(chatBubbleShellClassName("instagram", { isOutbound: true }), /rounded-2xl|fuchsia|violet/);
    assert.match(chatBubbleShellClassName("facebook", { isOutbound: true }), /#e7f3ff|rounded-2xl/);
    assert.match(chatBubbleShellClassName("sms", { isOutbound: true }), /slate-800|rounded-xl/);
    assert.match(chatBubbleShellClassName("telegram", { isOutbound: true }), /#dceeff|rounded-xl/);
  });
});

describe("Copilot visibility unchanged", () => {
  it("desktop Copilot/CRM column remains rendered beside conversation", () => {
    const inbox = read("client/src/pages/UnifiedInbox.tsx");
    assert.match(inbox, /InboxLeadDetailsPanel/);
    assert.match(inbox, /data-testid=\"inbox-copilot-column\"/);
    assert.match(inbox, /data-copilot-visible=\"true\"/);
    assert.match(inbox, /!isMobile && selectedContactId && contact/);
  });
});

describe("overflow / responsive contracts", () => {
  it("email document body wrap allows horizontal scroll containment; center pane min-w-0", () => {
    const emailMsg = read("client/src/components/inbox/conversation/EmailThreadMessage.tsx");
    const inbox = read("client/src/pages/UnifiedInbox.tsx");
    assert.match(emailMsg, /overflow-x-auto/);
    assert.match(emailMsg, /max-w-full/);
    assert.match(inbox, /flex-1 flex flex-col min-w-0 overflow-hidden/);
    const chrome = getConversationThreadChrome("email");
    assert.match(chrome.innerClassName, /min-w-0/);
    assert.match(chrome.innerClassName, /w-full|max-w-full/);
    assert.match(chrome.scrollerClassName, /min-h-0/);
    const chatChrome = getConversationThreadChrome("whatsapp");
    assert.doesNotMatch(chatChrome.scrollerClassName, /min-h-0/);
  });
});

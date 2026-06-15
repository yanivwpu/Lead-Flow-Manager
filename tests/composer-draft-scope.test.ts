/**
 * Composer draft must not leak across contact switches (async AI / manual takeover).
 * Covers UnifiedInbox + legacy Chats.tsx (chat.id scoped the same way).
 * Run: npx tsx tests/composer-draft-scope.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildComposerDraftScopeKey,
  loadComposerDraft,
  resetComposerDraftStoreForTests,
  saveComposerDraft,
  shouldApplyComposerDraft,
} from "../client/src/lib/composerDraftScope";

const __dirname = dirname(fileURLToPath(import.meta.url));

function simulateScopedComposer(params: {
  activeContactId: string;
  activeConversationId: string;
  channel?: string;
}) {
  let text = "";
  const scopeKeyFor = (contactId: string) =>
    buildComposerDraftScopeKey(contactId, null, params.channel ?? "whatsapp");

  const applyDraft = (
    draftText: string,
    meta: { contactId: string; conversationId?: string; source: "suggest_reply" | "auto_ai" | "manual" },
  ) => {
    if (
      !shouldApplyComposerDraft({
        activeContactId: params.activeContactId,
        activeConversationId: params.activeConversationId,
        draftContactId: meta.contactId,
        draftConversationId: meta.conversationId,
      })
    ) {
      return false;
    }
    text = draftText;
    saveComposerDraft(scopeKeyFor(params.activeContactId), draftText, meta.source);
    return true;
  };

  const switchContact = (nextContactId: string, nextConversationId: string) => {
    saveComposerDraft(scopeKeyFor(params.activeContactId), text, "manual");
    params.activeContactId = nextContactId;
    params.activeConversationId = nextConversationId;
    text = loadComposerDraft(scopeKeyFor(nextContactId));
    return text;
  };

  const takeManualTakeover = () => text;

  return { applyDraft, switchContact, takeManualTakeover, getText: () => text };
}

function runCrossContactScenario(label: string, channel = "whatsapp") {
  resetComposerDraftStoreForTests();

  const contactA = "contact-ecoshook";
  const contactB = "contact-susu";
  const convA = "conv-a";
  const convB = "conv-b";

  const inbox = simulateScopedComposer({
    activeContactId: contactA,
    activeConversationId: convA,
    channel,
  });

  const draftA =
    "Absolutely, @ecoshook! When it comes to automation, we can help streamline your workflow.";

  assert.equal(
    inbox.applyDraft(draftA, {
      contactId: contactA,
      conversationId: convA,
      source: "suggest_reply",
    }),
    true,
    `${label}: Contact A draft applies while A is active`,
  );
  assert.equal(inbox.getText(), draftA);

  const loadedB = inbox.switchContact(contactB, convB);
  assert.equal(loadedB, "", `${label}: Contact B starts with empty composer (no saved draft)`);
  assert.equal(inbox.getText(), "", `${label}: Contact B composer empty after switch`);

  assert.equal(
    inbox.applyDraft(draftA, {
      contactId: contactA,
      conversationId: convA,
      source: "suggest_reply",
    }),
    false,
    `${label}: late async draft for Contact A must be ignored on Contact B`,
  );
  assert.equal(inbox.getText(), "", `${label}: Contact B must not show Contact A draft after stale async`);

  const takeoverText = inbox.takeManualTakeover();
  assert.equal(takeoverText, "", `${label}: Manual takeover on B shows only B draft (empty)`);
  assert.ok(!takeoverText.includes("@ecoshook"), `${label}: Contact A mention must not appear on B`);

  inbox.applyDraft("Hi Susu, thanks for reaching out.", {
    contactId: contactB,
    conversationId: convB,
    source: "manual",
  });

  inbox.switchContact(contactA, convA);
  assert.ok(
    inbox.getText().includes("@ecoshook"),
    `${label}: Returning to Contact A restores A saved draft only`,
  );

  console.log(`  ${label}: OK`);
}

function runLegacyChatsScenario() {
  // Chats.tsx uses chat.id as contactId + conversationId and chat.channel for scope key.
  runCrossContactScenario("legacy Chats (chat.id + channel)", "instagram");
}

function assertChatsUsesScopedComposer() {
  const chatsSource = readFileSync(
    join(__dirname, "../client/src/pages/Chats.tsx"),
    "utf8",
  );
  assert.match(chatsSource, /buildComposerDraftScopeKey/, "Chats.tsx must use scoped draft keys");
  assert.match(chatsSource, /handleComposerChange/, "Chats.tsx must guard composer onChange");
  assert.match(chatsSource, /key=\{composerScopeKey/, "Chats.tsx must remount AIComposer per scope");
  assert.match(chatsSource, /contactId=\{selectedChatId\}/, "Chats.tsx must pass contactId to AIComposer");
  console.log("  Chats.tsx scoped composer wiring: OK");
}

function assertChatsRouteRedirectsToInbox() {
  const layoutSource = readFileSync(
    join(__dirname, "../client/src/pages/AppLayout.tsx"),
    "utf8",
  );
  assert.match(
    layoutSource,
    /path="\/app\/chats[^"]*"[\s\S]*Redirect to="\/app\/inbox"/,
    "/app/chats should redirect to UnifiedInbox",
  );
  console.log("  /app/chats redirects to inbox (Chats hardened for safety): OK");
}

function runScopeKeyTests() {
  assert.equal(
    buildComposerDraftScopeKey("c1", "acct-1", "whatsapp"),
    "c1::acct-1",
  );
  assert.equal(
    buildComposerDraftScopeKey("c1", null, "instagram"),
    "c1::instagram",
  );
  assert.equal(
    shouldApplyComposerDraft({
      activeContactId: "a",
      draftContactId: "b",
    }),
    false,
  );
  assert.equal(
    shouldApplyComposerDraft({
      activeContactId: "a",
      activeConversationId: "conv-2",
      draftContactId: "a",
      draftConversationId: "conv-1",
    }),
    false,
  );
  console.log("  scope key + shouldApply: OK");
}

runScopeKeyTests();
runCrossContactScenario("UnifiedInbox (contactId + channelAccount)");
runLegacyChatsScenario();
assertChatsUsesScopedComposer();
assertChatsRouteRedirectsToInbox();
console.log("composer-draft-scope.test.ts: OK");

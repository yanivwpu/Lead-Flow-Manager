/**
 * Sibling email thread selection + CRM lead score stability.
 * Run: npx tsx tests/inbox-sibling-and-lead-score.test.ts
 */
import assert from "node:assert/strict";
import { resolveInboxSelectionState } from "../client/src/lib/inboxSelectionState";
import { analyzeConversation } from "../client/src/lib/conversationIntelligence";
import {
  shouldApplySystemScoreTag,
  systemTagForQualification,
} from "../shared/leadQualification";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

/** Mirrors UnifiedInbox selectedConversationId parsing from wouter useSearch. */
function parseConversationSearch(searchString: string): string | null {
  const id = new URLSearchParams(searchString || "").get("conversation");
  return id && id.trim() ? id.trim() : null;
}

const contactId = "contact-yaniv";
const thread51 = {
  id: "conv-test-51",
  channel: "email",
  subject: "Test 51",
  lastMessageAt: "2026-07-13T21:03:00.000Z",
};
const thread52 = {
  id: "conv-test-52",
  channel: "email",
  subject: "Test 52",
  lastMessageAt: "2026-07-13T22:06:00.000Z",
};
const thread53 = {
  id: "conv-test-53",
  channel: "email",
  subject: "Test 53",
  lastMessageAt: "2026-07-13T23:00:00.000Z",
};
const conversations = [thread51, thread52, thread53];

run("same-contact query-only switch updates selectedConversationId", () => {
  // Pathname would stay /app/inbox/contact-yaniv — only search changes.
  const open53 = parseConversationSearch("?conversation=conv-test-53");
  const open52 = parseConversationSearch("?conversation=conv-test-52");
  const open51 = parseConversationSearch("?conversation=conv-test-51");
  assert.equal(open53, "conv-test-53");
  assert.equal(open52, "conv-test-52");
  assert.equal(open51, "conv-test-51");
  assert.notEqual(open53, open52);
});

run("explicit click conversationId overrides sticky older sibling", () => {
  // User was on Test 53 (sticky) then clicks Test 52 — URL conversation wins.
  const afterClick52 = resolveInboxSelectionState({
    selectedContactId: contactId,
    contactQueryData: { contact: { id: contactId }, conversations },
    preferredChannel: "email",
    messagesQueryData: [],
    inboxRowConversation: thread52,
    selectedConversationId: "conv-test-52",
    stickyConversationId: "conv-test-53",
  });
  assert.equal(afterClick52.activeConversationId, "conv-test-52");
  assert.equal(afterClick52.usedStickyConversation, false);

  const afterClick51 = resolveInboxSelectionState({
    selectedContactId: contactId,
    contactQueryData: { contact: { id: contactId }, conversations },
    preferredChannel: "email",
    messagesQueryData: [],
    inboxRowConversation: thread51,
    selectedConversationId: "conv-test-51",
    stickyConversationId: "conv-test-52",
  });
  assert.equal(afterClick51.activeConversationId, "conv-test-51");
});

run("passive refresh keeps sticky when no new explicit conversation", () => {
  const sticky = resolveInboxSelectionState({
    selectedContactId: contactId,
    contactQueryData: { contact: { id: contactId }, conversations },
    preferredChannel: "email",
    messagesQueryData: [],
    inboxRowConversation: thread53, // newest primary shifted
    selectedConversationId: null,
    stickyConversationId: "conv-test-51",
  });
  assert.equal(sticky.activeConversationId, "conv-test-51");
  assert.equal(sticky.usedStickyConversation, true);
});

run("weak sibling email does not wipe CRM Hot Lead display score", () => {
  const weakMsgs = [
    { direction: "inbound" as const, content: "Delivery Status Notification" },
    { direction: "inbound" as const, content: "Mail delivery failed" },
  ];
  const intel = analyzeConversation(weakMsgs, {
    isRealEstate: true,
    crmLeadScore: 88,
  });
  assert.ok((intel.leadScoreDetails?.score ?? 0) >= 75);
  assert.notEqual(intel.leadScoreDetails?.bucket, "unqualified");
  assert.equal(intel.leadScoreDetails?.scoreSource, "crm");
  assert.ok((intel.leadScoreDetails?.conversationScore ?? 100) < 75);
});

run("auto Hot→Unqualified downgrade blocked by policy", () => {
  const desired = systemTagForQualification("unqualified", 5);
  assert.equal(desired, "Unqualified");
  const policy = shouldApplySystemScoreTag({
    desiredTag: desired,
    currentTag: "Hot Lead",
    crmLeadScore: 88,
    scoreSource: "conversation",
    confidence: 0.9,
  });
  assert.equal(policy.apply, false);
  assert.equal(policy.reason, "auto_downgrade_blocked");
});

run("Warm→Hot upgrade still allowed when confident", () => {
  const desired = systemTagForQualification("hot", 90);
  assert.equal(desired, "Hot Lead");
  const policy = shouldApplySystemScoreTag({
    desiredTag: desired,
    currentTag: "Warm Lead",
    crmLeadScore: 80,
    scoreSource: "crm",
    confidence: 0.9,
  });
  assert.equal(policy.apply, true);
});

console.log("\nAll inbox-sibling-and-lead-score tests passed.");

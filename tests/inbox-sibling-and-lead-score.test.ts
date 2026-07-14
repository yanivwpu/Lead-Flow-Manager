/**
 * Sibling email selection + contact vs conversation lead-score model.
 * Run: npx tsx tests/inbox-sibling-and-lead-score.test.ts
 */
import assert from "node:assert/strict";
import { resolveInboxSelectionState } from "../client/src/lib/inboxSelectionState";
import { analyzeConversation } from "../client/src/lib/conversationIntelligence";
import {
  shouldApplySystemScoreTag,
  systemTagForQualification,
} from "../shared/leadQualification";
import { isCalendarOrInviteEmail, normalizeEmailAddress } from "../shared/emailChannel";
import fs from "node:fs";
import path from "node:path";

function run(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
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

async function main() {
  await run("same-contact query-only switch updates selectedConversationId", () => {
    const open53 = parseConversationSearch("?conversation=conv-test-53");
    const open52 = parseConversationSearch("?conversation=conv-test-52");
    const open51 = parseConversationSearch("?conversation=conv-test-51");
    assert.equal(open53, "conv-test-53");
    assert.equal(open52, "conv-test-52");
    assert.equal(open51, "conv-test-51");
    assert.notEqual(open53, open52);
  });

  await run("explicit click conversationId overrides sticky older sibling", () => {
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
  });

  await run("passive refresh keeps sticky when no new explicit conversation", () => {
    const sticky = resolveInboxSelectionState({
      selectedContactId: contactId,
      contactQueryData: { contact: { id: contactId }, conversations },
      preferredChannel: "email",
      messagesQueryData: [],
      inboxRowConversation: thread53,
      selectedConversationId: null,
      stickyConversationId: "conv-test-51",
    });
    assert.equal(sticky.activeConversationId, "conv-test-51");
    assert.equal(sticky.usedStickyConversation, true);
  });

  await run("Copilot score is conversation-scoped (no max CRM floor)", () => {
    const weakMsgs = [
      { direction: "inbound" as const, content: "Delivery Status Notification" },
      { direction: "inbound" as const, content: "Mail delivery failed" },
    ];
    const intel = analyzeConversation(weakMsgs, {
      isRealEstate: true,
      crmLeadScore: 88,
    });
    assert.equal(intel.leadScoreDetails?.scoreSource, "conversation");
    assert.ok((intel.leadScoreDetails?.score ?? 100) < 75);
    // CRM score is not merged into display — stale CRM cannot force Hot forever.
  });

  await run("conversation-scoped tag write blocked", () => {
    const desired = systemTagForQualification("hot", 90);
    assert.equal(desired, "Hot Lead");
    const policy = shouldApplySystemScoreTag({
      desiredTag: desired,
      currentTag: "Unqualified",
      crmLeadScore: null,
      scoreSource: "conversation",
      confidence: 0.95,
    });
    assert.equal(policy.apply, false);
    assert.equal(policy.reason, "conversation_scoped_no_contact_mutation");
  });

  await run("auto Hot→Unqualified downgrade blocked even for crm source", () => {
    const desired = systemTagForQualification("unqualified", 5);
    const policy = shouldApplySystemScoreTag({
      desiredTag: desired,
      currentTag: "Hot Lead",
      crmLeadScore: 88,
      scoreSource: "crm",
      confidence: 0.9,
    });
    assert.equal(policy.apply, false);
    assert.equal(policy.reason, "auto_downgrade_blocked");
  });

  await run("Warm→Hot upgrade allowed only with scoreSource=crm", () => {
    const desired = systemTagForQualification("hot", 90);
    const blocked = shouldApplySystemScoreTag({
      desiredTag: desired,
      currentTag: "Warm Lead",
      crmLeadScore: 80,
      scoreSource: "conversation",
      confidence: 0.9,
    });
    assert.equal(blocked.apply, false);
    const allowed = shouldApplySystemScoreTag({
      desiredTag: desired,
      currentTag: "Warm Lead",
      crmLeadScore: 80,
      scoreSource: "crm",
      confidence: 0.9,
    });
    assert.equal(allowed.apply, true);
  });

  await run("calendar invite subjects are detected as non-CRM email", () => {
    assert.equal(
      isCalendarOrInviteEmail({
        subject: "Invitation: Yaya and Yaniv Haramatiy @ Fri Jul 10, 2026 10am - 10:30am",
      }),
      true,
    );
    assert.equal(isCalendarOrInviteEmail({ subject: "Test 53" }), false);
    assert.equal(
      isCalendarOrInviteEmail({
        subject: "Hello",
        selectedHeaders: { "Content-Type": "text/calendar; method=REQUEST" },
      }),
      true,
    );
  });

  await run("email identity normalizes address (exact match key)", () => {
    assert.equal(normalizeEmailAddress("  Foo.Bar@Gmail.COM "), "foo.bar@gmail.com");
    assert.equal(normalizeEmailAddress("not-an-email"), null);
    // Display name is intentionally not an identity key — only normalized email is.
  });

  await run("no client localhost debug ingest (permission popup regression)", () => {
    const roots = [
      path.join("client", "src", "pages", "UnifiedInbox.tsx"),
      path.join("client", "src", "components", "AIComposer.tsx"),
      path.join("client", "src", "components", "settings", "ProspectIntelligencePanel.tsx"),
      path.join("client", "src", "components", "InboxLeadDetailsPanel.tsx"),
    ];
    for (const rel of roots) {
      const abs = path.join(process.cwd(), rel);
      const text = fs.readFileSync(abs, "utf8");
      assert.equal(
        text.includes("127.0.0.1:7693"),
        false,
        `${rel} must not call localhost ingest (Chrome Local Network Access popup)`,
      );
    }
  });

  console.log("\nAll inbox-sibling-and-lead-score tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Prospect AI cold-outreach Unified Inbox hygiene.
 * Run: npx tsx tests/prospect-cold-outreach-inbox.test.ts
 */
import assert from "node:assert/strict";
import { buildInboxItemsForContact } from "../shared/inboxRowModel";
import {
  collectHiddenColdOutreachConversationIds,
  isColdProspectOutreachAwaitingReply,
} from "../shared/prospectColdOutreachInbox";

const contact = {
  id: "contact-blank-box",
  primaryChannel: "email" as string | null,
  primaryChannelOverride: null as string | null,
};

const coldOutbound = {
  id: "conv-cold-outreach",
  channel: "email",
  subject: "Quick idea for Blank Box",
  lastMessageAt: "2026-07-25T18:00:00.000Z",
  lastMessageDirection: "outbound",
  unreadCount: 0,
  lastMessagePreview: "Initial outreach…",
  externalThreadId: "gmail-thread-1",
};

const manualEmail = {
  id: "conv-manual",
  channel: "email",
  subject: "Manual note",
  lastMessageAt: "2026-07-25T17:00:00.000Z",
  lastMessageDirection: "outbound",
  unreadCount: 0,
  lastMessagePreview: "Hey — following up manually",
};

const whatsapp = {
  id: "conv-wa",
  channel: "whatsapp",
  subject: null as string | null,
  lastMessageAt: "2026-07-25T16:00:00.000Z",
  lastMessageDirection: "outbound",
  unreadCount: 0,
  lastMessagePreview: "hi",
};

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("PI signal: cold outreach awaiting reply", () => {
  assert.equal(
    isColdProspectOutreachAwaitingReply({
      outreachConversationId: "conv-cold-outreach",
      outreachStatus: "outreach_sent",
      repliedAt: null,
    }),
    true,
  );
});

run("PI signal: replied → not hidden", () => {
  assert.equal(
    isColdProspectOutreachAwaitingReply({
      outreachConversationId: "conv-cold-outreach",
      outreachStatus: "replied",
      repliedAt: new Date("2026-07-25T19:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    isColdProspectOutreachAwaitingReply({
      outreachConversationId: "conv-cold-outreach",
      outreachStatus: "outreach_sent",
      repliedAt: "2026-07-25T19:00:00.000Z",
    }),
    false,
  );
});

run("PI signal: not sent / missing conversation → not hidden", () => {
  assert.equal(
    isColdProspectOutreachAwaitingReply({
      outreachConversationId: null,
      outreachStatus: "outreach_sent",
      repliedAt: null,
    }),
    false,
  );
  assert.equal(
    isColdProspectOutreachAwaitingReply({
      outreachConversationId: "conv-x",
      outreachStatus: "not_sent",
      repliedAt: null,
    }),
    false,
  );
});

run("cold Prospect AI outbound-only email hidden", () => {
  const hidden = collectHiddenColdOutreachConversationIds([
    {
      outreachConversationId: coldOutbound.id,
      outreachStatus: "outreach_sent",
      repliedAt: null,
    },
  ]);
  const rows = buildInboxItemsForContact({
    contact,
    conversations: [coldOutbound],
    hiddenColdOutreachConversationIds: hidden,
  });
  assert.equal(rows.length, 0);
});

run("same conversation visible after inbound reply (PI cleared hide)", () => {
  const hidden = collectHiddenColdOutreachConversationIds([
    {
      outreachConversationId: coldOutbound.id,
      outreachStatus: "replied",
      repliedAt: "2026-07-25T19:05:00.000Z",
    },
  ]);
  assert.equal(hidden.size, 0);
  const withInbound = {
    ...coldOutbound,
    lastMessageDirection: "inbound",
    unreadCount: 1,
    lastMessagePreview: "Thanks — interested",
    lastMessageAt: "2026-07-25T19:05:00.000Z",
  };
  const rows = buildInboxItemsForContact({
    contact,
    conversations: [withInbound],
    hiddenColdOutreachConversationIds: hidden,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.conversation?.id, coldOutbound.id);
  assert.equal(rows[0]!.unreadCount, 1);
});

run("outbound history preserved — same conversation id after reply", () => {
  // Simulate: one conversation still has outbound history; visibility toggles via hide set only.
  const beforeHide = new Set([coldOutbound.id]);
  const afterReplyHide = new Set<string>();
  const before = buildInboxItemsForContact({
    contact,
    conversations: [coldOutbound],
    hiddenColdOutreachConversationIds: beforeHide,
  });
  const after = buildInboxItemsForContact({
    contact,
    conversations: [coldOutbound],
    hiddenColdOutreachConversationIds: afterReplyHide,
  });
  assert.equal(before.length, 0);
  assert.equal(after.length, 1);
  assert.equal(after[0]!.conversation?.id, coldOutbound.id);
  assert.equal(after[0]!.conversation?.externalThreadId, "gmail-thread-1");
});

run("manual outbound email remains visible", () => {
  const hidden = new Set([coldOutbound.id]);
  const rows = buildInboxItemsForContact({
    contact,
    conversations: [coldOutbound, manualEmail],
    hiddenColdOutreachConversationIds: hidden,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.conversation?.id, manualEmail.id);
});

run("non-email channels unaffected", () => {
  const hidden = new Set([coldOutbound.id, whatsapp.id]); // even if WA id wrongly listed
  const rows = buildInboxItemsForContact({
    contact,
    conversations: [coldOutbound, whatsapp],
    hiddenColdOutreachConversationIds: hidden,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.channel, "whatsapp");
  assert.equal(rows[0]!.conversation?.id, whatsapp.id);
});

run("no empty fallback row for hidden Prospect AI contact", () => {
  const rows = buildInboxItemsForContact({
    contact,
    conversations: [coldOutbound],
    hiddenColdOutreachConversationIds: [coldOutbound.id],
  });
  assert.equal(rows.length, 0);
  assert.equal(
    rows.some((r) => r.conversation == null),
    false,
  );
});

run("empty CRM row still exists for contact with zero conversations", () => {
  const rows = buildInboxItemsForContact({
    contact,
    conversations: [],
    hiddenColdOutreachConversationIds: new Set([coldOutbound.id]),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.conversation, null);
});

run("no duplicate conversation/contact rows after reply", () => {
  const rows = buildInboxItemsForContact({
    contact,
    conversations: [coldOutbound],
    hiddenColdOutreachConversationIds: [],
  });
  assert.equal(rows.length, 1);
  const keys = rows.map((r) => r.conversation?.id || r.contact.id);
  assert.equal(new Set(keys).size, keys.length);
});

console.log("\nAll prospect-cold-outreach-inbox tests passed.");

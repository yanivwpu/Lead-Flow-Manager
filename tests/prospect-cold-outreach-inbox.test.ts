/**
 * Prospect AI cold-outreach Unified Inbox hygiene.
 * Run: npx tsx tests/prospect-cold-outreach-inbox.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildInboxItemsForContact } from "../shared/inboxRowModel";
import {
  collectHiddenColdOutreachConversationIds,
  isColdProspectOutreachAwaitingReply,
  isQueueSentColdOutreachAwaitingReply,
  shouldHideColdOutreachEmailConversation,
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

/** Max Zuz–style: Idea for subject, queue-linked conversation, PI missing conversationId. */
const maxZuzLike = {
  id: "conv-max-zuz",
  channel: "email",
  subject: "Idea for Max Zuz",
  lastMessageAt: "2026-07-25T18:30:00.000Z",
  lastMessageDirection: "outbound",
  unreadCount: 0,
  lastMessagePreview: "Initial outreach sent",
  externalThreadId: "gmail-thread-max",
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

run("Max Zuz–like: queue conversationId hides when PI.outreachConversationId missing", () => {
  const hidden = collectHiddenColdOutreachConversationIds(
    [
      {
        outreachConversationId: null,
        outreachStatus: "outreach_sent",
        repliedAt: null,
      },
    ],
    [
      {
        conversationId: maxZuzLike.id,
        contactId: "contact-max",
        outreachStatus: "outreach_sent",
        repliedAt: null,
      },
    ],
  );
  assert.ok(hidden.has(maxZuzLike.id));
  const rows = buildInboxItemsForContact({
    contact: { ...contact, id: "contact-max" },
    conversations: [maxZuzLike],
    hiddenColdOutreachConversationIds: hidden,
  });
  assert.equal(rows.length, 0, "Max-like outbound cold thread must not leak into Inbox");
});

run("Max Zuz–like: stuck not_sent + queue sent still hides", () => {
  assert.equal(
    isQueueSentColdOutreachAwaitingReply({
      conversationId: maxZuzLike.id,
      outreachStatus: "not_sent",
      repliedAt: null,
    }),
    true,
  );
  const hidden = collectHiddenColdOutreachConversationIds([], [
    {
      conversationId: maxZuzLike.id,
      outreachStatus: "not_sent",
      repliedAt: null,
    },
  ]);
  assert.ok(hidden.has(maxZuzLike.id));
});

run("inbound reply surfaces even if hide set is stale", () => {
  assert.equal(
    shouldHideColdOutreachEmailConversation({
      channel: "email",
      conversationId: maxZuzLike.id,
      lastMessageDirection: "inbound",
      hiddenIds: new Set([maxZuzLike.id]),
    }),
    false,
  );
  const withInbound = {
    ...maxZuzLike,
    lastMessageDirection: "inbound",
    unreadCount: 1,
    lastMessagePreview: "Thanks — interested",
  };
  const rows = buildInboxItemsForContact({
    contact: { ...contact, id: "contact-max" },
    conversations: [withInbound],
    hiddenColdOutreachConversationIds: [maxZuzLike.id],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.conversation?.id, maxZuzLike.id);
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
  const hidden = new Set([coldOutbound.id, whatsapp.id]);
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

run("storage merges queue conversationId into cold hide set", () => {
  const storageSrc = readFileSync(join(process.cwd(), "server/storage.ts"), "utf8");
  assert.ok(storageSrc.includes("prospectOutreachQueueItems"));
  assert.ok(storageSrc.includes("queueSentSignals"));
  assert.ok(storageSrc.includes("collectHiddenColdOutreachConversationIds"));
});

console.log("\nAll prospect-cold-outreach-inbox tests passed.");

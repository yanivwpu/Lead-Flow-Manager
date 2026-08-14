/**
 * Inbox session pin merge + search sanitize.
 * Run: npx tsx --test tests/inbox-list-merge.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { inboxRowKey } from "../shared/inboxRowModel";
import {
  mergeInboxWithSessionPins,
  upsertSessionPins,
  sanitizeInboxSearchQuery,
  inboxSearchPhoneDigits,
  INBOX_SEARCH_MAX_CHARS,
  INBOX_SEARCH_RESULT_LIMIT,
} from "../shared/inboxListMerge";
import {
  inboxItemsFromContactDetail,
  selectPinCandidates,
} from "../client/src/lib/inboxSessionPins";

function row(
  contactId: string,
  conversationId: string | null,
  lastMessageAt: string | null,
  extras: Record<string, unknown> = {},
) {
  return {
    contact: { id: contactId, name: extras.name ?? contactId, ...(extras.contact || {}) },
    conversation: conversationId ? { id: conversationId, unreadCount: extras.unread ?? 0 } : null,
    channel: extras.channel ?? "facebook",
    lastMessage: extras.lastMessage ?? "hi",
    lastMessageAt,
    unreadCount: extras.unread ?? 0,
    contactUnreadTotal: extras.unread ?? 0,
  };
}

test("inboxRowKey is canonical conversation id (or contact id)", () => {
  assert.equal(inboxRowKey(row("c1", "conv-fb", null)), "conv-fb");
  assert.equal(inboxRowKey(row("c1", null, null)), "c1");
});

test("merge: recent server data replaces matching pin (fresher unread/preview)", () => {
  const pins = [row("samantha", "msg-1", "2024-01-01T00:00:00Z", { unread: 2, lastMessage: "old" })];
  const recent = [
    row("whachat", "wa-1", "2026-08-01T00:00:00Z", { channel: "whatsapp" }),
    row("samantha", "msg-1", "2026-08-10T00:00:00Z", { unread: 0, lastMessage: "fresh" }),
  ];
  const merged = mergeInboxWithSessionPins(recent, pins);
  const sam = merged.find((r) => inboxRowKey(r) === "msg-1")!;
  assert.equal(sam.unreadCount, 0);
  assert.equal(sam.lastMessage, "fresh");
  assert.equal(merged.filter((r) => inboxRowKey(r) === "msg-1").length, 1);
});

test("merge: pin for older deep-link stays when absent from recent; natural order", () => {
  const pins = [row("samantha", "msg-1", "2024-01-01T00:00:00Z", { channel: "facebook" })];
  const recent = [
    row("whachat", "wa-1", "2026-08-01T00:00:00Z", { channel: "whatsapp", name: "WhachatCRM" }),
    row("other", "wa-2", "2026-07-01T00:00:00Z", { channel: "whatsapp" }),
  ];
  const merged = mergeInboxWithSessionPins(recent, pins);
  assert.equal(merged.length, 3);
  assert.ok(merged.some((r) => inboxRowKey(r) === "msg-1"));
  assert.equal(inboxRowKey(merged[0]!), "wa-1");
  assert.equal(inboxRowKey(merged[merged.length - 1]!), "msg-1");
  // Facebook Samantha and WhatsApp WhachatCRM remain separate
  assert.notEqual(
    merged.find((r) => r.contact.id === "samantha")!.contact.id,
    merged.find((r) => r.contact.id === "whachat")!.contact.id,
  );
});

test("upsertSessionPins drops candidates already in recent", () => {
  const recent = [row("samantha", "msg-1", "2026-08-10T00:00:00Z")];
  const prev = [row("samantha", "msg-1", "2024-01-01T00:00:00Z", { unread: 9 })];
  const next = upsertSessionPins(prev, prev, recent);
  assert.equal(next.length, 0);
});

test("upsertSessionPins no-op returns SAME array reference (React #185 guard)", () => {
  const recent = [row("whachat", "wa-1", "2026-08-01T00:00:00Z")];
  const prev = [row("samantha", "msg-1", "2024-01-01T00:00:00Z")];
  const once = upsertSessionPins(prev, [], recent);
  assert.equal(once.length, 1);
  const twice = upsertSessionPins(once, [], recent);
  assert.equal(twice, once);
  const emptyPrev: ReturnType<typeof row>[] = [];
  const emptyOnce = upsertSessionPins(emptyPrev, [], recent);
  assert.equal(emptyOnce, emptyPrev);
  const emptyTwice = upsertSessionPins(emptyOnce, [], recent);
  assert.equal(emptyTwice, emptyOnce);
});

test("upsertSessionPins returns new array when pin content actually changes", () => {
  const recent = [row("whachat", "wa-1", "2026-08-01T00:00:00Z")];
  const prev = [row("samantha", "msg-1", "2024-01-01T00:00:00Z")];
  const kept = upsertSessionPins(prev, [], recent);
  const added = upsertSessionPins(kept, [row("other", "msg-2", "2024-02-01T00:00:00Z")], recent);
  assert.notEqual(added, kept);
  assert.equal(added.length, 2);
  const dropped = upsertSessionPins(added, [], [
    ...recent,
    row("other", "msg-2", "2026-08-02T00:00:00Z"),
  ]);
  assert.notEqual(dropped, added);
  assert.equal(dropped.length, 1);
  assert.equal(inboxRowKey(dropped[0]!), "msg-1");
});

test("post-delete empty selection does not churn sessionPins across many effect cycles", () => {
  // Simulates UnifiedInbox after navigate to /app/inbox: no selection, empty candidates.
  const recent = [
    row("whachat", "wa-1", "2026-08-01T00:00:00Z"),
    row("other", "wa-2", "2026-07-01T00:00:00Z"),
  ];
  let pins: ReturnType<typeof row>[] = [];
  const EMPTY_CANDIDATES: ReturnType<typeof row>[] = [];
  for (let i = 0; i < 80; i++) {
    const next = upsertSessionPins(pins, EMPTY_CANDIDATES, recent);
    assert.equal(next, pins, `cycle ${i} must preserve reference`);
    pins = next;
  }
});

test("upsertSessionPins keeps deep-link when switching away (still not in recent)", () => {
  const recent = [row("whachat", "wa-1", "2026-08-01T00:00:00Z")];
  const candidates = [row("samantha", "msg-1", "2024-01-01T00:00:00Z")];
  const afterOpen = upsertSessionPins([], candidates, recent);
  assert.equal(afterOpen.length, 1);
  const afterSwitch = upsertSessionPins(afterOpen, [], recent);
  assert.equal(afterSwitch.length, 1);
  assert.equal(afterSwitch, afterOpen);
  assert.equal(inboxRowKey(afterSwitch[0]!), "msg-1");
});

test("selectPinCandidates prefers conversation id when present", () => {
  const items = [
    row("c1", "email-1", null, { channel: "email" }),
    row("c1", "fb-1", null, { channel: "facebook" }),
  ] as ReturnType<typeof inboxItemsFromContactDetail>;
  // cast via selectPinCandidates with compatible shape
  const picked = selectPinCandidates(items as any, "email-1");
  assert.equal(picked.length, 1);
  assert.equal(picked[0]!.conversation?.id, "email-1");
});

test("sanitizeInboxSearchQuery enforces min/max", () => {
  assert.equal(sanitizeInboxSearchQuery("a"), null);
  assert.equal(sanitizeInboxSearchQuery("  ab  "), "ab");
  assert.equal(sanitizeInboxSearchQuery("x".repeat(100))!.length, INBOX_SEARCH_MAX_CHARS);
  assert.equal(INBOX_SEARCH_RESULT_LIMIT, 50);
});

test("inboxSearchPhoneDigits requires 7+ digits", () => {
  assert.equal(inboxSearchPhoneDigits("123"), null);
  assert.equal(inboxSearchPhoneDigits("(305) 555-1212"), "3055551212");
});

test("inboxItemsFromContactDetail builds facebook row without merging other contacts", () => {
  const contact = {
    id: "sam",
    name: "Samantha Parezo",
    userId: "u1",
    primaryChannel: "facebook",
  } as any;
  const conversations = [
    {
      id: "fb-conv",
      contactId: "sam",
      channel: "facebook",
      lastMessageAt: new Date("2024-06-01"),
      lastMessagePreview: "hello",
      unreadCount: 1,
    },
  ] as any;
  const items = inboxItemsFromContactDetail(contact, conversations);
  assert.equal(items.length, 1);
  assert.equal(inboxRowKey(items[0]!), "fb-conv");
  assert.equal(items[0]!.channel, "facebook");
  assert.equal(items[0]!.contact.id, "sam");
});

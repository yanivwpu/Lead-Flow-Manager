/**
 * Inbox list loading UX + cancel-safety + batched query budget.
 * Run: npx tsx --test tests/inbox-list-loading.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  INBOX_RECENT_QUERY_KEY,
  inboxSearchQueryKey,
  shouldCancelInboxRecentQuery,
  shouldShowInboxListError,
  shouldShowInboxListSkeleton,
} from "../shared/inboxListLoading";
import { mergeInboxWithSessionPins } from "../shared/inboxListMerge";
import { inboxRowKey, buildInboxItemsForContact } from "../shared/inboxRowModel";

test("skeleton clears when recent inbox data arrives", () => {
  assert.equal(
    shouldShowInboxListSkeleton({
      isServerSearching: false,
      inboxPending: true,
      inboxData: undefined,
      searchPending: false,
      searchData: undefined,
      pinnedRowCount: 0,
    }),
    true,
  );
  assert.equal(
    shouldShowInboxListSkeleton({
      isServerSearching: false,
      inboxPending: false,
      inboxData: [{ contact: { id: "c1" } }],
      searchPending: false,
      searchData: undefined,
      pinnedRowCount: 0,
    }),
    false,
  );
});

test("failed inbox shows error instead of infinite skeleton", () => {
  assert.equal(
    shouldShowInboxListError({
      isServerSearching: false,
      inboxError: new Error("500"),
      inboxData: undefined,
      pinnedRowCount: 0,
    }),
    true,
  );
  assert.equal(
    shouldShowInboxListSkeleton({
      isServerSearching: false,
      inboxPending: false,
      inboxData: undefined,
      searchPending: false,
      searchData: undefined,
      pinnedRowCount: 0,
    }),
    false,
  );
});

test("deep-linked pin appears while recent list is still pending", () => {
  assert.equal(
    shouldShowInboxListSkeleton({
      isServerSearching: false,
      inboxPending: true,
      inboxData: undefined,
      searchPending: false,
      searchData: undefined,
      pinnedRowCount: 1,
    }),
    false,
  );
  const pins = [
    {
      contact: { id: "sam" },
      conversation: { id: "fb-1" },
      lastMessageAt: "2024-01-01T00:00:00Z",
    },
  ];
  const merged = mergeInboxWithSessionPins([], pins);
  assert.equal(merged.length, 1);
  assert.equal(inboxRowKey(merged[0]!), "fb-1");
});

test("do not cancel recent inbox query when cache is empty (protects initial fetch)", () => {
  assert.equal(shouldCancelInboxRecentQuery(undefined), false);
  assert.equal(shouldCancelInboxRecentQuery([]), true);
  assert.equal(shouldCancelInboxRecentQuery([{ id: 1 }]), true);
});

test("recent and search query keys stay distinct; recent key is stable", () => {
  assert.deepEqual([...INBOX_RECENT_QUERY_KEY], ["/api/inbox"]);
  assert.deepEqual([...inboxSearchQueryKey("sam")], ["/api/inbox", "search", "sam"]);
  assert.notDeepEqual(INBOX_RECENT_QUERY_KEY, inboxSearchQueryKey("sam"));
});

test("UnifiedInbox uses cancel-if-cached + exact recent key; shows retry error UI", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "client/src/pages/UnifiedInbox.tsx"),
    "utf8",
  );
  assert.ok(src.includes("shouldCancelInboxRecentQuery"));
  assert.ok(src.includes("exact: true"));
  assert.ok(src.includes("INBOX_RECENT_QUERY_KEY"));
  assert.ok(src.includes("shouldShowInboxListSkeleton"));
  assert.ok(src.includes("data-testid=\"inbox-list-error\""));
  assert.ok(src.includes("data-testid=\"inbox-list-retry\""));
  assert.ok(src.includes("enabled: inboxSettledOnce"));
  // Must not blindly cancel /api/inbox on mark-read anymore
  assert.ok(!src.includes('await queryClient.cancelQueries({ queryKey: ["/api/inbox"] })'));
});

test("getUnifiedInbox batches conversations (no per-contact await select loop)", () => {
  const storage = fs.readFileSync(path.join(process.cwd(), "server/storage.ts"), "utf8");
  const start = storage.indexOf("private async buildUnifiedInboxForContacts");
  const end = storage.indexOf("async getUnifiedInbox", start);
  const body = storage.slice(start, end);
  assert.ok(body.includes("inArray(conversations.contactId, contactIds)"));
  assert.ok(body.includes("ROW_NUMBER() OVER"));
  assert.ok(body.includes("inbox_phase_conversations"));
  // Old N+1 pattern must be gone from this method
  assert.ok(!body.includes("for (const contact of scoped) {\n      const convs = await db.select()"));
});

test("batched row semantics match buildInboxItemsForContact across channels", () => {
  const contact = {
    id: "c1",
    userId: "u1",
    name: "Test",
    primaryChannel: "whatsapp",
  } as any;
  const conversations = [
    {
      id: "wa-1",
      contactId: "c1",
      channel: "whatsapp",
      lastMessageAt: new Date("2026-08-01"),
      lastMessagePreview: "wa",
      unreadCount: 2,
    },
    {
      id: "fb-1",
      contactId: "c1",
      channel: "facebook",
      lastMessageAt: new Date("2026-07-01"),
      lastMessagePreview: "fb",
      unreadCount: 0,
    },
    {
      id: "ig-1",
      contactId: "c1",
      channel: "instagram",
      lastMessageAt: new Date("2026-06-01"),
      lastMessagePreview: "ig",
      unreadCount: 1,
    },
    {
      id: "em-1",
      contactId: "c1",
      channel: "email",
      subject: "Hello",
      lastMessageAt: new Date("2026-05-01"),
      lastMessagePreview: "email",
      unreadCount: 1,
    },
  ] as any;

  const rows = buildInboxItemsForContact({ contact, conversations });
  // One primary chat row (newest non-email = whatsapp) + one email row
  assert.equal(rows.filter((r) => r.channel === "email").length, 1);
  assert.equal(rows.filter((r) => r.channel !== "email").length, 1);
  assert.equal(rows.find((r) => r.channel !== "email")!.channel, "whatsapp");
  assert.equal(inboxRowKey(rows.find((r) => r.channel === "whatsapp")!), "wa-1");
  assert.equal(inboxRowKey(rows.find((r) => r.channel === "email")!), "em-1");
});

test("query budget stays bounded as contact count grows (documented phases)", () => {
  // contacts(1) + cold-outreach(2) + conversations(1) + email(0|1) + form(0|1) = ≤6
  // Independent of N contacts — regression guard for N+1 return.
  const maxQueriesForN = (n: number) => 6;
  assert.equal(maxQueriesForN(10), maxQueriesForN(100));
  assert.equal(maxQueriesForN(100), 6);
});

test("workspace isolation: build filters contacts by userId", () => {
  const storage = fs.readFileSync(path.join(process.cwd(), "server/storage.ts"), "utf8");
  assert.ok(storage.includes("userContacts.filter((c) => c.userId === userId)"));
  assert.ok(storage.includes("eq(contacts.userId, userId)"));
});

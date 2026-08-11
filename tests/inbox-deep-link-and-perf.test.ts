/**
 * Inbox deep-link pin wiring + channel-health deferral + search route.
 * Run: npx tsx --test tests/inbox-deep-link-and-perf.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  INBOX_SEARCH_MAX_CHARS,
  INBOX_SEARCH_MIN_CHARS,
  INBOX_SEARCH_RESULT_LIMIT,
  mergeInboxWithSessionPins,
  sanitizeInboxSearchQuery,
} from "../shared/inboxListMerge";
import { inboxRowKey } from "../shared/inboxRowModel";

const root = process.cwd();

test("UnifiedInbox defers channel-health until inbox settles; no full-page spinner gate", () => {
  const src = fs.readFileSync(
    path.join(root, "client/src/pages/UnifiedInbox.tsx"),
    "utf8",
  );
  assert.ok(src.includes("enabled: inboxSettledOnce"));
  assert.ok(src.includes('queryKey: ["/api/channel-health"]'));
  assert.ok(src.includes("refetchInterval: 5 * 60 * 1000"));
  assert.ok(src.includes("staleTime: 4 * 60 * 1000"));
  assert.ok(src.includes("data-testid=\"inbox-list-skeleton\""));
  assert.ok(src.includes("data-testid=\"inbox-center-skeleton\""));
  assert.ok(src.includes("showListSkeleton"));
  assert.ok(src.includes("mergeInboxWithSessionPins"));
  assert.ok(src.includes("upsertSessionPins"));
  assert.ok(src.includes('queryKey: ["/api/inbox", "search", sanitizedSearch]'));
  assert.ok(src.includes("pinScopeUserIdRef"));
});

test("GET /api/inbox search path uses sanitize + searchUnifiedInbox", () => {
  const routes = fs.readFileSync(path.join(root, "server/routes.ts"), "utf8");
  const inboxHandler = routes.slice(
    routes.indexOf("app.get(\"/api/inbox\""),
    routes.indexOf("app.get(\"/api/inbox\"") + 2500,
  );
  assert.ok(inboxHandler.includes("sanitizeInboxSearchQuery"));
  assert.ok(inboxHandler.includes("searchUnifiedInbox"));
  assert.ok(inboxHandler.includes("INBOX_SEARCH_RESULT_LIMIT"));
  assert.ok(inboxHandler.includes("recordInboxTiming"));

  const storage = fs.readFileSync(path.join(root, "server/storage.ts"), "utf8");
  assert.ok(storage.includes("async searchUnifiedInbox"));
  assert.ok(storage.includes("eq(contacts.userId, userId)"));
  assert.ok(storage.includes("regexp_replace(coalesce(${contacts.phone}"));
});

test("search sanitize constants match safeguards", () => {
  assert.equal(INBOX_SEARCH_MIN_CHARS, 2);
  assert.equal(INBOX_SEARCH_MAX_CHARS, 64);
  assert.equal(INBOX_SEARCH_RESULT_LIMIT, 50);
  assert.equal(sanitizeInboxSearchQuery("S"), null);
  assert.equal(sanitizeInboxSearchQuery("Sa"), "Sa");
});

test("deep-link pin survives selecting another conversation without duplicate keys", () => {
  const samantha = {
    contact: { id: "sam" },
    conversation: { id: "fb-1" },
    lastMessageAt: "2024-01-01T00:00:00Z",
    channel: "facebook",
    lastMessage: "hi",
    unreadCount: 1,
  };
  const whachat = {
    contact: { id: "wa" },
    conversation: { id: "wa-1" },
    lastMessageAt: "2026-08-01T00:00:00Z",
    channel: "whatsapp",
    lastMessage: "yo",
    unreadCount: 0,
  };
  const recent = [whachat];
  const pins = [samantha];
  const merged = mergeInboxWithSessionPins(recent, pins);
  assert.equal(merged.length, 2);
  assert.equal(new Set(merged.map(inboxRowKey)).size, 2);
  assert.ok(merged.some((r) => r.contact.id === "sam" && r.channel === "facebook"));
  assert.ok(merged.some((r) => r.contact.id === "wa" && r.channel === "whatsapp"));

  // Later recent page includes Samantha — server wins, no duplicate
  const recentWithSam = [
    whachat,
    { ...samantha, lastMessage: "fresh", unreadCount: 0, lastMessageAt: "2026-08-11T00:00:00Z" },
  ];
  const again = mergeInboxWithSessionPins(recentWithSam, pins);
  assert.equal(again.filter((r) => inboxRowKey(r) === "fb-1").length, 1);
  assert.equal(again.find((r) => inboxRowKey(r) === "fb-1")!.lastMessage, "fresh");
  assert.equal(again.find((r) => inboxRowKey(r) === "fb-1")!.unreadCount, 0);
});

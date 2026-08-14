/**
 * Inbox new-activity badge helpers + wiring contracts.
 * Run: npx tsx --test tests/inbox-new-activity-badge.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  formatInboxActivityBadge,
  isInboxAppPath,
  INBOX_ACTIVITY_COUNT_SOFT_CAP,
} from "../shared/inboxNewActivity";

describe("formatInboxActivityBadge", () => {
  it("hides at 0", () => {
    assert.equal(formatInboxActivityBadge(0), null);
    assert.equal(formatInboxActivityBadge(-1), null);
  });
  it("shows exact counts 1–99", () => {
    assert.equal(formatInboxActivityBadge(1), "1");
    assert.equal(formatInboxActivityBadge(15), "15");
    assert.equal(formatInboxActivityBadge(99), "99");
  });
  it("caps at 99+", () => {
    assert.equal(formatInboxActivityBadge(100), "99+");
    assert.equal(formatInboxActivityBadge(999), "99+");
    assert.equal(formatInboxActivityBadge(INBOX_ACTIVITY_COUNT_SOFT_CAP), "99+");
  });
});

describe("isInboxAppPath", () => {
  it("matches inbox routes only", () => {
    assert.equal(isInboxAppPath("/app/inbox"), true);
    assert.equal(isInboxAppPath("/app/inbox/abc"), true);
    assert.equal(isInboxAppPath("/app/contacts"), false);
    assert.equal(isInboxAppPath("/app/inboxish"), false);
  });
});

describe("server/client wiring contracts", () => {
  const root = process.cwd();
  const channelSrc = fs.readFileSync(path.join(root, "server/channelService.ts"), "utf8");
  const emailPersistSrc = fs.readFileSync(
    path.join(root, "server/emailChannel/persistInbound.ts"),
    "utf8",
  );
  const syncSrc = fs.readFileSync(path.join(root, "server/emailChannel/syncService.ts"), "utf8");
  const routesSrc = fs.readFileSync(path.join(root, "server/routes.ts"), "utf8");
  const inboxSrc = fs.readFileSync(path.join(root, "client/src/pages/UnifiedInbox.tsx"), "utf8");
  const sidebarSrc = fs.readFileSync(path.join(root, "client/src/components/Sidebar.tsx"), "utf8");
  const mobileSrc = fs.readFileSync(path.join(root, "client/src/components/MobileNav.tsx"), "utf8");
  const layoutSrc = fs.readFileSync(path.join(root, "client/src/pages/AppLayout.tsx"), "utf8");
  const helperSrc = fs.readFileSync(path.join(root, "server/inboxNewActivity.ts"), "utf8");
  const schemaSrc = fs.readFileSync(path.join(root, "shared/schema.ts"), "utf8");
  const patchSrc = fs.readFileSync(path.join(root, "server/startupSchemaPatches.ts"), "utf8");

  it("schema + startup patch include activity columns", () => {
    assert.match(schemaSrc, /inboxNewActivityCount/);
    assert.match(schemaSrc, /lastInboxCheckedAt/);
    assert.match(patchSrc, /0079_users_inbox_new_activity/);
    assert.match(patchSrc, /inbox_new_activity_count/);
    assert.match(patchSrc, /last_inbox_checked_at/);
  });

  it("channelService increments before notifyUser with returned count", () => {
    const notifyIdx = channelSrc.indexOf("notifyUser(userId");
    const incIdx = channelSrc.indexOf("incrementInboxNewActivity");
    assert.ok(incIdx > 0 && notifyIdx > incIdx, "increment must precede notifyUser");
    assert.match(channelSrc, /inboxNewActivityCount/);
    assert.match(channelSrc, /if\s*\(\s*!isCommerceInbound\s*\)/);
  });

  it("email persist increments only for inbound !silent before notify", () => {
    assert.match(emailPersistSrc, /incrementInboxNewActivity/);
    assert.match(
      emailPersistSrc,
      /normalized\.direction\s*===\s*["']inbound["'][\s\S]*incrementInboxNewActivity/,
    );
    const silentBlock = emailPersistSrc.indexOf("if (!params.silent)");
    const incInSilent = emailPersistSrc.indexOf("incrementInboxNewActivity", silentBlock);
    const notifyInSilent = emailPersistSrc.indexOf("notifyUser", silentBlock);
    assert.ok(incInSilent > silentBlock && notifyInSilent > incInSilent);
  });

  it("Gmail bootstrap remains silent:true (excluded from badge)", () => {
    assert.match(syncSrc, /silent:\s*true/);
  });

  it("lightweight activity endpoints exist; GET /api/inbox does not ack", () => {
    assert.match(routesSrc, /app\.get\("\/api\/inbox\/activity"/);
    assert.match(routesSrc, /app\.post\("\/api\/inbox\/activity\/ack"/);
    assert.match(helperSrc, /ackInboxNewActivity/);
    assert.match(helperSrc, /incrementInboxNewActivity/);
    // Full inbox GET must not call ack
    const getInboxIdx = routesSrc.indexOf('app.get("/api/inbox"');
    assert.ok(getInboxIdx > 0);
    const slice = routesSrc.slice(getInboxIdx, getInboxIdx + 2500);
    assert.doesNotMatch(slice, /ackInboxNewActivity/);
  });

  it("badge UI + visible Inbox ack; no needs_reply dependency", () => {
    assert.match(sidebarSrc, /InboxActivityNavBadge/);
    assert.match(sidebarSrc, /sidebar-inbox-activity-badge/);
    assert.match(mobileSrc, /mobile-nav-inbox-activity-badge/);
    assert.match(layoutSrc, /useInboxNewActivityRealtime/);
    assert.match(inboxSrc, /useAckInboxActivityWhenVisible/);
    assert.match(inboxSrc, /ackIfVisible/);
    assert.doesNotMatch(helperSrc, /needs_reply|needsReply/);
    assert.doesNotMatch(sidebarSrc, /needs_reply|needsReply/);
  });

  it("soft cap constant is finite", () => {
    assert.equal(INBOX_ACTIVITY_COUNT_SOFT_CAP, 9999);
  });
});

/**
 * Unified Inbox list must not render Needs Reply pill (keep unread / other chrome).
 * Follow-ups still use needs-reply elsewhere — do not remove that product logic.
 * Run: npx tsx --test tests/inbox-needs-reply-pill.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";

describe("UnifiedInbox list Needs Reply pill removed", () => {
  const inboxSrc = fs.readFileSync(
    path.join(process.cwd(), "client/src/pages/UnifiedInbox.tsx"),
    "utf8",
  );
  const followUpsSrc = fs.readFileSync(
    path.join(process.cwd(), "client/src/pages/FollowUps.tsx"),
    "utf8",
  );

  it("does not render Needs Reply pill / badge-needs-reply in list", () => {
    assert.doesNotMatch(inboxSrc, /badge-needs-reply-/);
    assert.doesNotMatch(inboxSrc, />Needs Reply</);
    assert.doesNotMatch(inboxSrc, /Needs Reply<\/span>/);
  });

  it("still derives inbound+unread for unread typography (underlying signal)", () => {
    assert.match(
      inboxSrc,
      /lastMessageDirection\s*===\s*["']inbound["']\s*&&\s*rowUnread\s*>\s*0/,
    );
    assert.match(inboxSrc, /needsReply\s*&&\s*INBOX_ROW_NAME_UNREAD/);
    assert.match(inboxSrc, /needsReply\s*&&\s*INBOX_ROW_PREVIEW_UNREAD/);
  });

  it("still renders unread count, channel, time, sender/preview chrome", () => {
    assert.match(inboxSrc, /INBOX_ROW_UNREAD_BADGE/);
    assert.match(inboxSrc, /rowUnread\s*>\s*0/);
    assert.match(inboxSrc, /INBOX_ROW_CHANNEL_ICON_WRAP/);
    assert.match(inboxSrc, /getChannelIcon/);
    assert.match(inboxSrc, /INBOX_ROW_TIME/);
    assert.match(inboxSrc, /INBOX_ROW_NAME/);
    assert.match(inboxSrc, /INBOX_ROW_PREVIEW/);
    assert.match(inboxSrc, /rowDisplayName/);
    assert.match(inboxSrc, /rowPreview/);
  });

  it("Follow-ups Needs Reply KPI/filter remains intact", () => {
    assert.match(followUpsSrc, /hasNeedsReply/);
    assert.match(followUpsSrc, /filterKey:\s*['"]needs-reply['"]/);
    assert.match(followUpsSrc, /Needs Reply/);
  });
});

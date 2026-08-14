/**
 * UnifiedInbox session-pins / empty-selection stability (React #185).
 * Run: npx tsx --test tests/inbox-session-pins-stability.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { upsertSessionPins } from "../shared/inboxListMerge";

describe("UnifiedInbox stable empty matchedConversations", () => {
  it("uses EMPTY_MATCHED_CONVERSATIONS / EMPTY_PIN_CANDIDATES instead of fresh []", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "client/src/pages/UnifiedInbox.tsx"),
      "utf8",
    );
    assert.match(src, /const EMPTY_MATCHED_CONVERSATIONS:\s*Conversation\[\]\s*=\s*\[\]/);
    assert.match(src, /const EMPTY_PIN_CANDIDATES:\s*InboxItem\[\]\s*=\s*\[\]/);
    assert.match(src, /contactData\?\.conversations\s*\?\?\s*EMPTY_MATCHED_CONVERSATIONS/);
    assert.match(src, /:\s*EMPTY_MATCHED_CONVERSATIONS/);
    assert.match(src, /:\s*EMPTY_PIN_CANDIDATES/);
    // Must not use bare `?? []` / `: []` for matched conversations assignment.
    assert.doesNotMatch(
      src,
      /matchedConversations\s*=\s*contactMatchesSelection\s*\?\s*\(contactData\?\.conversations\s*\?\?\s*\[\]\)\s*:\s*\[\]/,
    );
  });
});

describe("post-delete selection clear pins loop", () => {
  it("clearing selection with unstable fresh [] candidates still no-ops via upsert identity", () => {
    // Even if a caller mistakenly allocates a new [] each cycle, upsert must not churn.
    let pins: Array<{
      contact: { id: string };
      conversation: { id: string } | null;
      lastMessageAt: string | null;
    }> = [];
    const recent = [
      {
        contact: { id: "a" },
        conversation: { id: "c1" },
        lastMessageAt: "2026-01-01T00:00:00Z",
      },
    ];
    for (let i = 0; i < 100; i++) {
      const freshEmpty: typeof pins = [];
      const next = upsertSessionPins(pins, freshEmpty, recent);
      assert.equal(next, pins);
      pins = next;
    }
  });
});

/**
 * Email composer height / auto-grow — channel-isolated from chat composers.
 * Run: npx tsx --test tests/inbox-email-composer-height.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { COMPOSER_CHAT_CHANNELS } from "../shared/composerKeyboard";
import {
  CHAT_COMPOSER_TEXTAREA_MAX_PX,
  CHAT_COMPOSER_TEXTAREA_MIN_PX,
  EMAIL_COMPOSER_TEXTAREA_MAX_PX,
  EMAIL_COMPOSER_TEXTAREA_MIN_PX,
  composerTextareaBounds,
  nextComposerTextareaLayout,
} from "../shared/composerTextareaHeight";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Email composer bounds", () => {
  it("initial Email height is in the 120–150px band", () => {
    assert.equal(EMAIL_COMPOSER_TEXTAREA_MIN_PX, 140);
    assert.ok(EMAIL_COMPOSER_TEXTAREA_MIN_PX >= 120);
    assert.ok(EMAIL_COMPOSER_TEXTAREA_MIN_PX <= 150);
    assert.equal(composerTextareaBounds("email").minPx, EMAIL_COMPOSER_TEXTAREA_MIN_PX);
    assert.equal(composerTextareaBounds("EMAIL").kind, "email");
  });

  it("Email max height is in the 220–260px band", () => {
    assert.equal(EMAIL_COMPOSER_TEXTAREA_MAX_PX, 240);
    assert.ok(EMAIL_COMPOSER_TEXTAREA_MAX_PX >= 220);
    assert.ok(EMAIL_COMPOSER_TEXTAREA_MAX_PX <= 260);
    assert.equal(composerTextareaBounds("email").maxPx, EMAIL_COMPOSER_TEXTAREA_MAX_PX);
    assert.ok(EMAIL_COMPOSER_TEXTAREA_MAX_PX > EMAIL_COMPOSER_TEXTAREA_MIN_PX);
  });
});

describe("Email auto-grow, cap, scroll, shrink", () => {
  const min = EMAIL_COMPOSER_TEXTAREA_MIN_PX;
  const max = EMAIL_COMPOSER_TEXTAREA_MAX_PX;

  it("empty / short content stays at the Email minimum", () => {
    assert.deepEqual(nextComposerTextareaLayout(0, min, max), {
      heightPx: min,
      overflowY: "hidden",
    });
    assert.deepEqual(nextComposerTextareaLayout(min - 20, min, max), {
      heightPx: min,
      overflowY: "hidden",
    });
    assert.deepEqual(nextComposerTextareaLayout(min, min, max), {
      heightPx: min,
      overflowY: "hidden",
    });
  });

  it("newlines grow the textarea until max only", () => {
    const line = 24;
    const heights: number[] = [];
    for (let n = 0; n <= 20; n++) {
      const content = min + n * line;
      heights.push(nextComposerTextareaLayout(content, min, max).heightPx);
    }
    for (let i = 1; i < heights.length; i++) {
      assert.ok(heights[i] >= heights[i - 1], "height is non-decreasing while growing");
    }
    assert.equal(heights[0], min);
    assert.ok(heights.some((h) => h > min && h < max), "grows through the mid range");
    assert.equal(heights[heights.length - 1], max);
    assert.ok(heights.every((h) => h <= max), "never exceeds Email max");
  });

  it("beyond max, height is fixed and internal scrolling is enabled", () => {
    const over = nextComposerTextareaLayout(max + 80, min, max);
    assert.equal(over.heightPx, max);
    assert.equal(over.overflowY, "auto");
    const wayOver = nextComposerTextareaLayout(max + 800, min, max);
    assert.equal(wayOver.heightPx, max);
    assert.equal(wayOver.overflowY, "auto");
  });

  it("removing lines shrinks back toward the minimum", () => {
    const tall = nextComposerTextareaLayout(max + 200, min, max);
    const mid = nextComposerTextareaLayout(min + 40, min, max);
    const empty = nextComposerTextareaLayout(40, min, max);
    assert.equal(tall.heightPx, max);
    assert.equal(mid.heightPx, min + 40);
    assert.equal(mid.overflowY, "hidden");
    assert.equal(empty.heightPx, min);
    assert.ok(empty.heightPx < mid.heightPx);
    assert.ok(mid.heightPx < tall.heightPx);
  });
});

describe("Chat composer unchanged", () => {
  it("WhatsApp / IG / FB / SMS keep compact 58 / 160 bounds", () => {
    assert.equal(CHAT_COMPOSER_TEXTAREA_MIN_PX, 58);
    assert.equal(CHAT_COMPOSER_TEXTAREA_MAX_PX, 160);
    for (const channel of COMPOSER_CHAT_CHANNELS) {
      const bounds = composerTextareaBounds(channel);
      assert.equal(bounds.kind, "chat", channel);
      assert.equal(bounds.minPx, 58, channel);
      assert.equal(bounds.maxPx, 160, channel);
    }
    assert.equal(composerTextareaBounds("whatsapp").minPx, 58);
    assert.notEqual(composerTextareaBounds("whatsapp").minPx, EMAIL_COMPOSER_TEXTAREA_MIN_PX);
    assert.notEqual(composerTextareaBounds("whatsapp").maxPx, EMAIL_COMPOSER_TEXTAREA_MAX_PX);
  });

  it("chat auto-grow still caps at 160 and can shrink", () => {
    const min = CHAT_COMPOSER_TEXTAREA_MIN_PX;
    const max = CHAT_COMPOSER_TEXTAREA_MAX_PX;
    assert.equal(nextComposerTextareaLayout(40, min, max).heightPx, min);
    assert.equal(nextComposerTextareaLayout(120, min, max).heightPx, 120);
    assert.deepEqual(nextComposerTextareaLayout(400, min, max), {
      heightPx: max,
      overflowY: "auto",
    });
    assert.equal(nextComposerTextareaLayout(90, min, max).heightPx, 90);
  });
});

describe("AIComposer wiring (Email only)", () => {
  it("uses shared Email/chat bounds and does not hardcode the old unbounded Email min", () => {
    const composer = read("client/src/components/AIComposer.tsx");
    assert.match(composer, /composerTextareaBounds/);
    assert.match(composer, /nextComposerTextareaLayout/);
    assert.match(composer, /inbox-email-composer/);
    assert.match(composer, /inbox-chat-composer/);
    assert.match(composer, /data-composer-min-height/);
    assert.match(composer, /data-composer-max-height/);
    assert.match(composer, /\[field-sizing:fixed\]/);
    assert.doesNotMatch(composer, /min-h-\[96px\]/);
    assert.doesNotMatch(composer, /MIN_TEXTAREA_HEIGHT/);
    assert.doesNotMatch(composer, /MAX_TEXTAREA_HEIGHT/);
    // Email measures by collapsing; chat keeps height:auto
    assert.match(composer, /el\.style\.height = "0px"/);
    assert.match(composer, /el\.style\.height = "auto"/);
  });

  it("preserves Email To/Subject strip, Ctrl+Enter, and channel-adaptive layout", () => {
    const inbox = read("client/src/pages/UnifiedInbox.tsx");
    const composer = read("client/src/components/AIComposer.tsx");
    const keyboard = read("shared/composerKeyboard.ts");
    assert.match(inbox, /data-testid=\"inbox-email-compose-headers\"/);
    assert.match(inbox, /data-testid=\"input-inbox-email-subject\"/);
    assert.match(inbox, /data-composer-layout=\"email\"/);
    assert.match(composer, /Write your email/);
    assert.match(composer, /data-composer-layout=\{isEmailComposer \? \"email\" : \"chat\"\}/);
    assert.match(keyboard, /Enter = New line • Ctrl\+Enter = Send/);
    assert.match(inbox, /data-testid=\"inbox-copilot-column\"/);
    assert.match(inbox, /InboxLeadDetailsPanel/);
  });
});

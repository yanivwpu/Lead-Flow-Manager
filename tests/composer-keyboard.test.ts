/**
 * Channel-aware composer Enter / send keyboard mapping.
 * Run: npx tsx --test tests/composer-keyboard.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPOSER_CHAT_CHANNELS,
  composerKeyboardHelperText,
  isComposerEmailChannel,
  resolveComposerEnterAction,
  resolveComposerKeyboardChannelKind,
} from "../shared/composerKeyboard";

const __dirname = dirname(fileURLToPath(import.meta.url));

function enter(params: {
  channel?: string | null;
  isMobile?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  canSend?: boolean;
}) {
  return resolveComposerEnterAction({
    channel: params.channel ?? "whatsapp",
    isMobile: params.isMobile ?? false,
    key: "Enter",
    shiftKey: params.shiftKey ?? false,
    ctrlKey: params.ctrlKey ?? false,
    metaKey: params.metaKey ?? false,
    canSend: params.canSend ?? true,
  });
}

test("channel kind: email vs chat", () => {
  assert.equal(resolveComposerKeyboardChannelKind("email"), "email");
  assert.equal(resolveComposerKeyboardChannelKind("EMAIL"), "email");
  assert.equal(isComposerEmailChannel("email"), true);

  for (const channel of COMPOSER_CHAT_CHANNELS) {
    assert.equal(resolveComposerKeyboardChannelKind(channel), "chat", channel);
  }
  assert.equal(resolveComposerKeyboardChannelKind(null), "chat");
  assert.equal(resolveComposerKeyboardChannelKind(undefined), "chat");
  assert.equal(resolveComposerKeyboardChannelKind("whatsapp"), "chat");
});

test("chat desktop: Enter sends, Shift+Enter newlines", () => {
  for (const channel of ["whatsapp", "facebook", "instagram", "telegram", "webchat", "sms"]) {
    assert.deepEqual(enter({ channel }), { action: "send", preventDefault: true });
    assert.deepEqual(enter({ channel, shiftKey: true }), {
      action: "newline",
      preventDefault: false,
    });
  }
});

test("chat desktop: Ctrl/Cmd+Enter still sends (existing shortcut)", () => {
  assert.deepEqual(enter({ channel: "whatsapp", ctrlKey: true }), {
    action: "send",
    preventDefault: true,
  });
  assert.deepEqual(enter({ channel: "instagram", metaKey: true }), {
    action: "send",
    preventDefault: true,
  });
});

test("chat desktop: empty composer does not send on Enter", () => {
  assert.deepEqual(enter({ channel: "sms", canSend: false }), {
    action: "ignore",
    preventDefault: false,
  });
});

test("email desktop: Enter and Shift+Enter newline; Ctrl/Cmd+Enter send", () => {
  assert.deepEqual(enter({ channel: "email" }), {
    action: "newline",
    preventDefault: false,
  });
  assert.deepEqual(enter({ channel: "email", shiftKey: true }), {
    action: "newline",
    preventDefault: false,
  });
  assert.deepEqual(enter({ channel: "email", ctrlKey: true }), {
    action: "send",
    preventDefault: true,
  });
  assert.deepEqual(enter({ channel: "email", metaKey: true }), {
    action: "send",
    preventDefault: true,
  });
  assert.deepEqual(enter({ channel: "email", ctrlKey: true, canSend: false }), {
    action: "ignore",
    preventDefault: false,
  });
});

test("mobile: bare Enter never sends; mod+Enter can send", () => {
  assert.deepEqual(enter({ channel: "whatsapp", isMobile: true }), {
    action: "newline",
    preventDefault: false,
  });
  assert.deepEqual(enter({ channel: "email", isMobile: true }), {
    action: "newline",
    preventDefault: false,
  });
  assert.deepEqual(enter({ channel: "email", isMobile: true, metaKey: true }), {
    action: "send",
    preventDefault: true,
  });
});

test("non-Enter keys are ignored", () => {
  assert.deepEqual(
    resolveComposerEnterAction({
      channel: "whatsapp",
      isMobile: false,
      key: "a",
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      canSend: true,
    }),
    { action: "ignore", preventDefault: false },
  );
});

test("helper text matches channel mapping", () => {
  assert.equal(
    composerKeyboardHelperText("whatsapp"),
    "Enter = Send • Shift+Enter = New line",
  );
  assert.equal(
    composerKeyboardHelperText("email"),
    "Enter = New line • Ctrl+Enter = Send",
  );
});

test("AIComposer wires shared keyboard helper and hint", () => {
  const source = readFileSync(
    join(__dirname, "..", "client", "src", "components", "AIComposer.tsx"),
    "utf8",
  );
  assert.match(source, /resolveComposerEnterAction/);
  assert.match(source, /composerKeyboardHelperText/);
  assert.match(source, /composer-keyboard-hint/);
  assert.match(source, /aria-describedby/);
  assert.doesNotMatch(source, /Enter to send, Shift\+Enter for new line/);
});

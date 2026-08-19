/**
 * ActivationSetupModal auto-opens only on Inbox, not Prospect AI / other product areas.
 * Run: npx tsx --test tests/activation-setup-modal-route.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isInboxActivationModalPath,
  shouldAutoOpenActivationSetupModal,
  shouldShowActivationSetupModal,
  type ActivationStatusPayload,
} from "../client/src/lib/activationStatus";

const root = process.cwd();

const unactivated: ActivationStatusPayload = {
  whatsappConnected: false,
  instagramConnected: false,
  facebookConnected: false,
  metaConnected: false,
  hasAnyMessagingChannel: false,
  hasSentFirstMessage: false,
  checklistComplete: false,
};

const activated: ActivationStatusPayload = {
  ...unactivated,
  hasAnyMessagingChannel: true,
  whatsappConnected: true,
};

const eligible = {
  activationPending: false,
  activation: unactivated,
  dismissedThisSession: false,
  shownToday: false,
};

test("A: Prospect AI does not auto-open the channel setup modal", () => {
  assert.equal(isInboxActivationModalPath("/app/prospect-ai"), false);
  assert.equal(
    shouldAutoOpenActivationSetupModal({ ...eligible, pathname: "/app/prospect-ai" }),
    false,
  );
  assert.equal(shouldShowActivationSetupModal(eligible), true);
});

test("B: Inbox auto-opens the modal for an unactivated user", () => {
  assert.equal(isInboxActivationModalPath("/app/inbox"), true);
  assert.equal(isInboxActivationModalPath("/app/inbox/contact-1"), true);
  assert.equal(
    shouldAutoOpenActivationSetupModal({ ...eligible, pathname: "/app/inbox" }),
    true,
  );
});

test("C: Integrations does not auto-open the modal", () => {
  assert.equal(
    shouldAutoOpenActivationSetupModal({ ...eligible, pathname: "/app/integrations" }),
    false,
  );
});

test("D: Templates does not auto-open the modal", () => {
  assert.equal(
    shouldAutoOpenActivationSetupModal({ ...eligible, pathname: "/app/templates" }),
    false,
  );
});

test("E: Settings / Channels does not auto-open the modal", () => {
  assert.equal(isInboxActivationModalPath("/app/settings"), false);
  assert.equal(
    shouldAutoOpenActivationSetupModal({
      ...eligible,
      pathname: "/app/settings?section=channels",
    }),
    false,
  );
});

test("F: after connecting a channel, Inbox no longer auto-opens the modal", () => {
  assert.equal(
    shouldAutoOpenActivationSetupModal({
      ...eligible,
      activation: activated,
      pathname: "/app/inbox",
    }),
    false,
  );
});

test("G: activated users stay unchanged on every app route", () => {
  for (const pathname of [
    "/app/inbox",
    "/app/prospect-ai",
    "/app/integrations",
    "/app/templates",
    "/app/settings",
  ]) {
    assert.equal(
      shouldAutoOpenActivationSetupModal({
        ...eligible,
        activation: activated,
        pathname,
      }),
      false,
    );
  }
});

test("Growth Engine and other non-Inbox product areas stay unblocked", () => {
  for (const pathname of [
    "/app/templates/realtor-growth-engine",
    "/app/ai-brain",
    "/app/workflows",
    "/app/chatbot",
    "/app/contacts",
    "/app/followups",
    "/app/widget",
    "/app/help",
    "/app/search",
  ]) {
    assert.equal(isInboxActivationModalPath(pathname), false);
    assert.equal(shouldAutoOpenActivationSetupModal({ ...eligible, pathname }), false);
  }
});

test("AppLayout auto-opens from current route and still uses /api/activation-status", () => {
  const layout = readFileSync(join(root, "client/src/pages/AppLayout.tsx"), "utf8");
  assert.ok(layout.includes("shouldAutoOpenActivationSetupModal"));
  assert.ok(layout.includes("useLocation"));
  assert.ok(layout.includes("pathname: location"));
  assert.ok(layout.includes('["/api/activation-status"]'));
  assert.ok(layout.includes("ActivationSetupModal"));
  assert.ok(!layout.includes("shouldShowActivationSetupModal("));

  const channels = readFileSync(join(root, "server/routes/channels.ts"), "utf8");
  assert.ok(channels.includes("const hasAnyMessagingChannel = whatsappConnected || metaConnected"));
});

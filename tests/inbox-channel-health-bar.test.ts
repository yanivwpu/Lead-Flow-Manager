/**
 * Inbox channel-health bar — Email inclusion + connection mapping.
 * Run: npx tsx tests/inbox-channel-health-bar.test.ts
 */
import assert from "node:assert/strict";
import {
  INBOX_CHANNEL_HEALTH_ORDER,
  INBOX_CHANNEL_HEALTH_LABELS,
  buildInboxChannelHealthRows,
  emailStatusToChannelHealthEntry,
  inboxChannelHealthDotState,
} from "../shared/inboxChannelHealthBar";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("Inbox channel indicators include Email after TikTok", () => {
  assert.deepEqual([...INBOX_CHANNEL_HEALTH_ORDER], [
    "whatsapp",
    "facebook",
    "instagram",
    "telegram",
    "tiktok",
    "email",
  ]);
  assert.equal(INBOX_CHANNEL_HEALTH_LABELS.email, "Email");
  const rows = buildInboxChannelHealthRows([]);
  assert.equal(rows.length, 6);
  assert.equal(rows[5].channel, "email");
  assert.equal(rows[5].isConnected, false);
});

run("Email not connected → gray / inactive (never hardcoded connected)", () => {
  const entry = emailStatusToChannelHealthEntry({ connected: false, mailbox: null });
  assert.equal(entry.channel, "email");
  assert.equal(entry.isConnected, false);
  assert.equal(entry.healthy, null);
  const dots = inboxChannelHealthDotState(entry);
  assert.equal(dots.connected, false);
  assert.equal(dots.warning, false);
});

run("connected Gmail mailbox → green connected state", () => {
  const entry = emailStatusToChannelHealthEntry({
    connected: true,
    mailbox: {
      emailAddress: "yahabegood@gmail.com",
      syncStatus: "connected",
      syncError: null,
    },
  });
  assert.equal(entry.isConnected, true);
  assert.equal(entry.healthy, true);
  assert.equal(entry.pageName, "yahabegood@gmail.com");
  assert.equal(inboxChannelHealthDotState(entry).connected, true);
  assert.equal(inboxChannelHealthDotState(entry).warning, false);
});

run("needs_reconnect / error → warning/unhealthy (not green)", () => {
  for (const syncStatus of ["needs_reconnect", "error"] as const) {
    const entry = emailStatusToChannelHealthEntry({
      connected: true,
      mailbox: {
        emailAddress: "yahabegood@gmail.com",
        syncStatus,
        syncError: "Reconnect Gmail",
      },
    });
    assert.equal(entry.isConnected, true, syncStatus);
    assert.equal(entry.healthy, false, syncStatus);
    assert.equal(entry.healthState, "unhealthy", syncStatus);
    const dots = inboxChannelHealthDotState(entry);
    assert.equal(dots.connected, false, syncStatus);
    assert.equal(dots.warning, true, syncStatus);
    assert.equal(dots.unhealthy, true, syncStatus);
  }
});

run("buildInboxChannelHealthRows merges live email health into ordered bar", () => {
  const rows = buildInboxChannelHealthRows([
    {
      channel: "whatsapp",
      isConnected: true,
      isEnabled: true,
      pageName: null,
      healthy: true,
      issues: [],
    },
    emailStatusToChannelHealthEntry({
      connected: true,
      mailbox: { emailAddress: "a@b.com", syncStatus: "connected", syncError: null },
    }),
  ]);
  assert.equal(rows.map((r) => r.channel).join(","), "whatsapp,facebook,instagram,telegram,tiktok,email");
  assert.equal(rows.find((r) => r.channel === "email")?.isConnected, true);
  assert.equal(rows.find((r) => r.channel === "facebook")?.isConnected, false);
});

console.log("\nAll inbox channel health bar tests passed.");

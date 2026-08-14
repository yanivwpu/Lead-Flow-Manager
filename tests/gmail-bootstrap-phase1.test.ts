/**
 * Gmail Phase 1 — live-first baseline, small bootstrap, honest progress UI.
 * Run: npx tsx --test tests/gmail-bootstrap-phase1.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  EMAIL_BOOTSTRAP_IN_PROGRESS_TOTAL,
  EMAIL_DEFAULT_INITIAL_SYNC_MODE,
  EMAIL_INITIAL_SYNC_MESSAGE_CAP,
  describeEmailMailboxBootstrapUi,
  initialSyncModeToDays,
  isEmailBootstrapInProgress,
} from "../shared/emailChannel";
import { preferNewerHistoryId } from "../server/emailChannel/gmailPushConfig";
import { isEmailMailboxUiConnected } from "../shared/emailMailboxAvailability";

describe("Gmail Phase 1 defaults", () => {
  it("default bootstrap is last_7_days with ~100 cap", () => {
    assert.equal(EMAIL_DEFAULT_INITIAL_SYNC_MODE, "last_7_days");
    assert.equal(initialSyncModeToDays("last_7_days"), 7);
    assert.equal(EMAIL_INITIAL_SYNC_MESSAGE_CAP, 100);
    assert.ok(EMAIL_INITIAL_SYNC_MESSAGE_CAP <= 150);
  });

  it("Inbox+Sent query remains; no Drafts/Spam/Trash expansion", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/gmailProvider.ts"),
      "utf8",
    );
    assert.match(src, /\(in:inbox OR in:sent\)/);
    assert.doesNotMatch(src, /in:drafts|in:spam|in:trash/i);
  });
});

describe("historyId cursor never moves backward", () => {
  it("preferNewerHistoryId is monotonic", () => {
    assert.equal(preferNewerHistoryId("1000", "900"), "1000");
    assert.equal(preferNewerHistoryId("1000", "1100"), "1100");
    assert.equal(preferNewerHistoryId(null, "50"), "50");
    assert.equal(preferNewerHistoryId("50", null), "50");
  });

  it("bootstrap and incremental use advanceMailboxSyncCursor (no blind overwrite)", () => {
    const sync = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/syncService.ts"),
      "utf8",
    );
    assert.match(sync, /advanceMailboxSyncCursor/);
    assert.match(sync, /establishGmailLiveSyncBaseline/);
    assert.match(sync, /runRecentEmailBootstrap/);
    assert.match(sync, /cursor_regression_prevented|bootstrap_page/);
    // Must not assign syncCursor via blind page/history overwrite.
    assert.doesNotMatch(sync, /syncCursor:\s*page\.historyId\s*\|\|/);
    assert.doesNotMatch(sync, /syncCursor:\s*history\.historyId\s*\|\|/);
    assert.doesNotMatch(sync, /syncCursor:\s*historyId\s*\|\|/);
  });

  it("mailboxStore exposes atomic advance helper", () => {
    const store = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/mailboxStore.ts"),
      "utf8",
    );
    assert.match(store, /export async function advanceMailboxSyncCursor/);
    assert.match(store, /preferNewerHistoryId/);
    assert.match(store, /cursor_regression_prevented/);
  });
});

describe("live-first OAuth sequence", () => {
  it("persists baseline cursor and starts watch before bootstrap body import", () => {
    const oauth = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/oauth.ts"),
      "utf8",
    );
    const sync = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/syncService.ts"),
      "utf8",
    );
    assert.match(oauth, /establishGmailLiveSyncBaseline/);
    assert.match(oauth, /runRecentEmailBootstrap/);
    assert.match(oauth, /syncCursor:\s*baselineHistoryId/);
    assert.match(oauth, /syncStatus:\s*"connected"/);
    assert.match(sync, /ensureGmailWatch/);
    assert.match(sync, /baseline_history_id_captured/);
    assert.match(sync, /watch_start_ok|watch_start_failed/);
    // Watch is started inside establishGmailLiveSyncBaseline, not after bootstrap_complete.
    const watchIdx = sync.indexOf("ensureGmailWatch");
    const bootstrapCompleteIdx = sync.indexOf("bootstrap_complete");
    assert.ok(watchIdx > 0 && bootstrapCompleteIdx > 0);
    assert.ok(
      watchIdx < bootstrapCompleteIdx,
      "watch registration must appear before bootstrap_complete logging",
    );
  });

  it("watch failure fails soft; polling path remains", () => {
    const sync = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/syncService.ts"),
      "utf8",
    );
    const watch = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/gmailWatch.ts"),
      "utf8",
    );
    assert.match(sync, /watch_start_failed/);
    assert.match(watch, /Watch failure does NOT disconnect/);
    assert.match(sync, /runEmailPollingCron/);
  });

  it("incremental can run while bootstrap sentinel is active", () => {
    const sync = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/syncService.ts"),
      "utf8",
    );
    assert.match(sync, /incremental_while_bootstrap_active/);
    assert.match(sync, /EMAIL_BOOTSTRAP_IN_PROGRESS_TOTAL/);
  });
});

describe("honest progress UI", () => {
  it("bootstrap sentinel and copy never imply / 2000", () => {
    assert.equal(EMAIL_BOOTSTRAP_IN_PROGRESS_TOTAL, -1);
    assert.equal(isEmailBootstrapInProgress({ syncProgressTotal: -1 }), true);
    assert.equal(isEmailBootstrapInProgress({ syncProgressTotal: 42 }), false);

    const running = describeEmailMailboxBootstrapUi({
      syncStatus: "connected",
      syncProgressCurrent: 12,
      syncProgressTotal: -1,
    });
    assert.equal(running.bootstrapInProgress, true);
    assert.match(running.primaryLine || "", /importing recent conversations/i);
    assert.match(running.primaryLine || "", /12 imported/);
    assert.doesNotMatch(running.primaryLine || "", /\/\s*2000|\/\s*100/);
    assert.match(running.secondaryLine || "", /New emails sync automatically/i);

    const done = describeEmailMailboxBootstrapUi({
      syncStatus: "connected",
      syncProgressCurrent: 40,
      syncProgressTotal: 40,
    });
    assert.equal(done.bootstrapInProgress, false);
    assert.match(done.primaryLine || "", /Recent conversations imported/i);
    assert.match(done.secondaryLine || "", /New emails sync automatically/i);
  });

  it("ChannelSettings shows Connected during bootstrap; no fake total", () => {
    const ui = fs.readFileSync(
      path.join(process.cwd(), "client/src/components/ChannelSettings.tsx"),
      "utf8",
    );
    assert.match(ui, /importing recent conversations/i);
    assert.match(ui, /New emails sync automatically/);
    assert.match(ui, /Recent conversations imported/);
    assert.doesNotMatch(ui, /Syncing \$\{.*\} \/ \$\{/);
    assert.doesNotMatch(ui, /\/ \$\{emailStatus\.mailbox\.syncProgressTotal\}/);
    assert.equal(isEmailMailboxUiConnected("connected"), true);
    assert.equal(isEmailMailboxUiConnected("syncing"), true);
  });
});

describe("regression wiring", () => {
  it("gmailWatchHistoryId still does not replace syncCursor", () => {
    const watch = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/gmailWatch.ts"),
      "utf8",
    );
    assert.match(watch, /do NOT replace syncCursor/);
    assert.match(watch, /gmailWatchHistoryId/);
    assert.doesNotMatch(watch, /syncCursor:\s*watch\.historyId/);
  });

  it("dedupe by providerMessageId remains in persistInbound", () => {
    const persist = fs.readFileSync(
      path.join(process.cwd(), "server/emailChannel/persistInbound.ts"),
      "utf8",
    );
    assert.match(persist, /getMessageByUserExternalId/);
    assert.match(persist, /silent/);
  });
});

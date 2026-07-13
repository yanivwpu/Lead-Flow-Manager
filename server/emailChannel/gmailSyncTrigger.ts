/**
 * Coalesced mailbox sync triggers for push + poll (Phase 1B).
 * Reuses runIncrementalEmailSync — no second sync engine.
 */
import crypto from "crypto";
import {
  clearMailboxSyncPendingIfOwner,
  extendMailboxSyncLock,
  getEmailMailboxById,
  isMailboxSyncPending,
  markMailboxSyncPending,
  releaseMailboxSyncLock,
  tryAcquireMailboxSyncLock,
} from "./mailboxStore";
import { runIncrementalEmailSync } from "./syncService";
import {
  EMAIL_SYNC_LOCK_LEASE_MS,
  logGmailPushE2EEvent,
  logGmailSyncTriggerEvent,
} from "./gmailPushConfig";

export type GmailSyncTriggerSource = "push" | "poll" | "manual" | "watch_post_setup";

/**
 * Accept a sync signal: mark pending (+ optional observed historyId), then try to run.
 * Safe under multi-instance via DB lease lock + pending flag.
 */
export async function triggerMailboxIncrementalSync(params: {
  mailboxId: string;
  source: GmailSyncTriggerSource;
  observedHistoryId?: string | null;
  notificationAt?: Date;
  /** When true, run to completion (poll). When false, detach after lock (push webhook). */
  wait?: boolean;
}): Promise<{ accepted: boolean; started: boolean }> {
  const mailbox = await getEmailMailboxById(params.mailboxId);
  if (!mailbox) {
    logGmailSyncTriggerEvent("sync_failed", {
      mailboxId: params.mailboxId,
      triggerSource: params.source,
      errorMessage: "mailbox_not_found",
    });
    return { accepted: false, started: false };
  }
  if (!["connected", "syncing", "error"].includes(mailbox.syncStatus)) {
    logGmailSyncTriggerEvent("sync_failed", {
      mailboxId: params.mailboxId,
      workspaceId: mailbox.workspaceUserId,
      triggerSource: params.source,
      errorMessage: "mailbox_inactive",
    });
    return { accepted: false, started: false };
  }

  await markMailboxSyncPending({
    mailboxId: params.mailboxId,
    observedHistoryId: params.observedHistoryId,
    notificationAt: params.notificationAt,
  });

  const sourceEvent =
    params.source === "poll"
      ? "poll_triggered"
      : params.source === "push"
        ? "push_triggered"
        : "push_triggered";

  logGmailSyncTriggerEvent(sourceEvent, {
    mailboxId: params.mailboxId,
    workspaceId: mailbox.workspaceUserId,
    triggerSource: params.source,
    notificationHistoryId: params.observedHistoryId ?? null,
    storedSyncCursor: mailbox.syncCursor ?? null,
  });

  const started = await maybeRunMailboxIncrementalSync(
    params.mailboxId,
    params.source,
    Boolean(params.wait),
  );
  return { accepted: true, started };
}

/**
 * Fire-and-forget wrapper for HTTP handlers — pending flag is already durable.
 */
export function scheduleMailboxIncrementalSync(params: {
  mailboxId: string;
  source: GmailSyncTriggerSource;
  observedHistoryId?: string | null;
}): void {
  void triggerMailboxIncrementalSync({ ...params, wait: false }).catch((err) => {
    logGmailSyncTriggerEvent("sync_failed", {
      mailboxId: params.mailboxId,
      triggerSource: params.source,
      errorMessage: err instanceof Error ? err.message.slice(0, 200) : "schedule_failed",
    });
  });
}

async function maybeRunMailboxIncrementalSync(
  mailboxId: string,
  source: GmailSyncTriggerSource,
  wait: boolean,
): Promise<boolean> {
  const owner = `sync-${crypto.randomBytes(8).toString("hex")}`;
  const acquired = await tryAcquireMailboxSyncLock({
    mailboxId,
    owner,
    leaseMs: EMAIL_SYNC_LOCK_LEASE_MS,
  });

  if (!acquired) {
    logGmailSyncTriggerEvent("sync_already_running", {
      mailboxId,
      triggerSource: source,
    });
    logGmailSyncTriggerEvent("pending_trigger_recorded", {
      mailboxId,
      triggerSource: source,
    });
    // #region agent log
    logGmailPushE2EEvent("lease_deferred", {
      hypothesisId: "H-D",
      mailboxId,
      triggerSource: source,
      reason: "sync_already_running",
    });
    // #endregion
    return false;
  }

  // #region agent log
  logGmailPushE2EEvent("lease_acquired", {
    hypothesisId: "H-D",
    mailboxId,
    triggerSource: source,
    leaseMs: EMAIL_SYNC_LOCK_LEASE_MS,
    wait,
  });
  // #endregion

  if (wait) {
    await runLockedMailboxSyncLoop(mailboxId, owner, source);
  } else {
    void runLockedMailboxSyncLoop(mailboxId, owner, source);
  }
  return true;
}

async function runLockedMailboxSyncLoop(
  mailboxId: string,
  owner: string,
  source: GmailSyncTriggerSource,
): Promise<void> {
  let pass = 0;
  try {
    do {
      pass += 1;
      const eventStart = pass === 1 ? "sync_started" : "rerun_started";
      const eventFinish = pass === 1 ? "sync_finished" : "rerun_finished";
      const startedAt = Date.now();
      const before = await getEmailMailboxById(mailboxId);

      logGmailSyncTriggerEvent(eventStart, {
        mailboxId,
        workspaceId: before?.workspaceUserId ?? null,
        triggerSource: source,
        storedSyncCursor: before?.syncCursor ?? null,
        observedRemoteHistoryId: before?.observedRemoteHistoryId ?? null,
        pass,
      });

      // Clear pending before sync so notifications during sync re-dirty the flag.
      await clearMailboxSyncPendingIfOwner({ mailboxId, owner });

      try {
        await runIncrementalEmailSync(mailboxId);
      } catch (err) {
        logGmailSyncTriggerEvent("sync_failed", {
          mailboxId,
          workspaceId: before?.workspaceUserId ?? null,
          triggerSource: source,
          errorMessage: err instanceof Error ? err.message.slice(0, 200) : "sync_failed",
          pass,
        });
      }

      logGmailSyncTriggerEvent(eventFinish, {
        mailboxId,
        workspaceId: before?.workspaceUserId ?? null,
        triggerSource: source,
        durationMs: Date.now() - startedAt,
        pass,
      });

      await extendMailboxSyncLock({
        mailboxId,
        owner,
        leaseMs: EMAIL_SYNC_LOCK_LEASE_MS,
      });
    } while (await isMailboxSyncPending(mailboxId));
  } finally {
    await releaseMailboxSyncLock({ mailboxId, owner, clearPending: false });
  }
}

import {
  EMAIL_BOOTSTRAP_IN_PROGRESS_TOTAL,
  initialSyncModeToDays,
  type EmailInitialSyncMode,
} from "@shared/emailChannel";
import { getEmailChannelCaps } from "./emailChannelConfig";
import { getEmailProvider } from "./gmailProvider";
import { getValidMailboxAccessToken } from "./oauth";
import {
  advanceMailboxSyncCursor,
  getEmailMailboxById,
  setMailboxSyncStatus,
  updateEmailMailbox,
  listConnectedMailboxesForPoll,
} from "./mailboxStore";
import { persistNormalizedEmailMessage } from "./persistInbound";
import {
  isEmailCredentialDecryptFailure,
  logEmailChannelHealthDiag,
  syncErrorFromUnknown,
} from "./credentials";
import { logGmailSyncTriggerEvent } from "./gmailPushConfig";

/** Temporary safe inbound timing diag — no tokens, bodies, subjects, or addresses. */
function logGmailInboundTiming(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "[GmailInboundTiming]", ...payload }));
}

function logEmailSyncEvent(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "[EmailSync]", event, ...fields }));
}

/**
 * Capture live history baseline + start watch before any historical bootstrap.
 * Safe to call after OAuth; watch failure fails soft (polling remains).
 */
export async function establishGmailLiveSyncBaseline(mailboxId: string): Promise<{
  syncCursor: string | null;
  watchOk: boolean;
}> {
  const { accessToken, mailbox } = await getValidMailboxAccessToken(mailboxId);
  const provider = getEmailProvider(mailbox.provider);
  const profile = await provider.getMailboxProfile(accessToken, {
    grantedScopes: mailbox.scopes,
    hasRefreshToken: Boolean(mailbox.refreshTokenEncrypted),
  });
  const historyId = profile.historyId ? String(profile.historyId) : null;

  if (historyId) {
    await advanceMailboxSyncCursor({
      mailboxId,
      candidateHistoryId: historyId,
      source: "live_baseline_profile",
    });
    logEmailSyncEvent("baseline_history_id_captured", {
      mailboxId,
      historyIdLast4: historyId.slice(-4),
      historyIdLen: historyId.length,
    });
  } else {
    logEmailSyncEvent("baseline_history_id_missing", { mailboxId });
  }

  await setMailboxSyncStatus(mailboxId, "connected", { syncError: null });

  let watchOk = false;
  try {
    const { ensureGmailWatch } = await import("./gmailWatch");
    const watch = await ensureGmailWatch(mailboxId);
    watchOk = watch.ok;
    logEmailSyncEvent(watch.ok ? "watch_start_ok" : "watch_start_failed", {
      mailboxId,
      watchStatus: watch.status,
      reason: watch.reason ?? null,
    });
  } catch (err) {
    logEmailSyncEvent("watch_start_failed", {
      mailboxId,
      reason: err instanceof Error ? err.message.slice(0, 200) : "watch_failed",
    });
  }

  // Close the OAuth→watch window via history.list as soon as a cursor exists.
  if (historyId) {
    const { scheduleMailboxIncrementalSync } = await import("./gmailSyncTrigger");
    scheduleMailboxIncrementalSync({
      mailboxId,
      source: "watch_post_setup",
    });
    logEmailSyncEvent("incremental_scheduled_after_baseline", { mailboxId });
  }

  return { syncCursor: historyId, watchOk };
}

/**
 * Recent historical bootstrap only — does not establish live sync and never rewinds syncCursor.
 * Alias kept as runInitialEmailSync for route compatibility.
 */
export async function runInitialEmailSync(mailboxId: string): Promise<void> {
  return runRecentEmailBootstrap(mailboxId);
}

export async function runRecentEmailBootstrap(mailboxId: string): Promise<void> {
  const mailbox = await getEmailMailboxById(mailboxId);
  if (!mailbox) return;

  // Do not block channel on bootstrap — stay/become connected; mark indeterminate progress.
  await updateEmailMailbox(mailboxId, {
    syncStatus: mailbox.syncStatus === "error" ? mailbox.syncStatus : "connected",
    syncError: mailbox.syncStatus === "error" ? mailbox.syncError : null,
    syncProgressCurrent: 0,
    syncProgressTotal: EMAIL_BOOTSTRAP_IN_PROGRESS_TOTAL,
  });

  const { initialSyncMessageCap } = getEmailChannelCaps();

  logEmailSyncEvent("bootstrap_start", {
    mailboxId,
    initialSyncMode: mailbox.initialSyncMode,
    cap: initialSyncMessageCap,
    syncCursorPresent: Boolean(mailbox.syncCursor),
  });

  try {
    const { accessToken, mailbox: fresh } = await getValidMailboxAccessToken(mailboxId);
    const provider = getEmailProvider(fresh.provider);
    const mode = (fresh.initialSyncMode as EmailInitialSyncMode) || "last_7_days";
    const days = initialSyncModeToDays(mode);
    const afterDate =
      days == null ? null : fresh.syncFromDate || new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let pageToken: string | null | undefined = null;
    let imported = 0;

    do {
      const page = await provider.listRecentMessages({
        accessToken,
        afterDate,
        pageToken,
        maxResults: 25,
      });

      // Never persist page/profile historyId as a blind overwrite — only monotonic advance.
      if (page.historyId) {
        await advanceMailboxSyncCursor({
          mailboxId,
          candidateHistoryId: page.historyId,
          source: "bootstrap_page",
        });
      }

      for (const msg of page.messages) {
        if (imported >= initialSyncMessageCap) break;
        await persistNormalizedEmailMessage({
          mailbox: fresh,
          normalized: msg,
          silent: true,
        });
        imported += 1;
      }

      await updateEmailMailbox(mailboxId, {
        syncProgressCurrent: imported,
        syncProgressTotal: EMAIL_BOOTSTRAP_IN_PROGRESS_TOTAL,
      });

      pageToken = page.nextPageToken;
      if (imported >= initialSyncMessageCap) break;
    } while (pageToken);

    await updateEmailMailbox(mailboxId, {
      syncStatus: "connected",
      syncError: null,
      lastSyncAt: new Date(),
      syncProgressCurrent: imported,
      syncProgressTotal: imported,
    });

    logEmailSyncEvent("bootstrap_complete", {
      mailboxId,
      imported,
      cap: initialSyncMessageCap,
    });

    // Catch anything that arrived during bootstrap (history.list from live cursor).
    const { scheduleMailboxIncrementalSync } = await import("./gmailSyncTrigger");
    scheduleMailboxIncrementalSync({
      mailboxId,
      source: "manual",
    });
  } catch (err) {
    const message = syncErrorFromUnknown(err);
    if (isEmailCredentialDecryptFailure(err)) {
      logEmailChannelHealthDiag({
        mailboxId,
        workspaceId: mailbox.workspaceUserId,
        stage: "initial_sync_decrypt_failed",
        error: err,
        syncStatus: mailbox.syncStatus,
        lastSyncAt: mailbox.lastSyncAt,
        hasRefreshToken: Boolean(mailbox.refreshTokenEncrypted),
      });
      await setMailboxSyncStatus(mailboxId, "needs_reconnect", { syncError: message });
    } else {
      // Keep channel connected for live sync; clear bootstrap sentinel.
      await updateEmailMailbox(mailboxId, {
        syncStatus: "connected",
        syncError: message,
        syncProgressTotal: 0,
      });
      logEmailSyncEvent("bootstrap_failed", {
        mailboxId,
        errorName: err instanceof Error ? err.name : "Error",
      });
    }
    console.error("[EmailSync] bootstrap failed:", message);
  }
}

export async function runIncrementalEmailSync(mailboxId: string): Promise<void> {
  const mailbox = await getEmailMailboxById(mailboxId);
  if (!mailbox) return;
  if (!["connected", "error", "syncing"].includes(mailbox.syncStatus)) return;

  const syncStartedAt = new Date().toISOString();
  const historyStartId = mailbox.syncCursor ?? null;
  const bootstrapActive = Number(mailbox.syncProgressTotal) === EMAIL_BOOTSTRAP_IN_PROGRESS_TOTAL;
  if (bootstrapActive) {
    logEmailSyncEvent("incremental_while_bootstrap_active", {
      mailboxId,
      syncCursorPresent: Boolean(mailbox.syncCursor),
    });
    logGmailSyncTriggerEvent("incremental_while_bootstrap_active", {
      mailboxId,
      storedSyncCursor: mailbox.syncCursor ?? null,
    });
  }

  try {
    const { accessToken, mailbox: fresh } = await getValidMailboxAccessToken(mailboxId);
    const provider = getEmailProvider(fresh.provider);

    if (!fresh.syncCursor) {
      // No history cursor — bounded recent resync (7 days)
      const afterDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const page = await provider.listRecentMessages({
        accessToken,
        afterDate,
        maxResults: 50,
      });
      let messagesPersisted = 0;
      for (const msg of page.messages) {
        const result = await persistNormalizedEmailMessage({ mailbox: fresh, normalized: msg });
        if (result?.created) {
          messagesPersisted += 1;
          const persistedAt = new Date().toISOString();
          const gmailInternalDate = msg.sentAt?.toISOString?.() ?? null;
          const delaySeconds =
            msg.sentAt instanceof Date && !Number.isNaN(msg.sentAt.getTime())
              ? Math.max(0, Math.round((Date.now() - msg.sentAt.getTime()) / 1000))
              : null;
          logGmailInboundTiming({
            mailboxId,
            syncStartedAt,
            syncFinishedAt: persistedAt,
            historyStartId: null,
            historyEndId: page.historyId || null,
            messagesDiscovered: page.messages.length,
            messagesPersisted,
            providerMessageId: msg.providerMessageId,
            gmailInternalDate,
            persistedAt,
            delaySeconds,
            path: "bounded_resync_no_cursor",
          });
        }
      }
      await advanceMailboxSyncCursor({
        mailboxId,
        candidateHistoryId: page.historyId,
        source: "bounded_resync_no_cursor",
      });
      await updateEmailMailbox(mailboxId, {
        syncStatus: "connected",
        syncError: null,
        lastSyncAt: new Date(),
      });
      logGmailInboundTiming({
        mailboxId,
        syncStartedAt,
        syncFinishedAt: new Date().toISOString(),
        historyStartId: null,
        historyEndId: page.historyId || null,
        messagesDiscovered: page.messages.length,
        messagesPersisted,
        providerMessageId: null,
        gmailInternalDate: null,
        persistedAt: null,
        delaySeconds: null,
        path: "bounded_resync_no_cursor_summary",
      });
      return;
    }

    const history = await provider.historyList({
      accessToken,
      startHistoryId: fresh.syncCursor,
    });

    if (history.needsBoundedResync) {
      const afterDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const page = await provider.listRecentMessages({
        accessToken,
        afterDate,
        maxResults: 50,
      });
      let messagesPersisted = 0;
      for (const msg of page.messages) {
        const result = await persistNormalizedEmailMessage({ mailbox: fresh, normalized: msg });
        if (result?.created) {
          messagesPersisted += 1;
          const persistedAt = new Date().toISOString();
          const gmailInternalDate = msg.sentAt?.toISOString?.() ?? null;
          const delaySeconds =
            msg.sentAt instanceof Date && !Number.isNaN(msg.sentAt.getTime())
              ? Math.max(0, Math.round((Date.now() - msg.sentAt.getTime()) / 1000))
              : null;
          logGmailInboundTiming({
            mailboxId,
            syncStartedAt,
            syncFinishedAt: persistedAt,
            historyStartId,
            historyEndId: page.historyId || null,
            messagesDiscovered: page.messages.length,
            messagesPersisted,
            providerMessageId: msg.providerMessageId,
            gmailInternalDate,
            persistedAt,
            delaySeconds,
            path: "bounded_resync_stale_history",
          });
        }
      }
      await advanceMailboxSyncCursor({
        mailboxId,
        candidateHistoryId: page.historyId,
        source: "bounded_resync_stale_history",
      });
      await updateEmailMailbox(mailboxId, {
        syncStatus: "connected",
        syncError: null,
        lastSyncAt: new Date(),
      });
      logGmailInboundTiming({
        mailboxId,
        syncStartedAt,
        syncFinishedAt: new Date().toISOString(),
        historyStartId,
        historyEndId: page.historyId || null,
        messagesDiscovered: page.messages.length,
        messagesPersisted,
        providerMessageId: null,
        gmailInternalDate: null,
        persistedAt: null,
        delaySeconds: null,
        path: "bounded_resync_stale_history_summary",
      });
      return;
    }

    let messagesPersisted = 0;
    for (const messageId of history.messageIds) {
      const normalized = await provider.getMessage(accessToken, messageId);
      if (!normalized) continue;
      const result = await persistNormalizedEmailMessage({ mailbox: fresh, normalized });
      if (result?.created) {
        messagesPersisted += 1;
        const persistedAt = new Date().toISOString();
        const gmailInternalDate = normalized.sentAt?.toISOString?.() ?? null;
        const delaySeconds =
          normalized.sentAt instanceof Date && !Number.isNaN(normalized.sentAt.getTime())
            ? Math.max(0, Math.round((Date.now() - normalized.sentAt.getTime()) / 1000))
            : null;
        logGmailInboundTiming({
          mailboxId,
          syncStartedAt,
          syncFinishedAt: persistedAt,
          historyStartId,
          historyEndId: history.historyId || null,
          messagesDiscovered: history.messageIds.length,
          messagesPersisted,
          providerMessageId: normalized.providerMessageId,
          gmailInternalDate,
          persistedAt,
          delaySeconds,
          path: "history_list",
        });
      }
    }

    await advanceMailboxSyncCursor({
      mailboxId,
      candidateHistoryId: history.historyId,
      source: "history_list",
    });
    await updateEmailMailbox(mailboxId, {
      syncStatus: "connected",
      syncError: null,
      lastSyncAt: new Date(),
    });

    logGmailInboundTiming({
      mailboxId,
      syncStartedAt,
      syncFinishedAt: new Date().toISOString(),
      historyStartId,
      historyEndId: history.historyId || null,
      messagesDiscovered: history.messageIds.length,
      messagesPersisted,
      providerMessageId: null,
      gmailInternalDate: null,
      persistedAt: null,
      delaySeconds: null,
      path: "history_list_summary",
    });
  } catch (err) {
    const message = syncErrorFromUnknown(err);
    if (isEmailCredentialDecryptFailure(err) || message.includes("reconnect")) {
      if (isEmailCredentialDecryptFailure(err)) {
        logEmailChannelHealthDiag({
          mailboxId,
          workspaceId: mailbox.workspaceUserId,
          stage: "incremental_sync_decrypt_failed",
          error: err,
          syncStatus: mailbox.syncStatus,
          lastSyncAt: mailbox.lastSyncAt,
          hasRefreshToken: Boolean(mailbox.refreshTokenEncrypted),
        });
      }
      await setMailboxSyncStatus(mailboxId, "needs_reconnect", { syncError: message });
    } else {
      await setMailboxSyncStatus(mailboxId, "error", { syncError: message });
    }
    logGmailInboundTiming({
      mailboxId,
      syncStartedAt,
      syncFinishedAt: new Date().toISOString(),
      historyStartId,
      historyEndId: null,
      messagesDiscovered: 0,
      messagesPersisted: 0,
      providerMessageId: null,
      gmailInternalDate: null,
      persistedAt: null,
      delaySeconds: null,
      path: "incremental_failed",
      errorName: err instanceof Error ? err.name : "Error",
    });
  }
}

export async function runEmailPollingCron(): Promise<void> {
  const { triggerMailboxIncrementalSync } = await import("./gmailSyncTrigger");
  const mailboxes = await listConnectedMailboxesForPoll(40);
  for (const m of mailboxes) {
    try {
      await triggerMailboxIncrementalSync({
        mailboxId: m.id,
        source: "poll",
        wait: true,
      });
    } catch (err) {
      console.error(
        "[EmailPoll] mailbox failed:",
        m.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

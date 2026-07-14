import {
  EMAIL_INITIAL_SYNC_MESSAGE_CAP,
  initialSyncModeToDays,
  type EmailInitialSyncMode,
} from "@shared/emailChannel";
import { getEmailProvider } from "./gmailProvider";
import { getValidMailboxAccessToken } from "./oauth";
import {
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

/** Temporary safe inbound timing diag — no tokens, bodies, subjects, or addresses. */
function logGmailInboundTiming(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "[GmailInboundTiming]", ...payload }));
}

export async function runInitialEmailSync(mailboxId: string): Promise<void> {
  const mailbox = await getEmailMailboxById(mailboxId);
  if (!mailbox) return;

  await setMailboxSyncStatus(mailboxId, "syncing", { syncError: null });
  await updateEmailMailbox(mailboxId, {
    syncProgressCurrent: 0,
    syncProgressTotal: 0,
  });

  try {
    const { accessToken, mailbox: fresh } = await getValidMailboxAccessToken(mailboxId);
    const provider = getEmailProvider(fresh.provider);
    const mode = (fresh.initialSyncMode as EmailInitialSyncMode) || "last_30_days";
    const days = initialSyncModeToDays(mode);
    const afterDate =
      days == null ? null : fresh.syncFromDate || new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let pageToken: string | null | undefined = null;
    let imported = 0;
    let historyId: string | null = null;

    do {
      const page = await provider.listRecentMessages({
        accessToken,
        afterDate,
        pageToken,
        maxResults: 25,
      });
      if (page.historyId) historyId = page.historyId;

      for (const msg of page.messages) {
        if (imported >= EMAIL_INITIAL_SYNC_MESSAGE_CAP) break;
        await persistNormalizedEmailMessage({
          mailbox: fresh,
          normalized: msg,
          silent: true,
        });
        imported += 1;
      }

      await updateEmailMailbox(mailboxId, {
        syncProgressCurrent: imported,
        syncProgressTotal: Math.max(imported, EMAIL_INITIAL_SYNC_MESSAGE_CAP),
      });

      pageToken = page.nextPageToken;
      if (imported >= EMAIL_INITIAL_SYNC_MESSAGE_CAP) break;
    } while (pageToken);

    await updateEmailMailbox(mailboxId, {
      syncStatus: "connected",
      syncError: null,
      lastSyncAt: new Date(),
      syncCursor: historyId,
      syncProgressCurrent: imported,
      syncProgressTotal: imported,
    });

    console.log(
      JSON.stringify({
        tag: "[EmailSync]",
        event: "initial_complete",
        mailboxId,
        imported,
      }),
    );

    // Phase 1B: register watch after incremental cursor is established (never resets syncCursor).
    void import("./gmailWatch")
      .then(({ ensureGmailWatch }) => ensureGmailWatch(mailboxId))
      .catch((err) =>
        console.warn(
          "[GmailWatch] post-initial register failed:",
          err instanceof Error ? err.message : String(err),
        ),
      );
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
      await setMailboxSyncStatus(mailboxId, "error", { syncError: message });
    }
    console.error("[EmailSync] initial failed:", message);
  }
}

export async function runIncrementalEmailSync(mailboxId: string): Promise<void> {
  const mailbox = await getEmailMailboxById(mailboxId);
  if (!mailbox) return;
  if (!["connected", "error", "syncing"].includes(mailbox.syncStatus)) return;

  const syncStartedAt = new Date().toISOString();
  const historyStartId = mailbox.syncCursor ?? null;

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
      await updateEmailMailbox(mailboxId, {
        syncStatus: "connected",
        syncError: null,
        lastSyncAt: new Date(),
        syncCursor: page.historyId || fresh.syncCursor,
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
      await updateEmailMailbox(mailboxId, {
        syncStatus: "connected",
        syncError: null,
        lastSyncAt: new Date(),
        syncCursor: page.historyId || fresh.syncCursor,
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

    await updateEmailMailbox(mailboxId, {
      syncStatus: "connected",
      syncError: null,
      lastSyncAt: new Date(),
      syncCursor: history.historyId || fresh.syncCursor,
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

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setMailboxSyncStatus(mailboxId, "error", { syncError: message });
    console.error("[EmailSync] initial failed:", message);
  }
}

export async function runIncrementalEmailSync(mailboxId: string): Promise<void> {
  const mailbox = await getEmailMailboxById(mailboxId);
  if (!mailbox) return;
  if (!["connected", "error", "syncing"].includes(mailbox.syncStatus)) return;

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
      for (const msg of page.messages) {
        await persistNormalizedEmailMessage({ mailbox: fresh, normalized: msg });
      }
      await updateEmailMailbox(mailboxId, {
        syncStatus: "connected",
        syncError: null,
        lastSyncAt: new Date(),
        syncCursor: page.historyId || fresh.syncCursor,
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
      for (const msg of page.messages) {
        await persistNormalizedEmailMessage({ mailbox: fresh, normalized: msg });
      }
      await updateEmailMailbox(mailboxId, {
        syncStatus: "connected",
        syncError: null,
        lastSyncAt: new Date(),
        syncCursor: page.historyId || fresh.syncCursor,
      });
      return;
    }

    for (const messageId of history.messageIds) {
      const normalized = await provider.getMessage(accessToken, messageId);
      if (!normalized) continue;
      await persistNormalizedEmailMessage({ mailbox: fresh, normalized });
    }

    await updateEmailMailbox(mailboxId, {
      syncStatus: "connected",
      syncError: null,
      lastSyncAt: new Date(),
      syncCursor: history.historyId || fresh.syncCursor,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("reconnect")) {
      await setMailboxSyncStatus(mailboxId, "needs_reconnect", { syncError: message });
    } else {
      await setMailboxSyncStatus(mailboxId, "error", { syncError: message });
    }
  }
}

export async function runEmailPollingCron(): Promise<void> {
  const mailboxes = await listConnectedMailboxesForPoll(40);
  for (const m of mailboxes) {
    try {
      await runIncrementalEmailSync(m.id);
    } catch (err) {
      console.error(
        "[EmailPoll] mailbox failed:",
        m.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

/**
 * Gmail users.watch registration / renewal (Phase 1B).
 * Never overwrites syncCursor with watch historyId (would skip unprocessed mail).
 */
import type { GmailWatchStatus } from "@shared/emailChannel";
import { getValidMailboxAccessToken } from "./oauth";
import { getEmailProvider } from "./gmailProvider";
import {
  getEmailMailboxById,
  listGmailMailboxesForWatchRenewal,
  updateEmailMailbox,
} from "./mailboxStore";
import {
  GMAIL_WATCH_RENEW_WITHIN_MS,
  logGmailWatchEvent,
  resolveGmailPubSubConfig,
} from "./gmailPushConfig";

function computeWatchStatus(expiration: Date | null | undefined): GmailWatchStatus {
  if (!expiration) return "not_configured";
  const msLeft = expiration.getTime() - Date.now();
  if (msLeft <= 0) return "error";
  if (msLeft <= GMAIL_WATCH_RENEW_WITHIN_MS) return "renewal_due";
  return "active";
}

export function shouldRenewGmailWatch(expiration: Date | null | undefined): boolean {
  if (!expiration) return true;
  return expiration.getTime() - Date.now() <= GMAIL_WATCH_RENEW_WITHIN_MS;
}

/**
 * Register or renew Gmail users.watch when needed.
 * Watch failure does NOT disconnect the mailbox or change syncStatus.
 */
export async function ensureGmailWatch(mailboxId: string): Promise<{
  ok: boolean;
  status: GmailWatchStatus;
  renewed: boolean;
  reason?: string;
}> {
  const config = resolveGmailPubSubConfig();
  if (!config.configured) {
    const mailbox = await getEmailMailboxById(mailboxId);
    if (mailbox && mailbox.gmailWatchStatus !== "not_configured") {
      await updateEmailMailbox(mailboxId, {
        gmailWatchStatus: "not_configured",
        gmailWatchLastError: config.reason,
      });
    }
    logGmailWatchEvent("backfill_skipped_not_configured", {
      mailboxId,
      reason: config.reason,
    });
    return { ok: false, status: "not_configured", renewed: false, reason: config.reason };
  }

  const mailbox = await getEmailMailboxById(mailboxId);
  if (!mailbox) {
    return { ok: false, status: "error", renewed: false, reason: "mailbox_not_found" };
  }
  if (mailbox.provider !== "gmail") {
    return { ok: false, status: "not_configured", renewed: false, reason: "not_gmail" };
  }
  if (!["connected", "syncing", "error"].includes(mailbox.syncStatus)) {
    return {
      ok: false,
      status: (mailbox.gmailWatchStatus as GmailWatchStatus) || "error",
      renewed: false,
      reason: "mailbox_inactive",
    };
  }

  if (
    mailbox.gmailWatchStatus === "active" &&
    mailbox.gmailWatchExpiration &&
    !shouldRenewGmailWatch(mailbox.gmailWatchExpiration)
  ) {
    return { ok: true, status: "active", renewed: false };
  }

  const isRenewal = Boolean(mailbox.gmailWatchExpiration);
  logGmailWatchEvent(isRenewal ? "renewal_started" : "register_started", {
    mailboxId,
    workspaceId: mailbox.workspaceUserId,
    syncCursor: mailbox.syncCursor ?? null,
    previousExpiration: mailbox.gmailWatchExpiration?.toISOString?.() ?? null,
  });

  try {
    const { accessToken, mailbox: fresh } = await getValidMailboxAccessToken(mailboxId);
    const provider = getEmailProvider(fresh.provider);
    if (!provider.watchMailbox) {
      await updateEmailMailbox(mailboxId, {
        gmailWatchStatus: "not_configured",
        gmailWatchLastError: "Provider does not support watch",
      });
      return { ok: false, status: "not_configured", renewed: false, reason: "unsupported" };
    }

    const watch = await provider.watchMailbox({
      accessToken,
      topicName: config.topicName,
    });

    // Persist watch metadata only — do NOT replace syncCursor with watch.historyId.
    const status = computeWatchStatus(watch.expiration);
    await updateEmailMailbox(mailboxId, {
      gmailWatchHistoryId: watch.historyId,
      gmailWatchExpiration: watch.expiration,
      gmailWatchStatus: status,
      gmailWatchLastRegisteredAt: new Date(),
      gmailWatchLastError: null,
      // Keep legacy stub columns in sync for operators reading raw DB.
      webhookExpiresAt: watch.expiration,
      webhookSubscriptionId: config.topicName,
    });

    logGmailWatchEvent(isRenewal ? "renewal_ok" : "register_ok", {
      mailboxId,
      workspaceId: fresh.workspaceUserId,
      watchHistoryId: watch.historyId,
      expiration: watch.expiration.toISOString(),
      syncCursorPreserved: fresh.syncCursor ?? null,
      status,
    });

    return { ok: true, status, renewed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 240) : "watch_failed";
    await updateEmailMailbox(mailboxId, {
      gmailWatchStatus: "error",
      gmailWatchLastError: message,
    });
    logGmailWatchEvent(isRenewal ? "renewal_failed" : "register_failed", {
      mailboxId,
      workspaceId: mailbox.workspaceUserId,
      errorMessage: message,
    });
    return { ok: false, status: "error", renewed: false, reason: message };
  }
}

/** Daily / startup-safe backfill: renew watch only when needed. */
export async function runGmailWatchRenewalCron(): Promise<void> {
  const config = resolveGmailPubSubConfig();
  if (!config.configured) {
    logGmailWatchEvent("backfill_skipped_not_configured", { reason: config.reason });
    return;
  }

  const mailboxes = await listGmailMailboxesForWatchRenewal(80);
  for (const m of mailboxes) {
    if (
      m.gmailWatchStatus === "active" &&
      m.gmailWatchExpiration &&
      !shouldRenewGmailWatch(m.gmailWatchExpiration)
    ) {
      continue;
    }
    try {
      await ensureGmailWatch(m.id);
    } catch (err) {
      logGmailWatchEvent("register_failed", {
        mailboxId: m.id,
        errorMessage: err instanceof Error ? err.message.slice(0, 200) : "renew_cron_failed",
      });
    }
  }
}

/**
 * READ-ONLY: Ollie Marketing post-reconnect intermittent decrypt audit.
 * No decrypt of tokens for mutation paths; optional decrypt attempt is NOT used.
 * No resume, reconnect, send, or DB writes.
 * Run: npx tsx scripts/audit-ollie-decrypt-rerun.ts
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  emailMailboxes,
  prospectOutreachQueueItems,
  prospectOutreachSettings,
} from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import { formatProspectQueueItemError, isProspectOutreachQueueArmed } from "../shared/prospectBulkOutreach";
import { parseSenderNotConnectedDiagnostic } from "../shared/prospectSenderProbeDiagnostics";

function fp(name: string) {
  const raw = process.env[name];
  if (raw == null || !String(raw).trim()) {
    return { present: false, length: null as number | null, sha256Prefix8: null as string | null };
  }
  const t = String(raw).trim();
  return {
    present: true,
    length: t.length,
    sha256Prefix8: createHash("sha256").update(t, "utf8").digest("hex").slice(0, 8),
  };
}

/** Non-secret fingerprint of ciphertext (sha256 of full blob) — detects rewrite without exposing value */
function cipherFp(cipher: string | null | undefined) {
  if (!cipher) return null;
  const parts = cipher.split(":");
  return {
    len: cipher.length,
    formatOk: parts.length === 3 && parts[0]?.length === 32,
    ivPrefix8: parts[0]?.slice(0, 8) ?? null,
    sha256Prefix12: createHash("sha256").update(cipher, "utf8").digest("hex").slice(0, 12),
  };
}

async function main() {
  const wid = await resolveProspectImportDestinationUserId();
  const now = Date.now();

  const settingsRows = await db
    .select()
    .from(prospectOutreachSettings)
    .where(eq(prospectOutreachSettings.workspaceUserId, wid))
    .limit(1);
  const s = settingsRows[0];

  const ollie = await db
    .select({
      id: prospectOutreachQueueItems.id,
      contactId: prospectOutreachQueueItems.contactId,
      queueStatus: prospectOutreachQueueItems.queueStatus,
      attempts: prospectOutreachQueueItems.attempts,
      lastError: prospectOutreachQueueItems.lastError,
      senderMailboxId: prospectOutreachQueueItems.senderMailboxId,
      scheduledAt: prospectOutreachQueueItems.scheduledAt,
      startedAt: prospectOutreachQueueItems.startedAt,
      sentAt: prospectOutreachQueueItems.sentAt,
      createdAt: prospectOutreachQueueItems.createdAt,
      updatedAt: prospectOutreachQueueItems.updatedAt,
      name: contacts.name,
    })
    .from(prospectOutreachQueueItems)
    .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, wid),
        ilike(contacts.name, "%ollie%marketing%"),
      ),
    )
    .orderBy(desc(prospectOutreachQueueItems.updatedAt))
    .limit(5);

  const recent = await db
    .select({
      id: prospectOutreachQueueItems.id,
      name: contacts.name,
      queueStatus: prospectOutreachQueueItems.queueStatus,
      attempts: prospectOutreachQueueItems.attempts,
      lastError: prospectOutreachQueueItems.lastError,
      senderMailboxId: prospectOutreachQueueItems.senderMailboxId,
      sentAt: prospectOutreachQueueItems.sentAt,
      updatedAt: prospectOutreachQueueItems.updatedAt,
      scheduledAt: prospectOutreachQueueItems.scheduledAt,
    })
    .from(prospectOutreachQueueItems)
    .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
    .where(eq(prospectOutreachQueueItems.workspaceUserId, wid))
    .orderBy(desc(sql`coalesce(${prospectOutreachQueueItems.sentAt}, ${prospectOutreachQueueItems.updatedAt})`))
    .limit(30);

  const mailboxes = await db
    .select()
    .from(emailMailboxes)
    .where(eq(emailMailboxes.workspaceUserId, wid))
    .orderBy(desc(emailMailboxes.isPrimary), desc(emailMailboxes.createdAt));

  const ollie0 = ollie[0];
  const failAt = ollie0?.updatedAt?.getTime() ?? null;
  const diag = ollie0?.lastError ? parseSenderNotConnectedDiagnostic(ollie0.lastError) : null;

  const sentNear = recent
    .filter((r) => r.queueStatus === "sent" && r.sentAt)
    .map((r) => ({
      name: r.name,
      sentAt: r.sentAt!.toISOString(),
      mailboxPrefix: r.senderMailboxId?.slice(0, 8) ?? null,
      msBeforeOllieFail: failAt != null ? failAt - r.sentAt!.getTime() : null,
    }))
    .filter((r) => r.msBeforeOllieFail == null || (r.msBeforeOllieFail >= 0 && r.msBeforeOllieFail < 3_600_000))
    .sort((a, b) => (a.msBeforeOllieFail ?? 0) - (b.msBeforeOllieFail ?? 0))
    .slice(0, 12);

  const mailboxReport = mailboxes.map((m) => {
    const exp = m.tokenExpiresAt?.getTime() ?? null;
    const created = m.createdAt?.getTime() ?? null;
    const updated = m.updatedAt?.getTime() ?? null;
    return {
      idPrefix: m.id.slice(0, 8),
      email: m.emailAddress,
      isPrimary: m.isPrimary,
      syncStatus: m.syncStatus,
      syncErrorPreview: m.syncError ? String(m.syncError).slice(0, 160) : null,
      createdAt: m.createdAt?.toISOString() ?? null,
      updatedAt: m.updatedAt?.toISOString() ?? null,
      lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
      tokenExpiresAt: m.tokenExpiresAt?.toISOString() ?? null,
      /** Fresh reconnect indicator: created recently */
      ageSinceCreateMs: created != null ? now - created : null,
      msUpdatedAfterOllieFail: failAt != null && updated != null ? updated - failAt : null,
      wouldNeedRefreshAtOllieFail:
        failAt != null && exp != null ? exp < failAt + 60_000 : null,
      estimatedLastAccessRefreshAt:
        exp != null ? new Date(exp - 3600_000).toISOString() : null,
      access: cipherFp(m.accessTokenEncrypted),
      refresh: cipherFp(m.refreshTokenEncrypted),
      gmailWatchStatus: m.gmailWatchStatus ?? null,
      syncPending: m.syncPending ?? null,
    };
  });

  // Concurrent writers that can call getValidMailboxAccessToken (code inventory)
  const concurrentCallers = [
    "prospectOutreachQueueWorker → processClaimedQueueItem → resolveEmailSender / prepare / send",
    "cron email poll → runEmailPollingCron → runIncrementalEmailSync → getValidMailboxAccessToken",
    "gmail push → gmailSyncTrigger → runIncrementalEmailSync → getValidMailboxAccessToken",
    "gmailWatch ensureGmailWatch → getValidMailboxAccessToken",
    "getWorkspaceEmailStatus (Settings) → getValidMailboxAccessToken (+ heal)",
    "disconnect path / sendService send → getValidMailboxAccessToken",
  ];

  const tokenWriters = [
    {
      path: "oauth callback insertEmailMailbox",
      fields: ["accessTokenEncrypted", "refreshTokenEncrypted"],
      helper: "encryptEmailCredential",
    },
    {
      path: "getValidMailboxAccessToken refresh branch",
      fields: ["accessTokenEncrypted", "tokenExpiresAt", "syncStatus/syncError"],
      helper: "encryptEmailCredential",
    },
  ];

  console.log(
    JSON.stringify(
      {
        note: "READ-ONLY. Cipher sha256Prefix12 detects rewrite without exposing secrets.",
        workspaceIdPrefix: wid.slice(0, 8),
        localEnvNote: "local fingerprints may differ from Railway",
        localEMAIL_ENCRYPTION_KEY: fp("EMAIL_ENCRYPTION_KEY"),
        queue: {
          queueRunning: s?.queueRunning ?? null,
          paused: s?.paused ?? null,
          armed: s
            ? isProspectOutreachQueueArmed({
                queueRunning: s.queueRunning,
                paused: s.paused,
              })
            : null,
        },
        ollie: ollie.map((r) => ({
          idPrefix: r.id.slice(0, 8),
          name: r.name,
          queueStatus: r.queueStatus,
          attempts: r.attempts,
          lastErrorExact: r.lastError,
          lastErrorUi: formatProspectQueueItemError(r.lastError),
          failureClass: r.lastError
            ? parseSenderNotConnectedDiagnostic(r.lastError).failureClass
            : null,
          senderMailboxPrefix: r.senderMailboxId?.slice(0, 8) ?? null,
          scheduledAt: r.scheduledAt?.toISOString() ?? null,
          startedAt: r.startedAt?.toISOString() ?? null,
          sentAt: r.sentAt?.toISOString() ?? null,
          updatedAt: r.updatedAt?.toISOString() ?? null,
          inferredStage:
            r.attempts === 0 && String(r.lastError || "").includes("sender_not_connected")
              ? "eligibility_before_attempt_increment"
              : "unknown",
        })),
        parsedDiag: diag,
        sentNearBeforeOllieFail: sentNear,
        mailboxes: mailboxReport,
        concurrentGetValidMailboxAccessTokenCallers: concurrentCallers,
        accessTokenEncryptedWriters: tokenWriters,
        raceNotes: {
          refreshLock: "NONE — getValidMailboxAccessToken has no mailbox-level mutex around refresh+write",
          syncLock: "mailbox sync lock exists for incremental sync coalescing — does NOT cover token refresh",
          keyResolution: "same resolveEncryptionKeyMaterial() for all email encrypt/decrypt paths",
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

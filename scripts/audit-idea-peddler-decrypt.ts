/**
 * READ-ONLY: Idea Peddler sender_not_connected:decrypt timeline.
 * Does NOT decrypt tokens, refresh, send, resume, or mutate rows.
 * Run: npx tsx scripts/audit-idea-peddler-decrypt.ts
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  emailMailboxes,
  prospectOutreachQueueItems,
  prospectOutreachSettings,
} from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import {
  formatProspectQueueItemError,
  isProspectOutreachQueueArmed,
} from "../shared/prospectBulkOutreach";
import { parseSenderNotConnectedDiagnostic as parseDiag } from "../shared/prospectSenderProbeDiagnostics";
import { isEmailMailboxSyncStatusSendable } from "../shared/emailMailboxAvailability";

function fingerprintEnv(name: string) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") {
    return { present: false, length: null as number | null, sha256Prefix8: null as string | null };
  }
  const trimmed = String(raw).trim();
  return {
    present: true,
    length: trimmed.length,
    sha256Prefix8: createHash("sha256").update(trimmed, "utf8").digest("hex").slice(0, 8),
  };
}

function effectiveKeySource() {
  for (const name of [
    "EMAIL_ENCRYPTION_KEY",
    "META_ENCRYPTION_KEY",
    "TWILIO_ENCRYPTION_KEY",
    "SESSION_SECRET",
  ] as const) {
    const fp = fingerprintEnv(name);
    if (fp.present) return { source: name, ...fp };
  }
  return { source: null, present: false, length: null, sha256Prefix8: null };
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

  const idea = await db
    .select({
      id: prospectOutreachQueueItems.id,
      contactId: prospectOutreachQueueItems.contactId,
      queueStatus: prospectOutreachQueueItems.queueStatus,
      attempts: prospectOutreachQueueItems.attempts,
      lastError: prospectOutreachQueueItems.lastError,
      senderMailboxId: prospectOutreachQueueItems.senderMailboxId,
      selectedChannel: prospectOutreachQueueItems.selectedChannel,
      recipientIdentity: prospectOutreachQueueItems.recipientIdentity,
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
        ilike(contacts.name, "%idea%peddler%"),
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
    .orderBy(desc(prospectOutreachQueueItems.updatedAt))
    .limit(25);

  const mailboxIds = [
    ...new Set(
      [...idea, ...recent]
        .map((r) => r.senderMailboxId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const mailboxes =
    mailboxIds.length === 0
      ? await db
          .select()
          .from(emailMailboxes)
          .where(eq(emailMailboxes.workspaceUserId, wid))
      : await db
          .select()
          .from(emailMailboxes)
          .where(inArray(emailMailboxes.id, mailboxIds));

  // Also load primary if missing
  const primary = await db
    .select()
    .from(emailMailboxes)
    .where(
      and(eq(emailMailboxes.workspaceUserId, wid), eq(emailMailboxes.isPrimary, true)),
    )
    .limit(1);

  const mailboxReport = [...mailboxes, ...primary.filter((p) => !mailboxes.some((m) => m.id === p.id))].map(
    (m) => {
      const access = m.accessTokenEncrypted || "";
      const refresh = m.refreshTokenEncrypted || "";
      const accessParts = access.split(":");
      const refreshParts = refresh.split(":");
      const expiresAtMs = m.tokenExpiresAt?.getTime() ?? null;
      return {
        idPrefix: m.id.slice(0, 8),
        email: m.emailAddress,
        syncStatus: m.syncStatus,
        syncErrorPreview: m.syncError ? String(m.syncError).slice(0, 160) : null,
        isPrimary: m.isPrimary,
        sendableByStatus: isEmailMailboxSyncStatusSendable(m.syncStatus),
        hasAccessCiphertext: Boolean(access),
        hasRefreshCiphertext: Boolean(refresh),
        accessCipherLen: access.length,
        refreshCipherLen: refresh.length,
        accessFormatOk: accessParts.length === 3 && accessParts[0]?.length === 32,
        refreshFormatOk: refreshParts.length === 3 && refreshParts[0]?.length === 32,
        /** iv hex prefix only — not secret */
        accessIvPrefix8: accessParts[0]?.slice(0, 8) || null,
        refreshIvPrefix8: refreshParts[0]?.slice(0, 8) || null,
        tokenExpiresAt: m.tokenExpiresAt?.toISOString() || null,
        tokenExpiresInMsFromNow: expiresAtMs == null ? null : expiresAtMs - now,
        wouldNeedRefreshNow: !expiresAtMs || expiresAtMs < now + 60_000,
        lastSyncAt: m.lastSyncAt?.toISOString() || null,
        updatedAt: m.updatedAt?.toISOString() || null,
        createdAt: m.createdAt?.toISOString() || null,
      };
    },
  );

  const idea0 = idea[0];
  const diag = idea0?.lastError ? parseDiag(idea0.lastError) : null;

  const sentBefore = recent
    .filter((r) => r.queueStatus === "sent" && r.sentAt)
    .sort((a, b) => (a.sentAt!.getTime() > b.sentAt!.getTime() ? -1 : 1))
    .slice(0, 8)
    .map((r) => ({
      name: r.name,
      sentAt: r.sentAt?.toISOString() || null,
      mailboxPrefix: r.senderMailboxId?.slice(0, 8) || null,
      msBeforeIdeaUpdate:
        idea0?.updatedAt && r.sentAt
          ? idea0.updatedAt.getTime() - r.sentAt.getTime()
          : null,
    }));

  console.log(
    JSON.stringify(
      {
        note: "READ-ONLY — no decrypt, no token mutation. Compare mailbox.updatedAt vs sentAt for refresh timing.",
        auditProcessKeyFingerprints: {
          EMAIL_ENCRYPTION_KEY: fingerprintEnv("EMAIL_ENCRYPTION_KEY"),
          effective: effectiveKeySource(),
          warning:
            "This audit process key fingerprint may differ from Railway app replicas. Do not treat local decrypt ability as production truth.",
        },
        workspaceIdPrefix: wid.slice(0, 8),
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
        ideaPeddler: idea.map((r) => ({
          idPrefix: r.id.slice(0, 8),
          name: r.name,
          queueStatus: r.queueStatus,
          attempts: r.attempts,
          lastError: r.lastError,
          lastErrorUi: formatProspectQueueItemError(r.lastError),
          failureClass: r.lastError ? parseDiag(r.lastError).failureClass : null,
          senderMailboxPrefix: r.senderMailboxId?.slice(0, 8) || null,
          scheduledAt: r.scheduledAt?.toISOString() || null,
          startedAt: r.startedAt?.toISOString() || null,
          sentAt: r.sentAt?.toISOString() || null,
          updatedAt: r.updatedAt?.toISOString() || null,
          inferredStage:
            r.attempts === 0 && String(r.lastError || "").startsWith("sender_not_connected")
              ? "eligibility_or_prepare_before_attempt_increment"
              : "unknown",
        })),
        parsedDiag: diag,
        recentSentBeforeFailure: sentBefore,
        mailboxes: mailboxReport,
        hypothesesHints: {
          H1_access_decrypt:
            "If EmailChannelHealthDiag stage=token_read_access encryptedField=access_token around failure time",
          H2_refresh_decrypt:
            "If stage=token_read_refresh and mailbox.wouldNeedRefreshNow was true near failure",
          H3_multi_replica_key:
            "Successful sends then decrypt on same ciphertext ⇒ different process key OR access ciphertext rewritten between sends",
          H4_refresh_rewrite:
            "If mailbox.updatedAt is between last successful sentAt and Idea Peddler updatedAt, refresh likely rewrote accessTokenEncrypted",
          H5_format_corruption:
            "accessFormatOk/refreshFormatOk false would indicate truncated/non-AES blob",
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
